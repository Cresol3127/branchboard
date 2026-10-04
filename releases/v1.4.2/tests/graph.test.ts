import { describe, expect, it } from 'vitest';
import {
  absolutePosition,
  canConnect,
  contextFor,
  estimateTokens,
  layoutNodes,
  resolveNodeCollisions,
  nodeMessages,
  workspaceTokenCounts,
} from '../src/graph';
import type { BoardNode } from '../src/types';
import type { Edge } from '@xyflow/react';

function node(id: string, options: Partial<BoardNode> = {}): BoardNode {
  return {
    id,
    type: 'chat',
    position: { x: 0, y: 0 },
    data: { title: id, color: 'purple', note: '', messages: [{ id, role: 'user', content: id }] },
    ...options,
  };
}
const edge = (source: string, target: string): Edge => ({ id: source + target, source, target });
describe('graph connections', () => {
  it('unions historical turns on merged paths, keeps order, and lets full/manual paths include full history', () => {
    const a = node('a');
    a.data.messages = ['1', '2', '3'].map((id) => ({ id, role: 'user', content: id }));
    const nodes = [a, node('b'), node('c'), node('d')];
    const edges = [
      { ...edge('a', 'b'), data: { historyMessageIds: ['1'] } },
      { ...edge('a', 'c'), data: { historyMessageIds: ['1', '2'] } },
      edge('b', 'd'),
      edge('c', 'd'),
    ];
    expect(contextFor('d', nodes, edges).map((m) => m.content)).toEqual(['1', '2', 'b', 'c', 'd']);
    expect(contextFor('b', nodes, edges).map((m) => m.content)).toEqual(['1', 'b']);
    nodes[1].data.contextInclude = ['a'];
    expect(contextFor('b', nodes, edges).map((m) => m.content)).toEqual(['1', '2', '3', 'b']);
    expect(contextFor('d', nodes, [...edges, edge('a', 'd')]).map((m) => m.content)).toEqual([
      '1',
      '2',
      '3',
      'b',
      'c',
      'd',
    ]);
  });
  it('blocks self links, duplicates and indirect cycles', () => {
    const edges = [edge('a', 'b'), edge('b', 'c')];
    expect(canConnect('a', 'a', edges)).toBe(false);
    expect(canConnect('a', 'b', edges)).toBe(false);
    expect(canConnect('c', 'a', edges)).toBe(false);
    expect(canConnect('a', 'c', edges)).toBe(true);
    expect(canConnect('c', 'd', edges)).toBe(true);
  });
  it('collects parent-first context, without repeating a merged ancestor', () => {
    const nodes = ['a', 'b', 'c', 'd'].map((id) => node(id));
    const edges = [edge('a', 'b'), edge('a', 'c'), edge('b', 'd'), edge('c', 'd')];
    expect(contextFor('d', nodes, edges).map((m) => m.content)).toEqual(['a', 'b', 'c', 'd']);
    expect(contextFor('d', nodes, edges, false).map((m) => m.content)).toEqual(['a', 'b', 'c']);
  });
  it('includes connected sticky notes as explicit context', () => {
    const note = node('note', {
      type: 'note',
      data: { title: 'Constraints', color: 'amber', note: 'Use TypeScript', messages: [] },
    });
    expect(contextFor('chat', [note, node('chat')], [edge('note', 'chat')])[0].content).toBe(
      'Context note — Constraints:\nUse TypeScript',
    );
  });
  it('is defensive against old cyclic context', () => {
    expect(contextFor('a', [node('a'), node('b')], [edge('a', 'b'), edge('b', 'a')])).toHaveLength(
      2,
    );
  });
  it('includes manual sources with their ancestors, excludes content only, and keeps self last', () => {
    const nodes = ['a', 'b', 'c', 'd', 'extra'].map((id) => node(id));
    nodes[3].data.contextInclude = ['extra', 'c'];
    nodes[3].data.contextExclude = ['b'];
    const edges = [edge('a', 'b'), edge('b', 'd'), edge('a', 'extra'), edge('d', 'c')];
    expect(contextFor('d', nodes, edges).map((m) => m.content)).toEqual(['a', 'extra', 'c', 'd']);
    expect(contextFor('d', nodes, edges, false).map((m) => m.content)).toEqual(['a', 'extra', 'c']);
    expect(contextFor('missing', nodes, edges)).toEqual([]);
    expect(edges).toHaveLength(4);
  });
  it('does not leak another conversation’s manual inclusions into the current request', () => {
    const nodes = ['a', 'b', 'private'].map((id) => node(id));
    nodes[0].data.contextInclude = ['private'];
    expect(contextFor('b', nodes, [edge('a', 'b')]).map((m) => m.content)).toEqual(['a', 'b']);
  });
});
describe('token estimates', () => {
  it('handles empty, ASCII and multibyte content with message framing', () => {
    expect(estimateTokens([])).toBe(0);
    expect(estimateTokens([{ content: '' }])).toBe(0);
    expect(estimateTokens([{ content: 'test' }])).toBe(8);
    expect(estimateTokens([{ content: '🌿你好' }])).toBe(10);
    expect(estimateTokens([{ content: 'test' }, { content: 'test' }])).toBe(13);
  });
  it('counts selected group descendants once, excludes group content, and avoids inherited duplication', () => {
    const nodes = [
      node('group', { type: 'group', selected: true }),
      node('a', { parentId: 'group', selected: true }),
      node('b', { parentId: 'group' }),
      node('other'),
    ];
    const counts = workspaceTokenCounts(nodes);
    expect(counts.selected).toBe(
      estimateTokens(nodeMessages(nodes[1])) + estimateTokens(nodeMessages(nodes[2])),
    );
    expect(counts.board).toBe(counts.selected + estimateTokens(nodeMessages(nodes[3])));
    const edges = [edge('a', 'b'), edge('b', 'other')];
    expect(estimateTokens(contextFor('other', nodes, edges))).toBe(19);
    expect(workspaceTokenCounts(nodes)).toEqual(counts);
  });
});
describe('layout', () => {
  it('settles only edited siblings with a gap, preserving neighbor positions and group coordinates', () => {
    const nodes = [
      node('a', { style: { width: 300, height: 200 } }),
      node('b', { position: { x: 280, y: 0 }, style: { width: 300, height: 200 } }),
      node('g', { type: 'group', position: { x: 1000, y: 0 } }),
      node('child', { parentId: 'g', position: { x: 30, y: 60 } }),
    ];
    const result = resolveNodeCollisions(nodes, ['b']);
    expect(result[1].position).toEqual({ x: 324, y: 0 });
    expect(result[0]).toBe(nodes[0]);
    expect(result[3]).toBe(nodes[3]);
    expect(resolveNodeCollisions(result, ['b'])).toEqual(result);
    expect(nodes[1].position.x).toBe(280);
  });
  it('moves multiselections as rigid units and never treats children as parent obstacles', () => {
    const nodes = [
      node('a', { style: { width: 300, height: 200 } }),
      node('g', { type: 'group', position: { x: 290, y: 0 }, style: { width: 300, height: 200 } }),
      node('child', { parentId: 'g', position: { x: 30, y: 60 } }),
      node('b', { position: { x: 290, y: 300 }, style: { width: 300, height: 200 } }),
    ];
    const result = resolveNodeCollisions(nodes, ['g', 'child', 'b']);
    expect(result[1].position).toEqual({ x: 324, y: 0 });
    expect(result[2].position).toEqual(nodes[2].position);
    expect(result[3].position).toEqual({ x: 324, y: 300 });
    expect(absolutePosition(result[2], result)).toEqual({ x: 354, y: 60 });
  });
  it('resolves a resized child against siblings, not unrelated overlapping world rectangles', () => {
    const nodes = [
      node('g', { type: 'group' }),
      node('a', { parentId: 'g', position: { x: 20, y: 60 }, style: { width: 500, height: 200 } }),
      node('b', { parentId: 'g', position: { x: 400, y: 60 }, style: { width: 300, height: 200 } }),
      node('other', { position: { x: 20, y: -164 } }),
    ];
    const result = resolveNodeCollisions(nodes, ['a']);
    expect(result[1].position).toEqual({ x: -124, y: 60 });
    expect(result[2]).toBe(nodes[2]);
    expect(result[3]).toBe(nodes[3]);
  });
  it('preserves grouped positions and gives root columns room', () => {
    const nodes = [
      node('a', { style: { width: 500, height: 600 } }),
      node('b'),
      node('group', { type: 'group' }),
      node('child', { parentId: 'group', position: { x: 20, y: 50 } }),
    ];
    const result = layoutNodes(nodes, [edge('a', 'b')]);
    expect(result[1].position.x).toBeGreaterThan(result[0].position.x + 500);
    expect(result[3].position).toEqual({ x: 20, y: 50 });
  });
  it('resolves nested groups to canvas coordinates', () => {
    const nodes = [
      node('a', { position: { x: 100, y: 200 } }),
      node('b', { parentId: 'a', position: { x: 30, y: 40 } }),
      node('c', { parentId: 'b', position: { x: 5, y: 8 } }),
    ];
    expect(absolutePosition(nodes[2], nodes)).toEqual({ x: 135, y: 248 });
  });
});
