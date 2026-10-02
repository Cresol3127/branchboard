import type { SyntaxNodeRef, Tree } from "@lezer/common";

export type EditorSelectionRange = {
  from: number;
  to: number;
};

export type LivePreviewDecoration =
  | {
      type: "hide";
      from: number;
      to: number;
    }
  | {
      type: "mark";
      from: number;
      to: number;
      className: string;
    }
  | {
      type: "line";
      from: number;
      className: string;
    }
  | {
      type: "math";
      from: number;
      to: number;
      content: string;
      displayMode: boolean;
    }
  | {
      type: "image";
      from: number;
      to: number;
      alt: string;
    };

type SyntaxRange = {
  name: string;
  from: number;
  to: number;
};

export type LatexExpression = {
  from: number;
  to: number;
  content: string;
  displayMode: boolean;
};

const INLINE_CLASSES: Record<string, string> = {
  Emphasis: "cm-live-emphasis",
  StrongEmphasis: "cm-live-strong",
  Strikethrough: "cm-live-strikethrough",
  InlineCode: "cm-live-inline-code",
};

const MARKER_NAMES = new Set([
  "CodeMark",
  "EmphasisMark",
  "StrikethroughMark",
]);

const CODE_NODE_NAMES = new Set(["InlineCode", "FencedCode", "CodeBlock"]);

function isEscaped(text: string, index: number): boolean {
  let slashes = 0;
  for (let cursor = index - 1; cursor >= 0 && text[cursor] === "\\"; cursor -= 1) {
    slashes += 1;
  }
  return slashes % 2 === 1;
}

function overlapsSelection(
  from: number,
  to: number,
  selections: readonly EditorSelectionRange[],
): boolean {
  return selections.some((selection) => selection.from <= to && selection.to >= from);
}

function overlapsRange(from: number, to: number, ranges: readonly SyntaxRange[]): boolean {
  return ranges.some((range) => from < range.to && to > range.from);
}

function rangeAt(index: number, ranges: readonly SyntaxRange[]): SyntaxRange | undefined {
  return ranges.find((range) => index >= range.from && index < range.to);
}

function closingDelimiter(
  text: string,
  start: number,
  delimiter: string,
  protectedRanges: readonly SyntaxRange[],
  singleLine: boolean,
): number {
  for (let index = start; index < text.length; index += 1) {
    const protectedRange = rangeAt(index, protectedRanges);
    if (protectedRange) {
      index = protectedRange.to - 1;
      continue;
    }
    if (singleLine && text[index] === "\n") return -1;
    if (delimiter === "$" && text.startsWith("$$", index) && !isEscaped(text, index)) {
      return -1;
    }
    if (!text.startsWith(delimiter, index) || isEscaped(text, index)) continue;
    if (delimiter === "$" && (text[index - 1] === "$" || text[index + 1] === "$")) {
      continue;
    }
    if (delimiter === "$" && /\s/.test(text[index - 1] ?? "")) continue;
    return index;
  }
  return -1;
}

export function findLatexExpressions(
  text: string,
  protectedRanges: readonly SyntaxRange[] = [],
): LatexExpression[] {
  const expressions: LatexExpression[] = [];

  for (let index = 0; index < text.length; index += 1) {
    const protectedRange = rangeAt(index, protectedRanges);
    if (protectedRange) {
      index = protectedRange.to - 1;
      continue;
    }

    let opening = "";
    let closing = "";
    let displayMode = false;
    let singleLine = false;

    if (text.startsWith("$$", index) && !isEscaped(text, index)) {
      opening = "$$";
      closing = "$$";
      displayMode = true;
    } else if (
      text[index] === "$" &&
      !isEscaped(text, index) &&
      text[index + 1] !== "$" &&
      !/\s/.test(text[index + 1] ?? "")
    ) {
      opening = "$";
      closing = "$";
      singleLine = true;
    } else if (text.startsWith("\\(", index) && !isEscaped(text, index)) {
      opening = "\\(";
      closing = "\\)";
      singleLine = true;
    } else if (text.startsWith("\\[", index) && !isEscaped(text, index)) {
      opening = "\\[";
      closing = "\\]";
      displayMode = true;
    } else {
      continue;
    }

    const contentFrom = index + opening.length;
    const closeAt = closingDelimiter(
      text,
      contentFrom,
      closing,
      protectedRanges,
      singleLine,
    );
    if (closeAt < 0) continue;

    const content = text.slice(contentFrom, closeAt);
    if (!content.trim()) continue;

    const to = closeAt + closing.length;
    expressions.push({ from: index, to, content, displayMode });
    index = to - 1;
  }

  return expressions;
}

function childRanges(node: SyntaxNodeRef): SyntaxRange[] {
  const children: SyntaxRange[] = [];
  let child = node.node.firstChild;
  while (child) {
    children.push({ name: child.name, from: child.from, to: child.to });
    child = child.nextSibling;
  }
  return children;
}

function lineStarts(text: string, from: number, to: number): number[] {
  const starts = [text.lastIndexOf("\n", Math.max(0, from - 1)) + 1];
  for (let index = starts[0]; index < to; index += 1) {
    if (text[index] === "\n" && index + 1 < to) starts.push(index + 1);
  }
  return starts;
}

