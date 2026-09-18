import type { Attachment, AttachmentKind, Board, NodeData, Snapshot } from './types';
import type { ProviderId } from './providers';
import {
  allRecords,
  deleteRecords,
  getRecord,
  putRecord,
  openLocalDatabase,
  requestResult,
} from './localDb';
import { listVersions } from './versions';

export const MAX_FILE_BYTES = 25 * 1024 * 1024;
export const MAX_WORKSPACE_ATTACHMENT_BYTES = 150 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_NODE = 30;
export const MAX_EXTRACTED_CHARS = 1_000_000;
export const MAX_PROVIDER_ATTACHMENT_BYTES = 14 * 1024 * 1024;

const extensionMime: Record<string, string> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  avif: 'image/avif',
  pdf: 'application/pdf',
  mp3: 'audio/mpeg',
  wav: 'audio/wav',
  m4a: 'audio/mp4',
  ogg: 'audio/ogg',
  oga: 'audio/ogg',
  opus: 'audio/ogg',
  flac: 'audio/flac',
  mp4: 'video/mp4',
  webm: 'video/webm',
  mov: 'video/quicktime',
  txt: 'text/plain',
  md: 'text/markdown',
  markdown: 'text/markdown',
  csv: 'text/csv',
  tsv: 'text/tab-separated-values',
  json: 'application/json',
  xml: 'application/xml',
  yaml: 'text/yaml',
  yml: 'text/yaml',
  toml: 'text/plain',
  ini: 'text/plain',
  log: 'text/plain',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  odt: 'application/vnd.oasis.opendocument.text',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
};

const codeExtensions = new Set([
  'js','jsx','ts','tsx','mjs','cjs','py','go','rs','java','kt','kts','c','h','cc','cpp','hpp',
  'cs','rb','php','swift','scala','sh','bash','zsh','fish','sql','graphql','gql','css','scss',
  'sass','less','html','htm','vue','svelte','astro','dockerfile','makefile','gradle','lua','r',
  'dart','ex','exs','erl','hs','clj','fs','vb','asm','s','proto',
]);

export type StoredAttachment = {
  id: string;
  blob: Blob;
  text?: string;
  mime: string;
  name: string;
  hash: string;
  bytes: number;
};

export type AttachmentPayload = {
  id: string;
  name: string;
  mime: string;
  kind: AttachmentKind;
  size: number;
  data?: string;
  text?: string;
  native: boolean;
};

export function attachmentKind(mime: string, name: string): AttachmentKind {
  if (mime.startsWith('image/')) return 'image';
  if (mime === 'application/pdf') return 'pdf';
  if (mime.startsWith('audio/')) return 'audio';
  if (mime.startsWith('video/')) return 'video';
  const extension = name.split('.').pop()?.toLowerCase() || '';
  if (codeExtensions.has(extension)) return 'code';
  if (mime.includes('word') || mime.includes('opendocument') || mime.includes('presentation'))
    return 'document';
  if (mime.includes('sheet')) return 'document';
  return 'text';
}

export function extensionOf(name: string) {
  const match = /\.([a-z0-9]+)$/i.exec(name.trim());
  return match?.[1]?.toLowerCase() || '';
}

export function allowedMime(name: string, declared: string) {
  const extension = extensionOf(name);
  const fromExtension = extensionMime[extension];
  if (codeExtensions.has(extension) && (!declared || declared === 'application/octet-stream'))
    return 'text/plain';
  if (!fromExtension) return null;
  if (!declared || declared === 'application/octet-stream') return fromExtension;
  if (declared === fromExtension) return declared;
  // Browsers often report generic types for code and office files.
  if (declared === 'text/plain' && (fromExtension.startsWith('text/') || fromExtension === 'application/json' || fromExtension === 'application/xml'))
    return fromExtension;
  if (declared === 'application/zip' && fromExtension.includes('openxmlformats')) return fromExtension;
  return null;
}

