import type {
  AttachmentRef,
  ConversationColor,
  ConversationNode,
} from "../types";

export type SiblingRetryInput = {
  sourceId: string;
  parentIds: string[];
  prompt: string;
  attachments: AttachmentRef[];
  color?: ConversationColor;
};

export function canRetryConversation(
  node: ConversationNode,
): boolean {
  return node.status === "complete" || node.status === "error";
}

export function createSiblingRetryInput(
  node: ConversationNode,
): SiblingRetryInput {
  if (!canRetryConversation(node)) {
    throw new Error("Only completed or failed conversations can be retried.");
  }

  return {
    sourceId: node.id,
    parentIds: [...node.parentIds],
    prompt: node.prompt,
    attachments: [...(node.attachments ?? [])],
    ...(node.color ? { color: node.color } : {}),
  };
}
