import type { ConversationNode } from "../types";

type LegacyConversationNode = Omit<ConversationNode, "parentIds"> & {
  parentId?: string | null;
  parentIds?: string[];
};

function compareNodes(left: ConversationNode, right: ConversationNode): number {
  return left.createdAt - right.createdAt || left.id.localeCompare(right.id);
}

export function migrateConversationNode(
  value: ConversationNode | LegacyConversationNode,
): ConversationNode {
  const legacy = value as LegacyConversationNode;
  const parentIds = Array.isArray(legacy.parentIds)
    ? [...new Set(legacy.parentIds.filter((id) => typeof id === "string" && id))]
    : legacy.parentId
      ? [legacy.parentId]
      : [];

  if (
    Array.isArray(legacy.parentIds) &&
    parentIds.length === legacy.parentIds.length &&
    !("parentId" in legacy)
  ) {
    return value as ConversationNode;
  }

  const { parentId: _parentId, ...current } = legacy;
  return { ...current, parentIds } as ConversationNode;
}

export function getContextNodes(
  nodes: ConversationNode[],
  targetIds: string[],
): ConversationNode[] {
  if (!targetIds.length) return [];

  const byId = new Map(nodes.map((node) => [node.id, node]));
  const state = new Map<string, "visiting" | "visited">();
  const ancestorIds = new Set<string>();

  const visit = (id: string) => {
    if (state.get(id) === "visiting") {
      throw new Error("The conversation graph contains a cycle.");
    }
    if (state.get(id) === "visited") return;

    const node = byId.get(id);
    if (!node) {
      throw new Error("A conversation node references a missing parent.");
    }

    state.set(id, "visiting");
    node.parentIds.forEach(visit);
    state.set(id, "visited");
    ancestorIds.add(id);
  };

  [...new Set(targetIds)].forEach(visit);

  const indegree = new Map<string, number>();
  const children = new Map<string, string[]>();
  ancestorIds.forEach((id) => {
    const node = byId.get(id) as ConversationNode;
    const parents = node.parentIds.filter((parentId) => ancestorIds.has(parentId));
    indegree.set(id, parents.length);
    parents.forEach((parentId) => {
      const current = children.get(parentId) ?? [];
      current.push(id);
      children.set(parentId, current);
    });
  });

  const ready = [...ancestorIds]
    .filter((id) => indegree.get(id) === 0)
    .map((id) => byId.get(id) as ConversationNode)
    .sort(compareNodes);
  const ordered: ConversationNode[] = [];

  while (ready.length) {
    const node = ready.shift() as ConversationNode;
    ordered.push(node);
    for (const childId of children.get(node.id) ?? []) {
      const nextDegree = (indegree.get(childId) ?? 0) - 1;
      indegree.set(childId, nextDegree);
      if (nextDegree === 0) {
        ready.push(byId.get(childId) as ConversationNode);
        ready.sort(compareNodes);
      }
    }
  }

  if (ordered.length !== ancestorIds.size) {
    throw new Error("The conversation graph contains a cycle.");
  }

  return ordered;
}

export function getNodeDepths(nodes: ConversationNode[]): Map<string, number> {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const depths = new Map<string, number>();

  const visit = (id: string, path: Set<string>): number => {
    const known = depths.get(id);
    if (known !== undefined) return known;
    const node = byId.get(id);
    if (!node || path.has(id)) return 1;

    const nextPath = new Set(path).add(id);
    const depth = node.parentIds.length
      ? Math.max(...node.parentIds.map((parentId) => visit(parentId, nextPath))) + 1
      : 1;
    depths.set(id, depth);
    return depth;
  };

  nodes.forEach((node) => visit(node.id, new Set()));
  return depths;
}

export function getDescendantIds(
  nodes: ConversationNode[],
  rootId: string,
): Set<string> {
  const ids = new Set([rootId]);
  let foundChild = true;

  while (foundChild) {
    foundChild = false;
    for (const node of nodes) {
      if (node.parentIds.some((parentId) => ids.has(parentId)) && !ids.has(node.id)) {
        ids.add(node.id);
        foundChild = true;
      }
    }
  }

  return ids;
}

export function canAddDraftToMerge(
  selectedDrafts: readonly ConversationNode[],
  candidate: ConversationNode,
): boolean {
  if (
    candidate.status !== "draft" ||
    candidate.parentIds.length === 0 ||
    selectedDrafts.some((draft) => draft.id === candidate.id)
  ) {
    return false;
  }

  const existingParents = new Set(
    selectedDrafts.flatMap((draft) => draft.parentIds),
  );
  return candidate.parentIds.some((parentId) => !existingParents.has(parentId));
}

export function getMergedDraftParentIds(
  drafts: readonly ConversationNode[],
): string[] | null {
  if (drafts.length < 2 || new Set(drafts.map((draft) => draft.id)).size !== drafts.length) {
    return null;
  }
  if (
    drafts.some(
      (draft) => draft.status !== "draft" || draft.parentIds.length === 0,
    )
  ) {
    return null;
  }

  const parentIds = [...new Set(drafts.flatMap((draft) => draft.parentIds))];
  return parentIds.length >= 2 ? parentIds : null;
}
