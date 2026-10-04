import type { BoardNode } from './types';

/** Presentation only: never rewrites legacy titles or the context sent to a provider. */
export function nodeLabel(node: Pick<BoardNode, 'type' | 'data'>): string {
  const question =
    node.type === 'chat'
      ? node.data.messages.find((m) => m.role === 'user' && m.content.trim())?.content
      : node.type === 'note'
        ? node.data.note
        : '';
  return (
    question?.trim().replace(/\s+/g, ' ') ||
    node.data.title ||
    (node.type === 'chat' ? 'Conversation' : node.type === 'note' ? 'Note' : 'Legacy group')
  ).slice(0, 100);
}
