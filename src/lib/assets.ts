import type {
  AttachmentKind,
  AttachmentRef,
  WhiteboardCollection,
} from "../types";

const DATABASE_NAME = "branchboard-assets";
const DATABASE_VERSION = 1;
const ASSET_STORE = "assets";

export const MAX_ATTACHMENT_COUNT = 10;
export const MAX_ATTACHMENT_BYTES = 250 * 1024 * 1024;
export const MAX_COMPOSER_ATTACHMENT_BYTES = 500 * 1024 * 1024;
export const MAX_INLINE_TEXT_BYTES = 5 * 1024 * 1024;

type StoredAsset = {
  id: string;
  blob: Blob;
};

let databasePromise: Promise<IDBDatabase> | null = null;

function openDatabase(): Promise<IDBDatabase> {
  if (!globalThis.indexedDB) {
    return Promise.reject(new Error("File storage is unavailable in this browser."));
  }
  if (databasePromise) return databasePromise;

  databasePromise = new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(ASSET_STORE)) {
        request.result.createObjectStore(ASSET_STORE, { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open file storage."));
    request.onblocked = () => reject(new Error("File storage is blocked by another Branchboard tab."));
  });
  return databasePromise;
}

function finishTransaction(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error("File storage failed."));
    transaction.onabort = () => reject(transaction.error ?? new Error("File storage was cancelled."));
  });
}

const TEXT_EXTENSIONS = new Set([
  "asm", "bat", "c", "cc", "conf", "cpp", "css", "csv", "cxx", "diff",
  "env", "go", "h", "hpp", "html", "ini", "java", "js", "json", "jsx",
  "kt", "log", "lua", "md", "mjs", "php", "pl", "properties", "py", "r",
  "rb", "rs", "scala", "scss", "sh", "sql", "srt", "svg", "tex", "toml",
  "ts", "tsx", "txt", "vtt", "xml", "yaml", "yml", "zsh",
]);

function extensionOf(name: string): string {
  return name.toLowerCase().split(".").pop() ?? "";
}

export function classifyAttachment(file: Pick<File, "name" | "type">): AttachmentKind {
  const mimeType = file.type.toLowerCase();
  const extension = extensionOf(file.name);
  if (mimeType.startsWith("image/") && mimeType !== "image/svg+xml") return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType === "application/pdf" || extension === "pdf") return "pdf";
  if (
    mimeType.startsWith("text/") ||
    mimeType === "application/json" ||
    mimeType === "application/xml" ||
    mimeType === "application/javascript" ||
    TEXT_EXTENSIONS.has(extension)
  ) {
    return "text";
  }
  return "file";
}

export function attachmentRefForFile(file: File, id = crypto.randomUUID()): AttachmentRef {
  return {
    id,
    kind: classifyAttachment(file),
    name: file.name.slice(0, 255) || "untitled-file",
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    createdAt: Date.now(),
  };
}

export function validateFiles(files: File[], existingCount = 0, existingBytes = 0): void {
  if (existingCount + files.length > MAX_ATTACHMENT_COUNT) {
    throw new Error(`Attach up to ${MAX_ATTACHMENT_COUNT} files to one prompt.`);
  }
  for (const file of files) {
    if (!file.size) throw new Error(`${file.name || "A file"} is empty.`);
    if (file.size > MAX_ATTACHMENT_BYTES) {
      throw new Error(`${file.name} is larger than the 250 MB local limit.`);
    }
  }
  const total = existingBytes + files.reduce((sum, file) => sum + file.size, 0);
  if (total > MAX_COMPOSER_ATTACHMENT_BYTES) {
    throw new Error("Attachments for one prompt cannot exceed 500 MB.");
  }
}

export async function storeAttachments(
  entries: Array<{ ref: AttachmentRef; file: File }>,
): Promise<void> {
  if (!entries.length) return;
  const database = await openDatabase();
  const transaction = database.transaction(ASSET_STORE, "readwrite");
  const store = transaction.objectStore(ASSET_STORE);
  entries.forEach(({ ref, file }) => store.put({ id: ref.id, blob: file } satisfies StoredAsset));
  await finishTransaction(transaction);
}

export async function getAttachmentBlob(id: string): Promise<Blob> {
  const database = await openDatabase();
  const transaction = database.transaction(ASSET_STORE, "readonly");
  const request = transaction.objectStore(ASSET_STORE).get(id);
  const asset = await new Promise<StoredAsset | undefined>((resolve, reject) => {
    request.onsuccess = () => resolve(request.result as StoredAsset | undefined);
    request.onerror = () => reject(request.error ?? new Error("Could not read the attached file."));
  });
  if (!asset?.blob) throw new Error("An attached file is missing from local storage.");
  return asset.blob;
}

export async function getAttachmentText(attachment: AttachmentRef): Promise<string> {
  if (attachment.kind !== "text") throw new Error(`${attachment.name} is not a text file.`);
  if (attachment.size > MAX_INLINE_TEXT_BYTES) {
    throw new Error(`${attachment.name} is too large to include as inline text (5 MB maximum).`);
  }
  const text = await (await getAttachmentBlob(attachment.id)).text();
  if (text.includes("\0")) throw new Error(`${attachment.name} does not appear to be a text file.`);
  return text;
}

export async function deleteAttachments(ids: Iterable<string>): Promise<void> {
  const uniqueIds = [...new Set(ids)];
  if (!uniqueIds.length) return;
  const database = await openDatabase();
  const transaction = database.transaction(ASSET_STORE, "readwrite");
  const store = transaction.objectStore(ASSET_STORE);
  uniqueIds.forEach((id) => store.delete(id));
  await finishTransaction(transaction);
}

export function getReferencedAttachmentIds(collection: WhiteboardCollection): Set<string> {
  return new Set(
    collection.boards.flatMap((board) =>
      board.nodes.flatMap((node) => node.attachments?.map((attachment) => attachment.id) ?? []),
    ),
  );
}

export async function garbageCollectAttachments(
  collection: WhiteboardCollection,
  protectedIds: Iterable<string> = [],
): Promise<void> {
  const database = await openDatabase();
  const transaction = database.transaction(ASSET_STORE, "readwrite");
  const store = transaction.objectStore(ASSET_STORE);
  const keysRequest = store.getAllKeys();
  const keys = await new Promise<IDBValidKey[]>((resolve, reject) => {
    keysRequest.onsuccess = () => resolve(keysRequest.result);
    keysRequest.onerror = () => reject(keysRequest.error ?? new Error("Could not inspect file storage."));
  });
  const referenced = getReferencedAttachmentIds(collection);
  for (const id of protectedIds) referenced.add(id);
  keys.forEach((key) => {
    if (typeof key === "string" && !referenced.has(key)) store.delete(key);
  });
  await finishTransaction(transaction);
}

export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const units = ["KB", "MB", "GB"];
  let value = bytes / 1024;
  let unit = units[0];
  for (let index = 1; value >= 1024 && index < units.length; index += 1) {
    value /= 1024;
    unit = units[index];
  }
  return `${value >= 10 ? value.toFixed(0) : value.toFixed(1)} ${unit}`;
}
