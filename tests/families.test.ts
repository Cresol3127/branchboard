import { describe, expect, it } from 'vitest';
import type { Edge } from '@xyflow/react';
import { edgeFamilyColors, familyColorFor } from '../src/families';
import type { BoardNode } from '../src/types';

function node(id: string, type: BoardNode['type'] = 'chat'): BoardNode {
  return {
    id,
    type,
    position: { x: 0, y: 0 },
    data: { title: id, color: 'purple', note: '', messages: [] },
  };
}

function edge(id: string, source: string, target: string): Edge {
  return { id, source, target };
}

describe('conversation family edge colors', () => {
  it('colors a whole path, including its input note, from the conversation root', () => {
    const nodes = [
      node('note-source', 'note'),
      node('root'),
      node('branch'),
      node('leaf'),
      node('other'),
    ];
    const edges = [
      edge('note-edge', 'note-source', 'root'),
      edge('root-edge', 'root', 'branch'),
      edge('branch-edge', 'branch', 'leaf'),
      edge('other-edge', 'note-source', 'other'),
    ];

    const colors = edgeFamilyColors(nodes, edges);

    expect(colors.get('note-edge')).toBe(familyColorFor('root'));
    expect(colors.get('root-edge')).toBe(familyColorFor('root'));
    expect(colors.get('branch-edge')).toBe(familyColorFor('root'));
    expect(colors.get('other-edge')).toBe(familyColorFor('other'));
  });

  it('does not depend on edge order and handles an empty graph', () => {
    const nodes = [node('root'), node('child'), node('other')];
    const edges = [
      edge('root-edge', 'root', 'child'),
      edge('other-edge', 'other', 'child'),
      edge('root-other', 'root', 'other'),
    ];

    expect(edgeFamilyColors(nodes, [...edges].reverse())).toEqual(edgeFamilyColors(nodes, edges));
    expect(edgeFamilyColors([], [])).toEqual(new Map());
  });
});
