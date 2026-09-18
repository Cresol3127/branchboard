import { useState } from 'react';
import { contextNodesFor, estimateTokens, nodeMessages } from '../graph';
import { currentBoard, useStore } from '../store';
import type { BoardNode } from '../types';
import { Modal } from './ui';

export function ContextInspector({
  node,
  draft,
  onClose,
}: {
  node: BoardNode;
  draft: string;
  onClose: () => void;
}) {
  const state = useStore();
  const board = currentBoard(state);
  const [search, setSearch] = useState('');
  const [budget, setBudget] = useState(String(node.data.contextTokenLimit || ''));
  const inherited = contextNodesFor(node.id, board.nodes, board.edges);
  const messages = inherited.flatMap(nodeMessages);
  if (draft.trim()) messages.push({ id: 'draft', role: 'user', content: draft.trim() });
  const sources = new Map(inherited.map((n) => [n.id, n]));
  const tokens = estimateTokens(messages);
  const limit = node.data.contextTokenLimit;
  const busy = Boolean(state.streaming[node.id]);
  return (
    <Modal title="What the AI sees" onClose={onClose} className="context-inspector">
      <p className="muted">
        Upstream context first, shared ancestors once, manual sources next, then this conversation
        and your draft. Regenerate replaces the last assistant reply. Source settings apply only to
        this conversation; other nodes keep their own settings.
      </p>
      <details className="historical-context-help muted">
        <summary>How historical branches inherit context</summary>
        <p>
          Historical branches inherit only saved turn IDs through the chosen message. Edits stay
          live; deleted turns disappear and later turns are excluded. Merged paths combine their
          included turns once. A full connection or manual inclusion includes the source’s full
          history.
        </p>
      </details>
      <div className="token-summary" aria-label="Token estimates">
        <span>
          Node history <strong>~{estimateTokens(nodeMessages(node)).toLocaleString()}</strong>
        </span>
        <span>
          Branch + draft <strong>~{tokens.toLocaleString()}</strong>
        </span>
      </div>
      <p className="muted token-disclaimer">
        Estimated tokens: UTF-8 bytes ÷ 4, plus message framing. Not a model tokenizer or billed
        usage. Actual provider limits and output tokens may differ.
      </p>
      <form
        className="context-budget"
        onSubmit={(e) => {
          e.preventDefault();
          state.updateNode(
            node.id,
            { contextTokenLimit: budget === '' ? undefined : Number(budget) },
            true,
          );
        }}
      >
        <label htmlFor={`budget-${node.id}`}>Estimated input budget (tokens, optional)</label>
        <div>
          <input
            id={`budget-${node.id}`}
            type="number"
            min="1"
            max="10000000"
            step="1"
            placeholder="No budget"
            value={budget}
            disabled={busy}
            onChange={(e) => setBudget(e.target.value)}
          />
          <button className="primary" type="submit" disabled={busy}>
            Save budget
          </button>
        </div>
        <p
          className={limit && tokens > limit ? 'error' : 'muted'}
          role={limit && tokens > limit ? 'alert' : undefined}
        >
          {limit
            ? `~${tokens.toLocaleString()} / ${limit.toLocaleString()} tokens. ${tokens > limit ? 'Over budget — sending is blocked.' : 'Within budget.'}`
            : 'No local budget set. Clear the field and save to remove a budget.'}{' '}
          Oversized requests are blocked before sending; nothing is silently truncated.
        </p>
      </form>
      <h3>Context sources</h3>
      <p className="muted">
        Auto follows connections. Include adds a node and its upstream sources without creating an
        edge. Exclude removes only that node’s content, not its ancestors. This conversation is
        always included.
      </p>
      <input
        className="context-search"
        type="search"
        aria-label="Filter context sources"
        placeholder="Find a node…"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />
      <div className="context-sources">
        {board.nodes
          .filter(
            (n) =>
              n.id !== node.id &&
              n.type !== 'group' &&
              n.data.title.toLowerCase().includes(search.toLowerCase()),
          )
          .map((source) => (
            <div className="context-source" key={source.id}>
              <div>
                <strong>{source.data.title || 'Untitled node'}</strong>
                <small>
                  {sources.has(source.id) ? 'Included' : 'Not included'} · ~
                  {estimateTokens(nodeMessages(sources.get(source.id) || source)).toLocaleString()}{' '}
                  tokens
                </small>
              </div>
              <select
                aria-label={`Context for ${source.data.title || 'Untitled node'}`}
                disabled={busy}
                value={
                  node.data.contextInclude?.includes(source.id)
                    ? 'include'
                    : node.data.contextExclude?.includes(source.id)
                      ? 'exclude'
                      : 'auto'
                }
                onChange={(e) =>
                  state.setContextSource(
                    node.id,
                    source.id,
                    e.target.value as 'auto' | 'include' | 'exclude',
                  )
                }
              >
                <option value="auto">Auto</option>
                <option value="include">Include</option>
                <option value="exclude">Exclude</option>
              </select>
            </div>
          ))}
        {!board.nodes.some(
          (n) =>
            n.id !== node.id &&
            n.type !== 'group' &&
            n.data.title.toLowerCase().includes(search.toLowerCase()),
        ) && (
          <p className="muted">No matching sources. Add a conversation or note to this canvas.</p>
        )}
      </div>
      <h3>Ordered message preview</h3>
      <div className="context-list">
        {!messages.length && (
          <p>No messages yet. Write a message or include a note to add context.</p>
        )}
        {messages.map((m, i) => (
          <div key={`${m.id}-${i}`}>
            <strong>
              {m.role}
              {m.id === 'draft' ? ' · unsent draft' : ''}
            </strong>
            <p>{m.content}</p>
          </div>
        ))}
      </div>
    </Modal>
  );
}
