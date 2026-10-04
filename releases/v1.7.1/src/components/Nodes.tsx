import {
  memo,
  useEffect,

  useRef,
  useState,
  type CSSProperties,
  type PointerEvent,
} from 'react';
import {
  Handle,
  NodeResizer,
  Position,
  useUpdateNodeInternals,
  type NodeProps,
} from '@xyflow/react';
import {
  GitBranch,
  MoreHorizontal,
  RotateCcw,
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
import {  estimateTokens, nodeMessages } from '../graph';
import { currentBoard, useStore } from '../store';

import type { BoardNode } from '../types';
import { IconButton, Menu } from './ui';
import { ModelSelector } from './ModelSelector';

import { MessageHistory } from './MessageHistory';
import { NoteContent } from './NoteContent';
import { useCanvasTextSelection } from './useCanvasTextSelection';

const MessageMarkdown = memo(function MessageMarkdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{ a: (props) => <a {...props} className="nodrag nopan" /> }}
    >
      {text}
    </ReactMarkdown>
  );
});

function Ports({ id, data }: Pick<BoardNode, 'id' | 'data'>) {
  const ref = useRef<HTMLDivElement>(null),
    internals = useUpdateNodeInternals();
  const cleanup = useRef<(() => void) | null>(null);
  useEffect(() => () => cleanup.current?.(), []);
  useEffect(() => {
    internals(id);
  }, [data.portPositions, id, internals]);
  const move = (kind: 'source' | 'target', e: PointerEvent) => {
    if (!e.altKey) return;
    e.preventDefault();
    e.stopPropagation();
    cleanup.current?.();
    const rect = ref.current!.closest('.react-flow__node')!.getBoundingClientRect();
    const start = { x: e.clientX, y: e.clientY };
    useStore.getState().checkpoint();
    const set = (point: { x: number; y: number } | undefined) => {
      const node = currentBoard(useStore.getState()).nodes.find((n) => n.id === id);
      const ports = { ...node?.data.portPositions };
      if (point) ports[kind] = point;
      else delete ports[kind];
      useStore.getState().updateNode(id, { portPositions: ports });
    };
    const onMove = (event: globalThis.PointerEvent) => {
      const x = Math.min(1, Math.max(0, (event.clientX - rect.x) / rect.width));
      const y = Math.min(1, Math.max(0, (event.clientY - rect.y) / rect.height));
      set({ x, y });
    };
    const up = (event: globalThis.PointerEvent) => {
      if (Math.hypot(event.clientX - start.x, event.clientY - start.y) < 5) set(undefined);
      cleanup.current?.();
    };
    const cancel = () => cleanup.current?.();
    cleanup.current = () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', up);
      window.removeEventListener('pointercancel', cancel);
      cleanup.current = null;
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
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
  const selectText = useCanvasTextSelection();
  const state = useStore(),
    board = currentBoard(state);
  const node = board.nodes.find((n) => n.id === id);
  const streaming = Boolean(state.streaming[id]);


  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [historyAction, setHistoryAction] = useState<{
    messageId: string;
    mode: 'edit' | 'delete';
  } | null>(null);
  const historyBusy = Object.values(state.streaming).some(Boolean);
  const expanded = selected && !data.collapsed;
  // Positions/selection change every drag frame; graph context depends only on content and edges.
  const semantic = useRef<{ nodes: BoardNode[]; edges: typeof board.edges }>({
    nodes: [],
    edges: [],
  });
  if (
    semantic.current.edges !== board.edges ||
    semantic.current.nodes.length !== board.nodes.length ||
    semantic.current.nodes.some(
      (n, i) =>
        n.id !== board.nodes[i].id ||
        n.type !== board.nodes[i].type ||
        n.data !== board.nodes[i].data,
    )
  )
    semantic.current = { nodes: board.nodes, edges: board.edges };



  const contentRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const root = rootRef.current;
    if (!root || !data.autoSize || data.collapsed || type === 'group') return;
    let timer: ReturnType<typeof setTimeout>;
    const measure = () => {
      clearTimeout(timer);
      timer = setTimeout(() => {
        const region = root.querySelector<HTMLElement>('.sizing-region');
        const content = root.querySelector<HTMLElement>('.sizing-content');
        if (region && content) {
          const padding = getComputedStyle(region);
          state.sizeToContent(
            id,
            root.clientHeight -
              region.clientHeight +
              content.offsetHeight +
              parseFloat(padding.paddingTop) +
              parseFloat(padding.paddingBottom) +
              2,
          );
        }
      }, 120);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(root);
    const content = root.querySelector('.sizing-content');
    if (content) observer.observe(content);
    measure();
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [id, data.autoSize, data.collapsed, expanded, type, state.sizeToContent]);
  useEffect(() => {
    if (streaming) contentRef.current?.scrollTo({ top: contentRef.current.scrollHeight });
  }, [data.messages, streaming]);
  const update = (values: Partial<BoardNode['data']>, record = false) =>
    state.updateNode(id, values, record);
  const choose = () =>
    state.nodesChange(
      board.nodes.map((n) => ({ type: 'select', id: n.id, selected: n.id === id })),
    );
  const Icon = type === 'note' ? StickyNote : type === 'group' ? Folder : MessageCircle;
  return (
    <div
      ref={rootRef}
      // React Flow's nokey exempts card gestures from its Shift-rectangle capture handler.
      className={`board-node nokey ${type}-node ${expanded ? 'expanded' : ''} color-${data.color}`}
      onPointerDownCapture={(e) => {
        // Mouse drags work on content; touch gestures inside scroll regions remain native scrolling.
        const region = (e.target as HTMLElement).closest('.messages, .note-body');
        region?.classList.toggle('nodrag', e.pointerType === 'touch');
        const control = (e.target as HTMLElement).closest(
          'button, input, select, textarea, a, [contenteditable="true"], .react-flow__handle',
        );
        if (control && !control.closest('.nodrag')) control.classList.add('nodrag', 'pan-lock');
        selectText(e);
      }}
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
        onResizeStart={() => {
          state.checkpoint();
          if (data.autoSize) state.updateNode(id, { autoSize: false });
        }}
        onResizeEnd={() => state.settleNodes([id])}
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
            <NoteContent id={id} note={data.note} expanded={expanded} />
          ) : (
            <>
              <ModelSelector id={id} data={data} streaming={streaming} />

              <div ref={contentRef} className="messages sizing-region nowheel">
                <div className="sizing-content">

                  {!data.messages.length && (
                    <div className="empty-conversation">
                      <span className="empty-icon">
                        <MessageCircle size={24} />
                      </span>
                      <h3>Start a conversation</h3>
                      <p>
                        {expanded
                          ? 'Write in the message bar below the canvas to begin.'
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
                          className="message-tools nodrag nopan"
                          role="group"
                          aria-label={`Actions for ${m.role} message`}
                        >
                          <IconButton
                            label="Branch from this message"
                            title="Inherit messages through this turn only; later turns are excluded"
                            disabled={historyBusy}
                            onClick={() => {
                              const child = state.branchFromMessage(id, m.id);
                              if (child)
                                useStore.setState({
                                  historyTarget: { boardId: board.id, nodeId: child, focus: false },
                                });
                            }}
                          >
                            <GitBranch size={12} />
                          </IconButton>
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
                        <MessageMarkdown
                          text={m.content || (streaming ? 'Thinking…' : 'No response received.')}
                        />
                      </div>
                    </div>
                  ))}
                  {data.error && (
                    <p role="alert" className="error">
                      {data.error}
                    </p>
                  )}
                </div>
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
          {type !== 'group' && (
            <button
              role="menuitemcheckbox"
              aria-checked={Boolean(data.autoSize)}
              onClick={() => update({ autoSize: !data.autoSize }, true)}
            >
              Automatic content sizing
            </button>
          )}
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
          <button
            role="menuitem"
            className="danger"
            onClick={() => {
              const selected = board.nodes.filter((n) => n.selected);
              if (
                (selected.length < 5 && !selected.some((n) => n.type === 'group')) ||
                confirm('Delete the selected nodes and their connected content?')
              )
                state.removeSelected();
            }}
          >
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
