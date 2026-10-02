import type { AttachmentRef, ConversationNode } from "../types";
import { getContextNodes } from "./graph";

export type ChatMessage = {
  role: "user" | "assistant";
  content: string;
  attachments?: AttachmentRef[];
};

export type ChatContext = {
  messages: ChatMessage[];
  systemInstruction?: string;
};

function getNearestIncludedParents(
  parentIds: string[],
  byId: Map<string, ConversationNode>,
  includedIds: Set<string>,
): string[] {
  const resolved = new Set<string>();

  const visit = (id: string, path: Set<string>) => {
    if (path.has(id)) return;
    if (includedIds.has(id)) {
      resolved.add(id);
      return;
    }
    const node = byId.get(id);
    if (!node) return;
    const nextPath = new Set(path).add(id);
    node.parentIds.forEach((parentId) => visit(parentId, nextPath));
  };

  parentIds.forEach((parentId) => visit(parentId, new Set()));
  return [...resolved];
}

export function buildChatContext(
  nodes: ConversationNode[],
  parentIds: string[],
  nextPrompt: string,
  nextAttachments: AttachmentRef[] = [],
): ChatContext {
  const graph = getContextNodes(nodes, parentIds);
  const included = graph.filter(
    (node) => !node.muted && node.status === "complete",
  );
  const messages: ChatMessage[] = [];
  const usesMergedContext =
    new Set(parentIds).size > 1 || graph.some((node) => node.parentIds.length > 1);

  if (usesMergedContext) {
    const byId = new Map(graph.map((node) => [node.id, node]));
    const includedIds = new Set(included.map((node) => node.id));
    const labels = new Map(
      included.map((node, index) => [node.id, `N${index + 1}`]),
    );

    for (const node of included) {
      const parentLabels = getNearestIncludedParents(
        node.parentIds,
        byId,
        includedIds,
      ).map((id) => labels.get(id) as string);
      messages.push({
        role: "user",
        content: `[Context node ${labels.get(node.id)} | parents: ${parentLabels.join(", ") || "none"}]\n${node.prompt}`,
        ...(node.attachments?.length ? { attachments: node.attachments } : {}),
      });
      if (node.response.trim()) {
        messages.push({ role: "assistant", content: node.response });
      }
    }

    const currentParentLabels = getNearestIncludedParents(
      parentIds,
      byId,
      includedIds,
    ).map((id) => labels.get(id) as string);
    messages.push({
      role: "user",
      content: `[Current request | parents: ${currentParentLabels.join(", ") || "none"}]\n${nextPrompt}`,
      ...(nextAttachments.length ? { attachments: nextAttachments } : {}),
    });
  } else {
    for (const node of included) {
      messages.push({
        role: "user",
        content: node.prompt,
        ...(node.attachments?.length ? { attachments: node.attachments } : {}),
      });
      if (node.response.trim()) {
        messages.push({ role: "assistant", content: node.response });
      }
    }
    messages.push({
      role: "user",
      content: nextPrompt,
      ...(nextAttachments.length ? { attachments: nextAttachments } : {}),
    });
  }

  return { messages };
}
