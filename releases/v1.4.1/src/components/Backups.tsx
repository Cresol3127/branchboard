import { useEffect, useRef, useState } from 'react';
import { currentBoard, useStore } from '../store';
import { Modal } from './ui';

export function Backups({
  onClose,
  onExport,
  onImport,
}: {
  onClose: () => void;
  onExport: () => void;
  onImport: () => void;
}) {
  const state = useStore();
  const [name, setName] = useState('');
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (deleting) cancel.current?.focus();
  }, [deleting]);
  const busy = Object.values(state.streaming).some(Boolean);
  const attempt = (action: () => void) => {
    try {
      action();
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Backup action failed.');
    }
  };
  return (
    <Modal title="Backups & snapshots" onClose={onClose} className="backups-dialog">
      <p className="muted">
        Workspace JSON includes every canvas, projects/folders, favorites, templates, and saved
        snapshots. Credentials and appearance preferences are never included. Import adds copies and
        keeps existing work.
      </p>
      <div className="history-dialog-actions">
        <button onClick={() => attempt(onExport)}>Export workspace backup</button>
        <button onClick={onImport}>Import workspace or board backup</button>
      </div>
      <h3>Canvas snapshots · {state.snapshots.length} / 30</h3>
      <p className="muted">
        Named copies persist on this browser beyond undo and canvas deletion. Restore opens a new
        canvas, leaving current work untouched. Browser data clearing can erase snapshots too;
        download a workspace backup for independent recovery.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          attempt(() => {
            state.createSnapshot(name);
            setName('');
          });
        }}
      >
        <label htmlFor="snapshot-name">Snapshot name for {currentBoard(state).name}</label>
        <input
          id="snapshot-name"
          data-autofocus
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Before a big change…"
        />
        <button
          className="primary"
          type="submit"
          disabled={
            busy || !name.trim() || state.snapshots.length >= 30 || Boolean(state.snapshotError)
          }
        >
          Save snapshot
        </button>
      </form>
      {busy && <p className="muted">Stop active generations to save a consistent snapshot.</p>}
      {(error || state.snapshotError) && (
        <p className="error" role="alert">
          {error || state.snapshotError}
        </p>
      )}
      <div className="snapshot-list">
        {[...state.snapshots].reverse().map((snapshot) => (
          <section
            key={snapshot.id}
            className="snapshot-item"
            aria-label={`Snapshot ${snapshot.name}`}
          >
            <strong>{snapshot.name}</strong>
            <small>
              {snapshot.board.name} · {new Date(snapshot.createdAt).toLocaleString()} ·{' '}
              {snapshot.board.nodes.length} nodes
            </small>
            {deleting === snapshot.id ? (
              <div className="history-dialog-actions">
                <span>Delete this saved snapshot?</span>
                <button ref={cancel} onClick={() => setDeleting(null)}>
                  Cancel
                </button>
                <button
                  className="danger"
                  onClick={() =>
                    attempt(() => {
                      state.deleteSnapshot(snapshot.id);
                      setDeleting(null);
                    })
                  }
                >
                  Confirm delete
                </button>
              </div>
            ) : (
              <div className="history-dialog-actions">
                <button
                  onClick={() =>
                    attempt(() => {
                      state.restoreSnapshot(snapshot.id);
                      onClose();
                    })
                  }
                >
                  Restore as new canvas
                </button>
                <button onClick={() => setDeleting(snapshot.id)}>Delete snapshot</button>
              </div>
            )}
          </section>
        ))}
        {!state.snapshots.length && (
          <p className="muted">
            No snapshots yet. Save one before making a change you may want to revisit.
          </p>
        )}
      </div>
    </Modal>
  );
}
