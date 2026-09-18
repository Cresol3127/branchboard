import { useEffect, useRef } from 'react';
import { EditorContent, useEditor } from '@tiptap/react';
import { Extension } from '@tiptap/core';
import StarterKit from '@tiptap/starter-kit';
import { Markdown } from '@tiptap/markdown';
import TaskList from '@tiptap/extension-task-list';
import TaskItem from '@tiptap/extension-task-item';
import { TableKit } from '@tiptap/extension-table';
import { useStore } from '../store';
import { richMarkdownIssue } from '../richMarkdown';

// A single workspace history, rather than a second editor-specific undo stack.
const WorkspaceHistory = Extension.create({
  name: 'workspaceHistory',
  addKeyboardShortcuts() {
    const undo = () => {
      useStore.getState().undo();
      return true;
    };
    const redo = () => {
      useStore.getState().redo();
      return true;
    };
    return { 'Mod-z': undo, 'Mod-Shift-z': redo, 'Mod-y': redo };
  },
});

export function RichNote({ id, note }: { id: string; note: string }) {
  const busy = useStore((s) => Object.values(s.streaming).some(Boolean));
  const issue = richMarkdownIssue(note);
  const started = useRef(false);
  const source = useRef(note);
  const editor = useEditor({
    shouldRerenderOnTransaction: true,
    extensions: [
      StarterKit.configure({
        undoRedo: false,
        link: { openOnClick: false, autolink: false },
      }),
      Markdown,
      TaskList,
      TaskItem.configure({ nested: true }),
      TableKit,
      WorkspaceHistory,
    ],
    content: note,
    contentType: 'markdown',
    editorProps: {
      attributes: {
        class: 'rich-note-editor markdown nodrag nowheel',
        role: 'textbox',
        'aria-label': 'Rich note content',
        'aria-multiline': 'true',
      },
    },
    onBlur: () => {
      started.current = false;
    },
    onUpdate: ({ editor: current }) => {
      const state = useStore.getState();
      if (Object.values(state.streaming).some(Boolean) || richMarkdownIssue(source.current)) return;
      const value = current.getMarkdown();
      if (value === source.current) return;
      if (!started.current) {
        state.checkpoint();
        started.current = true;
      }
      source.current = value;
      state.updateNode(id, { note: value });
    },
  });
  useEffect(() => {
    if (!editor || note === source.current) return;
    // Undo, redo and other workspace changes must update the visible document.
    source.current = note;
    started.current = false;
    editor.commands.setContent(note, { contentType: 'markdown', emitUpdate: false });
  }, [editor, note]);
  useEffect(() => {
    // Changing editability is not a content edit and must not normalize saved Markdown.
    editor?.setEditable(!busy && !issue, false);
  }, [editor, busy, issue]);
  if (!editor) return null;
  return (
    <>
      <div
        className="note-toolbar rich-note-toolbar"
        role="group"
        aria-label="Rich text formatting"
      >
        {[
          {
            label: 'Bold',
            text: 'B',
            active: editor.isActive('bold'),
            run: () => editor.chain().focus().toggleBold().run(),
          },
          {
            label: 'Italic',
            text: 'I',
            active: editor.isActive('italic'),
            run: () => editor.chain().focus().toggleItalic().run(),
          },
          {
            label: 'Heading',
            text: 'H',
            active: editor.isActive('heading'),
            run: () => editor.chain().focus().toggleHeading({ level: 2 }).run(),
          },
          {
            label: 'Bulleted list',
            text: 'List',
            active: editor.isActive('bulletList'),
            run: () => editor.chain().focus().toggleBulletList().run(),
          },
          {
            label: 'Add checklist item',
            text: 'Task',
            active: editor.isActive('taskList'),
            run: () => editor.chain().focus().toggleTaskList().run(),
          },
          {
            label: 'Inline code',
            text: 'Code',
            active: editor.isActive('code'),
            run: () => editor.chain().focus().toggleCode().run(),
          },
          {
            label: 'Block quote',
            text: 'Quote',
            active: editor.isActive('blockquote'),
            run: () => editor.chain().focus().toggleBlockquote().run(),
          },
        ].map((action) => (
          <button
            key={action.label}
            aria-label={action.label}
            aria-pressed={action.active}
            disabled={busy || !!issue}
            onMouseDown={(e) => e.preventDefault()}
            onClick={action.run}
          >
            {action.text}
          </button>
        ))}
      </div>
      <p className="rich-note-hint" role={issue ? 'status' : undefined}>
        {issue ||
          (busy
            ? 'Editing pauses during generation.'
            : 'Saved as Markdown; use Edit for exact source. Rich edits normalize formatting.')}
      </p>
      <EditorContent editor={editor} />
    </>
  );
}
