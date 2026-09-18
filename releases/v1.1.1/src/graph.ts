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

export function contextFor(id: string, nodes: BoardNode[], edges: Edge[], includeSelf = true) {
  const visited = new Set<string>();
  const messages: Message[] = [];
  const visit = (key: string) => {
    if (visited.has(key)) return;
    visited.add(key);
    edges.filter((e) => e.target === key).forEach((e) => visit(e.source));
    const node = nodes.find((n) => n.id === key);
    if (!node || (key === id && !includeSelf)) return;
    if (node.type === 'note' && node.data.note.trim())
      messages.push({
        id: node.id,
        role: 'user',
        content: `Context note — ${node.data.title}:\n${node.data.note}`,
      });
    else if (node.type === 'chat') messages.push(...node.data.messages.filter((m) => m.content));
  };
  visit(id);
  return messages;
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
