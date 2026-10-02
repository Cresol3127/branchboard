import type { ConversationNode } from "../types";

export const AUTO_NODE_MIN_WIDTH = 340;
export const AUTO_NODE_MAX_WIDTH = 620;
export const NODE_HORIZONTAL_GAP = 80;

type NodeContent = Pick<ConversationNode, "prompt" | "response"> &
  Partial<Pick<ConversationNode, "attachments">>;

export function getAutomaticNodeWidth(node: NodeContent): number {
  const contentLength = node.prompt.trim().length + node.response.trim().length;

  if (contentLength >= 2600) return AUTO_NODE_MAX_WIDTH;
  if (node.attachments?.some((attachment) =>
    attachment.kind === "image" || attachment.kind === "video"
  )) return 520;
  if (contentLength >= 1200) return 520;
  if (node.attachments?.length) return 430;
  if (contentLength >= 480) return 430;
  return AUTO_NODE_MIN_WIDTH;
}

export function getConversationNodeWidth(node: NodeContent & Pick<ConversationNode, "size">): number {
  return node.size?.width ?? getAutomaticNodeWidth(node);
}