function textKind(name: string, mime: string) {
  return (
    mime.startsWith('text/') ||
    mime === 'application/json' ||
    mime === 'application/xml' ||
    codeExtensions.has(extensionOf(name))
  );
}

async function startsWith(file: Blob, bytes: number[], offset = 0) {
  const head = new Uint8Array(await file.slice(offset, offset + bytes.length).arrayBuffer());
  return bytes.every((byte, index) => head[index] === byte);
}

async function ascii(file: Blob, start: number, length: number) {
  return new TextDecoder('latin1').decode(await file.slice(start, start + length).arrayBuffer());
}

export async function validateFile(file: File) {
  if (!file.size) throw new Error('The selected file is empty.');
  if (file.size > MAX_FILE_BYTES)
    throw new Error(`Files are limited to ${MAX_FILE_BYTES / 1024 / 1024} MB each.`);
  const mime = allowedMime(file.name, file.type);
  if (!mime)
    throw new Error(
      'Unsupported file type. Use images, PDF, audio, video, plain text/code, DOCX, ODT, PPTX or XLSX. Executables, HTML-app content, SVG scripts and unknown formats are rejected.',
    );
  if (file.name.length > 200 || /[\u0000-\u001f]/.test(file.name))
    throw new Error('The file name is invalid or too long.');
  if (mime === 'image/png' && !(await startsWith(file, [0x89, 0x50, 0x4e, 0x47])))
    throw new Error('This is not a valid PNG image.');
  if (mime === 'image/jpeg' && !(await startsWith(file, [0xff, 0xd8, 0xff])))
    throw new Error('This is not a valid JPEG image.');
  if (mime === 'image/gif' && !(await startsWith(file, [0x47, 0x49, 0x46, 0x38])))
    throw new Error('This is not a valid GIF image.');
  if (mime === 'image/webp' && (!(await startsWith(file, [0x52, 0x49, 0x46, 0x46])) || (await ascii(file, 8, 4)) !== 'WEBP'))
    throw new Error('This is not a valid WebP image.');
  if (mime === 'image/avif' && (await ascii(file, 4, 4)) !== 'ftyp')
    throw new Error('This is not a valid AVIF image.');
  if (mime === 'application/pdf' && !(await ascii(file, 0, 5)).startsWith('%PDF-'))
    throw new Error('This is not a valid PDF file.');
  if (mime.includes('openxmlformats') || mime.includes('opendocument')) {
    if (!(await startsWith(file, [0x50, 0x4b])))
      throw new Error('This is not a valid ZIP-based office document.');
  }
  if (mime === 'video/mp4' && (await ascii(file, 4, 4)) !== 'ftyp')
    throw new Error('This is not a valid MP4 video.');
  if (mime === 'video/webm' && !(await startsWith(file, [0x1a, 0x45, 0xdf, 0xa3])))
    throw new Error('This is not a valid WebM video.');
  if (textKind(file.name, mime)) {
    const sample = new Uint8Array(await file.slice(0, 8192).arrayBuffer());
    if (sample.includes(0)) throw new Error('This text file contains binary data.');
    try {
      new TextDecoder('utf-8', { fatal: true }).decode(sample);
    } catch {
      throw new Error('Text files must use UTF-8 encoding.');
    }
  }
  return { mime, kind: attachmentKind(mime, file.name) };
}

function stripXml(xml: string) {
  return xml
    .replace(/<w:tab\/>/g, '\t')
    .replace(/<w:br\/>/g, '\n')
    .replace(/<\/w:p>/g, '\n')
    .replace(/<\/a:p>/g, '\n')
    .replace(/<\/text:p>/g, '\n')
    .replace(/<\/si>/g, '\n')
    .replace(/<\/c>/g, '\t')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/\u0000/g, '')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

