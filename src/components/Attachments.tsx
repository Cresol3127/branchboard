import { memo, useEffect, useState } from "react";
import { formatFileSize, getAttachmentBlob } from "../lib/assets";
import type { AttachmentKind, AttachmentRef } from "../types";
import { IconButton, MaterialSymbol, type MaterialSymbolName } from "./material";

export type PendingAttachment = {
  ref: AttachmentRef;
  file: File;
};

function KindIcon({ kind, size = 15 }: { kind: AttachmentKind; size?: number }) {
  const name: MaterialSymbolName = kind === "image"
    ? "image"
    : kind === "video"
      ? "movie"
      : "description";
  return <MaterialSymbol name={name} size={size <= 20 ? 20 : 24} />;
}

function useObjectUrl(blob: Blob | null): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    if (!blob) {
      setUrl(null);
      return;
    }
    const next = URL.createObjectURL(blob);
    setUrl(next);
    return () => URL.revokeObjectURL(next);
  }, [blob]);

  return url;
}

function PendingAttachmentItem({
  attachment,
  onRemove,
}: {
  attachment: PendingAttachment;
  onRemove: (id: string) => void;
}) {
  const url = useObjectUrl(
    attachment.ref.kind === "image" || attachment.ref.kind === "video"
      ? attachment.file
      : null,
  );

  return (
    <div className="pending-attachment">
      <div className="pending-attachment-preview">
        {attachment.ref.kind === "image" && url ? (
          <img src={url} alt="" />
        ) : attachment.ref.kind === "video" && url ? (
          <video src={url} muted preload="metadata" aria-hidden="true" />
        ) : (
          <KindIcon kind={attachment.ref.kind} />
        )}
      </div>
      <span>
        <strong>{attachment.ref.name}</strong>
        <small>{formatFileSize(attachment.ref.size)}</small>
      </span>
      <IconButton
        label={`Remove ${attachment.ref.name}`}
        icon="close"
        onClick={() => onRemove(attachment.ref.id)}
      />
    </div>
  );
}

export function AttachmentTray({
  attachments,
  onRemove,
}: {
  attachments: PendingAttachment[];
  onRemove: (id: string) => void;
}) {
  if (!attachments.length) return null;
  return (
    <div className="attachment-tray" aria-label="Prompt attachments">
      {attachments.map((attachment) => (
        <PendingAttachmentItem
          key={attachment.ref.id}
          attachment={attachment}
          onRemove={onRemove}
        />
      ))}
    </div>
  );
}

function StoredAttachment({ attachment }: { attachment: AttachmentRef }) {
  const [blob, setBlob] = useState<Blob | null>(null);
  const [error, setError] = useState("");
  const url = useObjectUrl(blob);

  useEffect(() => {
    let active = true;
    setBlob(null);
    setError("");
    getAttachmentBlob(attachment.id)
      .then((value) => active && setBlob(value))
      .catch((reason) => {
        if (active) {
          setError(reason instanceof Error ? reason.message : "Could not open this file.");
        }
      });
    return () => {
      active = false;
    };
  }, [attachment.id]);

  if (error) {
    return (
      <div className="node-attachment node-attachment-error" aria-label={`${attachment.name}: ${error}`}>
        <KindIcon kind={attachment.kind} />
        <span>{attachment.name}</span>
        <small>Missing locally</small>
      </div>
    );
  }

  if (attachment.kind === "image" && url) {
    return (
      <a
        className="node-attachment node-attachment-image"
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        aria-label={`Open ${attachment.name}`}
        onClick={(event) => event.stopPropagation()}
      >
        <img src={url} alt={attachment.name} />
        <span>{attachment.name}</span>
      </a>
    );
  }

  if (attachment.kind === "video" && url) {
    return (
      <div className="node-attachment node-attachment-video">
        <video
          src={url}
          controls
          preload="metadata"
          aria-label={attachment.name}
          onClick={(event) => event.stopPropagation()}
        />
        <span>{attachment.name}</span>
      </div>
    );
  }

  return (
    <a
      className="node-attachment node-attachment-file"
      href={url ?? undefined}
      download={attachment.kind === "pdf" ? undefined : attachment.name}
      target={attachment.kind === "pdf" ? "_blank" : undefined}
      rel={attachment.kind === "pdf" ? "noreferrer noopener" : undefined}
      aria-label={url
        ? `${attachment.kind === "pdf" ? "Open" : "Download"} ${attachment.name}`
        : `Loading ${attachment.name}`}
      aria-disabled={!url}
      onClick={(event) => {
        event.stopPropagation();
        if (!url) event.preventDefault();
      }}
    >
      <KindIcon kind={attachment.kind} size={17} />
      <span>
        <strong>{attachment.name}</strong>
        <small>{formatFileSize(attachment.size)}</small>
      </span>
    </a>
  );
}

export const StoredAttachments = memo(function StoredAttachments({
  attachments,
}: {
  attachments: AttachmentRef[];
}) {
  if (!attachments.length) return null;
  return (
    <div className="node-attachments nodrag nowheel" aria-label="Attached files">
      <span className="attachment-section-label">
        <MaterialSymbol name="attach_file" size={20} /> {attachments.length} attached
      </span>
      <div className="node-attachment-grid">
        {attachments.map((attachment) => (
          <StoredAttachment key={attachment.id} attachment={attachment} />
        ))}
      </div>
    </div>
  );
});
