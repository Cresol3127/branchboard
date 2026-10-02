import { memo, useRef, useState } from "react";
import {
  Handle,
  NodeResizeControl,
  Position,
  type Node,
  type NodeProps,
} from "@xyflow/react";
import {
  describeMetrics,
  formatDuration,
  formatTokenRate,
} from "../lib/metrics";
import type { ConversationNode } from "../types";
import { StoredAttachments } from "./Attachments";
import { MarkdownContent } from "./MarkdownContent";
import { Button, IconButton, MaterialSymbol, Menu, MenuItem } from "./material";

const PROVIDER_NAMES = {
  gemini: "Gemini",
  openai: "OpenAI",
  anthropic: "Anthropic",
  "ollama-cloud": "Ollama Cloud",
  local: "Local",
} as const;

export type ConversationNodeData = {
  conversation: ConversationNode;
  depth: number;
  selected: boolean;
  tokenSelected: boolean;
  familySelected: boolean;
  mergeState: "selected" | "eligible" | "blocked" | null;
  onSelect: (id: string) => void;
  onCreateBranch: (id: string) => void;
  onRetry: (id: string) => void;
  onStartMerge: (id: string) => void;
  onToggleMuted: (id: string) => void;
  onStop: (id: string) => void;
  onDelete: (id: string) => void;
  onResizeStart: (id: string) => void;
  onResizeEnd: (
    id: string,
    size: { width: number; height: number },
  ) => void;
  onResetSize: (id: string) => void;
} & Record<string, unknown>;

export type ConversationFlowNode = Node<
  ConversationNodeData,
  "conversation"
>;

