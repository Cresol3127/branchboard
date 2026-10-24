import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Check, FolderInput, FolderOpen, Star, Trash2 } from 'lucide-react';
import { useStore } from '../store';
import { folderPath } from '../organization';
import { Menu } from './ui';
import { useWorkspacePanels } from '../workspacePanels';
import { useIsPresent } from './Motion';

export function CanvasActionsMenu({
  boardId,
  x,
  y,
  onClose,
  onDelete,
}: {
  boardId: string;
  x: number;
  y: number;
  onClose: () => void;
  onDelete: () => void;
}) {
  const { boards, organization } = useStore();
  const present = useIsPresent();
  const board = boards.find((item) => item.id === boardId);
  const [moving, setMoving] = useState(false);
  const content = useRef<HTMLButtonElement>(null);
  const opener = useRef(document.activeElement as HTMLElement | null);
  useLayoutEffect(() => {
    if (present) content.current?.focus();
  }, [moving, present]);
  useLayoutEffect(() => {
    if (!present) return;
    // Restore focus only once, at logical close. The opener row may disappear from
    // a Favorites filter as part of the action, so retry briefly and fall back to a
    // stable sidebar control. Any input after close cancels the deferred restore.
    return () => {
      let cancelled = false;
      let attempts = 0;
      let done = false;
      const stop = () => {
        if (done) return;
        done = true;
        window.removeEventListener('pointerdown', cancel, true);
        window.removeEventListener('keydown', cancel, true);
        window.clearTimeout(safety);
      };
      const cancel = () => {
        cancelled = true;
        stop();
      };
      const safety = window.setTimeout(stop, 1000);
      // Registered after logical close, so the dismissing click cannot cancel it.
      window.addEventListener('pointerdown', cancel, true);
      window.addEventListener('keydown', cancel, true);
      const exitingMenu = () =>
        document.querySelector<HTMLElement>('.context-menu[data-motion-state="closing"]');
      function restore() {
        requestAnimationFrame(() => {
          if (cancelled || done) return;
          const active = document.activeElement;
          const withinMenu = Boolean(active && exitingMenu()?.contains(active));
          const withinOpener = Boolean(active && opener.current?.contains(active));
          if (active && active !== document.body && !withinMenu && !withinOpener) {
            stop();
            return;
          }
          if (useWorkspacePanels.getState().activeId) {
            stop();
            return;
          }
          // The filtered row can vanish a frame or two after close; keep checking.
          if (opener.current?.isConnected) {
            if (attempts++ < 12) restore();
            else stop();
            return;
          }
          [
            ...document.querySelectorAll<HTMLElement>(
              '.workspace-sidebar nav .board-link, .library-sidebar-actions button, button[aria-label="Search"]',
            ),
          ]
            .find((element) => element.offsetWidth > 0 && !element.closest('[inert]'))
            ?.focus({ preventScroll: true });
          stop();
        });
      }
      restore();
    };
  }, [present]);
  if (!board) return null;
  const name = board.name || 'Untitled canvas';
  const favorite = organization.favoriteBoardIds.includes(boardId);
  const folders = [...organization.folders].sort((a, b) =>
    folderPath(a.id, organization.folders).localeCompare(folderPath(b.id, organization.folders)),
  );
  return (
    <Menu
      x={x}
      y={y}
      label={`${moving ? 'Move canvas to project' : 'Canvas actions'}: ${name}`}
      className="canvas-actions-menu"
      onClose={onClose}
    >
      <small className="canvas-menu-caption">{name}</small>
      {moving ? (
        <>
          <button
            ref={content}
            role="menuitem"
            onClick={(e) => {
              e.stopPropagation();
              setMoving(false);
            }}
          >
            <ArrowLeft size={17} aria-hidden="true" />
            Back
          </button>
          {[
            { id: '', name: 'Unfiled' },
            ...folders.map((folder) => ({
              id: folder.id,
              name: folderPath(folder.id, organization.folders),
            })),
          ].map((folder) => (
            <button
              key={folder.id}
              role="menuitemradio"
              aria-checked={(organization.boardFolders[boardId] || '') === folder.id}
              title={folder.name}
              onClick={() => {
                const state = useStore.getState();
                if (
                  state.boards.some((item) => item.id === boardId) &&
                  (!folder.id || state.organization.folders.some((item) => item.id === folder.id))
                )
                  state.moveBoard(boardId, folder.id || undefined);
              }}
            >
              <FolderOpen size={17} aria-hidden="true" />
              <span>{folder.name}</span>
              {(organization.boardFolders[boardId] || '') === folder.id && (
                <Check size={16} aria-hidden="true" />
              )}
            </button>
          ))}
          {!folders.length && (
            <p className="canvas-menu-caption">
              Create a project in Projects &amp; folders to add a destination.
            </p>
          )}
        </>
      ) : (
        <>
          <button
            ref={content}
            role="menuitem"
            onClick={() => useStore.getState().toggleFavorite(boardId)}
          >
            <Star size={17} fill={favorite ? 'currentColor' : 'none'} aria-hidden="true" />
            {favorite ? 'Unfavorite' : 'Favorite'}
          </button>
          <button
            role="menuitem"
            aria-haspopup="menu"
            onClick={(e) => {
              e.stopPropagation();
              setMoving(true);
            }}
          >
            <FolderInput size={17} aria-hidden="true" />
            Move to project
          </button>
          <button role="menuitem" className="danger" onClick={onDelete}>
            <Trash2 size={17} aria-hidden="true" />
            Delete
          </button>
        </>
      )}
    </Menu>
  );
}