function imageAlt(text: string, children: readonly SyntaxRange[]): string {
  const marks = children.filter((child) => child.name === "LinkMark");
  if (marks.length < 2) return "attachment";
  return text.slice(marks[0].to, marks[1].from).trim() || "attachment";
}

export function buildLivePreviewDecorations(
  text: string,
  tree: Tree,
  selections: readonly EditorSelectionRange[],
): LivePreviewDecoration[] {
  const decorations: LivePreviewDecoration[] = [];
  const codeRanges: SyntaxRange[] = [];

  tree.iterate({
    enter(node) {
      if (CODE_NODE_NAMES.has(node.name)) {
        codeRanges.push({ name: node.name, from: node.from, to: node.to });
      }
    },
  });

  const mathExpressions = findLatexExpressions(text, codeRanges);
  const mathRanges = mathExpressions.map((expression) => ({
    name: "Math",
    from: expression.from,
    to: expression.to,
  }));
  for (const expression of mathExpressions) {
    if (!overlapsSelection(expression.from, expression.to, selections)) {
      decorations.push({ type: "math", ...expression });
    } else {
      decorations.push({
        type: "mark",
        from: expression.from,
        to: expression.to,
        className: "cm-live-math-source",
      });
    }
  }

  tree.iterate({
    enter(node) {
      const className = INLINE_CLASSES[node.name];
      const overlapsMath = overlapsRange(node.from, node.to, mathRanges);

      if (className && !overlapsMath) {
        const children = childRanges(node);
        const markers = children.filter((child) => MARKER_NAMES.has(child.name));
        const contentFrom = markers[0]?.to ?? node.from;
        const contentTo = markers.at(-1)?.from ?? node.to;
        if (contentFrom < contentTo) {
          decorations.push({
            type: "mark",
            from: contentFrom,
            to: contentTo,
            className,
          });
        }
        if (!overlapsSelection(node.from, node.to, selections)) {
          markers.forEach((marker) => decorations.push({ type: "hide", ...marker }));
        }
        return;
      }

      if (node.name === "Link" || node.name === "Autolink") {
        const children = childRanges(node);
        const marks = children.filter((child) => child.name === "LinkMark");
        const url = children.find((child) => child.name === "URL");
        const labelFrom = marks[0]?.to ?? url?.from ?? node.from;
        const labelTo = marks[1]?.from ?? url?.to ?? node.to;
        if (labelFrom < labelTo) {
          decorations.push({
            type: "mark",
            from: labelFrom,
            to: labelTo,
            className: "cm-live-link",
          });
        }
        if (!overlapsSelection(node.from, node.to, selections)) {
          marks.forEach((mark) => decorations.push({ type: "hide", ...mark }));
          children
            .filter(
              (child) =>
                child.name === "LinkLabel" ||
                (node.name === "Link" && child.name === "URL"),
            )
            .forEach((child) => decorations.push({ type: "hide", ...child }));
        }
        return;
      }

      if (
        node.name === "URL" &&
        node.node.parent?.name !== "Link" &&
        node.node.parent?.name !== "Autolink" &&
        node.node.parent?.name !== "Image"
      ) {
        decorations.push({
          type: "mark",
          from: node.from,
          to: node.to,
          className: "cm-live-link",
        });
        return;
      }

      if (node.name === "Image") {
        if (!overlapsSelection(node.from, node.to, selections)) {
          decorations.push({
            type: "image",
            from: node.from,
            to: node.to,
            alt: imageAlt(text, childRanges(node)),
          });
        }
        return false;
      }

      const headingMatch = /^ATXHeading([1-6])$/.exec(node.name);
      if (headingMatch) {
        const marker = childRanges(node).find((child) => child.name === "HeaderMark");
        decorations.push({
          type: "line",
          from: lineStarts(text, node.from, node.to)[0],
          className: `cm-live-heading cm-live-heading-${headingMatch[1]}`,
        });
        if (marker?.to && marker.to < node.to) {
          decorations.push({
            type: "mark",
            from: marker.to,
            to: node.to,
            className: "cm-live-heading-text",
          });
        }
        return;
      }

      const lineClass = node.name === "Blockquote"
        ? "cm-live-blockquote"
        : node.name === "FencedCode" || node.name === "CodeBlock"
          ? "cm-live-code-block"
          : node.name === "Table"
            ? "cm-live-table"
            : null;
      if (lineClass) {
        lineStarts(text, node.from, node.to).forEach((from) =>
          decorations.push({ type: "line", from, className: lineClass }),
        );
      }

      if (node.name === "ListMark" || node.name === "QuoteMark" || node.name === "TaskMarker") {
        decorations.push({
          type: "mark",
          from: node.from,
          to: node.to,
          className: "cm-live-structure-mark",
        });
      }
    },
  });

  return decorations.sort((left, right) => {
    const leftTo = "to" in left ? left.to : left.from;
    const rightTo = "to" in right ? right.to : right.from;
    return left.from - right.from || leftTo - rightTo;
  });
}
