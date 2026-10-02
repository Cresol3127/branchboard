import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { syntaxTree } from "@codemirror/language";
import {
  Compartment,
  EditorState,
  Prec,
  Transaction,
} from "@codemirror/state";
import {
  defaultKeymap,
  history,
  historyKeymap,
  insertNewline,
} from "@codemirror/commands";
import {
  Decoration,
  type DecorationSet,
  EditorView,
  keymap,
  placeholder as placeholderExtension,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import katex from "katex";
import {
  buildLivePreviewDecorations,
  type LivePreviewDecoration,
} from "../lib/live-markdown";

export type MarkdownComposerHandle = {
  focus: () => void;
  blur: () => void;
};

type MarkdownComposerProps = {
  value: string;
  placeholder: string;
  maxLength: number;
  onChange: (value: string) => void;
  onFiles?: (files: File[]) => void;
  onSubmit: (value: string) => void;
};

class MathWidget extends WidgetType {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly content: string,
    readonly displayMode: boolean,
  ) {
    super();
  }

  eq(other: MathWidget): boolean {
    return (
      other.from === this.from &&
      other.to === this.to &&
      other.content === this.content &&
      other.displayMode === this.displayMode
    );
  }

  toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = this.displayMode
      ? "cm-live-math cm-live-math-display"
      : "cm-live-math cm-live-math-inline";
    element.dataset.liveFrom = String(this.from);
    element.dataset.liveTo = String(this.to);
    element.setAttribute("aria-label", `Math: ${this.content}`);
    element.innerHTML = katex.renderToString(this.content, {
      displayMode: this.displayMode,
      throwOnError: false,
      strict: false,
      output: "htmlAndMathml",
    });
    return element;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

class ImageWidget extends WidgetType {
  constructor(
    readonly from: number,
    readonly to: number,
    readonly alt: string,
  ) {
    super();
  }

  eq(other: ImageWidget): boolean {
    return other.from === this.from && other.to === this.to && other.alt === this.alt;
  }

  toDOM(): HTMLElement {
    const element = document.createElement("span");
    element.className = "cm-live-image-placeholder";
    element.dataset.liveFrom = String(this.from);
    element.dataset.liveTo = String(this.to);
    element.textContent = `[Image: ${this.alt}]`;
    return element;
  }

  ignoreEvent(): boolean {
    return false;
  }
}

function toCodeMirrorDecoration(item: LivePreviewDecoration) {
  if (item.type === "hide") {
    return Decoration.replace({}).range(item.from, item.to);
  }
  if (item.type === "mark") {
    return Decoration.mark({ class: item.className }).range(item.from, item.to);
  }
  if (item.type === "line") {
    return Decoration.line({ class: item.className }).range(item.from);
  }
  if (item.type === "math") {
    return Decoration.replace({
      widget: new MathWidget(
        item.from,
        item.to,
        item.content,
        item.displayMode,
      ),
    }).range(item.from, item.to);
  }
  return Decoration.replace({
    widget: new ImageWidget(item.from, item.to, item.alt),
  }).range(item.from, item.to);
}

function livePreviewDecorations(view: EditorView): DecorationSet {
  const text = view.state.doc.toString();
  const selections = view.hasFocus
    ? view.state.selection.ranges.map((range) => ({
        from: range.from,
        to: range.to,
      }))
    : [];
  const ranges = buildLivePreviewDecorations(
    text,
    syntaxTree(view.state),
    selections,
  ).map(toCodeMirrorDecoration);
  return Decoration.set(ranges, true);
}

const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;

    constructor(view: EditorView) {
      this.decorations = livePreviewDecorations(view);
    }

    update(update: ViewUpdate): void {
      if (
        update.docChanged ||
        update.selectionSet ||
        update.focusChanged ||
        update.viewportChanged ||
        syntaxTree(update.startState) !== syntaxTree(update.state)
      ) {
        this.decorations = livePreviewDecorations(update.view);
      }
    }
  },
  {
    decorations: (instance) => instance.decorations,
    eventHandlers: {
      mousedown(event, view) {
        if (!(event.target instanceof Element)) return false;
        const widget = event.target.closest<HTMLElement>(
          ".cm-live-math, .cm-live-image-placeholder",
        );
        if (!widget) return false;
        const from = Number(widget.dataset.liveFrom);
        const to = Number(widget.dataset.liveTo);
        if (!Number.isFinite(from) || !Number.isFinite(to)) return false;
        view.dispatch({
          selection: { anchor: Math.min(from + 1, to) },
          scrollIntoView: true,
        });
        view.focus();
        return true;
      },
    },
  },
);

