import { Component, useId, useState, type ReactNode } from 'react';
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  GitBranch,
  Layers,
  Link2,
  Maximize2,
  Minimize2,
  X,
  Zap,
} from 'lucide-react';
import { currentBoard, useStore } from '../store';
import { canConnect } from '../graph';
import {
  analyzeSelection,
  analyzeTreeFromHead,
  findRootNode,
  readTokenPrices,
  TOKEN_PRICES_KEY,
} from '../tokenComparison';
import { formatCost } from '../tokens';
import { providerDefinitions, type ProviderId } from '../providers';
import type { BoardNode, ModelPrice } from '../types';
import { IconButton } from './ui';

const DEFAULT_COMPACT_SIZE = { width: 640, height: 195 };

class TokenErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('TokenComparison error caught by boundary:', error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
      return null;
    }
    return this.props.children;
  }
}

function loadPrices() {
  try {
    return readTokenPrices(JSON.parse(localStorage.getItem(TOKEN_PRICES_KEY) || '[]'));
  } catch {
    return [];
  }
}

export function TokenComparison() {
  const state = useStore();
  const board = currentBoard(state);
  const selected = board.nodes.filter((node) => node.selected && node.type === 'chat');

  // Trigger when:
  // 1. Single node selected that has connections (inbound or outbound)
  const singleConnected =
    selected.length === 1 &&
    board.edges.some((e) => e.source === selected[0].id || e.target === selected[0].id);

  // 2. Or two or more nodes selected
  const shouldShow = singleConnected || selected.length >= 2;

  const key = JSON.stringify([board.id, selected.map((node) => node.id).sort()]);
  return shouldShow ? (
    <TokenErrorBoundary>
      <ComparisonIsland
        key={key}
        headNode={singleConnected ? findRootNode(board, selected[0].id) : undefined}
        activeNodeId={singleConnected ? selected[0].id : undefined}
      />
    </TokenErrorBoundary>
  ) : null;
}

