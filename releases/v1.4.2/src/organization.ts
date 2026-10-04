import type { Board, WorkspaceFolder, WorkspaceOrganization } from './types';

export const emptyOrganization = (): WorkspaceOrganization => ({
  folders: [],
  boardFolders: {},
  favoriteBoardIds: [],
  templates: [],
});

export function organizationName(name: string): string {
  if (typeof name !== 'string' || !name.trim() || name.length > 120)
    throw new Error('Enter a name (1–120 characters).');
  return name.trim();
}

export function folderPath(id: string, folders: WorkspaceFolder[]): string {
  const parts: string[] = [];
  const seen = new Set<string>();
  let folder = folders.find((f) => f.id === id);
  while (folder && !seen.has(folder.id)) {
    seen.add(folder.id);
    parts.unshift(folder.name);
    folder = folders.find((f) => f.id === folder?.parentId);
  }
  return parts.join(' / ');
}

export function folderSubtree(id: string, folders: WorkspaceFolder[]): Set<string> {
  const ids = new Set([id]);
  let size = 0;
  while (size !== ids.size) {
    size = ids.size;
    for (const f of folders) if (f.parentId && ids.has(f.parentId)) ids.add(f.id);
  }
  return ids;
}

// Legacy workspaces have no organization field. Everything else is validated atomically.
export function validateOrganization(
  input: unknown,
  boards: Board[],
  validateBoard: (input: unknown) => Board,
): WorkspaceOrganization {
  if (input === undefined) return emptyOrganization();
  const o = input as WorkspaceOrganization;
  if (
    !o ||
    !Array.isArray(o.folders) ||
    o.folders.length > 100 ||
    !Array.isArray(o.templates) ||
    o.templates.length > 50 ||
    !Array.isArray(o.favoriteBoardIds) ||
    !o.boardFolders ||
    typeof o.boardFolders !== 'object' ||
    Array.isArray(o.boardFolders)
  )
    throw new Error('Invalid workspace organization (100 folders / 50 templates maximum).');
  const folderIds = new Set<string>();
  const folders = o.folders.map((f) => {
    if (
      !f ||
      typeof f.id !== 'string' ||
      !f.id ||
      folderIds.has(f.id) ||
      (f.parentId !== undefined && typeof f.parentId !== 'string')
    )
      throw new Error('Invalid or duplicate folder.');
    folderIds.add(f.id);
    return {
      id: f.id,
      name: organizationName(f.name),
      ...(f.parentId !== undefined ? { parentId: f.parentId } : {}),
    };
  });
  for (const f of folders) {
    const seen = new Set([f.id]);
    let parentId = f.parentId;
    while (parentId !== undefined) {
      if (!folderIds.has(parentId) || seen.has(parentId))
        throw new Error('Invalid or circular folder hierarchy.');
      seen.add(parentId);
      parentId = folders.find((p) => p.id === parentId)!.parentId;
    }
  }
  const boardIds = new Set(boards.map((b) => b.id));
  const entries = Object.entries(o.boardFolders);
  if (
    entries.some(
      ([id, folder]) => !boardIds.has(id) || typeof folder !== 'string' || !folderIds.has(folder),
    )
  )
    throw new Error('Invalid canvas folder reference.');
  if (
    new Set(o.favoriteBoardIds).size !== o.favoriteBoardIds.length ||
    o.favoriteBoardIds.some((id) => typeof id !== 'string' || !boardIds.has(id))
  )
    throw new Error('Invalid favorite canvas reference.');
  const templateIds = new Set<string>();
  const templates = o.templates.map((t) => {
    if (
      !t ||
      typeof t.id !== 'string' ||
      !t.id ||
      templateIds.has(t.id) ||
      !Number.isFinite(t.createdAt) ||
      t.createdAt <= 0
    )
      throw new Error('Invalid canvas template.');
    templateIds.add(t.id);
    return {
      id: t.id,
      name: organizationName(t.name),
      createdAt: t.createdAt,
      board: validateBoard(t.board),
    };
  });
  return {
    folders,
    boardFolders: Object.fromEntries(entries),
    favoriteBoardIds: [...o.favoriteBoardIds],
    templates,
  };
}
