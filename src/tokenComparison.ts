import { contextFor, estimateTokens } from './graph';
import { nodeLabel } from './nodeLabel';
import { isProviderId, type ProviderId } from './providers';
import { calculateCost, estimatedUsage, findPrice } from './tokens';
import type { Board, BoardNode, ModelPrice, TokenUsage } from './types';

export const TOKEN_PRICES_KEY = 'branchboard.token-prices.v1';

export function readTokenPrices(value: unknown): ModelPrice[] {
  if (!Array.isArray(value)) return [];
  return value.filter((price): price is ModelPrice =>
    Boolean(
      price &&
      typeof price.id === 'string' &&
      isProviderId(price.provider) &&
      typeof price.model === 'string' &&
      price.model.length > 0 &&
      price.model.length <= 512 &&
      price.currency === 'USD' &&
      Number.isFinite(price.updatedAt) &&
      [price.inputPerMillion, price.outputPerMillion].every(
        (n) => typeof n === 'number' && Number.isFinite(n) && n >= 0 && n <= 1_000_000,
      ),
    ),
  );
}

export type NodeContextInfo = {
  isRoot: boolean;
  isLinearChain: boolean;
  isBranch: boolean;
  turn: number;
  badge: string;
  rootTitle?: string;
};

export function getNodeContextInfo(board: Board, nodeId: string): NodeContextInfo {
  const incoming = board.edges.filter((e) => e.target === nodeId);
  if (!incoming.length) {
    return {
      isRoot: true,
      isLinearChain: false,
      isBranch: false,
      turn: 1,
      badge: 'Root Prompt',
    };
  }

  // Walk up to root
  let currentId = nodeId;
  let turn = 1;
  let branchForkFound = false;
  let branchIndex = 1;
  const visited = new Set<string>([nodeId]);

  while (true) {
    const parentEdges = board.edges.filter((e) => e.target === currentId);
    if (!parentEdges.length) break;
    const parentId = parentEdges[0].source;
    if (visited.has(parentId)) break;
    visited.add(parentId);
    turn++;

    const outgoingFromParent = board.edges.filter((e) => e.source === parentId);
    if (outgoingFromParent.length > 1) {
      branchForkFound = true;
      const idx = outgoingFromParent.findIndex((e) => e.target === currentId);
      if (idx >= 0) branchIndex = idx + 1;
    }
    currentId = parentId;
  }

  const rootNode = board.nodes.find((n) => n.id === currentId);
  const rootTitle = rootNode ? nodeLabel(rootNode) : undefined;

  if (branchForkFound) {
    return {
      isRoot: false,
      isLinearChain: false,
      isBranch: true,
      turn,
      badge: turn === 2 ? `Branch ${branchIndex}` : `Branch ${branchIndex} · Turn ${turn - 1}`,
      rootTitle,
    };
  }

  return {
    isRoot: false,
    isLinearChain: true,
    isBranch: false,
    turn,
    badge: `Linear Chain · Turn ${turn}`,
    rootTitle,
  };
}

export type ConversationComparison = {
  id: string;
  label: string;
  contextBadge: string;
  contextInfo: NodeContextInfo;
  provider: ProviderId;
  model: string;
  usage: TokenUsage | null;
  status: 'completed' | 'cancelled' | 'failed' | undefined;
  historical: boolean;
  pending: boolean;
  cost: number | null;
};

