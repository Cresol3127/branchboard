import { describe, expect, it } from 'vitest';
import {
  analyzeSelection,
  analyzeTreeFromHead,
  compareConversation,
  computeTokenEfficiency,
  readTokenPrices,
} from '../src/tokenComparison';
import { readGeneration, reportedUsage } from '../src/tokenUsage';
import { estimateTokens } from '../src/graph';
import type { Board, BoardNode, ModelPrice } from '../src/types';

const node = (id: string): BoardNode => ({
  id,
  type: 'chat',
  position: { x: 0, y: 0 },
  data: { title: id, note: '', color: 'sage', messages: [] },
});
const price: ModelPrice = {
  id: 'price',
  provider: 'openai',
  model: 'original-model',
  currency: 'USD',
  inputPerMillion: 2,
  outputPerMillion: 8,
  updatedAt: 0,
};

describe('token comparisons', () => {
  it('compares the latest recorded reply using its original model, including after model changes', () => {
    const chat = node('chat');
    chat.data.provider = 'anthropic';
    chat.data.model = 'new-model';
    chat.data.messages = [
      {
        id: 'a',
        role: 'assistant',
        content: 'Earlier',
        generation: {
          provider: 'openai',
          model: 'original-model',
          status: 'completed',
          usage: reportedUsage(999, 999)!,
        },
      },
      {
        id: 'b',
        role: 'assistant',
        content: 'Edited text',
        generation: {
          provider: 'openai',
          model: 'original-model',
          status: 'completed',
          usage: reportedUsage(100, 20)!,
        },
      },
    ];
    const board: Board = { id: 'b', name: 'Board', nodes: [chat], edges: [], updatedAt: 0 };
    expect(compareConversation(board, chat, [price], 'default')).toMatchObject({
      model: 'original-model',
      provider: 'openai',
      usage: { inputTokens: 100, outputTokens: 20, totalTokens: 120, source: 'provider' },
      cost: 0.00036,
      historical: false,
    });
  });

  it('reconstructs historical input before the latest reply, respects branch cutoffs, and deduplicates shared ancestors', () => {
    const root = node('root'),
      a = node('a'),
      b = node('b'),
      child = node('child');
    root.data.messages = [
      { id: 'kept', role: 'user', content: 'Shared context' },
      { id: 'later', role: 'user', content: 'Not included' },
    ];
    child.data.messages = [
      { id: 'q', role: 'user', content: 'Question' },
      { id: 'r', role: 'assistant', content: 'Answer' },
      { id: 'next', role: 'user', content: 'Unanswered next prompt' },
    ];
    const board: Board = {
      id: 'board',
      name: 'Board',
      updatedAt: 0,
      nodes: [root, a, b, child],
      edges: [
        { id: 'ra', source: 'root', target: 'a', data: { historyMessageIds: ['kept'] } },
        { id: 'rb', source: 'root', target: 'b', data: { historyMessageIds: ['kept'] } },
        { id: 'ac', source: 'a', target: 'child' },
        { id: 'bc', source: 'b', target: 'child' },
      ],
    };
    expect(compareConversation(board, child, [], 'default')).toMatchObject({
      historical: true,
      cost: null,
      usage: {
        inputTokens: estimateTokens([{ content: 'Shared context' }, { content: 'Question' }]),
        outputTokens: 2,
        source: 'estimated',
      },
    });
    expect(compareConversation(board, a, [], 'default').usage).toBeNull();
  });

  it('rejects partial, negative, infinite and invalid imported counters instead of labelling them reported', () => {
    expect(reportedUsage(undefined, 2)).toBeNull();
    expect(reportedUsage(-1, 2)).toBeNull();
    expect(reportedUsage(Infinity, 2)).toBeNull();
    expect(reportedUsage(0, 0)).toEqual({
      inputTokens: 0,
      outputTokens: 0,
      totalTokens: 0,
      source: 'provider',
    });
    const generation = {
      provider: 'openai',
      model: 'model',
      status: 'completed',
      usage: reportedUsage(5, 2),
    };
    expect(readGeneration(generation)).toEqual(generation);
    expect(
      readGeneration({ ...generation, usage: { ...generation.usage, totalTokens: 1 } }),
    ).toBeUndefined();
    expect(readGeneration({ ...generation, provider: 'fake' })).toBeUndefined();
  });

  it('preserves explicit zero prices but rejects malformed and unsupported pricing', () => {
    expect(
      readTokenPrices([
        price,
        { ...price, inputPerMillion: -1 },
        { ...price, outputPerMillion: Infinity },
        { ...price, currency: 'EUR' },
      ]),
    ).toEqual([price]);
    expect(readTokenPrices([{ ...price, inputPerMillion: 0, outputPerMillion: 0 }])).toHaveLength(
      1,
    );
    expect(readTokenPrices(null)).toEqual([]);
  });

  it('computes efficiency delta and savings percentage between linear and branched conversations', () => {
    const linear = {
      id: 'linear',
      label: 'Linear thread',
      usage: {
        inputTokens: 1000,
        outputTokens: 200,
        totalTokens: 1200,
        source: 'provider' as const,
      },
    };
    const branched = {
      id: 'branched',
      label: 'Branched fork',
      usage: { inputTokens: 400, outputTokens: 150, totalTokens: 550, source: 'provider' as const },
    };

    const efficiency = computeTokenEfficiency([linear, branched]);
    expect(efficiency).not.toBeNull();
    expect(efficiency?.bestId).toBe('branched');
    expect(efficiency?.worstId).toBe('linear');
    expect(efficiency?.inputDiff).toBe(600);
    expect(efficiency?.savingsPercent).toBe(60);
    expect(efficiency?.isEqual).toBe(false);
    expect(efficiency?.headline).toContain('60% more token-efficient');
    expect(efficiency?.description).toContain('600 fewer input tokens');
    expect(efficiency?.deltas['branched']).toEqual({
      diffFromBest: 0,
      savingsPercentFromWorst: 60,
      isBest: true,
    });
    expect(efficiency?.deltas['linear']).toEqual({
      diffFromBest: 600,
      savingsPercentFromWorst: 0,
      isBest: false,
    });
  });

  it('handles identical input token usage gracefully', () => {
    const a = {
      id: 'a',
      label: 'Chat A',
      usage: { inputTokens: 500, outputTokens: 100, totalTokens: 600, source: 'provider' as const },
    };
    const b = {
      id: 'b',
      label: 'Chat B',
      usage: { inputTokens: 500, outputTokens: 120, totalTokens: 620, source: 'provider' as const },
    };

    const efficiency = computeTokenEfficiency([a, b]);
    expect(efficiency).not.toBeNull();
    expect(efficiency?.isEqual).toBe(true);
    expect(efficiency?.inputDiff).toBe(0);
    expect(efficiency?.savingsPercent).toBe(0);
    expect(efficiency?.headline).toBe('Identical input token usage');
    expect(efficiency?.deltas['a'].isBest).toBe(false);
    expect(efficiency?.deltas['b'].isBest).toBe(false);
  });

  it('returns null when fewer than two candidates have usage', () => {
    expect(computeTokenEfficiency([])).toBeNull();
    expect(
      computeTokenEfficiency([
        { id: '1', label: '1', usage: null },
        { id: '2', label: '2', usage: null },
      ]),
    ).toBeNull();
    expect(
      computeTokenEfficiency([
        {
          id: '1',
          label: '1',
          usage: { inputTokens: 100, outputTokens: 10, totalTokens: 110, source: 'provider' },
        },
        { id: '2', label: '2', usage: null },
      ]),
    ).toBeNull();
  });

  it('estimates prompt preview tokens for conversations without replies yet', () => {
    const chat = node('preview-chat');
    chat.data.messages = [{ id: 'u1', role: 'user', content: 'What is the capital of France?' }];
    const board: Board = { id: 'b', name: 'Board', nodes: [chat], edges: [], updatedAt: 0 };
    const comparison = compareConversation(board, chat, [], 'default');
    expect(comparison.pending).toBe(true);
    expect(comparison.usage).not.toBeNull();
    expect(comparison.usage?.inputTokens).toBeGreaterThan(0);
    expect(comparison.usage?.outputTokens).toBe(0);
  });

  it('analyzes tree structure from head node, identifying branches, sub-chains, and token savings', () => {
    const root = node('root');
    root.data.messages = [
      { id: 'r1', role: 'user', content: 'What is an operating system?' },
      {
        id: 'r2',
        role: 'assistant',
        content: 'An OS is system software that manages hardware and software.',
        generation: {
          provider: 'openai',
          model: 'gpt-4o',
          status: 'completed',
          usage: reportedUsage(10, 100)!,
        },
      },
    ];

    const branch1 = node('branch1');
    branch1.data.messages = [
      { id: 'b1-1', role: 'user', content: 'What is a kernel?' },
      {
        id: 'b1-2',
        role: 'assistant',
        content: 'The kernel is the core of the OS.',
        generation: {
          provider: 'openai',
          model: 'gpt-4o',
          status: 'completed',
          usage: reportedUsage(120, 80)!,
        },
      },
    ];

    const branch1Child = node('branch1Child');
    branch1Child.data.messages = [
      { id: 'b1c-1', role: 'user', content: 'What is a device driver?' },
      {
        id: 'b1c-2',
        role: 'assistant',
        content: 'A driver operates a specific device.',
        generation: {
          provider: 'openai',
          model: 'gpt-4o',
          status: 'completed',
          usage: reportedUsage(210, 60)!,
        },
      },
    ];

    const branch2 = node('branch2');
    branch2.data.messages = [
      { id: 'b2-1', role: 'user', content: 'Difference between Android and iOS?' },
      {
        id: 'b2-2',
        role: 'assistant',
        content: 'Android is open-source based on Linux; iOS is closed-source based on Darwin.',
        generation: {
          provider: 'openai',
          model: 'gpt-4o',
          status: 'completed',
          usage: reportedUsage(120, 90)!,
        },
      },
    ];

    const board: Board = {
      id: 'board-tree',
      name: 'Tree Test',
      updatedAt: 0,
      nodes: [root, branch1, branch1Child, branch2],
      edges: [
        { id: 'e1', source: 'root', target: 'branch1' },
        { id: 'e2', source: 'branch1', target: 'branch1Child' },
        { id: 'e3', source: 'root', target: 'branch2' },
      ],
    };

    const tree = analyzeTreeFromHead(board, root, [], 'default');
    expect(tree).not.toBeNull();
    expect(tree?.headId).toBe('root');
    expect(tree?.branches).toHaveLength(2);
    expect(tree?.totalDescendants).toBe(3);

    // Branch 1 has 2 nodes in linear continuation
    const b1 = tree?.branches.find((b) => b.branchRootId === 'branch1');
    expect(b1).toBeDefined();
    expect(b1?.nodes).toHaveLength(2);
    expect(b1?.nodes[0].depth).toBe(1);
    expect(b1?.nodes[1].depth).toBe(2);
    expect(b1?.nodes[1].isLinearContinuation).toBe(true);

    // Branch 2 has 1 node
    const b2 = tree?.branches.find((b) => b.branchRootId === 'branch2');
    expect(b2).toBeDefined();
    expect(b2?.nodes).toHaveLength(1);

    // Tokens saved by branching vs single linear chat
    expect(tree?.actualBranchedInput).toBe(120 + 210 + 120); // 450
    expect(tree?.hypotheticalLinearInput).toBeGreaterThan(tree?.actualBranchedInput || 0);
    expect(tree?.tokensSaved).toBeGreaterThan(0);
    expect(tree?.savingsPercent).toBeGreaterThan(0);
  });

  it('classifies a multi-node selection as a linear chain with accumulated context', () => {
    const n1 = node('n1');
    n1.data.messages = [
      { id: '1', role: 'user', content: 'Step 1' },
      {
        id: '2',
        role: 'assistant',
        content: 'Ans 1',
        generation: {
          provider: 'openai',
          model: 'm',
          status: 'completed',
          usage: reportedUsage(10, 50)!,
        },
      },
    ];
    const n2 = node('n2');
    n2.data.messages = [
      { id: '3', role: 'user', content: 'Step 2' },
      {
        id: '4',
        role: 'assistant',
        content: 'Ans 2',
        generation: {
          provider: 'openai',
          model: 'm',
          status: 'completed',
          usage: reportedUsage(70, 60)!,
        },
      },
    ];
    const n3 = node('n3');
    n3.data.messages = [
      { id: '5', role: 'user', content: 'Step 3' },
      {
        id: '6',
        role: 'assistant',
        content: 'Ans 3',
        generation: {
          provider: 'openai',
          model: 'm',
          status: 'completed',
          usage: reportedUsage(140, 80)!,
        },
      },
    ];

    const board: Board = {
      id: 'chain-board',
      name: 'Chain',
      updatedAt: 0,
      nodes: [n1, n2, n3],
      edges: [
        { id: 'e12', source: 'n1', target: 'n2' },
        { id: 'e23', source: 'n2', target: 'n3' },
      ],
    };

    // Selecting all three nodes in the chain
    const analysis = analyzeSelection(board, [n3, n1, n2], [], 'default');
    expect(analysis.type).toBe('chain');
    if (analysis.type === 'chain') {
      expect(analysis.items).toHaveLength(3);
      expect(analysis.items[0].id).toBe('n1');
      expect(analysis.items[0].turn).toBe(1);
      expect(analysis.items[1].id).toBe('n2');
      expect(analysis.items[1].turn).toBe(2);
      expect(analysis.items[2].id).toBe('n3');
      expect(analysis.items[2].turn).toBe(3);
      expect(analysis.items[1].inheritedContextTokens).toBeGreaterThan(0);
      expect(analysis.linearSavingsPercent).toBeGreaterThan(0);
      expect(analysis.linearTokensSaved).toBeGreaterThan(0);
    }
  });

  it('compares two root nodes across conversation trees and produces full architecture comparison', () => {
    // Chain head and downstream chain
    const c1 = node('c1');
    c1.data.messages = [
      { id: 'm1', role: 'user', content: 'What is an OS?' },
      {
        id: 'm2',
        role: 'assistant',
        content: 'OS is software',
        generation: {
          provider: 'openai',
          model: 'gpt-4o',
          status: 'completed',
          usage: reportedUsage(10, 100)!,
        },
      },
    ];
    const c2 = node('c2');
    c2.data.messages = [
      { id: 'm3', role: 'user', content: 'Difference between android and ios' },
      {
        id: 'm4',
        role: 'assistant',
        content: 'Android vs iOS',
        generation: {
          provider: 'openai',
          model: 'gpt-4o',
          status: 'completed',
          usage: reportedUsage(120, 150)!,
        },
      },
    ];
    const c3 = node('c3');
    c3.data.messages = [
      { id: 'm5', role: 'user', content: 'What is a process?' },
      {
        id: 'm6',
        role: 'assistant',
        content: 'Process is program in execution',
        generation: {
          provider: 'openai',
          model: 'gpt-4o',
          status: 'completed',
          usage: reportedUsage(280, 200)!,
        },
      },
    ];

    // Tree head and downstream branches
    const tHead = node('tHead');
    tHead.data.messages = [
      { id: 'tm1', role: 'user', content: 'What is an OS?' },
      {
        id: 'tm2',
        role: 'assistant',
        content: 'OS is software',
        generation: {
          provider: 'openai',
          model: 'gpt-4o',
          status: 'completed',
          usage: reportedUsage(10, 100)!,
        },
      },
    ];
    const tb1 = node('tb1');
    tb1.data.messages = [
      { id: 'tm3', role: 'user', content: 'Difference between android and ios' },
      {
        id: 'tm4',
        role: 'assistant',
        content: 'Android vs iOS',
        generation: {
          provider: 'openai',
          model: 'gpt-4o',
          status: 'completed',
          usage: reportedUsage(120, 150)!,
        },
      },
    ];
    const tb2 = node('tb2');
    tb2.data.messages = [
      { id: 'tm5', role: 'user', content: 'What is a process?' },
      {
        id: 'tm6',
        role: 'assistant',
        content: 'Process is program in execution',
        generation: {
          provider: 'openai',
          model: 'gpt-4o',
          status: 'completed',
          usage: reportedUsage(120, 200)!,
        },
      },
    ];

    const board: Board = {
      id: 'dual-board',
      name: 'Dual Architecture',
      updatedAt: 0,
      nodes: [c1, c2, c3, tHead, tb1, tb2],
      edges: [
        { id: 'ec12', source: 'c1', target: 'c2' },
        { id: 'ec23', source: 'c2', target: 'c3' },
        { id: 'et1', source: 'tHead', target: 'tb1' },
        { id: 'et2', source: 'tHead', target: 'tb2' },
      ],
    };

    const sel = analyzeSelection(board, [c1, tHead], [], 'default');
    expect(sel.type).toBe('branches');
    if (sel.type === 'branches') {
      expect(sel.efficiency).not.toBeNull();
      expect(sel.efficiency?.treeComparison).toBeDefined();
      expect(sel.efficiency?.treeComparison?.linearTotalInput).toBe(410); // 10 + 120 + 280
      expect(sel.efficiency?.treeComparison?.branchedTotalInput).toBe(240); // 120 + 120
      expect(sel.efficiency?.treeComparison?.totalSavingsPercent).toBe(41); // (410 - 240) / 410 = 41%
      expect(sel.efficiency?.headline).toContain('more token-efficient across conversation');
      expect(sel.efficiency?.description).toContain('Full conversation architecture comparison');
    }
  });

  it('explains compounding context when comparing a linear turn with an isolated branch', () => {
    const c1 = node('c1');
    c1.data.messages = [
      { id: 'm1', role: 'user', content: 'Prompt 1' },
      {
        id: 'm2',
        role: 'assistant',
        content: 'Reply 1',
        generation: {
          provider: 'openai',
          model: 'gpt-4o',
          status: 'completed',
          usage: reportedUsage(10, 600)!,
        },
      },
    ];
    const c2 = node('c2');
    c2.data.messages = [
      { id: 'm3', role: 'user', content: 'Prompt 2' },
      {
        id: 'm4',
        role: 'assistant',
        content: 'Reply 2',
        generation: {
          provider: 'openai',
          model: 'gpt-4o',
          status: 'completed',
          usage: reportedUsage(670, 800)!,
        },
      },
    ];

    const tHead = node('tHead');
    tHead.data.messages = [
      { id: 'tm1', role: 'user', content: 'Prompt 1' },
      {
        id: 'tm2',
        role: 'assistant',
        content: 'Reply 1',
        generation: {
          provider: 'openai',
          model: 'gpt-4o',
          status: 'completed',
          usage: reportedUsage(10, 600)!,
        },
      },
    ];
    const tb1 = node('tb1');
    tb1.data.messages = [
      { id: 'tm3', role: 'user', content: 'Prompt 2' },
      {
        id: 'tm4',
        role: 'assistant',
        content: 'Reply 2',
        generation: {
          provider: 'openai',
          model: 'gpt-4o',
          status: 'completed',
          usage: reportedUsage(610, 800)!,
        },
      },
    ];
    const tb2 = node('tb2');
    tb2.data.messages = [
      { id: 'tm5', role: 'user', content: 'Prompt 3' },
      {
        id: 'tm6',
        role: 'assistant',
        content: 'Reply 3',
        generation: {
          provider: 'openai',
          model: 'gpt-4o',
          status: 'completed',
          usage: reportedUsage(610, 800)!,
        },
      },
    ];

    const board: Board = {
      id: 'b',
      name: 'B',
      updatedAt: 0,
      nodes: [c1, c2, tHead, tb1, tb2],
      edges: [
        { id: 'e1', source: 'c1', target: 'c2' },
        { id: 'e2', source: 'tHead', target: 'tb1' },
        { id: 'e3', source: 'tHead', target: 'tb2' },
      ],
    };

    const sel = analyzeSelection(board, [c2, tb1], [], 'default');
    expect(sel.type).toBe('branches');
    if (sel.type === 'branches') {
      expect(sel.efficiency).not.toBeNull();
      expect(sel.efficiency?.savingsPercent).toBe(9); // (670 - 610) / 670 = 8.95% -> 9%
      expect(sel.efficiency?.description).toContain(
        'At Turn 2, savings are 9% because only 1 prior turn has accumulated',
      );
      expect(sel.efficiency?.description).toContain(
        'branch isolation saves up to ~60% across the full conversation',
      );
    }
  });
});
