import { useEffect, useRef, useState } from 'react';
import { currentBoard, useStore } from '../store';
import { folderPath } from '../organization';
import { Modal } from './ui';

export function WorkspaceLibrary({
  section,
  onClose,
}: {
  section: 'projects' | 'templates';
  onClose: () => void;
}) {
  const state = useStore();
  const board = currentBoard(state);
  const { folders, templates, boardFolders } = state.organization;
  const [name, setName] = useState('');
  const [parentId, setParentId] = useState('');
  const [destination, setDestination] = useState(boardFolders[board.id] || '');
  const [source] = useState({ id: board.id, name: board.name });
  const sourceBoard = state.boards.find((candidate) => candidate.id === source.id);
  const sourceActive = board.id === source.id;
  const [includeMessages, setIncludeMessages] = useState(false);
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
      setError(e instanceof Error ? e.message : 'Workspace action failed.');
    }
  };
  const folderOptions = [...folders].sort((a, b) =>
    folderPath(a.id, folders).localeCompare(folderPath(b.id, folders)),
  );
  const options = folderOptions.map((f) => (
    <option key={f.id} value={f.id}>
      {folderPath(f.id, folders)}
    </option>
  ));
  return (
    <Modal
      kind="library"
      title={section === 'projects' ? 'Projects & folders' : 'Canvas templates'}
      onClose={onClose}
      className="library-dialog"
    >
      {error && (
        <p className="error" role="alert">
          {error}
        </p>
      )}
      {section === 'projects' ? (
        <>
          <p className="muted">
            Projects contain folders and canvases. Removing a project or folder keeps all canvases.
            Organization changes are separate from canvas undo.
          </p>
          <label>
            Location for {board.name}
            <select
              aria-label="Current canvas folder"
              value={boardFolders[board.id] || ''}
              onChange={(e) =>
                attempt(() => state.moveBoard(board.id, e.target.value || undefined))
              }
            >
              <option value="">Unfiled</option>
              {options}
            </select>
          </label>
          <h3>Create a project or folder · {folders.length} / 100</h3>
          <form
            data-dirty={Boolean(name.trim())}
            onSubmit={(e) => {
              e.preventDefault();
              attempt(() => {
                state.createFolder(
                  name,
                  folders.some((f) => f.id === parentId) ? parentId : undefined,
                );
                setName('');
              });
            }}
          >
            <label>
              Name
              <input
                data-autofocus
                aria-label="Project or folder name"
                maxLength={120}
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label>
              Parent project / folder
              <select
                aria-label="Parent project or folder"
                value={folders.some((f) => f.id === parentId) ? parentId : ''}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">None — create a project</option>
                {options}
              </select>
            </label>
            <button className="primary" disabled={!name.trim() || folders.length >= 100}>
              Create project / folder
            </button>
          </form>
          <div className="library-list">
            {folderOptions.map((f) => (
              <section
                key={f.id}
                className="snapshot-item"
                aria-label={`Folder ${folderPath(f.id, folders)}`}
              >
                <small>{f.parentId ? folderPath(f.parentId, folders) : 'Project'}</small>
                <Rename
                  name={f.name}
                  label={`Rename ${f.name}`}
                  onSave={(name) => attempt(() => state.renameFolder(f.id, name))}
                />
                {deleting === f.id ? (
                  <div className="history-dialog-actions">
                    <p>
                      Remove this folder and its subfolders? All canvases move to its parent or
                      Unfiled.
                    </p>
                    <button ref={cancel} onClick={() => setDeleting(null)}>
                      Cancel
                    </button>
                    <button
                      className="danger"
                      onClick={() =>
                        attempt(() => {
                          state.deleteFolder(f.id);
                          setDeleting(null);
                        })
                      }
                    >
                      Confirm remove folder
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setDeleting(f.id)}>Remove folder</button>
                )}
              </section>
            ))}
            {!folders.length && (
              <p className="muted">No projects yet. Create one to organize your canvases.</p>
            )}
          </div>
        </>
      ) : (
        <>
          <p className="muted">
            Save a reusable copy of this canvas: notes, layout, connections, models and annotations.
            Conversation history is excluded unless you opt in. No AI request is made. Templates
            stay on this browser; workspace backups include them.
          </p>
          <h3>
            Save {sourceBoard?.name || source.name} as a template · {templates.length} / 50
          </h3>
          {!sourceActive && (
            <p role="status">
              {sourceBoard
                ? 'Your draft belongs to another canvas.'
                : 'The source canvas was deleted. Your draft is unchanged.'}{' '}
              {sourceBoard && (
                <button onClick={() => state.switchBoard(source.id)}>
                  Return to source canvas
                </button>
              )}
            </p>
          )}
          <form
            data-dirty={Boolean(name.trim())}
            onSubmit={(e) => {
              e.preventDefault();
              if (useStore.getState().currentId !== source.id || !sourceBoard) return;
              attempt(() => {
                state.saveTemplate(name, includeMessages);
                setName('');
              });
            }}
          >
            <label>
              Template name
              <input
                data-autofocus
                aria-label="Template name"
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
              />
            </label>
            <label className="library-checkbox">
              <input
                type="checkbox"
                checked={includeMessages}
                onChange={(e) => setIncludeMessages(e.target.checked)}
              />
              Include saved conversation messages
            </label>
            <button
              className="primary"
              disabled={
                busy || !sourceActive || !sourceBoard || !name.trim() || templates.length >= 50
              }
            >
              Save template
            </button>
          </form>
          {busy && <p className="muted">Stop active generations to save or use templates.</p>}
          <label>
            New canvas location
            <select
              aria-label="Template destination folder"
              value={folders.some((f) => f.id === destination) ? destination : ''}
              onChange={(e) => setDestination(e.target.value)}
            >
              <option value="">Unfiled</option>
              {options}
            </select>
          </label>
          <div className="library-list">
            {templates.map((t) => (
              <section key={t.id} className="snapshot-item" aria-label={`Template ${t.name}`}>
                <Rename
                  name={t.name}
                  label={`Rename template ${t.name}`}
                  onSave={(name) => attempt(() => state.renameTemplate(t.id, name))}
                />
                <small>
                  {t.board.nodes.length} nodes ·{' '}
                  {t.board.nodes.reduce((count, n) => count + n.data.messages.length, 0)} messages ·{' '}
                  {new Date(t.createdAt).toLocaleDateString()}
                </small>
                {deleting === t.id ? (
                  <div className="history-dialog-actions">
                    <span>Delete this template? Existing canvases are kept.</span>
                    <button ref={cancel} onClick={() => setDeleting(null)}>
                      Cancel
                    </button>
                    <button
                      className="danger"
                      onClick={() =>
                        attempt(() => {
                          state.deleteTemplate(t.id);
                          setDeleting(null);
                        })
                      }
                    >
                      Confirm delete template
                    </button>
                  </div>
                ) : (
                  <div className="history-dialog-actions">
                    <button
                      disabled={busy}
                      onClick={() =>
                        attempt(() => {
                          state.useTemplate(
                            t.id,
                            folders.some((f) => f.id === destination) ? destination : undefined,
                          );
                          onClose();
                        })
                      }
                    >
                      Create canvas from template
                    </button>
                    <button onClick={() => setDeleting(t.id)}>Delete template</button>
                  </div>
                )}
              </section>
            ))}
            {!templates.length && (
              <p className="muted">No templates yet. Save a canvas you want to reuse.</p>
            )}
          </div>
        </>
      )}
    </Modal>
  );
}

function Rename({
  name,
  label,
  onSave,
}: {
  name: string;
  label: string;
  onSave: (name: string) => void;
}) {
  const [draft, setDraft] = useState(name);
  useEffect(() => setDraft(name), [name]);
  return (
    <form
      className="library-rename"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(draft);
      }}
    >
      <input
        aria-label={label}
        maxLength={120}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
      <button disabled={!draft.trim() || draft === name}>Rename</button>
    </form>
  );
}