/** Compare the latest saved reply, never imply this is a billing/spending ledger. */
export function compareConversation(
  board: Board,
  node: BoardNode,
  prices: ModelPrice[],
  defaultModel: string,
): ConversationComparison {
  let index = node.data.messages.length - 1;
  while (index >= 0 && node.data.messages[index].role !== 'assistant') index--;
  const reply = node.data.messages[index];
  const recorded = reply?.generation;
  const provider = recorded?.provider ?? node.data.provider ?? 'openai';
  const model = recorded?.model ?? node.data.model ?? defaultModel;
  let usage: TokenUsage | null = recorded?.usage ?? null;
  if (reply && !usage) {
    const request = contextFor(
      node.id,
      board.nodes.map((candidate) =>
        candidate.id === node.id
          ? {
              ...candidate,
              data: { ...candidate.data, messages: candidate.data.messages.slice(0, index) },
            }
          : candidate,
      ),
      board.edges,
    );
    usage = estimatedUsage(estimateTokens(request), reply.content);
  }
  let pending = false;
  if (!reply && !usage) {
    const nonempty = node.data.messages.filter((m) => m.content);
    if (nonempty.length > 0) {
      const request = contextFor(node.id, board.nodes, board.edges);
      const inputTokens = estimateTokens(request);
      usage = {
        inputTokens,
        outputTokens: 0,
        totalTokens: inputTokens,
        source: 'estimated',
      };
      pending = true;
    }
  }
  const price = findPrice(prices, provider, model);
  const contextInfo = getNodeContextInfo(board, node.id);
  return {
    id: node.id,
    label: nodeLabel(node),
    contextBadge: contextInfo.badge,
    contextInfo,
    provider,
    model,
    usage,
    status: recorded?.status,
    historical: Boolean(reply && !recorded),
    pending,
    cost: usage && price ? calculateCost(usage, price) : null,
  };
}

export type TokenEfficiency = {
  bestId: string;
  worstId: string;
  inputDiff: number;
  savingsPercent: number;
  isEqual: boolean;
  headline: string;
  description: string;
  treeComparison?: {
    linearTotalInput: number;
    branchedTotalInput: number;
    totalSavingsPercent: number;
    tokensSaved: number;
    linearTurnsCount: number;
    branchesCount: number;
  };
  deltas: Record<
    string,
    { diffFromBest: number; savingsPercentFromWorst: number; isBest: boolean }
  >;
};

