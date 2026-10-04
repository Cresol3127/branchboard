import { marked } from 'marked';

/** Do not silently discard constructs that the rich editor cannot round-trip. */
export function richMarkdownIssue(source: string): string | undefined {
  let unsupported = false;
  marked.walkTokens(marked.lexer(source), (token) => {
    if (token.type === 'html' || token.type === 'image') unsupported = true;
  });
  return unsupported
    ? 'This note contains images or raw HTML. Use Edit to preserve its exact source; rich editing is read-only.'
    : undefined;
}
