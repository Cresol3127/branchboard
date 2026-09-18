import { lazy, Suspense, useLayoutEffect, useRef, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useStore } from '../store';
const RichNote = lazy(() => import('./RichNote').then((module) => ({ default: module.RichNote })));

/** Only offsets supplied by parsed Markdown list items may target a task marker. */
export function taskMarker(source: string, offset: number) {
  const match = /^(?:[-+*]|\d+[.)])\s+\[([ xX])\]/.exec(source.slice(offset));
  return match ? offset + match[0].length - 2 : undefined;
}

export function NoteContent({
  id,
  note,
  expanded,
}: {
  id: string;
  note: string;
  expanded: boolean;
}) {
  const [editing, setEditing] = useState(true);
  const [rich, setRich] = useState(false);
  const editor = useRef<HTMLTextAreaElement>(null);
  const editStarted = useRef(false);
  const write = expanded && editing && !rich;
  const state = useStore();
  useLayoutEffect(() => {
    if (!editor.current) return;
    editor.current.style.height = '0px';
    editor.current.style.height = `${Math.max(80, editor.current.scrollHeight)}px`;
  }, [note, write]);
  const format = (before: string, after = '', placeholder = 'text') => {
    const input = editor.current;
    if (!input) return;
    const start = input.selectionStart,
      end = input.selectionEnd;
    const text = note.slice(start, end) || placeholder;
    state.updateNode(
      id,
      { note: note.slice(0, start) + before + text + after + note.slice(end) },
      true,
    );
    requestAnimationFrame(() => {
      input.focus();
      input.setSelectionRange(start + before.length, start + before.length + text.length);
    });
  };
  const line = (prefix: string) => {
    const input = editor.current;
    if (!input) return;
    const start = note.lastIndexOf('\n', input.selectionStart - 1) + 1;
    const nextLine = note.indexOf('\n', input.selectionEnd);
    input.setSelectionRange(start, nextLine < 0 ? note.length : nextLine);
    format(prefix);
  };
  return (
    <>
      {expanded && (
        <div className="note-toolbar nodrag nowheel" role="group" aria-label="Note formatting">
          <button
            aria-pressed={editing && !rich}
            onClick={() => {
              setEditing(true);
              setRich(false);
            }}
          >
            Edit
          </button>
          <button
            aria-pressed={editing && rich}
            onClick={() => {
              setEditing(true);
              setRich(true);
            }}
          >
            Rich text
          </button>
          <button aria-pressed={!editing} onClick={() => setEditing(false)}>
            Preview
          </button>
          {write && (
            <>
              <button
                aria-label="Bold"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => format('**', '**')}
              >
                B
              </button>
              <button
                aria-label="Italic"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => format('*', '*')}
              >
                I
              </button>
              <button
                aria-label="Heading"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => line('## ')}
              >
                H
              </button>
              <button
                aria-label="Bulleted list"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => line('- ')}
              >
                List
              </button>
              <button
                aria-label="Add checklist item"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => line('- [ ] ')}
              >
                Task
              </button>
              <button
                aria-label="Inline code"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => format('`', '`')}
              >
                Code
              </button>
            </>
          )}
        </div>
      )}
      <div className="note-body sizing-region nodrag nowheel">
        <div className="sizing-content">
          {expanded && editing && rich ? (
            <Suspense fallback={<p>Loading rich text editor…</p>}>
              <RichNote id={id} note={note} />
            </Suspense>
          ) : write ? (
            <textarea
              ref={editor}
              className="note-editor"
              aria-label="Note content"
              value={note}
              placeholder="Write Markdown… headings, **bold**, lists, and - [ ] tasks"
              onBlur={() => {
                editStarted.current = false;
              }}
              onChange={(e) => {
                if (!editStarted.current) {
                  state.checkpoint();
                  editStarted.current = true;
                }
                state.updateNode(id, { note: e.target.value });
              }}
            />
          ) : (
            <div className="note-preview markdown">
              <ReactMarkdown
                remarkPlugins={[remarkGfm]}
                skipHtml
                components={{
                  input: () => null,
                  a: (props) => (
                    <a href={props.href} title={props.title} target="_blank" rel="noreferrer">
                      {props.children}
                    </a>
                  ),
                  li: ({ node, children, className }) => {
                    const offset = node?.position?.start.offset;
                    const marker = offset === undefined ? undefined : taskMarker(note, offset);
                    return (
                      <li className={className}>
                        {marker !== undefined && (
                          <input
                            type="checkbox"
                            aria-label={`Task: ${
                              note
                                .slice(marker + 2)
                                .split(/\r?\n/)[0]
                                .trim() || 'Untitled'
                            }`}
                            checked={note[marker].toLowerCase() === 'x'}
                            onClick={(e) => e.stopPropagation()}
                            onPointerDown={(e) => e.stopPropagation()}
                            onChange={(e) =>
                              state.updateNode(
                                id,
                                {
                                  note:
                                    note.slice(0, marker) +
                                    (e.target.checked ? 'x' : ' ') +
                                    note.slice(marker + 1),
                                },
                                true,
                              )
                            }
                          />
                        )}
                        {children}
                      </li>
                    );
                  },
                }}
              >
                {note || 'Select to write a thought…'}
              </ReactMarkdown>
            </div>
          )}
        </div>
      </div>
    </>
  );
}
