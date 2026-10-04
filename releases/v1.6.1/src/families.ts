import type { Edge } from '@xyflow/react';
import type { BoardNode } from './types';

export const familyColors = ['sage', 'blue', 'amber', 'rose', 'violet', 'teal'] as const;
export type FamilyColor = (typeof familyColors)[number];

const labels: Record<FamilyColor, string> = {
  sage: 'Sage',
  blue: 'Slate blue',
  amber: 'Amber',
  rose: 'Rose',
  violet: 'Violet',
  teal: 'Teal',
};

export function isFamilyColor(value: unknown): value is FamilyColor {
  return typeof value === 'string' && familyColors.includes(value as FamilyColor);
}

export function familyLabel(color: string | undefined) {
  return isFamilyColor(color) ? labels[color] : 'No family color';
}

/** Stable hash: the same family root always receives the same color. */
export function familyColorFor(familyId: string): FamilyColor {
  let hash = 2166136261;
  for (let i = 0; i < familyId.length; i++) {
    hash ^= familyId.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return familyColors[Math.abs(hash) % familyColors.length];
}

/**
 * Recomputes conversation families and inherited colors.
 * A family is named by the lexicographically smallest ancestor family ID, so edge
 * order and object order cannot change the result. Orphaned descendants keep their
 * family ID so deleting the root does not recolor unrelated surviving history.
 */
export function assignFamilies(nodes: BoardNode[], edges: Edge[]): BoardNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const parents = new Map<string, string[]>();
  for (const edge of edges) {
    if (!byId.has(edge.source) || !byId.has(edge.target)) continue;
    parents.set(edge.target, [...(parents.get(edge.target) || []), edge.source]);
  }
  const resolved = new Map<string, string>();
  const visiting = new Set<string>();
  const familyOf = (id: string): string | null => {
    const cached = resolved.get(id);
    if (cached) return cached;
    const node = byId.get(id);
    if (!node || node.type !== 'chat') return null;
    if (visiting.has(id)) return node.data.familyId || id;
    visiting.add(id);
    const upstream = (parents.get(id) || [])
      .flatMap((parentId) => {
        const family = familyOf(parentId);
        return family ? [family] : [];
      })
      .sort();
    const family = upstream[0] || node.data.familyId || id;
    visiting.delete(id);
    resolved.set(id, family);
    return family;
  };
  return nodes.map((node) => {
    if (node.type !== 'chat') return node;
    const familyId = familyOf(node.id) || node.id;
    const familyColor = familyColorFor(familyId);
    const color = isFamilyColor(node.data.colorOverride)
      ? node.data.colorOverride
      : familyColor;
    if (
      node.data.familyId === familyId &&
      node.data.familyColor === familyColor &&
      node.data.color === color
    )
      return node;
    return {
      ...node,
      data: { ...node.data, familyId, familyColor, color },
    };
  });
}

export function familyName(node: BoardNode) {
  return familyLabel(node.data.familyColor || (node.data.familyId ? familyColorFor(node.data.familyId) : undefined));
}

/** Ancestor family names provide a non-color cue in the node context inspector. */
export function familyContext(nodes: BoardNode[], id: string, edges: Edge[]) {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const seen = new Set<string>();
  const names = new Set<string>();
  const visit = (key: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    edges.filter((edge) => edge.target === key).forEach((edge) => visit(edge.source));
    const node = byId.get(key);
    if (node?.type === 'chat') names.add(familyName(node));
  };
  visit(id);
  return [...names].sort();
}
