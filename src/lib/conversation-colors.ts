import type { ConversationColor, ConversationNode } from "../types";
import { getDescendantIds } from "./graph";

export const CONVERSATION_COLORS: readonly ConversationColor[] = [
  "coral",
  "amber",
  "green",
  "cyan",
  "blue",
  "violet",
  "pink",
];

export type ConversationColorScope = "node" | "family";
export const DEFAULT_CONVERSATION_COLOR_SCOPE: ConversationColorScope = "family";

function getAffectedIds(
  nodes: readonly ConversationNode[],
  nodeId: string,
  scope: ConversationColorScope,
): Set<string> {
  return scope === "family"
    ? getDescendantIds([...nodes], nodeId)
    : new Set([nodeId]);
}

export function isConversationColor(value: unknown): value is ConversationColor {
  return CONVERSATION_COLORS.includes(value as ConversationColor);
}

export function getInheritedConversationColor(
  nodes: readonly ConversationNode[],
  parentIds: readonly string[],
): ConversationColor | undefined {
  if (!parentIds.length) return undefined;
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const colors = parentIds.map((parentId) => byId.get(parentId)?.color);
  const first = colors[0];
  return first && colors.every((color) => color === first) ? first : undefined;
}

export function applyConversationColor(
  nodes: ConversationNode[],
  nodeId: string,
  color: ConversationColor | undefined,
  scope: ConversationColorScope,
): ConversationNode[] {
  const affectedIds = getAffectedIds(nodes, nodeId, scope);
  let changed = false;
  const next = nodes.map((node) => {
    if (!affectedIds.has(node.id) || node.color === color) return node;
    changed = true;
    if (color) return { ...node, color };
    const { color: _color, ...withoutColor } = node;
    return withoutColor;
  });
  return changed ? next : nodes;
}

export function getConversationColorAffectedCount(
  nodes: readonly ConversationNode[],
  nodeId: string,
  scope: ConversationColorScope,
): number {
  return getAffectedIds(nodes, nodeId, scope).size;
}
