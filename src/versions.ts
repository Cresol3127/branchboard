import type { Board } from './types';
import { allRecords, deleteRecords, putRecord, requestResult, openLocalDatabase } from './localDb';

export type VersionReason = 'auto' | 'generation' | 'import' | 'restore' | 'snapshot';

export type BoardVersion = {
  id: string;
  boardId: string;
  boardName: string;
  createdAt: number;
  reason: VersionReason;
  bytes: number;
  board: Board;
};

export const VERSION_LIMITS = {
  perBoard: 60,
  ageMs: 30 * 24 * 60 * 60 * 1000,
  totalBytes: 100 * 1024 * 1024,
  autoCoalesceMs: 60 * 1000,
} as const;

export const VERSION_POLICY =
  'Automatic browser-local history keeps up to 60 versions per canvas, 30 days, and 100 MiB total (whichever limit is reached first). The newest recoverable version of every canvas is never pruned. This is not an independent backup.';

function sizeOf(board: Board) {
  return new TextEncoder().encode(JSON.stringify(board)).byteLength;
}

function compareOldest(a: BoardVersion, b: BoardVersion) {
  return a.createdAt - b.createdAt || a.id.localeCompare(b.id);
}

/** Pure retention decision, exported for deterministic tests. */
export function retentionPlan(versions: BoardVersion[], now = Date.now()) {
  const sorted = [...versions].sort(compareOldest);
  const newest = new Map<string, string>();
  for (const version of sorted) newest.set(version.boardId, version.id);
  const remove = new Set<string>();

  const byBoard = new Map<string, BoardVersion[]>();
  for (const version of sorted)
    byBoard.set(version.boardId, [...(byBoard.get(version.boardId) || []), version]);
  for (const list of byBoard.values())
    list.slice(0, Math.max(0, list.length - VERSION_LIMITS.perBoard)).forEach((version) => {
      if (version.id !== newest.get(version.boardId)) remove.add(version.id);
    });

  for (const version of sorted) {
    if (version.id === newest.get(version.boardId)) continue;
    if (now - version.createdAt > VERSION_LIMITS.ageMs) remove.add(version.id);
  }

  let bytes = sorted
    .filter((version) => !remove.has(version.id))
    .reduce((sum, version) => sum + version.bytes, 0);
  for (const version of sorted) {
    if (bytes <= VERSION_LIMITS.totalBytes) break;
    if (version.id === newest.get(version.boardId)) continue;
    if (remove.has(version.id)) continue;
    remove.add(version.id);
    bytes -= version.bytes;
  }
  return {
    remove: [...remove],
    kept: sorted.filter((version) => !remove.has(version.id)),
    bytes,
  };
}

export async function listVersions(): Promise<BoardVersion[]> {
  const versions = await allRecords<BoardVersion>('versions');
  return versions.sort((a, b) => b.createdAt - a.createdAt);
}

export async function versionsForBoard(boardId: string, limit = 60): Promise<BoardVersion[]> {
  const database = await openLocalDatabase();
  const store = database.transaction('versions', 'readonly').objectStore('versions');
  const versions = await requestResult<BoardVersion[]>(store.index('boardId').getAll(boardId));
  return versions.sort((a, b) => b.createdAt - a.createdAt).slice(0, limit);
}

async function prune() {
  const versions = await allRecords<BoardVersion>('versions');
  const plan = retentionPlan(versions);
  if (plan.remove.length) await deleteRecords('versions', plan.remove);
}

export async function saveVersion(
  board: Board,
  reason: VersionReason,
  options: { now?: number; force?: boolean } = {},
): Promise<BoardVersion> {
  const now = options.now ?? Date.now();
  const database = await openLocalDatabase();
  const existing = await requestResult<BoardVersion[]>(
    database
      .transaction('versions', 'readonly')
      .objectStore('versions')
      .index('boardId')
      .getAll(board.id),
  );
  const latest = existing.sort((a, b) => b.createdAt - a.createdAt)[0];
  const coalesce =
    !options.force &&
    reason === 'auto' &&
    latest?.reason === 'auto' &&
    now - latest.createdAt < VERSION_LIMITS.autoCoalesceMs;
  const record: BoardVersion = {
    id: coalesce ? latest.id : crypto.randomUUID(),
    boardId: board.id,
    boardName: board.name,
    createdAt: now,
    reason,
    bytes: sizeOf(board),
    board: structuredClone(board),
  };
  await putRecord('versions', record);
  await prune();
  return record;
}

export async function deleteVersion(id: string) {
  await deleteRecords('versions', [id]);
}

/** Latest committed version for each canvas, newest first. */
export function latestByBoard(versions: BoardVersion[]) {
  const seen = new Set<string>();
  return versions.filter((version) => {
    if (seen.has(version.boardId)) return false;
    seen.add(version.boardId);
    return true;
  });
}

export async function recoveryCandidates(
  boards: Board[],
  versions: BoardVersion[],
): Promise<BoardVersion[]> {
  const current = new Map(boards.map((board) => [board.id, board.updatedAt]));
  return latestByBoard(versions).filter((version) => {
    const updated = current.get(version.boardId);
    return (
      updated === undefined || version.board.updatedAt > updated || version.createdAt > updated
    );
  });
}
