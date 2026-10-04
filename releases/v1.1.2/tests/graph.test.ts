import { describe, expect, it } from 'vitest';
import { absolutePosition, canConnect, contextFor, layoutNodes } from '../src/graph';
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