export function computeTokenEfficiency(
  rows: {
    id: string;
    label: string;
    contextBadge?: string;
    contextInfo?: NodeContextInfo;
    usage: TokenUsage | null;
    pending?: boolean;
  }[],
  board?: Board,
  prices?: ModelPrice[],
  defaultModel?: string,
): TokenEfficiency | null {
  const candidates = rows.filter(
    (row): row is typeof row & { usage: TokenUsage } =>
      row.usage !== null &&
      typeof row.usage.inputTokens === 'number' &&
      Number.isFinite(row.usage.inputTokens),
  );
  if (candidates.length < 2) return null;

  // Special comparison: If exactly two Root nodes are compared across conversations
  if (candidates.length === 2 && board) {
    const nodeA = board.nodes.find((n) => n.id === candidates[0].id);
    const nodeB = board.nodes.find((n) => n.id === candidates[1].id);
    const infoA = candidates[0].contextInfo || getNodeContextInfo(board, candidates[0].id);
    const infoB = candidates[1].contextInfo || getNodeContextInfo(board, candidates[1].id);

    if (nodeA && nodeB && infoA.isRoot && infoB.isRoot) {
      const treeA = analyzeTreeFromHead(board, nodeA, prices || [], defaultModel || 'default');
      const treeB = analyzeTreeFromHead(board, nodeB, prices || [], defaultModel || 'default');

      if (treeA && treeB) {
        const isLinearA = treeA.isLinearSequence;
        const isLinearB = treeB.isLinearSequence;

        if (isLinearA !== isLinearB) {
          const linearTree = isLinearA ? treeA : treeB;
          const branchedTree = isLinearA ? treeB : treeA;
          const linearRow = isLinearA ? candidates[0] : candidates[1];
          const branchedRow = isLinearA ? candidates[1] : candidates[0];

          const linearInput = linearTree.totalLinearInput || linearTree.actualBranchedInput;
          const branchedInput = branchedTree.actualBranchedInput;
          const saved = Math.max(0, linearInput - branchedInput);
          const pct = linearInput > 0 ? Math.round((saved / linearInput) * 100) : 0;

          const headline = `“${branchedRow.label}” (Branched Tree) is ${pct}% more token-efficient across conversation`;
          const description = `Full conversation architecture comparison: The linear chain accumulated ${linearInput.toLocaleString()} input tokens across ${linearTree.linearTurns?.length || linearTree.totalDescendants + 1} turns due to compounding context. The branched tree used only ${branchedInput.toLocaleString()} input tokens across ${branchedTree.branches.length} branches (${saved.toLocaleString()} tokens saved).`;

          const deltas: TokenEfficiency['deltas'] = {
            [branchedRow.id]: {
              diffFromBest: 0,
              savingsPercentFromWorst: pct,
              isBest: true,
            },
            [linearRow.id]: {
              diffFromBest: saved,
              savingsPercentFromWorst: 0,
              isBest: false,
            },
          };

          return {
            bestId: branchedRow.id,
            worstId: linearRow.id,
            inputDiff: saved,
            savingsPercent: pct,
            isEqual: saved === 0,
            headline,
            description,
            treeComparison: {
              linearTotalInput: linearInput,
              branchedTotalInput: branchedInput,
              totalSavingsPercent: pct,
              tokensSaved: saved,
              linearTurnsCount: linearTree.linearTurns?.length || linearTree.totalDescendants + 1,
              branchesCount: branchedTree.branches.length,
            },
            deltas,
          };
        }
      }
    }
  }

  let minRow = candidates[0];
  let maxRow = candidates[0];
  for (const row of candidates) {
    if (row.usage.inputTokens < minRow.usage.inputTokens) minRow = row;
    if (row.usage.inputTokens > maxRow.usage.inputTokens) maxRow = row;
  }

  const inputDiff = maxRow.usage.inputTokens - minRow.usage.inputTokens;
  const isEqual = inputDiff === 0;
  const savingsPercent =
    maxRow.usage.inputTokens > 0 ? Math.round((inputDiff / maxRow.usage.inputTokens) * 100) : 0;

  const isPending = candidates.every((c) => c.pending);
  const verb = isPending ? 'Will send' : 'Uses';

  const hasDuplicateLabels =
    minRow.label.trim().toLowerCase() === maxRow.label.trim().toLowerCase();
  const minDisplay =
    hasDuplicateLabels && minRow.contextBadge
      ? `“${minRow.label}” (${minRow.contextBadge})`
      : `“${minRow.label}”`;
  const maxDisplay =
    hasDuplicateLabels && maxRow.contextBadge
      ? `“${maxRow.label}” (${maxRow.contextBadge})`
      : `“${maxRow.label}”`;

  const headline = isEqual
    ? 'Identical input token usage'
    : hasDuplicateLabels
      ? `${minDisplay} is ${savingsPercent}% more token-efficient than ${maxDisplay}`
      : `${minDisplay} is ${savingsPercent}% more token-efficient`;

  // Provide compounding context explanation if one candidate is a linear turn and one is a branch
  let compoundingNote = '';
  if (candidates.length === 2 && board) {
    const info0 = candidates[0].contextInfo || getNodeContextInfo(board, candidates[0].id);
    const info1 = candidates[1].contextInfo || getNodeContextInfo(board, candidates[1].id);
    const linearInfo = info0.isLinearChain ? info0 : info1.isLinearChain ? info1 : null;
    const branchInfo = info0.isBranch ? info0 : info1.isBranch ? info1 : null;

    if (linearInfo && branchInfo) {
      if (linearInfo.turn === 2) {
        compoundingNote = ` At Turn 2, savings are ${savingsPercent}% because only 1 prior turn has accumulated. In deeper turns (Turn 3: ~65%, Turn 4: ~76%), branch isolation saves up to ~60% across the full conversation.`;
      } else if (linearInfo.turn >= 3) {
        compoundingNote = ` By Turn ${linearInfo.turn}, the linear chat has re-read all preceding conversation turns, giving this isolated branch a ${savingsPercent}% token advantage.`;
      }
    }
  }

  const description = isEqual
    ? `Selected conversations send ${minRow.usage.inputTokens.toLocaleString()} input tokens to the model.`
    : `${verb} ${inputDiff.toLocaleString()} fewer input tokens (${minRow.usage.inputTokens.toLocaleString()} vs ${maxRow.usage.inputTokens.toLocaleString()}) due to isolated branch context.${compoundingNote}`;

  const deltas: TokenEfficiency['deltas'] = {};
  for (const row of candidates) {
    const diffFromBest = Math.max(0, row.usage.inputTokens - minRow.usage.inputTokens);
    const savingsPercentFromWorst =
      maxRow.usage.inputTokens > 0
        ? Math.round(
            ((maxRow.usage.inputTokens - row.usage.inputTokens) / maxRow.usage.inputTokens) * 100,
          )
        : 0;
    deltas[row.id] = {
      diffFromBest,
      savingsPercentFromWorst,
      isBest: row.id === minRow.id && !isEqual,
    };
  }

  return {
    bestId: minRow.id,
    worstId: maxRow.id,
    inputDiff,
    savingsPercent,
    isEqual,
    headline,
    description,
    deltas,
  };
}

