import { memo, useEffect, useRef, useState } from 'react';
import { Handle, NodeResizer, Position, type NodeProps } from '@xyflow/react';
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
import { currentBoard, useStore } from '../store';
import { canConnect } from '../graph';
import { nodeLabel } from '../nodeLabel';
import type { BoardNode } from '../types';
import { IconButton, Menu } from './ui';
import { Presence } from './Motion';
import { motion } from '../motion';
import { ModelSelector } from './ModelSelector';
import { useWorkspacePanels } from '../workspacePanels';
import { NoteContent } from './NoteContent';
import { useCanvasTextSelection } from './useCanvasTextSelection';
import { ConnectModal } from './ConnectModal';

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

function Anchors() {
  return (
    <div className="node-anchors" aria-hidden="true">
      <Handle
        type="target"
        position={Position.Left}
        className="node-target-anchor"
        isConnectable={false}
        style={{
          left: 0,
          top: '50%',
          transform: 'translate(-50%, -50%)',
        }}
      />
      <Handle
        type="source"
        position={Position.Right}
        className="node-source-anchor"
        isConnectable={false}
        style={{
          left: '50%',
          top: '50%',
          right: 'auto',
          transform: 'translate(-50%, -50%)',
        }}
      />
    </div>
  );
}

export function CanvasNode({ id, data, selected, type }: NodeProps<BoardNode>) {
  const selectText = useCanvasTextSelection();
  const state = useStore(),
    board = currentBoard(state);
  const streaming = Boolean(state.streaming[id]);
  const currentNode = board.nodes.find((n) => n.id === id);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const editHistory = (messageId: string, mode: 'edit' | 'delete') =>
    useWorkspacePanels.setState({
      messageEditor: { boardId: board.id, nodeId: id, messageId, mode },
    });
  const historyBusy = Object.values(state.streaming).some(Boolean);
  const selectedNodes = board.nodes.filter((node) => node.selected);
  const mergeable =
    !historyBusy &&
    selectedNodes.length === 2 &&
    selectedNodes.every((node) => node.type !== 'group');
  const canConnectFirstToSecond =
    !historyBusy &&
    selectedNodes.length === 2 &&
    selectedNodes.every((n) => n.type !== 'group') &&
    canConnect(selectedNodes[0].id, selectedNodes[1].id, board.edges);
  const canConnectSecondToFirst =
    !historyBusy &&
    selectedNodes.length === 2 &&
    selectedNodes.every((n) => n.type !== 'group') &&
    canConnect(selectedNodes[1].id, selectedNodes[0].id, board.edges);
  const [connectOpen, setConnectOpen] = useState(false);
  const mergeSelectedParents = () => {
    const id = state.mergeParents();
    if (id)
      requestAnimationFrame(() =>
        document.querySelector<HTMLTextAreaElement>('.unified-composer textarea')?.focus(),
      );
  };
  const expanded = selected && !data.collapsed;
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
      aria-label={nodeLabel({ type, data })}
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
      {(type === 'group' || data.collapsed) && (
        <div className="node-heading">
          <span className="node-type-dot">
            <Icon size={16} />
          </span>
          <span className="node-preview">{nodeLabel({ type, data })}</span>
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
      )}
      {type !== 'group' && !data.collapsed && (
        <>
          {type === 'note' ? (
            <NoteContent id={id} note={data.note} expanded={expanded} />
          ) : (
            <>
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
                            onClick={() => editHistory(m.id, 'edit')}
                          >
                            <Pencil size={12} />
                          </IconButton>
                          <IconButton
                            label="Delete message"
                            disabled={historyBusy}
                            onClick={() => editHistory(m.id, 'delete')}
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
      {type !== 'group' && !data.collapsed && (
        <div className="node-bottom-actions">
          {type === 'chat' && <ModelSelector id={id} data={data} streaming={streaming} />}
          <IconButton label="Collapse node" onClick={() => update({ collapsed: true }, true)}>
            <ChevronUp size={14} />
          </IconButton>
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
      )}
      {type !== 'group' && <Anchors />}
      <Presence duration={motion.spatial.fast.duration}>
        {menu && (
          <Menu x={menu.x} y={menu.y} label="Node actions" onClose={() => setMenu(null)}>
            {type !== 'group' && (
              <button role="menuitem" onClick={() => state.branch(id)}>
                Branch conversation
              </button>
            )}
            {type !== 'group' && (
              <button
                role="menuitem"
                onClick={() => {
                  setMenu(null);
                  setConnectOpen(true);
                }}
              >
                Connect to another card…
              </button>
            )}
            {canConnectFirstToSecond && (
              <button
                role="menuitem"
                onClick={() => {
                  state.connect(selectedNodes[0].id, selectedNodes[1].id);
                  setMenu(null);
                }}
              >
                Connect: “{nodeLabel(selectedNodes[0])}” → “{nodeLabel(selectedNodes[1])}”
              </button>
            )}
            {canConnectSecondToFirst && (
              <button
                role="menuitem"
                onClick={() => {
                  state.connect(selectedNodes[1].id, selectedNodes[0].id);
                  setMenu(null);
                }}
              >
                Connect: “{nodeLabel(selectedNodes[1])}” → “{nodeLabel(selectedNodes[0])}”
              </button>
            )}
            {mergeable && (
              <button role="menuitem" onClick={mergeSelectedParents}>
                Merge selected parents
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
                if (selected.length < 5 && !selected.some((n) => n.type === 'group'))
                  state.removeSelected();
                else {
                  const selection = {
                    nodes: selected.map((n) => n.id),
                    edges: board.edges.filter((e) => e.selected).map((e) => e.id),
                  };
                  useWorkspacePanels.setState({
                    confirmation: {
                      title: 'Delete selection',
                      description:
                        'Delete these nodes and their connected content? You can undo this change.',
                      run: () => {
                        if (useStore.getState().currentId === board.id)
                          useStore.getState().removeSelected(selection);
                      },
                    },
                  });
                }
              }}
            >
              Delete selection
            </button>
          </Menu>
        )}
      </Presence>
      <Presence duration={motion.effects.default.duration}>
        {connectOpen && currentNode && (
          <ConnectModal sourceNode={currentNode} onClose={() => setConnectOpen(false)} />
        )}
      </Presence>
    </div>
  );
}
