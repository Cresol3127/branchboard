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
  const parents = new Map<string, Edge[]>();
  edges.forEach((e) => parents.set(e.target, [...(parents.get(e.target) || []), e]));
  const visited = new Set<string>();
  const limits = new Map<string, Set<string> | null>();
  const result: BoardNode[] = [];
  const visit = (key: string, messageIds?: string[]) => {
    if (!limits.has(key)) limits.set(key, messageIds ? new Set(messageIds) : null);
    else if (!messageIds) limits.set(key, null);
    else if (limits.get(key)) messageIds.forEach((messageId) => limits.get(key)!.add(messageId));
    if (visited.has(key)) return;
    visited.add(key);
    (parents.get(key) || []).forEach((edge) =>
      visit(edge.source, edge.data?.historyMessageIds as string[] | undefined),
    );
    const node = byId.get(key);
    if (node && key !== id && node.type !== 'group' && !excluded.has(key)) result.push(node);
  };
  // Mark self first, so a manual source downstream of self cannot duplicate/reorder it.
  visit(id);
  root.data.contextInclude?.forEach((key) => visit(key));
  if (includeSelf && root.type !== 'group') result.push(root);
  return result.map((node) => {
    const limit = limits.get(node.id);
    return limit
      ? {
          ...node,
          data: { ...node.data, messages: node.data.messages.filter((m) => limit.has(m.id)) },
        }
      : node;
  });
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

/** Move edited siblings together to the nearest free position, never moving their neighbors.
 * Group descendants travel with their parent; only sibling rectangles are obstacles.
 */
export function resolveNodeCollisions(nodes: BoardNode[], ids: string[], gap = 24): BoardNode[] {
  const moving = new Set(ids);
  const roots = nodes.filter((node) => {
    if (!moving.has(node.id)) return false;
    let parent = nodes.find((n) => n.id === node.parentId);
    while (parent) {
      if (moving.has(parent.id)) return false;
      parent = nodes.find((n) => n.id === parent!.parentId);
    }
    return true;
  });
  let result = nodes;
  for (const parentId of new Set(roots.map((n) => n.parentId))) {
    const edited = roots.filter((n) => n.parentId === parentId);
    const obstacles = result.filter((n) => n.parentId === parentId && !moving.has(n.id));
    const size = (n: BoardNode) => ({
      width: Number(n.style?.width) || n.measured?.width || 340,
      height: Number(n.style?.height) || n.measured?.height || 300,
    });
    const queue = [{ x: 0, y: 0 }];
    const seen = new Set<string>();
    let offset = queue[0];
    let found = false;
    // Bounded best-first search; deterministic fallback also guarantees a free rectangle.
    for (let attempts = 0; queue.length && attempts < 512; attempts++) {
      queue.sort((a, b) => a.x * a.x + a.y * a.y - b.x * b.x - b.y * b.y);
      offset = queue.shift()!;
      const key = `${offset.x},${offset.y}`;
      if (seen.has(key)) continue;
      seen.add(key);
      let collision: { a: BoardNode; b: BoardNode } | undefined;
      for (const a of edited) {
        const sa = size(a);
        const b = obstacles.find((b) => {
          const sb = size(b);
          return (
            a.position.x + offset.x < b.position.x + sb.width + gap &&
            a.position.x + offset.x + sa.width + gap > b.position.x &&
            a.position.y + offset.y < b.position.y + sb.height + gap &&
            a.position.y + offset.y + sa.height + gap > b.position.y
          );
        });
        if (b) {
          collision = { a, b };
          break;
        }
      }
      if (!collision) {
        found = true;
        break;
      }
      const { a, b } = collision;
      const sa = size(a),
        sb = size(b);
      queue.push(
        { x: b.position.x - a.position.x - sa.width - gap, y: offset.y },
        { x: b.position.x + sb.width + gap - a.position.x, y: offset.y },
        { x: offset.x, y: b.position.y - a.position.y - sa.height - gap },
        { x: offset.x, y: b.position.y + sb.height + gap - a.position.y },
      );
    }
    if (!found)
      offset = {
        x:
          Math.max(...obstacles.map((n) => n.position.x + size(n).width)) +
          gap -
          Math.min(...edited.map((n) => n.position.x)),
        y: 0,
      };
    if (!offset.x && !offset.y) continue;
    const editedIds = new Set(edited.map((n) => n.id));
    result = result.map((n) =>
      editedIds.has(n.id)
        ? {
            ...n,
            position: { x: n.position.x + offset.x, y: n.position.y + offset.y },
          }
        : n,
    );
  }
  return result;
}

export function layoutNodes(nodes: BoardNode[], edges: Edge[]) {
  const roots = nodes.filter((n) => !n.parentId);
  const levels = new Map<string, number>();
  const depth = (id: string, seen = new Set<string>()): number => {
    if (seen.has(id)) return 0;
    seen.add(id);
    return Math.max(
      0,
      ...edges.filter((e) => e.target === id).map((e) => depth(e.source, new Set(seen)) + 1),
    );
  };
  roots.forEach((n) => levels.set(n.id, depth(n.id)));
  const widths = new Map<number, number>();
  roots.forEach((n) => {
    const level = levels.get(n.id)!;
    widths.set(level, Math.max(widths.get(level) || 0, Number(n.style?.width) || 360));
  });
  const rows = new Map<number, number>();
  return nodes.map((n) => {
    if (n.parentId) return n;
    const level = levels.get(n.id)!;
    let x = 80;
    for (let i = 0; i < level; i++) x += (widths.get(i) || 360) + 100;
    const y = rows.get(level) || 80;
    rows.set(level, y + (Number(n.style?.height) || 330) + 70);
    return { ...n, position: { x, y } };
  });
}