async function extractZipText(file: File, mime: string) {
  const { unzipSync } = await import('fflate');
  const data = new Uint8Array(await file.arrayBuffer());
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(data, {
      filter: (entry) => entry.name.length < 500 && entry.size <= 30 * 1024 * 1024,
    });
  } catch {
    throw new Error('The office document archive is unreadable or password-protected.');
  }
  const decoder = new TextDecoder();
  const wanted =
    mime.includes('wordprocessing')
      ? ['word/document.xml']
      : mime.includes('presentation')
        ? Object.keys(entries).filter((key) => /^ppt\/slides\/slide\d+\.xml$/.test(key)).sort((a, b) => {
            const number = (key: string) => Number(/(\d+)\.xml$/.exec(key)?.[1] || 0);
            return number(a) - number(b);
          })
        : mime.includes('spreadsheet')
          ? ['xl/sharedStrings.xml', 'xl/workbook.xml'].filter((key) => entries[key])
          : mime.includes('opendocument') && mime.includes('text')
            ? ['content.xml']
            : [];
  if (!wanted.length || wanted.some((key) => !entries[key]))
    throw new Error('This Office document does not contain readable text.');
  const text = wanted.map((key) => stripXml(decoder.decode(entries[key]))).filter(Boolean).join('\n\n');
  if (!text) throw new Error('No selectable text was found in this document.');
  return { text, engine: 'Office Open XML text extraction (local)' };
}

async function extractPdf(file: File) {
  try {
    const pdfjs = await import('pdfjs-dist');
    const worker = (await import('pdfjs-dist/build/pdf.worker.min.mjs?url')).default;
    pdfjs.GlobalWorkerOptions.workerSrc = worker;
    const task = pdfjs.getDocument({
      data: new Uint8Array(await file.arrayBuffer()),
      isEvalSupported: false,
      useSystemFonts: false,
    });
    const document = await task.promise;
    const pages: string[] = [];
    for (let pageNumber = 1; pageNumber <= Math.min(document.numPages, 300); pageNumber++) {
      const page = await document.getPage(pageNumber);
      const content = await page.getTextContent();
      pages.push(
        content.items
          .map((item) => ('str' in item ? item.str : ''))
          .join(' ')
          .replace(/\s+/g, ' ')
          .trim(),
      );
      page.cleanup();
    }
    await document.destroy();
    const text = pages.join('\n\n');
    if (!text.trim())
      throw new Error(
        'No selectable text was found. This PDF may be scanned; OCR is not included, so attach it only to providers that accept PDFs or add a text transcription.',
      );
    return { text, pages: pages.length, engine: 'PDF.js local text extraction' };
  } catch (error) {
    throw new Error(
      error instanceof Error && error.message
        ? error.message
        : 'PDF text extraction failed. The file may be encrypted or damaged.',
    );
  }
}

function truncate(text: string) {
  const normalized = text.replace(/\r\n?/g, '\n').trim();
  if (normalized.length <= MAX_EXTRACTED_CHARS) return { text: normalized, truncated: false };
  return { text: normalized.slice(0, MAX_EXTRACTED_CHARS), truncated: true };
}

export async function extractAttachment(
  file: File,
  kind: AttachmentKind,
  mime: string,
): Promise<{ text?: string; extraction: Attachment['extraction'] }> {
  if (kind === 'image' || kind === 'audio' || kind === 'video')
    return {
      extraction: {
        status: 'unsupported',
        engine: 'Native media; no local text transcription is performed.',
      },
    };
  try {
    let extracted: { text: string; pages?: number; engine: string };
    if (mime === 'application/pdf') extracted = await extractPdf(file);
    else if (mime.includes('openxmlformats') || mime.includes('opendocument'))
      extracted = await extractZipText(file, mime);
    else extracted = { text: await file.text(), engine: 'UTF-8 text' };
    const { text, truncated } = truncate(extracted.text);
    if (!text)
      return {
        extraction: { status: 'error', engine: extracted.engine, error: 'No text found.' },
      };
    return {
      text,
      extraction: {
        status: 'ready',
        characters: text.length,
        pages: extracted.pages,
        engine: extracted.engine,
        ...(truncated ? { truncated: true } : {}),
      },
    };
  } catch (error) {
    return {
      extraction: {
        status: 'error',
        engine: 'Local text extraction',
        error: error instanceof Error ? error.message : 'Text extraction failed.',
      },
    };
  }
}

