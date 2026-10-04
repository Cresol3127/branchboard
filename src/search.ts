import type { Board, Message } from './types';
import { nodeLabel } from './nodeLabel';

export type SearchResult = {
  boardId: string;
  nodeId: string;
  messageId?: string;
  boardName: string;
  nodeTitle: string;
  source: Message['role'] | 'note' | 'title';
  snippet: string;
};

/** Literal, case-insensitive local search. Results are bounded, not the searched content. */
export function searchWorkspace(boards: Board[], query: string, limit = 100) {
  const needle = query.trim().toLowerCase();
  const results: SearchResult[] = [];
  if (!needle) return { results, hasMore: false };
  for (const board of boards) {
    for (const node of board.nodes) {
      const candidates = [
        { source: 'title' as const, content: node.data.title, messageId: undefined },
        ...(node.type === 'note'
          ? [{ source: 'note' as const, content: node.data.note, messageId: undefined }]
          : node.type === 'chat'
            ? node.data.messages.map((m) => ({
                source: m.role,
                content: m.content,
                messageId: m.id,
              }))
            : []),
      ];
      for (const candidate of candidates) {
        const index = candidate.content.toLowerCase().indexOf(needle);
        if (index < 0) continue;
        if (results.length >= limit) return { results, hasMore: true };
        const start = Math.max(0, index - 45);
        const end = Math.min(candidate.content.length, index + Math.min(needle.length, 100) + 100);
        results.push({
          boardId: board.id,
          nodeId: node.id,
          messageId: candidate.messageId,
          boardName: board.name,
          nodeTitle: nodeLabel(node),
          source: candidate.source,
          snippet: `${start ? '…' : ''}${candidate.content.slice(start, end)}${end < candidate.content.length ? '…' : ''}`,
        });
      }
    }
  }
  return { results, hasMore: false };
}
