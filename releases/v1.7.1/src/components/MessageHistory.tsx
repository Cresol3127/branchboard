import { useState } from 'react';
import { currentBoard, useStore } from '../store';
import { Modal } from './ui';

export function MessageHistory({
  nodeId,
  messageId,
  mode,
  onClose,
}: {
  nodeId: string;
  messageId: string;
  mode: 'edit' | 'delete';
  onClose: () => void;
}) {
  const state = useStore();
  const message = currentBoard(state)
    .nodes.find((n) => n.id === nodeId)
    ?.data.messages.find((m) => m.id === messageId);
  const [content, setContent] = useState(message?.content || '');
  const [error, setError] = useState('');
  const busy = Object.values(state.streaming).some(Boolean);
  const editing = mode === 'edit';
  return (
    <Modal
      title={editing ? 'Edit message' : 'Delete message'}
      onClose={onClose}
      className="message-history"
    >
      <p className="muted">
        {editing
          ? 'Changes affect future AI context, including connected branches.'
          : 'Remove only this message from future AI context, including connected branches.'}{' '}
        Later messages are kept and may no longer match. No reply is regenerated automatically. You
        can undo this change.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const success = editing
            ? state.editMessage(nodeId, messageId, content)
            : state.deleteMessage(nodeId, messageId);
          if (success) onClose();
          else setError('Message could not be changed. Stop active generations and try again.');
        }}
      >
        {editing ? (
          <>
            <label htmlFor="saved-message-content">Message content ({message?.role})</label>
            <textarea
              id="saved-message-content"
              data-autofocus
              value={content}
              maxLength={100_000}
              rows={10}
              disabled={busy || !message}
              onChange={(e) => setContent(e.target.value)}
            />
          </>
        ) : (
          <blockquote className="message-delete-preview">
            {message?.content || '(Empty message)'}
          </blockquote>
        )}
        {busy && <p role="alert">Stop active generations before changing saved history.</p>}
        {!message && <p role="alert">This message no longer exists.</p>}
        {error && (
          <p className="error" role="alert">
            {error}
          </p>
        )}
        <div className="history-dialog-actions">
          <button type="button" onClick={onClose} data-autofocus={!editing || undefined}>
            Cancel
          </button>
          <button
            className={editing ? 'primary' : 'danger'}
            type="submit"
            disabled={busy || !message || (editing && !content.trim())}
          >
            {editing ? 'Save changes' : 'Delete message'}
          </button>
        </div>
      </form>
    </Modal>
  );
}
