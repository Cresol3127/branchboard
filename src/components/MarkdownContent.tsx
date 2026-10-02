import { memo, useMemo } from "react";
import ReactMarkdown, {
  defaultUrlTransform,
  type Components,
} from "react-markdown";
import rehypeKatex from "rehype-katex";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { normalizeLatexDelimiters } from "../lib/markdown";

type MarkdownContentProps = {
  content: string;
  variant: "prompt" | "response";
};

const markdownComponents: Components = {
  a({ node: _node, className, onClick, ...props }) {
    return (
      <a
        {...props}
        className={["markdown-link", "nodrag", "nopan", className]
          .filter(Boolean)
          .join(" ")}
        target="_blank"
        rel="noreferrer noopener"
        onClick={(event) => {
          event.stopPropagation();
          onClick?.(event);
        }}
      />
    );
  },
  img({ node: _node, alt, title }) {
    return (
      <span className="markdown-image-placeholder" aria-label={title ?? undefined}>
        [Image: {alt || "attachment"}]
      </span>
    );
  },
};

function MarkdownContentView({ content, variant }: MarkdownContentProps) {
  const normalizedContent = useMemo(
    () => normalizeLatexDelimiters(content),
    [content],
  );

  return (
    <div className={`markdown-content markdown-${variant}`}>
      <ReactMarkdown
        skipHtml
        components={markdownComponents}
        remarkPlugins={[remarkGfm, [remarkMath, { singleDollarTextMath: true }]]}
        rehypePlugins={[[rehypeKatex, { strict: false }]]}
        urlTransform={defaultUrlTransform}
      >
        {normalizedContent}
      </ReactMarkdown>
    </div>
  );
}

export const MarkdownContent = memo(MarkdownContentView);
