import { useEffect } from "react";

export type SnackbarMessage = {
  id: string;
  text: string;
  politeness?: "polite" | "assertive";
  durationMs?: number | null;
  actionLabel?: string;
  onAction?(): void;
};

export function SnackbarHost({
  message,
  onDismiss,
}: {
  message: SnackbarMessage | null;
  onDismiss(id: string): void;
}) {
  useEffect(() => {
    if (!message || message.durationMs === null) return;
    const timer = window.setTimeout(
      () => onDismiss(message.id),
      message.durationMs ?? 6000,
    );
    return () => window.clearTimeout(timer);
  }, [message, onDismiss]);

  if (!message) return null;
  return (
    <div
      className="md-snackbar"
      role={message.politeness === "assertive" ? "alert" : "status"}
      aria-live={message.politeness ?? "polite"}
    >
      <span>{message.text}</span>
      {message.actionLabel ? (
        <button type="button" onClick={message.onAction}>{message.actionLabel}</button>
      ) : null}
      <button type="button" aria-label="Dismiss notification" onClick={() => onDismiss(message.id)}>
        <span className="material-symbol" aria-hidden="true">close</span>
      </button>
    </div>
  );
}

export function ProgressIndicator({
  label,
  value,
  variant = "circular",
}: {
  label: string;
  value?: number;
  variant?: "circular" | "linear";
}) {
  const determinate = Number.isFinite(value);
  return (
    <span
      role="progressbar"
      aria-label={label}
      aria-valuemin={determinate ? 0 : undefined}
      aria-valuemax={determinate ? 100 : undefined}
      aria-valuenow={determinate ? Math.max(0, Math.min(100, value!)) : undefined}
      className={`md-progress md-progress--${variant} ${determinate ? "is-determinate" : "is-indeterminate"}`}
      style={determinate ? { "--md-progress": `${Math.max(0, Math.min(100, value!))}%` } as React.CSSProperties : undefined}
    />
  );
}