function ConversationCardView({ data }: NodeProps<ConversationFlowNode>) {
  const { conversation } = data;
  const [isResizing, setIsResizing] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuTriggerRef = useRef<HTMLButtonElement>(null);
  const isStreaming = conversation.status === "streaming";
  const isDraft = conversation.status === "draft";
  const providerName = conversation.provider
    ? PROVIDER_NAMES[conversation.provider]
    : "Assistant";
  const tokenRate = conversation.metrics
    ? formatTokenRate(conversation.metrics)
    : null;
  const modelLabel = conversation.model
    ? `${providerName} · ${conversation.model}`
    : conversation.provider
      ? providerName
      : "";

  const handleAction = (
    event: React.MouseEvent<HTMLButtonElement>,
    action: () => void,
  ) => {
    event.stopPropagation();
    action();
  };

  return (
    <>
      {data.selected && !data.familySelected && !isDraft && (
        <NodeResizeControl
          position="bottom-right"
          minWidth={280}
          minHeight={240}
          maxWidth={900}
          maxHeight={1200}
          className="node-resize-control nodrag"
          onResizeStart={() => {
            setIsResizing(true);
            data.onResizeStart(conversation.id);
          }}
          onResizeEnd={(_, size) => {
            setIsResizing(false);
            data.onResizeEnd(conversation.id, {
              width: Math.round(size.width),
              height: Math.round(size.height),
            });
          }}
        >
          <MaterialSymbol name="fit_screen" size={20} />
        </NodeResizeControl>
      )}

      <article
        className={`conversation-card ${conversation.size || isResizing ? "is-manual-size" : "is-auto-size"} ${data.selected ? "is-selected" : ""} ${data.tokenSelected ? "is-token-selected" : ""} ${data.familySelected ? "is-family-selected" : ""} ${conversation.muted ? "is-muted" : ""} ${isDraft ? "is-draft" : ""} ${conversation.color ? `has-conversation-color conversation-color-${conversation.color}` : ""} ${data.mergeState ? `merge-${data.mergeState}` : ""}`}
      >
        <Handle
          type="target"
          position={Position.Top}
          className="floating-edge-handle"
        />

        <header className="card-header">
          <span className="card-index">
            {data.depth === 1
              ? "ROOT"
              : `DEPTH ${String(data.depth).padStart(2, "0")}`}
          </span>
          <div className="card-header-status">
            {conversation.size && (
              <IconButton
                className="reset-size-button nodrag"
                label="Return node to automatic size"
                icon="fit_screen"
                aria-keyshortcuts="R"
                onClick={(event) =>
                  handleAction(event, () => data.onResetSize(conversation.id))
                }
              />
            )}
            <span className={`status-dot status-${conversation.status}`}>
              {conversation.status}
            </span>
          </div>
        </header>

       {isDraft ? (
         <section className="draft-message">
            <MaterialSymbol name={conversation.parentIds.length > 1 ? "merge_type" : "account_tree"} />
           <span>EMPTY {conversation.parentIds.length > 1 ? "MERGE" : "BRANCH"}</span>
           <p>Use the composer below to write this node.</p>
         </section>
       ) : (
         <>
             <section className="message prompt-message">
               <span className="message-label">YOU</span>
               {conversation.prompt && (
                 <MarkdownContent content={conversation.prompt} variant="prompt" />
               )}
               <StoredAttachments attachments={conversation.attachments ?? []} />
             </section>

           <div className="card-rule" />

           <section className="message response-message nowheel">
              <span className="message-label">{providerName}</span>
              {conversation.response ? (
                <MarkdownContent content={conversation.response} variant="response" />
              ) : isStreaming ? (
               <div className="thinking" aria-label={`${providerName} is responding`}>
                 <i />
                 <i />
                 <i />
               </div>
             ) : null}
             {conversation.error && (
               <p className="node-error">{conversation.error}</p>
             )}
           </section>
         </>
       )}

      {!isDraft && (modelLabel || conversation.metrics) && (
        <div
          className="card-metadata nodrag"
          aria-label={[
            modelLabel ? `Model: ${modelLabel}` : "",
            conversation.metrics ? describeMetrics(conversation.metrics) : "",
          ]
            .filter(Boolean)
            .join(" · ")}
        >
          <span className="metadata-model">{modelLabel || "Model unavailable"}</span>
          <span className="metadata-stats">
            {conversation.metrics ? formatDuration(conversation.metrics.durationMs) : "--"}
            <i aria-hidden="true" />
            {conversation.metrics ? tokenRate ?? "-- tok/s" : "-- tok/s"}
          </span>
        </div>
      )}

      <footer className="card-actions nodrag">
        {isDraft ? (
          <>
            <Button
               variant="text"
               leadingIcon="merge_type"
               className={`merge-action ${data.mergeState === "selected" ? "active" : ""}`}
              aria-keyshortcuts="G"
               disabled={!conversation.parentIds.length || data.mergeState === "blocked"}
              onClick={(event) =>
                handleAction(event, () =>
                   data.onStartMerge(conversation.id),
                )
              }
            >
               {data.mergeState === "selected"
                 ? "Remove"
                 : data.mergeState === "eligible"
                   ? "Add to merge"
                   : "Merge"}
            </Button>
          </>
        ) : (
          <>
        {isStreaming ? (
          <Button
            variant="text"
            leadingIcon="stop"
            className="stop-action"
            aria-keyshortcuts="S"
            onClick={(event) =>
              handleAction(event, () => data.onStop(conversation.id))
            }
          >Stop</Button>
        ) : (
          <Button
            variant="text"
            leadingIcon="account_tree"
            className="branch-action"
            aria-keyshortcuts="B"
            disabled={conversation.status !== "complete"}
            onClick={(event) =>
              handleAction(event, () => data.onCreateBranch(conversation.id))
            }
          >
            {conversation.status === "error" ? "Unavailable" : "Branch"}
          </Button>
        )}
        {!isStreaming && (
          <Button
            variant="text"
            leadingIcon="replay"
            className="retry-action"
            aria-label="Retry as sibling"
            disabled={conversation.status !== "complete" && conversation.status !== "error"}
            onClick={(event) =>
              handleAction(event, () => data.onRetry(conversation.id))
            }
          >Retry</Button>
        )}
          </>
        )}
        <IconButton
          ref={menuTriggerRef}
          label="More conversation actions"
          icon="more_vert"
          className="nodrag"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          onClick={(event) => {
            event.stopPropagation();
            setMenuOpen((open) => !open);
          }}
        />
        <Menu
          open={menuOpen}
          anchorRef={menuTriggerRef}
          label="Conversation actions"
          onRequestClose={() => setMenuOpen(false)}
        >
          {!isDraft ? (
            <MenuItem
              disabled={conversation.status !== "complete"}
              onSelect={() => data.onToggleMuted(conversation.id)}
            >
              <MaterialSymbol name={conversation.muted ? "volume_up" : "volume_off"} />
              {conversation.muted ? "Include in context" : "Mute from context"}
            </MenuItem>
          ) : null}
          <MenuItem className="md-menu__item--error" onSelect={() => data.onDelete(conversation.id)}>
            <MaterialSymbol name="delete" />
            {isDraft ? "Delete empty node" : "Delete conversation"}
          </MenuItem>
        </Menu>
      </footer>

        <Handle
          type="source"
          position={Position.Bottom}
          className="floating-edge-handle"
        />
      </article>
    </>
  );
}

export const ConversationCard = memo(
  ConversationCardView,
  (previous, next) =>
    previous.data.conversation === next.data.conversation &&
    previous.data.depth === next.data.depth &&
    previous.data.selected === next.data.selected &&
    previous.data.tokenSelected === next.data.tokenSelected &&
    previous.data.familySelected === next.data.familySelected &&
    previous.data.mergeState === next.data.mergeState &&
    previous.data.onSelect === next.data.onSelect &&
    previous.data.onCreateBranch === next.data.onCreateBranch &&
    previous.data.onRetry === next.data.onRetry &&
    previous.data.onStartMerge === next.data.onStartMerge &&
    previous.data.onToggleMuted === next.data.onToggleMuted &&
    previous.data.onStop === next.data.onStop &&
    previous.data.onDelete === next.data.onDelete &&
    previous.data.onResizeStart === next.data.onResizeStart &&
    previous.data.onResizeEnd === next.data.onResizeEnd &&
    previous.data.onResetSize === next.data.onResetSize,
);
