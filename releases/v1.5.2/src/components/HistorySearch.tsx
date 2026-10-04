import { useMemo, useRef, useState } from 'react';
import { useStore } from '../store';
import { searchWorkspace, type SearchResult } from '../search';
import { Modal } from './ui';

export function HistorySearch({
  onClose,
  onSelect,
  initialQuery = '',
}: {
  onClose: () => void;
  onSelect: (result: SearchResult) => void;
  initialQuery?: string;
}) {
  const boards = useStore((s) => s.boards);
  const [query, setQuery] = useState(initialQuery);
  const list = useRef<HTMLDivElement>(null);
  const { results, hasMore } = useMemo(() => searchWorkspace(boards, query), [boards, query]);
  return (
    <Modal title="Search saved content" onClose={onClose} className="history-search">
      <p className="muted">
        Search message text, notes, and node titles across all canvases. Nothing is sent to an AI
        provider.
      </p>
      <label htmlFor="history-query">Search saved content</label>
      <input
        id="history-query"
        className="history-query"
        data-autofocus
        type="search"
        placeholder="Find a phrase in your workspace…"
        value={query}
        maxLength={500}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            list.current?.querySelector('button')?.focus();
          }
        }}
      />
      <p className="muted" role="status">
        {!query.trim()
          ? 'Enter a phrase to search your saved history.'
          : results.length
            ? `${hasMore ? 'First ' : ''}${results.length} ${results.length === 1 ? 'match' : 'matches'}${hasMore ? ' — refine your search for more.' : '.'}`
            : 'No matching saved content.'}
      </p>
      <div
        className="history-search-results"
        ref={list}
        onKeyDown={(e) => {
          if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
          e.preventDefault();
          const items = [...list.current!.querySelectorAll('button')];
          const index = items.indexOf(document.activeElement as HTMLButtonElement);
          const next = index + (e.key === 'ArrowDown' ? 1 : -1);
          if (next < 0) document.getElementById('history-query')?.focus();
          else items[Math.min(next, items.length - 1)]?.focus();
        }}
      >
        {results.map((result, index) => (
          <button
            key={`${result.boardId}-${result.nodeId}-${index}`}
            onClick={() => onSelect(result)}
          >
            <strong>{result.nodeTitle || 'Untitled node'}</strong>
            <small>
              {result.boardName} · {result.source === 'title' ? 'Node title' : result.source}
            </small>
            <span>{result.snippet}</span>
          </button>
        ))}
      </div>
    </Modal>
  );
}
