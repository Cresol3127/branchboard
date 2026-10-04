import { describe, expect, it } from 'vitest';
import {
  absolutePosition,
  canConnect,
  contextFor,
  estimateTokens,
  layoutNodes,
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
