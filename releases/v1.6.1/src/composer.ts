import type { Board, BoardNode } from './types';

export type ComposerTarget =
  { kind: 'new' } | { kind: 'choose' } | { kind: 'chat'; node: BoardNode };

export function composerTarget(board: Board): ComposerTarget {
  const selected = board.nodes.filter((node) => node.selected);
  if (selected.length > 1) return { kind: 'choose' };
  const node = selected[0];
  return node?.type === 'chat' ? { kind: 'chat', node } : { kind: 'new' };
}

export const draftKey = (boardId: string, nodeId: string | null) =>
  JSON.stringify([boardId, nodeId]);