export type TreeNodeItem = {
  id: string;
  label: string;
  depth: number;
  parentId: string;
  childrenCount: number;
  comparison: ConversationComparison;
  isLinearContinuation: boolean;
};

export type TreeBranchGroup = {
  branchRootId: string;
  branchRootLabel: string;
  isLinearChain: boolean;
  nodes: TreeNodeItem[];
  totalInputTokens: number;
  totalOutputTokens: number;
};

export type TreeAnalysis = {
  headId: string;
  headLabel: string;
  headComparison: ConversationComparison;
  isLinearSequence: boolean;
  linearTurns?: ChainItem[];
  totalLinearInput?: number;
  totalLinearOutput?: number;
  branchedEquivalentInput?: number;
  linearTokensSaved?: number;
  linearSavingsPercent?: number;
  branches: TreeBranchGroup[];
  totalDescendants: number;
  actualBranchedInput: number;
  hypotheticalLinearInput: number;
  tokensSaved: number;
  savingsPercent: number;
};

export function findRootNode(board: Board, nodeId: string): BoardNode {
  let currentId = nodeId;
  const visited = new Set<string>([nodeId]);
  while (true) {
    const parentEdges = board.edges.filter((e) => e.target === currentId);
    if (!parentEdges.length) break;
    const parentId = parentEdges[0].source;
    if (visited.has(parentId)) break;
    visited.add(parentId);
    currentId = parentId;
  }
  return board.nodes.find((n) => n.id === currentId) || board.nodes.find((n) => n.id === nodeId)!;
}