function ComparisonIsland({
  headNode,
  activeNodeId,
}: {
  headNode?: BoardNode;
  activeNodeId?: string;
}) {
  const state = useStore();
  const board = currentBoard(state);
  const [closed, setClosed] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [expandedDetails, setExpandedDetails] = useState(false);
  const [prices, setPrices] = useState(loadPrices);
  const [pricingOpen, setPricingOpen] = useState(false);
  const [notice, setNotice] = useState('');
  const detailsId = useId();

  // Position starts at { x: 0, y: 0 } on every mount!
  // When closed and opened again, it always starts from the main middle top position!
  const [position, setPosition] = useState<{ x: number; y: number }>({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);

  // Default compact size showing the header + first green big text box!
  const [size, setSize] = useState<{ width: number; height: number }>(DEFAULT_COMPACT_SIZE);
  const [isResizing, setIsResizing] = useState(false);

  // Header dragging handlers (window move)
  const onHeaderPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if ((e.target as HTMLElement).closest('button, input, a, [role="button"]')) {
      return;
    }
    e.preventDefault();
    setIsDragging(true);
    const startPointerX = e.clientX;
    const startPointerY = e.clientY;
    const startPosX = position.x;
    const startPosY = position.y;

    const onPointerMove = (moveEv: PointerEvent) => {
      const dx = moveEv.clientX - startPointerX;
      const dy = moveEv.clientY - startPointerY;
      setPosition({
        x: startPosX + dx,
        y: startPosY + dy,
      });
    };

    const onPointerUp = () => {
      setIsDragging(false);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      window.removeEventListener('pointercancel', onPointerUp);
    };

    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerUp);
  };

  // Resize handler supporting bottom, right, left, and corner dragging
  type ResizeDirection = 'se' | 'sw' | 's' | 'e' | 'w';

  const startResize = (e: React.PointerEvent<HTMLElement>, direction: ResizeDirection) => {
    e.preventDefault();
    e.stopPropagation();
    setIsResizing(true);

    const startX = e.clientX;
    const startY = e.clientY;
    const startW = size.width;
    const startH = size.height;
    const startPosX = position.x;

    const minW = 380;
    const maxW = Math.max(minW, window.innerWidth - 32);
    const minH = 195;
    const maxH = Math.max(minH, window.innerHeight - 50);

    const handlePointerMove = (moveEv: PointerEvent) => {
      const dx = moveEv.clientX - startX;
      const dy = moveEv.clientY - startY;

      let newW = startW;
      let newH = startH;
      let newPosX = startPosX;

      if (direction === 'se' || direction === 'sw' || direction === 's') {
        newH = Math.round(Math.max(minH, Math.min(maxH, startH + dy)));
      }

      if (direction === 'se' || direction === 'e') {
        newW = Math.round(Math.max(minW, Math.min(maxW, startW + dx)));
        const actualDx = newW - startW;
        newPosX = startPosX + actualDx / 2;
      }

      if (direction === 'sw' || direction === 'w') {
        newW = Math.round(Math.max(minW, Math.min(maxW, startW - dx)));
        const actualDx = startW - newW;
        newPosX = startPosX + actualDx / 2;
      }

      setSize({ width: newW, height: newH });
      setPosition((prev) => ({ ...prev, x: newPosX }));
    };

    const handlePointerUp = () => {
      setIsResizing(false);
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
      window.removeEventListener('pointercancel', handlePointerUp);
    };

    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
    window.addEventListener('pointercancel', handlePointerUp);
  };

  const toggleSizePreset = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (size.height > 260) {
      setSize(DEFAULT_COMPACT_SIZE);
    } else {
      const maxW = Math.max(380, window.innerWidth - 32);
      const maxH = Math.max(260, window.innerHeight - 60);
      setSize({
        width: Math.min(680, maxW),
        height: Math.min(520, maxH),
      });
    }
  };

  const selected = board.nodes.filter((node) => node.selected && node.type === 'chat');

  // If headNode is passed, analyze the full downstream tree of branches and chains
  const tree = headNode ? analyzeTreeFromHead(board, headNode, prices, state.model) : null;

  // Otherwise, analyze the multi-node selection
  const selectionAnalysis = !headNode
    ? analyzeSelection(board, selected, prices, state.model)
    : null;

  const allRows = tree
    ? tree.isLinearSequence && tree.linearTurns
      ? tree.linearTurns
      : [tree.headComparison, ...tree.branches.flatMap((b) => b.nodes.map((n) => n.comparison))]
    : selectionAnalysis?.type === 'chain'
      ? selectionAnalysis.items
      : selectionAnalysis?.rows || [];

  const models = [
    ...new Map(allRows.map((row) => [JSON.stringify([row.provider, row.model]), row])).values(),
  ];

  if (closed) return null;
  const close = () => {
    setClosed(true);
    state.nodesChange(board.nodes.map((n) => ({ type: 'select', id: n.id, selected: false })));
    document
      .querySelector<HTMLTextAreaElement>('.message-bar textarea')
      ?.focus({ preventScroll: true });
  };

  const number = (value: number | null | undefined) =>
    value === null || value === undefined || !Number.isFinite(value) ? '—' : value.toLocaleString();

  const providerName = (p: string | undefined) =>
    (p && providerDefinitions[p as ProviderId]?.name) || p || 'AI';

  const safeCost = (cost: number | null | undefined) =>
    cost === null || cost === undefined || !Number.isFinite(cost)
      ? 'Unavailable'
      : formatCost(cost);

  const selectCard = (nodeId: string) => {
    state.nodesChange(
      board.nodes.map((n) => ({ type: 'select', id: n.id, selected: n.id === nodeId })),
    );
  };

  const primaryBadge = tree?.isLinearSequence
    ? (tree.linearSavingsPercent ?? 0) > 0
      ? `▼ ${tree.linearSavingsPercent}% reduction`
      : null
    : tree
      ? `Saved ${number(tree.tokensSaved)} tokens (${tree.savingsPercent}%)`
      : selectionAnalysis?.type === 'chain'
        ? (selectionAnalysis.linearSavingsPercent ?? 0) > 0
          ? `▼ ${selectionAnalysis.linearSavingsPercent}% reduction`
          : null
        : selectionAnalysis?.efficiency && !selectionAnalysis.efficiency.isEqual
          ? `▼ ${selectionAnalysis.efficiency.savingsPercent}% fewer tokens`
          : null;

  let pinnedBanner: ReactNode = null;

  if (tree && tree.isLinearSequence && tree.linearTurns) {
    pinnedBanner = (
      <div className="token-efficiency-banner" role="status" aria-live="polite">
        <Zap size={16} className="token-efficiency-icon" aria-hidden />
        <div className="token-efficiency-content">
          <strong>
            {(tree.linearSavingsPercent ?? 0) > 0
              ? `${tree.linearSavingsPercent}% token reduction possible with branching (${number(tree.linearTokensSaved)} tokens saved)`
              : 'Linear Chat Context Accumulation'}
          </strong>
          <p>
            In this linear chat, each new message re-reads the entire history of all preceding
            turns, accumulating {number(tree.totalLinearInput)} input tokens. If asked as separate
            branches from the root prompt, only {number(tree.branchedEquivalentInput)} tokens would
            be needed.
          </p>
        </div>
      </div>
    );
  } else if (tree && !tree.isLinearSequence) {
    pinnedBanner = (
      <div className="token-efficiency-banner" role="status" aria-live="polite">
        <Zap size={16} className="token-efficiency-icon" aria-hidden />
        <div className="token-efficiency-content">
          <strong>
            Saved {number(tree.tokensSaved)} input tokens ({tree.savingsPercent}% reduction vs
            linear chat)
          </strong>
          <p>
            Branching keeps each conversation isolated. In a linear chat, every question must
            re-read all preceding answers, accumulating {number(tree.hypotheticalLinearInput)}{' '}
            tokens instead of {number(tree.actualBranchedInput)}.
          </p>
        </div>
      </div>
    );
  } else if (!tree && selectionAnalysis?.type === 'chain') {
    pinnedBanner = (
      <div className="token-efficiency-banner" role="status" aria-live="polite">
        <Layers size={16} className="token-efficiency-icon" aria-hidden />
        <div className="token-efficiency-content">
          <strong>
            {(selectionAnalysis.linearSavingsPercent ?? 0) > 0
              ? `${selectionAnalysis.linearSavingsPercent}% token reduction possible with branching (${number(selectionAnalysis.linearTokensSaved)} tokens saved)`
              : 'Linear Chat Context Accumulation'}
          </strong>
          <p>{selectionAnalysis.explanation}</p>
        </div>
      </div>
    );
  } else if (!tree && selectionAnalysis?.type === 'branches' && selectionAnalysis.efficiency) {
    pinnedBanner = (
      <div className="token-efficiency-banner" role="status" aria-live="polite">
        <Zap size={16} className="token-efficiency-icon" aria-hidden />
        <div className="token-efficiency-content">
          <strong>{selectionAnalysis.efficiency.headline}</strong>
          <p>{selectionAnalysis.efficiency.description}</p>
        </div>
      </div>
    );
  }

  const isCompact = Boolean(pinnedBanner) && size.height <= 220;

  return (
    <section
      className={`token-island nodrag nopan nowheel ${collapsed ? 'token-island-collapsed' : ''}`}
      role="region"
      aria-label="Token and branch comparison"
      data-collapsed={collapsed}
      data-dragging={isDragging}
      data-resizing={isResizing}
      style={{
        left: `calc(50% + ${position.x}px)`,
        top: `calc(10px + ${position.y}px)`,
        width: collapsed ? undefined : `${size.width}px`,
        height: collapsed ? undefined : `${size.height}px`,
        maxHeight: collapsed ? '48px' : `min(${size.height}px, calc(100vh - 40px))`,
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onWheel={(event) => event.stopPropagation()}
      onKeyDown={(event) => {
        event.stopPropagation();
        if (event.key === 'Escape') {
          event.preventDefault();
          close();
        }
      }}
    >
      <header
        onPointerDown={onHeaderPointerDown}
        onClick={collapsed ? () => setCollapsed(false) : undefined}
        title={collapsed ? 'Click to expand' : 'Drag header to move window'}
      >
        {tree?.isLinearSequence ? (
          <Layers size={18} aria-hidden />
        ) : tree ? (
          <GitBranch size={18} aria-hidden />
        ) : selectionAnalysis?.type === 'chain' ? (
          <Layers size={18} aria-hidden />
        ) : (
          <BarChart3 size={18} aria-hidden />
        )}
        <div className="token-island-header-info">
          <div className="token-island-titles">
            <h2>
              {tree?.isLinearSequence
                ? 'Linear Chat Token Growth'
                : tree
                  ? 'Token & Branch Analysis'
                  : selectionAnalysis?.type === 'chain'
                    ? 'Linear Chat Token Growth'
                    : 'Token Comparison'}
            </h2>
            {!collapsed && (
              <p>
                {tree?.isLinearSequence
                  ? `Linear chain · ${tree.linearTurns?.length} turns from “${tree.headLabel}”`
                  : tree
                    ? `Head: “${tree.headLabel}” · ${tree.branches.length} ${tree.branches.length === 1 ? 'branch' : 'branches'} · ${tree.totalDescendants} replies`
                    : selectionAnalysis?.type === 'chain'
                      ? `Linear chain · ${selectionAnalysis.items.length} turns in direct sequence`
                      : `Latest reply · ${allRows.length} conversations`}
              </p>
            )}
          </div>
          {primaryBadge && (
            <span className="token-island-pill-badge" title="Primary token efficiency">
              <Zap size={11} aria-hidden /> {primaryBadge}
            </span>
          )}
        </div>
        <div className="token-island-header-actions">
          {!collapsed && (
            <IconButton
              label={size.height > 260 ? 'Compact view (green box only)' : 'Expand all turns'}
              onClick={toggleSizePreset}
            >
              {size.height > 260 ? <Minimize2 size={16} /> : <Maximize2 size={16} />}
            </IconButton>
          )}
          <IconButton
            label={collapsed ? 'Expand token details' : 'Collapse to dynamic island'}
            aria-expanded={!collapsed}
            onClick={(e) => {
              e.stopPropagation();
              setCollapsed(!collapsed);
            }}
          >
            {collapsed ? <ChevronDown size={17} /> : <ChevronUp size={17} />}
          </IconButton>
          <IconButton
            label="Close token comparison"
            onClick={(e) => {
              e.stopPropagation();
              close();
            }}
          >
            <X size={17} />
          </IconButton>
        </div>
      </header>

      {!collapsed && pinnedBanner && <div className="token-island-pinned-top">{pinnedBanner}</div>}

      {!collapsed && !isCompact && (
        <div className="token-island-scroll">
          {/* VIEW 1A: Single Node in Linear Chain Progression */}
          {tree && tree.isLinearSequence && tree.linearTurns && (
            <>
              <div className="token-compare-stats">
                <div className="token-stat-pill">
                  <span className="token-stat-label">Linear Input Sent</span>
                  <span className="token-stat-val token-stat-val-warn">
                    {number(tree.totalLinearInput)}
                  </span>
                </div>
                <div className="token-stat-pill">
                  <span className="token-stat-label">Branched Equivalent</span>
                  <span className="token-stat-val token-stat-val-good">
                    {number(tree.branchedEquivalentInput)}
                  </span>
                </div>
                <div className="token-stat-pill">
                  <span className="token-stat-label">Potential Savings</span>
                  <span className="token-stat-val token-stat-val-accent">
                    -{number(tree.linearTokensSaved)} ({tree.linearSavingsPercent ?? 0}%)
                  </span>
                </div>
              </div>

              <ul className="token-comparison-rows">
                {tree.linearTurns.map((item) => {
                  const isCurrentActive = item.id === activeNodeId;
                  const promptLen = Math.max(
                    10,
                    (item.usage?.inputTokens || 0) - item.inheritedContextTokens,
                  );
                  const turnBranchedInput =
                    item.turn === 1
                      ? item.usage?.inputTokens || 0
                      : (tree.headComparison.usage?.inputTokens || 0) +
                        (tree.headComparison.usage?.outputTokens || 0) +
                        promptLen;
                  const turnDiff = Math.max(0, (item.usage?.inputTokens || 0) - turnBranchedInput);
                  const turnSavingsPct =
                    (item.usage?.inputTokens || 0) > 0
                      ? Math.round((turnDiff / item.usage!.inputTokens) * 100)
                      : 0;

                  return (
                    <li
                      key={item.id}
                      className={`token-row-interactive ${isCurrentActive ? 'token-row-active' : ''}`}
                      onClick={() => selectCard(item.id)}
                      title="Click to select this card on canvas"
                    >
                      <div className="token-row-heading">
                        <span className="token-depth-tag token-depth-tag-chain">
                          Turn {item.turn}
                        </span>
                        <strong title={item.label}>{item.label}</strong>
                        {isCurrentActive && (
                          <span className="token-badge token-badge-context">Selected</span>
                        )}
                        {item.turn > 1 && item.inheritedContextTokens > 0 && (
                          <span
                            className="token-badge token-badge-baseline"
                            title="Context re-read from previous turns"
                          >
                            +{number(item.inheritedContextTokens)} re-read
                          </span>
                        )}
                        {item.turn > 1 && turnSavingsPct > 0 && (
                          <span
                            className="token-badge token-badge-efficient"
                            title="Savings if this turn branched directly from the root prompt"
                          >
                            ▼ {turnSavingsPct}% if branched
                          </span>
                        )}
                        <span className="token-source">
                          {state.streaming[item.id]
                            ? 'Generating…'
                            : item.pending
                              ? 'Prompt preview'
                              : item.usage?.source === 'provider'
                                ? 'Reported'
                                : 'Estimated'}
                        </span>
                      </div>
                      <p className="token-model">
                        {providerName(item.provider)} · {item.model}
                      </p>
                      <dl>
                        <div>
                          <dt>Input</dt>
                          <dd>{number(item.usage?.inputTokens)}</dd>
                        </div>
                        <div>
                          <dt>Output</dt>
                          <dd>{item.pending ? '—' : number(item.usage?.outputTokens)}</dd>
                        </div>
                        <div>
                          <dt>Total</dt>
                          <dd>
                            {item.pending
                              ? `~${number(item.usage?.totalTokens)}`
                              : number(item.usage?.totalTokens)}
                          </dd>
                        </div>
                        <div>
                          <dt>Est. cost</dt>
                          <dd>{safeCost(item.cost)}</dd>
                        </div>
                      </dl>
                    </li>
                  );
                })}
              </ul>
            </>
          )}

          {/* VIEW 1B: Single Node in Branched Tree */}
          {tree && !tree.isLinearSequence && (
            <>
              <div className="token-compare-stats">
                <div className="token-stat-pill">
                  <span className="token-stat-label">Actual Branched Input</span>
                  <span className="token-stat-val token-stat-val-good">
                    {number(tree.actualBranchedInput)}
                  </span>
                </div>
                <div className="token-stat-pill">
                  <span className="token-stat-label">Linear Chat Equivalent</span>
                  <span className="token-stat-val token-stat-val-warn">
                    {number(tree.hypotheticalLinearInput)}
                  </span>
                </div>
                <div className="token-stat-pill">
                  <span className="token-stat-label">Tokens Saved</span>
                  <span className="token-stat-val token-stat-val-accent">
                    -{number(tree.tokensSaved)}
                  </span>
                </div>
              </div>

              <div className="token-branch-list">
                {tree.branches.map((branch, bIdx) => (
                  <section key={branch.branchRootId} className="token-branch-section">
                    <div className="token-branch-header">
                      <GitBranch size={14} className="token-branch-icon" aria-hidden />
                      <span className="token-branch-title">
                        Branch {bIdx + 1}: {branch.branchRootLabel}
                      </span>
                      <span className="token-branch-meta">
                        {branch.isLinearChain ? 'Linear chain' : 'Sub-tree'} · {branch.nodes.length}{' '}
                        {branch.nodes.length === 1 ? 'node' : 'nodes'}
                      </span>
                    </div>
                    <ul className="token-comparison-rows">
                      {branch.nodes.map((item) => {
                        const isCurrentActive = item.id === activeNodeId;
                        return (
                          <li
                            key={item.id}
                            className={`token-row-interactive ${isCurrentActive ? 'token-row-active' : ''} ${item.depth > 1 ? 'token-row-indent' : ''}`}
                            onClick={() => selectCard(item.id)}
                            title="Click to select this card on canvas"
                          >
                            <div className="token-row-heading">
                              <span
                                className={`token-depth-tag ${item.depth > 1 ? 'token-depth-tag-chain' : ''}`}
                              >
                                {item.depth === 1 ? 'Branch turn 1' : `↳ Turn ${item.depth}`}
                              </span>
                              <strong title={item.label}>{item.label}</strong>
                              {isCurrentActive && (
                                <span className="token-badge token-badge-context">Selected</span>
                              )}
                              <span className="token-source">
                                {state.streaming[item.id]
                                  ? 'Generating…'
                                  : item.comparison.pending
                                    ? 'Prompt preview'
                                    : item.comparison.usage?.source === 'provider'
                                      ? 'Reported'
                                      : 'Estimated'}
                              </span>
                            </div>
                            <p className="token-model">
                              {providerName(item.comparison.provider)} · {item.comparison.model}
                            </p>
                            <dl>
                              <div>
                                <dt>Input</dt>
                                <dd>{number(item.comparison.usage?.inputTokens)}</dd>
                              </div>
                              <div>
                                <dt>Output</dt>
                                <dd>
                                  {item.comparison.pending
                                    ? '—'
                                    : number(item.comparison.usage?.outputTokens)}
                                </dd>
                              </div>
                              <div>
                                <dt>Total</dt>
                                <dd>
                                  {item.comparison.pending
                                    ? `~${number(item.comparison.usage?.totalTokens)}`
                                    : number(item.comparison.usage?.totalTokens)}
                                </dd>
                              </div>
                              <div>
                                <dt>Est. cost</dt>
                                <dd>{safeCost(item.comparison.cost)}</dd>
                              </div>
                            </dl>
                          </li>
                        );
                      })}
                    </ul>
                  </section>
                ))}
              </div>
            </>
          )}

          {/* VIEW 2: Linear Chain Context Accumulation Mode */}
          {!tree && selectionAnalysis?.type === 'chain' && (
            <>
              <div className="token-compare-stats">
                <div className="token-stat-pill">
                  <span className="token-stat-label">Chain Steps</span>
                  <span className="token-stat-val">{selectionAnalysis.items.length} turns</span>
                </div>
                <div className="token-stat-pill">
                  <span className="token-stat-label">Total Input Sent</span>
                  <span className="token-stat-val token-stat-val-warn">
                    {number(selectionAnalysis.totalInput)}
                  </span>
                </div>
                {(selectionAnalysis.linearSavingsPercent ?? 0) > 0 ? (
                  <div className="token-stat-pill">
                    <span className="token-stat-label">Potential Savings</span>
                    <span className="token-stat-val token-stat-val-accent">
                      -{number(selectionAnalysis.linearTokensSaved)} (
                      {selectionAnalysis.linearSavingsPercent}%)
                    </span>
                  </div>
                ) : (
                  <div className="token-stat-pill">
                    <span className="token-stat-label">Total Output Generated</span>
                    <span className="token-stat-val">{number(selectionAnalysis.totalOutput)}</span>
                  </div>
                )}
              </div>

              <ul className="token-comparison-rows">
                {selectionAnalysis.items.map((item) => (
                  <li
                    key={item.id}
                    className="token-row-interactive"
                    onClick={() => selectCard(item.id)}
                    title="Click to select this card on canvas"
                  >
                    <div className="token-row-heading">
                      <span className="token-depth-tag token-depth-tag-chain">
                        Turn {item.turn}
                      </span>
                      <strong title={item.label}>{item.label}</strong>
                      {item.turn > 1 && item.inheritedContextTokens > 0 && (
                        <span
                          className="token-badge token-badge-baseline"
                          title="Context re-read from previous turns"
                        >
                          +{number(item.inheritedContextTokens)} re-read
                        </span>
                      )}
                      <span className="token-source">
                        {state.streaming[item.id]
                          ? 'Generating…'
                          : item.pending
                            ? 'Prompt preview'
                            : item.usage?.source === 'provider'
                              ? 'Reported'
                              : 'Estimated'}
                      </span>
                    </div>
                    <p className="token-model">
                      {providerName(item.provider)} · {item.model}
                    </p>
                    <dl>
                      <div>
                        <dt>Input</dt>
                        <dd>{number(item.usage?.inputTokens)}</dd>
                      </div>
                      <div>
                        <dt>Output</dt>
                        <dd>{item.pending ? '—' : number(item.usage?.outputTokens)}</dd>
                      </div>
                      <div>
                        <dt>Total</dt>
                        <dd>
                          {item.pending
                            ? `~${number(item.usage?.totalTokens)}`
                            : number(item.usage?.totalTokens)}
                        </dd>
                      </div>
                      <div>
                        <dt>Est. cost</dt>
                        <dd>{safeCost(item.cost)}</dd>
                      </div>
                    </dl>
                  </li>
                ))}
              </ul>
            </>
          )}

          {/* VIEW 3: Parallel Branches / Cross-Branch Comparison Mode */}
          {!tree && selectionAnalysis?.type === 'branches' && (
            <>
              {selectionAnalysis.efficiency?.treeComparison && (
                <div className="token-compare-stats">
                  <div className="token-stat-pill">
                    <span className="token-stat-label">
                      Linear Chain ({selectionAnalysis.efficiency.treeComparison.linearTurnsCount}{' '}
                      turns)
                    </span>
                    <span className="token-stat-val token-stat-val-warn">
                      {number(selectionAnalysis.efficiency.treeComparison.linearTotalInput)}
                    </span>
                  </div>
                  <div className="token-stat-pill">
                    <span className="token-stat-label">
                      Branched Tree ({selectionAnalysis.efficiency.treeComparison.branchesCount}{' '}
                      branches)
                    </span>
                    <span className="token-stat-val token-stat-val-good">
                      {number(selectionAnalysis.efficiency.treeComparison.branchedTotalInput)}
                    </span>
                  </div>
                  <div className="token-stat-pill">
                    <span className="token-stat-label">Overall Reduction</span>
                    <span className="token-stat-val token-stat-val-accent">
                      -{number(selectionAnalysis.efficiency.treeComparison.tokensSaved)} (
                      {selectionAnalysis.efficiency.treeComparison.totalSavingsPercent}%)
                    </span>
                  </div>
                </div>
              )}

              {selectionAnalysis.efficiency?.treeComparison && (
                <div className="token-compare-stats">
                  <div className="token-stat-pill">
                    <span className="token-stat-label">
                      Linear Chain ({selectionAnalysis.efficiency.treeComparison.linearTurnsCount}{' '}
                      turns)
                    </span>
                    <span className="token-stat-val token-stat-val-warn">
                      {number(selectionAnalysis.efficiency.treeComparison.linearTotalInput)}
                    </span>
                  </div>
                  <div className="token-stat-pill">
                    <span className="token-stat-label">
                      Branched Tree ({selectionAnalysis.efficiency.treeComparison.branchesCount}{' '}
                      branches)
                    </span>
                    <span className="token-stat-val token-stat-val-good">
                      {number(selectionAnalysis.efficiency.treeComparison.branchedTotalInput)}
                    </span>
                  </div>
                  <div className="token-stat-pill">
                    <span className="token-stat-label">Overall Reduction</span>
                    <span className="token-stat-val token-stat-val-accent">
                      -{number(selectionAnalysis.efficiency.treeComparison.tokensSaved)} (
                      {selectionAnalysis.efficiency.treeComparison.totalSavingsPercent}%)
                    </span>
                  </div>
                </div>
              )}

              <ul className="token-comparison-rows">
                {selectionAnalysis.rows.map((row) => {
                  const delta = selectionAnalysis.efficiency?.deltas[row.id];
                  return (
                    <li
                      key={row.id}
                      className="token-row-interactive"
                      onClick={() => selectCard(row.id)}
                      title="Click to select this card on canvas"
                    >
                      <div className="token-row-heading">
                        <span className="token-depth-tag token-depth-tag-chain">
                          {row.contextBadge}
                        </span>
                        <strong title={row.label}>{row.label}</strong>
                        {delta?.isBest && (
                          <span
                            className="token-badge token-badge-efficient"
                            title="Most token-efficient branch"
                          >
                            ▼ {selectionAnalysis.efficiency?.savingsPercent}% fewer tokens
                          </span>
                        )}
                        {!delta?.isBest && (delta?.diffFromBest ?? 0) > 0 && (
                          <span
                            className="token-badge token-badge-baseline"
                            title="Additional input tokens compared to most efficient"
                          >
                            +{number(delta?.diffFromBest)} tokens
                          </span>
                        )}
                        <span className="token-source">
                          {state.streaming[row.id]
                            ? 'Generating…'
                            : !row.usage
                              ? 'No reply yet'
                              : row.pending
                                ? 'Prompt preview'
                                : row.usage.source === 'provider'
                                  ? 'Reported'
                                  : 'Estimated'}
                        </span>
                      </div>
                      <p className="token-model">
                        {providerName(row.provider)} · {row.model}
                      </p>
                      <dl>
                        <div>
                          <dt>Input</dt>
                          <dd>{number(row.usage?.inputTokens)}</dd>
                        </div>
                        <div>
                          <dt>Output</dt>
                          <dd>{row.pending ? '—' : number(row.usage?.outputTokens)}</dd>
                        </div>
                        <div>
                          <dt>Total</dt>
                          <dd>
                            {row.pending
                              ? `~${number(row.usage?.totalTokens)}`
                              : number(row.usage?.totalTokens)}
                          </dd>
                        </div>
                        <div>
                          <dt>Est. cost</dt>
                          <dd>{safeCost(row.cost)}</dd>
                        </div>
                      </dl>
                    </li>
                  );
                })}
              </ul>
              {selectionAnalysis.rows.length === 2 && (
                <div
                  style={{
                    padding: '0 16px 12px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '6px',
                  }}
                >
                  {canConnect(
                    selectionAnalysis.rows[0].id,
                    selectionAnalysis.rows[1].id,
                    board.edges,
                  ) && (
                    <button
                      type="button"
                      className="connect-modal-btn"
                      onClick={() =>
                        state.connect(selectionAnalysis.rows[0].id, selectionAnalysis.rows[1].id)
                      }
                    >
                      <Link2 size={14} aria-hidden /> Connect: “{selectionAnalysis.rows[0].label}” →
                      “{selectionAnalysis.rows[1].label}”
                    </button>
                  )}
                  {canConnect(
                    selectionAnalysis.rows[1].id,
                    selectionAnalysis.rows[0].id,
                    board.edges,
                  ) && (
                    <button
                      type="button"
                      className="connect-modal-btn"
                      onClick={() =>
                        state.connect(selectionAnalysis.rows[1].id, selectionAnalysis.rows[0].id)
                      }
                    >
                      <Link2 size={14} aria-hidden /> Connect: “{selectionAnalysis.rows[1].label}” →
                      “{selectionAnalysis.rows[0].label}”
                    </button>
                  )}
                </div>
              )}
            </>
          )}

          {expandedDetails && (
            <div id={detailsId} className="token-island-details">
              <p>
                <strong>Linear Chat vs. Branching:</strong> In a linear chat, each new message
                re-reads the entire accumulated history of all previous turns. When you branch from
                a common parent, each branch remains isolated and only sends its direct ancestors,
                drastically cutting input tokens.
              </p>
              <p>
                Costs use your USD base rates and are estimates; cache discounts and other provider
                charges are not included.
              </p>
              <button
                type="button"
                aria-expanded={pricingOpen}
                onClick={() => setPricingOpen(!pricingOpen)}
              >
                {pricingOpen ? 'Hide model pricing' : 'Set model pricing'}
              </button>
              {pricingOpen && (
                <form
                  onSubmit={(event) => {
                    event.preventDefault();
                    const data = new FormData(event.currentTarget);
                    const updated = [...prices];
                    for (const [index, row] of models.entries()) {
                      const input = String(data.get(`input-${index}`) || '').trim();
                      const output = String(data.get(`output-${index}`) || '').trim();
                      const previous = updated.findIndex(
                        (p) => p.provider === row.provider && p.model === row.model,
                      );
                      if (previous >= 0) updated.splice(previous, 1);
                      if (!input && !output) continue;
                      const price: ModelPrice = {
                        id: JSON.stringify([row.provider, row.model]),
                        provider: row.provider,
                        model: row.model,
                        currency: 'USD',
                        inputPerMillion: Number(input),
                        outputPerMillion: Number(output),
                        updatedAt: Date.now(),
                      };
                      if (!input || !output || !readTokenPrices([price]).length) {
                        setNotice('Enter both nonnegative rates, or clear both to remove pricing.');
                        return;
                      }
                      updated.push(price);
                    }
                    try {
                      localStorage.setItem(TOKEN_PRICES_KEY, JSON.stringify(updated));
                      setPrices(updated);
                      setNotice('Pricing saved on this device.');
                    } catch {
                      setNotice('Unable to save pricing. Browser storage is unavailable or full.');
                    }
                  }}
                >
                  {models.map((row, index) => {
                    const price = prices.find(
                      (p) => p.provider === row.provider && p.model === row.model,
                    );
                    return (
                      <fieldset key={JSON.stringify([row.provider, row.model])}>
                        <legend>{row.model}</legend>
                        <label>
                          Input USD / 1M tokens
                          <input
                            type="number"
                            min="0"
                            max="1000000"
                            step="any"
                            name={`input-${index}`}
                            defaultValue={price?.inputPerMillion}
                          />
                        </label>
                        <label>
                          Output USD / 1M tokens
                          <input
                            type="number"
                            min="0"
                            max="1000000"
                            step="any"
                            name={`output-${index}`}
                            defaultValue={price?.outputPerMillion}
                          />
                        </label>
                      </fieldset>
                    );
                  })}
                  <button type="submit">Save pricing</button>
                </form>
              )}
              {notice && <p role="status">{notice}</p>}
            </div>
          )}
        </div>
      )}
      {!collapsed && (
        <footer>
          <div className="token-island-footer-content">
            <span>
              Click any connected node for conversation token analysis · Shift-click to compare
              specific chats
            </span>
            <button
              type="button"
              className="token-details-toggle-btn"
              style={{
                background: 'none',
                border: 'none',
                color: 'var(--muted)',
                fontSize: '11px',
                cursor: 'pointer',
                textDecoration: 'underline',
                padding: '2px 4px',
                flexShrink: 0,
              }}
              onClick={() => setExpandedDetails(!expandedDetails)}
            >
              {expandedDetails ? 'Hide explanation' : 'Explain math & pricing'}
            </button>
          </div>
        </footer>
      )}
      {!collapsed && (
        <>
          <div
            className="token-island-resize-left"
            onPointerDown={(e) => startResize(e, 'w')}
            title="Drag left edge to resize width"
          />
          <div
            className="token-island-resize-right"
            onPointerDown={(e) => startResize(e, 'e')}
            title="Drag right edge to resize width"
          />
          <div
            className="token-island-resize-bottom"
            onPointerDown={(e) => startResize(e, 's')}
            title="Drag bottom edge to resize height"
          >
            <div className="token-island-resize-bottom-bar" />
          </div>
          <div
            className="token-island-resize-corner-sw"
            onPointerDown={(e) => startResize(e, 'sw')}
            title="Drag corner to resize width and height"
          />
          <div
            className="token-island-resize-corner-se"
            onPointerDown={(e) => startResize(e, 'se')}
            title="Drag corner to freely resize width and height"
          >
            <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
              <path
                d="M11 2L2 11M11 6L6 11M11 10L10 11"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
              />
            </svg>
          </div>
        </>
      )}
    </section>
  );
}