async function digest(file: Blob) {
  if (!crypto.subtle)
    throw new Error('File integrity hashing is unavailable in this browser; file was not stored.');
  const hash = await crypto.subtle.digest('SHA-256', await file.arrayBuffer());
  return [...new Uint8Array(hash)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export function attachmentIdsFromNode(data: NodeData) {
  return (data.attachments || []).map((attachment) => attachment.id);
}

export function uniqueAttachmentsFromNodes(nodes: { data: NodeData }[]) {
  const map = new Map<string, Attachment>();
  for (const node of nodes) for (const attachment of node.data.attachments || []) map.set(attachment.id, attachment);
  return [...map.values()];
}

export function reachableAttachmentIds(
  boards: Board[],
  snapshots: Snapshot[] = [],
  templates: Board[] = [],
  extraBoards: Board[] = [],
) {
  const ids = new Set<string>();
  [...boards, ...snapshots.map((snapshot) => snapshot.board), ...templates, ...extraBoards].forEach(
    (board) => board.nodes.forEach((node) => attachmentIdsFromNode(node.data).forEach((id) => ids.add(id))),
  );
  return ids;
}

export async function workspaceAttachmentBytes(nodes: { data: NodeData }[]) {
  return uniqueAttachmentsFromNodes(nodes).reduce((sum, attachment) => sum + attachment.size, 0);
}

export function ensureAttachmentCapacity(
  nodes: { data: NodeData }[],
  addition: { size: number; id?: string },
) {
  const unique = uniqueAttachmentsFromNodes(nodes);
  if (addition.id && unique.some((attachment) => attachment.id === addition.id)) return;
  const total = unique.reduce((sum, attachment) => sum + attachment.size, 0);
  if (total + addition.size > MAX_WORKSPACE_ATTACHMENT_BYTES)
    throw new Error(
      `Attachments in this workspace would exceed ${MAX_WORKSPACE_ATTACHMENT_BYTES / 1024 / 1024} MB. Remove or disable unused files first.`,
    );
}

export async function storeAttachment(file: File): Promise<Attachment> {
  const { mime, kind } = await validateFile(file);
  const hash = await digest(file);
  const id = `att_${hash.slice(0, 40)}`;
  const existing = await getRecord<StoredAttachment>('attachmentBlobs', id);
  if (existing) {
    return {
      id,
      name: existing.name || file.name,
      mime: existing.mime,
      size: existing.bytes,
      kind: attachmentKind(existing.mime, existing.name),
      hash,
      createdAt: Date.now(),
      enabled: true,
      extraction: existing.text
        ? {
            status: 'ready',
            characters: existing.text.length,
            engine: 'Previously extracted locally',
          }
        : { status: 'unsupported', engine: 'Native media; no local text transcription is performed.' },
    };
  }
  const extraction = await extractAttachment(file, kind, mime);
  const record: StoredAttachment = {
    id,
    blob: file,
    text: extraction.text,
    mime,
    name: file.name.slice(0, 200),
    hash,
    bytes: file.size,
  };
  await putRecord('attachmentBlobs', record);
  return {
    id,
    name: record.name,
    mime,
    size: file.size,
    kind,
    hash,
    createdAt: Date.now(),
    enabled: true,
    extraction: extraction.extraction,
  };
}

export async function loadAttachment(id: string) {
  return getRecord<StoredAttachment>('attachmentBlobs', id);
}

export async function attachmentText(id: string) {
  return (await loadAttachment(id))?.text;
}

export function previewUrl(blob: Blob) {
  return URL.createObjectURL(blob);
}

export async function exportAttachmentData(ids: string[]) {
  const entries: {
    id: string;
    name: string;
    mime: string;
    hash: string;
    data: string;
    text?: string;
  }[] = [];
  for (const id of ids) {
    const record = await loadAttachment(id);
    if (!record) continue;
    entries.push({
      id,
      name: record.name,
      mime: record.mime,
      hash: record.hash,
      data: await blobBase64(record.blob),
      text: record.text,
    });
  }
  return entries;
}

export async function importAttachmentData(
  entries: unknown,
): Promise<{ attachments: Attachment[]; errors: string[] }> {
  if (!Array.isArray(entries)) return { attachments: [], errors: ['Invalid attachment bundle.'] };
  const attachments: Attachment[] = [];
  const errors: string[] = [];
  for (const candidate of entries.slice(0, 500)) {
    try {
      if (!candidate || typeof candidate !== 'object') throw new Error('Invalid file entry.');
      const entry = candidate as Record<string, unknown>;
      if (
        typeof entry.id !== 'string' ||
        typeof entry.name !== 'string' ||
        typeof entry.mime !== 'string' ||
        typeof entry.data !== 'string' ||
        (entry.text !== undefined && typeof entry.text !== 'string')
      )
        throw new Error('Invalid file entry.');
      const mime = allowedMime(entry.name, entry.mime);
      if (!mime) throw new Error(`Unsupported imported file type: ${entry.name}.`);
      const blob = base64Blob(entry.data, mime);
      if (blob.size > MAX_FILE_BYTES) throw new Error(`Imported file ${entry.name} is too large.`);
      const hash = await digest(blob);
      if (entry.hash !== hash) throw new Error(`Imported file ${entry.name} failed integrity validation.`);
      if (await getRecord('attachmentBlobs', entry.id))
        throw new Error(`Duplicate attachment ID ${entry.name}.`);
      const record: StoredAttachment = {
        id: entry.id,
        blob,
        text: entry.text?.slice(0, MAX_EXTRACTED_CHARS),
        mime,
        name: entry.name.slice(0, 200),
        hash,
        bytes: blob.size,
      };
      await putRecord('attachmentBlobs', record);
      attachments.push({
        id: record.id,
        name: record.name,
        mime,
        size: blob.size,
        kind: attachmentKind(mime, record.name),
        hash,
        createdAt: Date.now(),
        enabled: true,
        extraction: record.text
          ? { status: 'ready', characters: record.text.length, engine: 'Imported extracted text' }
          : { status: 'unsupported', engine: 'Media file; no local transcription.' },
      });
    } catch (error) {
      errors.push(error instanceof Error ? error.message : 'Attachment import failed.');
    }
  }
  return { attachments, errors };
}

export async function cleanupUnusedAttachments(
  boards: Board[],
  snapshots: Snapshot[],
  templates: Board[],
  extraBoards: Board[] = [],
) {
  const versions = await listVersions();
  const keep = reachableAttachmentIds(boards, snapshots, templates, [
    ...extraBoards,
    ...versions.map((version) => version.board),
  ]);
  const database = await openLocalDatabase();
  const records = await requestResult<StoredAttachment[]>(
    database.transaction('attachmentBlobs', 'readonly').objectStore('attachmentBlobs').getAll(),
  );
  const remove = records.map((record) => record.id).filter((id) => !keep.has(id));
  await deleteRecords('attachmentBlobs', remove);
  return { removed: remove.length, bytes: records.filter((record) => remove.includes(record.id)).reduce((sum, record) => sum + record.bytes, 0) };
}

type Capabilities = {
  images: boolean;
  pdf: boolean;
  audio: boolean;
  video: boolean;
  note: string;
};

export const providerAttachmentCapabilities: Record<ProviderId, Capabilities> = {
  openai: {
    images: true,
    pdf: false,
    audio: false,
    video: false,
    note: 'Images are sent natively. PDFs, audio and video use local text extraction; untranscribed media is blocked.',
  },
  anthropic: {
    images: true,
    pdf: true,
    audio: false,
    video: false,
    note: 'Images and PDFs are sent natively. Untranscribed audio/video is blocked.',
  },
  google: {
    images: true,
    pdf: true,
    audio: true,
    video: true,
    note: 'Images, PDFs, audio and video are sent natively as inline data.',
  },
  openrouter: {
    images: true,
    pdf: false,
    audio: false,
    video: false,
    note: 'Images are sent for vision-capable routed models. PDFs use local text. Media support depends on the routed model.',
  },
  groq: {
    images: false,
    pdf: false,
    audio: false,
    video: false,
    note: 'Text extraction only. Images and media are blocked rather than silently omitted.',
  },
  ollama: {
    images: true,
    pdf: false,
    audio: false,
    video: false,
    note: 'Images are sent in Ollama’s native images field. Other media is blocked.',
  },
  ollama_cloud: {
    images: true,
    pdf: false,
    audio: false,
    video: false,
    note: 'Images use Ollama’s native images field. Other media is blocked.',
  },
  custom: {
    images: false,
    pdf: false,
    audio: false,
    video: false,
    note: 'OpenAI-compatible text only. Binary media is blocked rather than silently omitted.',
  },
};

/** Loads bytes only when the user explicitly sends a message. */
export async function prepareProviderAttachments(
  attachments: Attachment[],
  provider: ProviderId,
): Promise<{ payload: AttachmentPayload[]; bytes: number; errors: string[] }> {
  const enabled = attachments.filter((attachment) => attachment.enabled);
  if (enabled.length > 16) throw new Error('Send at most 16 attachments in one request.');
  const capabilities = providerAttachmentCapabilities[provider];
  const payload: AttachmentPayload[] = [];
  const errors: string[] = [];
  let bytes = 0;
  for (const attachment of enabled) {
    const record = await loadAttachment(attachment.id);
    if (!record) {
      errors.push(`${attachment.name}: file bytes are missing from browser storage. Re-upload it.`);
      continue;
    }
    const native =
      (attachment.kind === 'image' && capabilities.images) ||
      (attachment.kind === 'pdf' && capabilities.pdf) ||
      (attachment.kind === 'audio' && capabilities.audio) ||
      (attachment.kind === 'video' && capabilities.video);
    if (native) {
      const data = await blobBase64(record.blob);
      bytes += Math.ceil((data.length * 3) / 4);
      payload.push({
        id: attachment.id,
        name: attachment.name,
        mime: record.mime,
        kind: attachment.kind,
        size: record.bytes,
        data,
        native: true,
      });
      continue;
    }
    if (record.text) {
      payload.push({
        id: attachment.id,
        name: attachment.name,
        mime: record.mime,
        kind: attachment.kind,
        size: record.bytes,
        text: record.text,
        native: false,
      });
      continue;
    }
    errors.push(
      `${attachment.name}: ${provider} cannot receive ${attachment.kind} natively and no local text is available. Disable this attachment or use a compatible provider.`,
    );
  }
  if (bytes > MAX_PROVIDER_ATTACHMENT_BYTES)
    errors.push(
      `Native attachments total ${(bytes / 1024 / 1024).toFixed(1)} MB; the request limit is ${MAX_PROVIDER_ATTACHMENT_BYTES / 1024 / 1024} MB. Disable or compress files.`,
    );
  return { payload, bytes, errors };
}

export async function blobBase64(blob: Blob) {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let binary = '';
  const chunk = 0x8000;
  for (let index = 0; index < bytes.length; index += chunk)
    binary += String.fromCharCode(...bytes.subarray(index, index + chunk));
  return btoa(binary);
}

function base64Blob(value: string, mime: string) {
  if (value.length > Math.ceil((MAX_FILE_BYTES * 4) / 3) + 8)
    throw new Error('Imported file data is too large.');
  let binary: string;
  try {
    binary = atob(value);
  } catch {
    throw new Error('Imported file data is not valid base64.');
  }
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: mime });
}