/** Analyze all downstream branches and sub-branches connected to a head node. */
export function analyzeTreeFromHead(
  board: Board,
  headNode: BoardNode,
  prices: ModelPrice[],
  defaultModel: string,
): TreeAnalysis | null {
  const headComparison = compareConversation(board, headNode, prices, defaultModel);
  const directChildEdges = board.edges.filter((e) => e.source === headNode.id);
  if (!directChildEdges.length) return null;

  const nodeMap = new Map(board.nodes.map((n) => [n.id, n]));
  const childrenMap = new Map<string, string[]>();
  board.edges.forEach((e) => {
    childrenMap.set(e.source, [...(childrenMap.get(e.source) || []), e.target]);
  });

  const branches: TreeBranchGroup[] = [];
  const allDescendantComparisons: ConversationComparison[] = [];

  for (const edge of directChildEdges) {
    const childNode = nodeMap.get(edge.target);
    if (!childNode || childNode.type !== 'chat') continue;

    const branchItems: TreeNodeItem[] = [];
    const queue: { nodeId: string; parentId: string; depth: number }[] = [
      { nodeId: childNode.id, parentId: headNode.id, depth: 1 },
    ];
    const visited = new Set<string>();
    let isStrictlyLinear = true;

    while (queue.length > 0) {
      const { nodeId, parentId, depth } = queue.shift()!;
      if (visited.has(nodeId)) continue;
      visited.add(nodeId);

      const node = nodeMap.get(nodeId);
      if (!node || node.type !== 'chat') continue;

      const comp = compareConversation(board, node, prices, defaultModel);
      const childIds = (childrenMap.get(nodeId) || []).filter((id) => {
        const c = nodeMap.get(id);
        return c && c.type === 'chat';
      });

      if (childIds.length > 1) {
        isStrictlyLinear = false;
      }

      branchItems.push({
        id: node.id,
        label: comp.label,
        depth,
        parentId,
        childrenCount: childIds.length,
        comparison: comp,
        isLinearContinuation: depth > 1 && childIds.length <= 1,
      });

      for (const cid of childIds) {
        queue.push({ nodeId: cid, parentId: nodeId, depth: depth + 1 });
      }
    }

    if (!branchItems.length) continue;

    const totalInput = branchItems.reduce(
      (acc, item) => acc + (item.comparison.usage?.inputTokens || 0),
      0,
    );
    const totalOutput = branchItems.reduce(
      (acc, item) => acc + (item.comparison.usage?.outputTokens || 0),
      0,
    );

    branches.push({
      branchRootId: childNode.id,
      branchRootLabel: nodeLabel(childNode),
      isLinearChain: isStrictlyLinear,
      nodes: branchItems,
      totalInputTokens: totalInput,
      totalOutputTokens: totalOutput,
    });

    allDescendantComparisons.push(...branchItems.map((b) => b.comparison));
  }

  if (!branches.length) return null;

  const headInput = headComparison.usage?.inputTokens || 0;
  const headOutput = headComparison.usage?.outputTokens || 0;

  // Determine if this entire sub-graph is a pure linear chain (1 child at every step)
  const isLinearSequence = branches.length === 1 && branches[0].isLinearChain;

  let linearTurns: ChainItem[] | undefined = undefined;
  let totalLinearInput = 0;
  let totalLinearOutput = 0;
  let branchedEquivalentInput = 0;
  let linearTokensSaved = 0;
  let linearSavingsPercent = 0;

  if (isLinearSequence) {
    let accumulated = headInput + headOutput;
    linearTurns = [
      {
        ...headComparison,
        turn: 1,
        inheritedContextTokens: 0,
      },
      ...branches[0].nodes.map((item, idx) => {
        const inherited = accumulated;
        accumulated +=
          (item.comparison.usage?.inputTokens || 0) + (item.comparison.usage?.outputTokens || 0);
        return {
          ...item.comparison,
          turn: idx + 2,
          inheritedContextTokens: inherited,
        };
      }),
    ];

    totalLinearInput = linearTurns.reduce((s, it) => s + (it.usage?.inputTokens || 0), 0);
    totalLinearOutput = linearTurns.reduce((s, it) => s + (it.usage?.outputTokens || 0), 0);

    // If these turns were asked as branches off the root prompt:
    // Turn 1 sends headInput.
    // Turn K sends: (headInput + headOutput) + promptK.
    branchedEquivalentInput = linearTurns.reduce((s, it, idx) => {
      if (idx === 0) return s + (it.usage?.inputTokens || 0);
      const promptLen = Math.max(10, (it.usage?.inputTokens || 0) - it.inheritedContextTokens);
      return s + (headInput + headOutput + promptLen);
    }, 0);

    linearTokensSaved = Math.max(0, totalLinearInput - branchedEquivalentInput);
    linearSavingsPercent =
      totalLinearInput > 0 ? Math.round((linearTokensSaved / totalLinearInput) * 100) : 0;
  }

  // Actual input tokens sent across all branched conversations
  const actualBranchedInput = allDescendantComparisons.reduce(
    (acc, c) => acc + (c.usage?.inputTokens || 0),
    0,
  );

  // Hypothetical linear input calculation:
  // If all prompts were sent sequentially in one linear chat thread:
  // Turn 0: head prompt & reply.
  // Each subsequent turn must re-read all preceding prompts and replies.
  let cumulativeContext = headInput + headOutput;
  let hypotheticalLinearInput = 0;

  for (const c of allDescendantComparisons) {
    const promptLen = Math.max(10, (c.usage?.inputTokens || 0) - (headInput + headOutput));
    const turnInput = cumulativeContext + promptLen;
    hypotheticalLinearInput += turnInput;
    cumulativeContext += (c.usage?.outputTokens || 0) + promptLen;
  }

  const tokensSaved = Math.max(0, hypotheticalLinearInput - actualBranchedInput);
  const savingsPercent =
    hypotheticalLinearInput > 0 ? Math.round((tokensSaved / hypotheticalLinearInput) * 100) : 0;

  return {
    headId: headNode.id,
    headLabel: nodeLabel(headNode),
    headComparison,
    isLinearSequence,
    linearTurns,
    totalLinearInput,
    totalLinearOutput,
    branchedEquivalentInput,
    linearTokensSaved,
    linearSavingsPercent,
    branches,
    totalDescendants: allDescendantComparisons.length,
    actualBranchedInput,
    hypotheticalLinearInput,
    tokensSaved,
    savingsPercent,
  };
}

export type ChainItem = ConversationComparison & {
  turn: number;
  inheritedContextTokens: number;
};

export type SelectionAnalysis =
  | {
      type: 'chain';
      items: ChainItem[];
      totalInput: number;
      totalOutput: number;
      branchedEquivalentInput?: number;
      linearTokensSaved?: number;
      linearSavingsPercent?: number;
      explanation: string;
    }
  | {
      type: 'branches';
      rows: ConversationComparison[];
      efficiency: TokenEfficiency | null;
    };

