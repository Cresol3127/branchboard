import type { Edge } from '@xyflow/react';
import type { BoardNode, Message } from './types';

export function canConnect(source: string, target: string, edges: Edge[]) {
  if (source === target || edges.some((e) => e.source === source && e.target === target))
    return false;
  const visited = new Set<string>();
  const reaches = (id: string): boolean => {
    if (id === source) return true;
    if (visited.has(id)) return false;
    visited.add(id);
    return edges.filter((e) => e.source === id).some((e) => reaches(e.target));
  };
  return !reaches(target);
}

export function nodeMessages(node: BoardNode): Message[] {
  if (node.type === 'note' && node.data.note.trim())
    return [
      {
        id: node.id,
        role: 'user',
        content: `Context note — ${node.data.title}:\n${node.data.note}`,
      },
    ];
  return node.type === 'chat' ? node.data.messages.filter((m) => m.content) : [];
}

/** Request-scoped overrides: exclusions omit content, not traversal through that node. */
export function contextNodesFor(id: string, nodes: BoardNode[], edges: Edge[], includeSelf = true) {
  const byId = new Map(nodes.map((n) => [n.id, n]));
  const root = byId.get(id);
  if (!root) return [];
  const excluded = new Set(root.data.contextExclude);
  const parents = new Map<string, string[]>();
  edges.forEach((e) => parents.set(e.target, [...(parents.get(e.target) || []), e.source]));
  const visited = new Set<string>();
  const result: BoardNode[] = [];
  const visit = (key: string) => {
    if (visited.has(key)) return;
    visited.add(key);
    (parents.get(key) || []).forEach(visit);
    const node = byId.get(key);
    if (node && key !== id && node.type !== 'group' && !excluded.has(key)) result.push(node);
  };
  // Mark self first, so a manual source downstream of self cannot duplicate/reorder it.
  visit(id);
  root.data.contextInclude?.forEach(visit);
  if (includeSelf && root.type !== 'group') result.push(root);
  return result;
}

export function contextFor(id: string, nodes: BoardNode[], edges: Edge[], includeSelf = true) {
  return contextNodesFor(id, nodes, edges, includeSelf).flatMap(nodeMessages);
}

/** Provider-independent heuristic, not billing usage: UTF-8 bytes / 4 + message framing. */
export function estimateTokens(messages: Pick<Message, 'content'>[]) {
  const nonempty = messages.filter((m) => m.content);
  if (!nonempty.length) return 0;
  const encoder = new TextEncoder();
  return (
    3 +
    nonempty.reduce((total, m) => total + Math.ceil(encoder.encode(m.content).length / 4) + 4, 0)
  );
}

/** Count local content once per node (including selected group descendants), never branch totals. */
export function workspaceTokenCounts(nodes: BoardNode[]) {
  const selected = new Set(nodes.filter((n) => n.selected).map((n) => n.id));
  const children = new Map<string, BoardNode[]>();
  nodes.forEach((n) => {
    if (n.parentId) children.set(n.parentId, [...(children.get(n.parentId) || []), n]);
  });
  const visit = (id: string) => {
    for (const child of children.get(id) || []) {
      if (selected.has(child.id)) continue;
      selected.add(child.id);
      visit(child.id);
    }
  };
  [...selected].forEach(visit);
  return nodes.reduce(
    (totals, n) => {
      const count = estimateTokens(nodeMessages(n));
      totals.board += count;
      if (selected.has(n.id)) totals.selected += count;
      return totals;
    },
    { board: 0, selected: 0 },
  );
}

export function absolutePosition(node: BoardNode, nodes: BoardNode[]) {
  const position = { ...node.position };
  const visited = new Set([node.id]);
  let parent = nodes.find((n) => n.id === node.parentId);
  while (parent && !visited.has(parent.id)) {
    visited.add(parent.id);
    position.x += parent.position.x;
    position.y += parent.position.y;
    parent = nodes.find((n) => n.id === parent?.parentId);
  }
  return position;
}

export function layoutNodes(nodes: BoardNode[], edges: Edge[]) {
  const roots = nodes.filter((n) => !n.parentId);
  const levels = new Map<string, number>();
  const incoming = new Map(nodes.map((n) => [n.id, 0]));
  const outgoing = new Map<string, string[]>();
  for (const n of nodes) levels.set(n.id, 0);
  for (const e of edges) {
    if (!incoming.has(e.source) || !incoming.has(e.target)) continue;
    incoming.set(e.target, incoming.get(e.target)! + 1);
    const targets = outgoing.get(e.source) || [];
    targets.push(e.target);
    outgoing.set(e.source, targets);
  }
  const queue = nodes.filter((n) => incoming.get(n.id) === 0).map((n) => n.id);
  // Each edge is visited once, including shared ancestors in deeply merged graphs.
  for (let i = 0; i < queue.length; i++) {
    const id = queue[i];
    for (const target of outgoing.get(id) || []) {
      levels.set(target, Math.max(levels.get(target)!, levels.get(id)! + 1));
      incoming.set(target, incoming.get(target)! - 1);
      if (incoming.get(target) === 0) queue.push(target);
    }
  }
  const widths = new Map<number, number>();
  roots.forEach((n) => {
    const level = levels.get(n.id)!;
    widths.set(level, Math.max(widths.get(level) || 0, Number(n.style?.width) || 360));
  });
  const rows = new Map<number, number>();
  const columns = new Map<number, number>();
  const maximum = Math.max(0, ...levels.values());
  let x = 80;
  for (let i = 0; i <= maximum; i++) {
    columns.set(i, x);
    x += (widths.get(i) || 360) + 100;
  }
  return nodes.map((n) => {
    if (n.parentId) return n;
    const level = levels.get(n.id)!;
    const y = rows.get(level) || 80;
    rows.set(level, y + (Number(n.style?.height) || 330) + 70);
    return { ...n, position: { x: columns.get(level)!, y } };
  });
}