const editorTheme = EditorView.theme({
  "&": {
    width: "100%",
    backgroundColor: "transparent",
  },
  ".cm-scroller": {
    overflow: "auto",
  },
  ".cm-content": {
    minHeight: "38px",
  },
  ".cm-line": {
    padding: "0",
  },
  "&.cm-focused": {
    outline: "none",
  },
});

export const MarkdownComposer = forwardRef<
  MarkdownComposerHandle,
  MarkdownComposerProps
>(function MarkdownComposer(
  { value, placeholder, maxLength, onChange, onFiles, onSubmit },
  forwardedRef,
) {
  const hostRef = useRef<HTMLDivElement>(null);
  const viewRef = useRef<EditorView | null>(null);
  const onChangeRef = useRef(onChange);
  const onFilesRef = useRef(onFiles);
  const onSubmitRef = useRef(onSubmit);
  const applyingExternalValue = useRef(false);
  const placeholderCompartment = useRef(new Compartment());

  onChangeRef.current = onChange;
  onFilesRef.current = onFiles;
  onSubmitRef.current = onSubmit;

  useImperativeHandle(
    forwardedRef,
    () => ({
      focus() {
        viewRef.current?.focus();
      },
      blur() {
        viewRef.current?.contentDOM.blur();
      },
    }),
    [],
  );

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const sendOrNewline = Prec.highest(
      keymap.of([
        {
          key: "Shift-Enter",
          run: insertNewline,
        },
        {
          key: "Enter",
          run(view) {
            if (view.composing) return false;
            onSubmitRef.current(view.state.doc.toString());
            return true;
          },
        },
      ]),
    );

    const state = EditorState.create({
      doc: value,
      extensions: [
        history(),
        markdown({
          base: markdownLanguage,
          addKeymap: false,
          completeHTMLTags: false,
          pasteURLAsLink: false,
        }),
        livePreview,
        EditorView.lineWrapping,
        editorTheme,
        sendOrNewline,
        keymap.of([...defaultKeymap, ...historyKeymap]),
        EditorState.changeFilter.of(
          (transaction) => !transaction.docChanged || transaction.newDoc.length <= maxLength,
        ),
        EditorView.contentAttributes.of({
          "aria-label": "Prompt",
          "aria-keyshortcuts": "Enter Shift+Enter Escape",
          autocapitalize: "sentences",
          spellcheck: "true",
        }),
        EditorView.domEventHandlers({
          paste(event) {
            const files = Array.from(event.clipboardData?.files ?? []);
            if (!files.length || !onFilesRef.current) return false;
            event.preventDefault();
            onFilesRef.current(files);
            return true;
          },
          drop(event) {
            const files = Array.from(event.dataTransfer?.files ?? []);
            if (!files.length || !onFilesRef.current) return false;
            event.preventDefault();
            onFilesRef.current(files);
            return true;
          },
        }),
        placeholderCompartment.current.of(placeholderExtension(placeholder)),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !applyingExternalValue.current) {
            onChangeRef.current(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent: host });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
  }, [maxLength]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view || view.state.doc.toString() === value) return;
    applyingExternalValue.current = true;
    try {
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: value },
        selection: { anchor: value.length },
        annotations: Transaction.addToHistory.of(false),
      });
    } finally {
      applyingExternalValue.current = false;
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: placeholderCompartment.current.reconfigure(
        placeholderExtension(placeholder),
      ),
    });
  }, [placeholder]);

  return <div ref={hostRef} className="markdown-composer" />;
});
