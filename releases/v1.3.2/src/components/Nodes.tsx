import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react';
import {
  Handle,
  NodeResizer,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from '@xyflow/react';
import {
  ArrowUp,
  GitBranch,
  MoreHorizontal,
  RotateCcw,
  Square,
  ChevronDown,
  ChevronUp,
  MessageCircle,
  StickyNote,
  Folder,
  Pencil,
  Trash2,
} from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { contextFor, estimateTokens, nodeMessages } from '../graph';
import { currentBoard, useStore } from '../store';
import type { BoardNode } from '../types';
import { IconButton, Menu } from './ui';
import { ModelSelector } from './ModelSelector';

import { MessageHistory } from './MessageHistory';

function Ports({ id, data }: Pick<BoardNode, 'id' | 'data'>) {
  const ref = useRef<HTMLDivElement>(null),
    internals = useUpdateNodeInternals();
  useEffect(() => {
    internals(id);
  }, [data.portPositions, id, internals]);
  const move = (kind: 'source' | 'target', e: PointerEvent) => {
    if (!e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    const rect = ref.current!.closest('.react-flow__node')!.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY };
    useStore.getState().checkpoint();
    const set = (point: { x: number; y: number } | undefined) => {
      const node = currentBoard(useStore.getState()).nodes.find((n) => n.id === id);
      useStore
        .getState()
        .updateNode(id, { portPositions: Object.fromEntries(Object.entries({ ...node?.data.portPositions, [kind]: point }).filter(([, value]) => value !== undefined)) });
    };
    const onMove = (event: globalThis.PointerEvent) => {
      const x = Math.min(1, Math.max(0, (event.clientX - rect.x) / rect.width));
      const y = Math.min(1, Math.max(0, (event.clientY - rect.y) / rect.height));
      set({ x, y });
    };
    const up = (event: globalThis.PointerEvent) => {
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) set(undefined);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', up);
  };
  const style = (kind: 'source' | 'target'): CSSProperties | undefined => {
    const p = data.portPositions?.[kind];
    return p
      ? {
          left: `${p.x * 100}%`,
          top: `${p.y * 100}%`,
          right: 'auto',
          bottom: 'auto',
          transform: 'translate(-50%, -50%)',
        }
      : undefined;
  };
  return (
    <div ref={ref} className="ports">
      {(['target', 'source'] as const).map((kind) => (
        <div key={kind} onPointerDownCapture={(e) => move(kind, e)}>
          <Handle
            type={kind}
            position={kind === 'source' ? Position.Right : Position.Left}
            style={style(kind)}
            aria-label={kind === 'source' ? 'Output connection' : 'Input connection'}
          />
        </div>
      ))}
    </div>
  );
}

export function CanvasNode({ id, data, selected, type }: NodeProps<BoardNode>) {
  const state = useStore(),
    board = currentBoard(state);
  const node = board.nodes.find((n) => n.id === id);
  const streaming = Boolean(state.streaming[id]);
  const [draft, setDraft] = useState('');
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [historyAction, setHistoryAction] = useState<{
    messageId: string;
    mode: 'edit' | 'delete';
  } | null>(null);
  const historyBusy = Object.values(state.streaming).some(Boolean);
  const expanded = selected && !data.collapsed;

  const preview = contextFor(id, board.nodes, board.edges);
  if (draft.trim()) preview.push({ id: 'draft', role: 'user', content: draft.trim() });
  const tokens = estimateTokens(preview);
  const overBudget = Boolean(data.contextTokenLimit && tokens > data.contextTokenLimit);
  const contentRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (streaming) contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight });
  }, [data.messages, streaming]);
  const send = () => {
    if (!draft.trim() || streaming) return;
    void state.generate(id, draft);
    if (
      !overBudget &&
      state.providers.find((p) => p.id === (data.provider || 'openai'))?.configured
    )
      setDraft('');
  };
  const update = (values: Partial<BoardNode['data']>, record = false) =>
    state.updateNode(id, values, record);
  const choose = () =>
    state.nodesChange(
      board.nodes.map((n) => ({ type: 'select', id: n.id, selected: n.id === id })),
    );
  const Icon = type === 'note' ? StickyNote : type === 'group' ? Folder : MessageCircle;
  return (
    <div
      className={`board-node ${type}-node ${expanded ? 'expanded' : ''} color-${data.color}`}
      onContextMenu={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!selected) choose();
        setMenu({ x: e.clientX, y: e.clientY });
      }}
    >
      <NodeResizer
        isVisible={selected && !data.collapsed}
        minWidth={260}
        minHeight={type === 'group' ? 200 : type === 'chat' ? 320 : 180}
        onResizeStart={state.checkpoint}
      />
      <div className="node-heading">
        <span className="node-type-dot">
          <Icon size={16} />
        </span>
        <input
          className="node-title nodrag"
          aria-label="Node title"
          value={data.title}
          onFocus={state.checkpoint}
          onChange={(e) => update({ title: e.target.value })}
        />
        <div className="node-heading-actions nodrag">
          {type === 'chat' && data.error && (
            <span
              className="generation-error-dot"
              role="img"
              aria-label="Generation failed"
              title={data.error}
            />
          )}
          {type !== 'group' && (
            <IconButton
              label={data.collapsed ? 'Expand node' : 'Collapse node'}
              onClick={() => {
                if (data.collapsed && !selected) choose();
                update({ collapsed: !data.collapsed }, true);
              }}
            >
              {data.collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </IconButton>
          )}
          <IconButton
            label="Node actions"
            onClick={(e) => {
              if (!selected) choose();
              setMenu({ x: e.clientX, y: e.clientY });
            }}
          >
            <MoreHorizontal size={16} />
          </IconButton>
        </div>
      </div>
      {type !== 'group' && !data.collapsed && (
        <>
          {type === 'note' ? (
            expanded ? (
              <textarea
                className="note-editor nodrag nowheel"
                aria-label="Note content"
                value={data.note}
                placeholder="Keep a thought here…"
                onFocus={state.checkpoint}
                onChange={(e) => update({ note: e.target.value })}
              />
            ) : (
              <div className="note-preview">{data.note || 'Select to write a thought…'}</div>
            )
          ) : (
            <>
              <ModelSelector id={id} data={data} streaming={streaming} />

              <div ref={contentRef} className="messages nodrag nowheel">

                {!data.messages.length && (
                  <div className="empty-conversation">
                    <span className="empty-icon">
                      <MessageCircle size={24} />
                    </span>
                    <h3>Start a conversation</h3>
                    <p>
                      {expanded
                        ? 'Write a message below to begin.'
                        : 'Select this node to write a message.'}
                    </p>
                  </div>
                )}
                {data.messages.map((m) => (
                  <div
                    key={m.id}
                    data-message-id={m.id}
                    tabIndex={-1}
                    className={`message ${m.role} ${state.historyTarget?.boardId === board.id && state.historyTarget.nodeId === id && state.historyTarget.messageId === m.id ? 'search-match' : ''}`}
                  >
                    <div className="message-heading">
                      <span className="message-label">
                        {m.role === 'user' ? 'You' : m.role === 'system' ? 'System' : 'Assistant'}
                      </span>
                      <div
                        className="message-tools"
                        role="group"
                        aria-label={`Actions for ${m.role} message`}
                      >
                        <IconButton
                          label="Edit message"
                          disabled={historyBusy}
                          onClick={() => setHistoryAction({ messageId: m.id, mode: 'edit' })}
                        >
                          <Pencil size={12} />
                        </IconButton>
                        <IconButton
                          label="Delete message"
                          disabled={historyBusy}
                          onClick={() => setHistoryAction({ messageId: m.id, mode: 'delete' })}
                        >
                          <Trash2 size={12} />
                        </IconButton>
                      </div>
                    </div>
                    <div className="markdown">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {m.content || (streaming ? 'Thinking…' : 'No response received.')}
                      </ReactMarkdown>
                    </div>
                  </div>
                ))}
                {data.error && (
                  <p role="alert" className="error">
                    {data.error}
                  </p>
                )}
              </div>
              {expanded && (
                <div className="conversation-bottom nodrag nowheel">
                  {data.messages.length > 0 && (
                    <div className="conversation-actions">
                      {!streaming && (
                        <button onClick={() => void state.generate(id)}>
                          <RotateCcw size={12} />
                          {data.error ? 'Retry' : 'Regenerate'}
                        </button>
                      )}
                      <button onClick={() => state.branch(id)}>
                        <GitBranch size={12} />
                        Branch
                      </button>
                    </div>
                  )}
                  <form
                    className="composer"
                    onSubmit={(e) => {
                      e.preventDefault();
                      send();
                    }}
                  >
                    <textarea
                      aria-label="Message"
                      placeholder="Write a message…"
                      value={draft}
                      onChange={(e) => setDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !e.shiftKey) {
                          e.preventDefault();
                          send();
                        }
                      }}
                    />
                    {streaming ? (
                      <IconButton label="Stop generating" onClick={() => state.stop(id)}>
                        <Square size={14} />
                      </IconButton>
                    ) : (
                      draft.trim() && (
                        <IconButton label="Send message" type="submit">
                          <ArrowUp size={17} />
                        </IconButton>
                      )
                    )}
                  </form>
                  <div className="model-label">
                    <span className="enter-hint">↵ to send</span>
                  </div>
                </div>
              )}
            </>
          )}
        </>
      )}
      {type === 'note' && !data.collapsed && node && (
        <div className="node-token-count">
          ~{estimateTokens(nodeMessages(node)).toLocaleString()} tokens · estimated
        </div>
      )}
      {data.contextTokenLimit && <button className="nodrag nopan" onClick={() => update({ contextTokenLimit: undefined, error: undefined }, true)}>Remove old input limit</button>}
      {type !== 'group' && <Ports id={id} data={data} />}
      {menu && (
        <Menu x={menu.x} y={menu.y} label="Node actions" onClose={() => setMenu(null)}>
          {type !== 'group' && (
            <button role="menuitem" onClick={() => state.branch(id)}>
              Branch conversation
            </button>
          )}
          <button role="menuitem" onClick={state.duplicate}>
            Duplicate selection
          </button>
          {type === 'group' && (
            <button role="menuitem" onClick={() => state.ungroup(id)}>
              Ungroup
            </button>
          )}

          {type === 'note' && (
            <div className="color-options" role="group" aria-label="Note color">
              {['purple', 'amber', 'sage', 'blue', 'rose'].map((color) => (
                <button
                  key={color}
                  aria-label={`Color ${color}`}
                  title={`Color ${color}`}
                  aria-pressed={data.color === color}
                  className={`swatch color-${color}`}
                  onClick={() => update({ color }, true)}
                />
              ))}
            </div>
          )}
          <button role="menuitem" className="danger" onClick={state.removeSelected}>
            Delete selection
          </button>
        </Menu>
      )}

      {historyAction && (
        <MessageHistory
          nodeId={id}
          messageId={historyAction.messageId}
          mode={historyAction.mode}
          onClose={() => setHistoryAction(null)}
        />
      )}
    </div>
  );
}
