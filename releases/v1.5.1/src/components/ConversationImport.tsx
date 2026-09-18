import { useRef, useState } from 'react';
import {
  parseConversations,
  type ConversationImport as ImportPreview,
} from '../conversationImport';
import { useStore } from '../store';
import { Modal } from './ui';

export function ConversationImport({ onClose }: { onClose: () => void }) {
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const request = useRef(0);
  const generating = useStore((s) => Object.values(s.streaming).some(Boolean));
  const close = () => {
    request.current++;
    onClose();
  };
  const commit = () => {
    try {
      const state = useStore.getState();
      if (Object.values(state.streaming).some(Boolean))
        throw new Error('Stop generation before importing.');
      const boards = preview?.boards.filter((b) => selected.includes(b.id));
      if (!boards?.length) throw new Error('Select at least one conversation.');
      // The store validates every board and adds all copies in one atomic state change.
      state.importWorkspace({
        version: 1,
        kind: 'workspace',
        boards,
        currentId: boards[0].id,
        snapshots: [],
      });
      close();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Import failed.');
    }
  };
  return (
    <Modal title="Import conversations" className="conversation-import" onClose={close}>
      <p>
        Import text-only ChatGPT or Claude JSON exports, or a JSON object with a messages array
        containing role and content. An array of conversations is also supported.
      </p>
      <p>
        Each selected conversation becomes a new canvas. Existing work is kept. Files are processed
        locally; nothing is sent to an AI provider and no credentials are imported.
      </p>
      <label>
        Conversation JSON file
        <input
          data-autofocus
          type="file"
          accept=".json,application/json"
          onChange={async (e) => {
            const file = e.target.files?.[0];
            e.target.value = '';
            if (!file) return;
            const token = ++request.current;
            setBusy(true);
            setError('');
            setPreview(null);
            setSelected([]);
            try {
              if (file.size > 20_000_000) throw new Error('File is too large (maximum 20 MB).');
              const result = parseConversations(JSON.parse(await file.text()));
              if (token !== request.current) return;
              setPreview(result);
              setSelected(result.boards.map((b) => b.id));
            } catch (e) {
              if (token === request.current)
                setError(e instanceof Error ? e.message : 'Could not read file.');
            } finally {
              if (token === request.current) setBusy(false);
            }
          }}
        />
      </label>
      <p className="export-hint">
        Maximum 20 MB, 100 conversations, 5,000 total messages and 100,000 characters per message.
        Attachments and tool messages are rejected, not silently discarded. ChatGPT imports follow
        current_node; alternate branches are not imported.
      </p>
      {busy && <p role="status">Reading conversations…</p>}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {preview && (
        <>
          <p role="status">
            {preview.format} · {preview.boards.length} conversations found
          </p>
          {preview.warnings.map((warning) => (
            <p key={warning} className="import-warning">
              {warning}
            </p>
          ))}
          <div
            className="conversation-import-list"
            role="group"
            aria-label="Conversations to import"
          >
            {preview.boards.map((board) => (
              <label key={board.id}>
                <input
                  type="checkbox"
                  checked={selected.includes(board.id)}
                  onChange={(e) =>
                    setSelected((ids) =>
                      e.target.checked ? [...ids, board.id] : ids.filter((id) => id !== board.id),
                    )
                  }
                />
                <span>
                  <strong>{board.name}</strong>
                  <small>{board.nodes[0].data.messages.length} messages</small>
                </span>
              </label>
            ))}
          </div>
        </>
      )}
      {generating && <p role="status">Stop generation before importing.</p>}
      <div className="dialog-actions">
        <button onClick={close}>Cancel</button>
        <button
          className="primary"
          disabled={busy || generating || !preview || !selected.length}
          onClick={commit}
        >
          Import {selected.length || ''} {selected.length === 1 ? 'conversation' : 'conversations'}
        </button>
      </div>
    </Modal>
  );
}
