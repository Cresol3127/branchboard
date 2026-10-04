import { useLayoutEffect, useRef } from 'react';
import type { XYPosition } from '@xyflow/react';
import { ArrowUp, MessageCircle, Square } from 'lucide-react';
import { composerTarget, draftKey } from '../composer';
import { contextFor, estimateTokens } from '../graph';
import { currentBoard, useStore } from '../store';
import { nodeLabel } from '../nodeLabel';
import { ModelSelector } from './ModelSelector';
import { IconButton } from './ui';

export function MessageBar({
  positionForConversation,
  onCreate,
}: {
  positionForConversation: () => XYPosition;
  onCreate: (id: string) => void;
}) {
  const state = useStore();
  const board = currentBoard(state);
  const target = composerTarget(board);
  const node = target.kind === 'chat' ? target.node : null;
  const ambiguous = target.kind === 'choose';
  const draft = ambiguous ? '' : state.composerDrafts[draftKey(board.id, node?.id || null)] || '';
  const streaming = Boolean(node && state.streaming[node.id]);
  const activeCount = board.nodes.filter((n) => state.streaming[n.id]).length;
  const selection =
    node?.data || state.composerModels[board.id] || state.modelPreferences.recent[0];
  const provider = state.providers.find((p) => p.id === (selection?.provider || 'openai'));
  const limit = node?.data.contextTokenLimit;
  const messages = node && limit ? contextFor(node.id, board.nodes, board.edges) : [];
  if (draft.trim()) messages.push({ id: 'draft', role: 'user', content: draft.trim() });
  const tokens = estimateTokens(messages);
  const overBudget = Boolean(limit && tokens > limit);
  const input = useRef<HTMLTextAreaElement>(null);
  const bar = useRef<HTMLElement>(null);
  useLayoutEffect(() => {
    const el = input.current;
    if (!el) return;
    const resize = () => {
      el.style.height = '0px';
      el.style.height = `${Math.min(160, Math.max(32, el.scrollHeight))}px`;
    };
    let width = el.clientWidth;
    resize();
    const observer = new ResizeObserver(() => {
      if (el.clientWidth === width) return;
      width = el.clientWidth;
      resize();
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [draft, board.id, node?.id]);
  useLayoutEffect(() => {
    const el = bar.current;
    const parent = el?.closest<HTMLElement>('.canvas-area');
    if (!el || !parent) return;
    const measure = () => parent.style.setProperty('--composer-height', `${el.offsetHeight}px`);
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    measure();
    return () => observer.disconnect();
  }, []);
  const send = () => {
    const id = state.sendComposerMessage(
      board.id,
      node?.id || null,
      draft,
      positionForConversation(),
    );
    if (id && !node) onCreate(id);
  };
  return (
    <section ref={bar} className="message-bar" aria-label="Message bar">
      <div className="message-bar-inner">
        <div className="composer-routing">
          <MessageCircle size={15} aria-hidden="true" />
          <label className="sr-only" htmlFor="message-destination">
            Send to
          </label>
          <select
            id="message-destination"
            aria-label="Message destination"
            value={ambiguous ? 'choose' : node?.id || ''}
            onChange={(e) =>
              state.nodesChange(
                board.nodes.map((n) => ({
                  type: 'select',
                  id: n.id,
                  selected: n.id === e.target.value,
                })),
              )
            }
          >
            {ambiguous && (
              <option value="choose" disabled>
                Choose a conversation…
              </option>
            )}
            <option value="">New conversation · no inherited context</option>
            {board.nodes
              .filter((n) => n.type === 'chat')
              .map((n) => (
                <option key={n.id} value={n.id}>
                  {nodeLabel(n)}
                  {state.streaming[n.id] ? ' · generating' : ''}
                </option>
              ))}
          </select>
          {!ambiguous && (
            <ModelSelector
              key={`${board.id}:${node?.id || 'new'}`}
              id={`composer-${board.id}-${node?.id || 'new'}`}
              data={selection || {}}
              streaming={streaming}
              className="composer-model"
              label="Message model"
              onSelect={(provider, model) =>
                state.setComposerModel(board.id, node?.id || null, provider, model)
              }
            />
          )}
          {activeCount > 0 && <span className="composer-active">{activeCount} generating</span>}
        </div>
        <form
          className="composer unified-composer"
          onSubmit={(e) => {
            e.preventDefault();
            send();
          }}
        >
          <textarea
            ref={input}
            aria-label="Message"
            aria-describedby="composer-status"
            placeholder={
              ambiguous
                ? 'Choose a destination above to write a message.'
                : 'Ask anything or explore an idea...'
            }
            value={draft}
            maxLength={100_000}
            disabled={ambiguous}
            onChange={(e) => state.setComposerDraft(board.id, node?.id || null, e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                send();
              }
            }}
          />
          {streaming ? (
            <IconButton
              key="stop"
              label="Stop generating"
              onClick={(e) => {
                // Aborting can replace this control with a submit button during this click.
                // Never let the same click send the draft intended for the next turn.
                e.preventDefault();
                state.stop(node!.id);
              }}
            >
              <Square size={16} />
            </IconButton>
          ) : (
            <IconButton
              key="send"
              label="Send message"
              type="submit"
              disabled={ambiguous || !draft.trim() || overBudget}
            >
              <ArrowUp size={18} />
            </IconButton>
          )}
        </form>
        <span
          id="composer-status"
          className={ambiguous || overBudget || streaming ? 'composer-status-visible' : 'sr-only'}
          aria-live="polite"
        >
          {ambiguous
            ? 'Multiple nodes selected — choose one destination. No broadcast.'
            : overBudget
              ? 'An old input limit blocks this message. Your draft is kept.'
              : streaming
                ? 'Generating… Draft your next message or stop.'
                : !provider?.configured
                  ? 'Provider setup required. Your draft will be kept.'
                  : !node
                    ? 'Creates a separate chat · no inherited context'
                    : 'Enter to send · Shift+Enter for a new line'}
        </span>
        {node && overBudget && (
          <button
            className="text-button"
            onClick={() =>
              state.updateNode(node.id, { contextTokenLimit: undefined, error: undefined }, true)
            }
          >
            Remove old input limit
          </button>
        )}
        {node?.data.error && <p className="composer-error error">{node.data.error}</p>}
      </div>
    </section>
  );
}