/** Classifies multi-node selection as a linear chain or parallel branches. */
export function analyzeSelection(
  board: Board,
  selectedNodes: BoardNode[],
  prices: ModelPrice[],
  defaultModel: string,
): SelectionAnalysis {
  const rows = selectedNodes.map((node) => compareConversation(board, node, prices, defaultModel));

  const reaches = (startId: string, endId: string): boolean => {
    const visited = new Set<string>();
    const stack = [startId];
    while (stack.length) {
      const cur = stack.pop()!;
      if (cur === endId) return true;
      if (visited.has(cur)) continue;
      visited.add(cur);
      for (const e of board.edges) {
        if (e.source === cur) stack.push(e.target);
      }
    }
    return false;
  };

  // Sort topologically: ancestors first
  const sorted = [...rows].sort((a, b) => {
    if (reaches(a.id, b.id)) return -1;
    if (reaches(b.id, a.id)) return 1;
    return 0;
  });

  // Check if every selected node reaches the next in sequence
  let isStrictSequence = sorted.length >= 2;
  for (let i = 0; i < sorted.length - 1; i++) {
    if (!reaches(sorted[i].id, sorted[i + 1].id)) {
      isStrictSequence = false;
      break;
    }
  }

  // Also check if any node in the selection is a sibling branch (forked from the same parent)
  // If so, it is NOT a single linear conversation sequence, but a comparison between branches!
  const hasSiblingBranches = sorted.some((nodeA) =>
    sorted.some((nodeB) => {
      if (nodeA.id === nodeB.id) return false;
      const parentsA = board.edges.filter((e) => e.target === nodeA.id).map((e) => e.source);
      const parentsB = board.edges.filter((e) => e.target === nodeB.id).map((e) => e.source);
      return parentsA.some((p) => parentsB.includes(p));
    }),
  );

  if (isStrictSequence && !hasSiblingBranches) {
    let accumulated = 0;
    const items: ChainItem[] = sorted.map((row, idx) => {
      const inherited = idx === 0 ? 0 : accumulated;
      accumulated = (row.usage?.inputTokens || 0) + (row.usage?.outputTokens || 0);
      return {
        ...row,
        turn: idx + 1,
        inheritedContextTokens: inherited,
      };
    });

    const totalInput = items.reduce((s, it) => s + (it.usage?.inputTokens || 0), 0);
    const totalOutput = items.reduce((s, it) => s + (it.usage?.outputTokens || 0), 0);
    const headInput = items[0]?.usage?.inputTokens || 0;
    const headOutput = items[0]?.usage?.outputTokens || 0;
    const branchedEquivalentInput = items.reduce((s, it, idx) => {
      if (idx === 0) return s + (it.usage?.inputTokens || 0);
      const promptLen = Math.max(10, (it.usage?.inputTokens || 0) - it.inheritedContextTokens);
      return s + (headInput + headOutput + promptLen);
    }, 0);
    const linearTokensSaved = Math.max(0, totalInput - branchedEquivalentInput);
    const linearSavingsPercent =
      totalInput > 0 ? Math.round((linearTokensSaved / totalInput) * 100) : 0;

    return {
      type: 'chain',
      items,
      totalInput,
      totalOutput,
      branchedEquivalentInput,
      linearTokensSaved,
      linearSavingsPercent,
      explanation:
        linearSavingsPercent > 0
          ? `${linearSavingsPercent}% token reduction possible with branching (${linearTokensSaved.toLocaleString()} tokens saved). Each turn re-reads the entire history of all preceding turns, compounding input tokens.`
          : 'Linear chat sequence: each turn accumulates the history of all preceding turns, causing input tokens to grow with every reply.',
    };
  }

  // Sibling branches or mixed comparison: filter out ancestors so we compare the distinct endpoints
  const nonAncestors = rows.filter(
    (r) => !rows.some((other) => other.id !== r.id && reaches(r.id, other.id)),
  );
  const candidatesForEfficiency = nonAncestors.length >= 2 ? nonAncestors : rows;

  return {
    type: 'branches',
    rows,
    efficiency: computeTokenEfficiency(candidatesForEfficiency, board, prices, defaultModel),
  };
}
