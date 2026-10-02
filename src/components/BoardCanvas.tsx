import {
  Background,
  BackgroundVariant,
  MiniMap,
  Panel,
  ReactFlow,
  SelectionMode,
  ViewportPortal,
  applyNodeChanges,
  useNodesState,
  useReactFlow,
  useStore,
  type Edge,
  type NodeChange,
  type NodeMouseHandler,
  type OnNodeDrag,
  type Viewport,
  type XYPosition,
} from "@xyflow/react";
import {
  memo,
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type {
  BoardViewport,
  ConversationColor,
  ConversationNode,
  InkPoint,
  InkStroke,
  PenColor,
  StickyColor,
  StickyNote,
} from "../types";
import {
  CONVERSATION_COLORS,
  DEFAULT_CONVERSATION_COLOR_SCOPE,
  getConversationColorAffectedCount,
  type ConversationColorScope,
} from "../lib/conversation-colors";
import {
  MAX_INK_STROKES,
  MAX_STROKE_POINTS,
  MAX_STICKY_NOTES,
  STICKY_NOTE_SIZE,
  findPositionForStickyNote,
  getInkStrokeBounds,
  simplifyInkPoints,
  strokeIntersectsRectangle,
  strokeIntersectsPoint,
  translateInkStroke,
  type AxisAlignedRectangle,
} from "../lib/annotations";
import {
  canAddDraftToMerge,
  getDescendantIds,
  getNodeDepths,
} from "../lib/graph";
import {
  clampSharedDeltaBeforeCollision,
  clampPositionBeforeCollision,
  clampSizeBeforeCollision,
  getConversationNodeBounds,
  type NodeBounds,
} from "../lib/node-collision";
import { getAutomaticNodeWidth } from "../lib/node-sizing";
import {
  aggregateSelectedTokenUsage,
  formatDuration,
  formatTokenCount,
} from "../lib/metrics";
import type { ShortcutCommandId } from "../lib/shortcuts";
import {
  ConversationCard,
  type ConversationFlowNode,
  type ConversationNodeData,
} from "./ConversationCard";
import { FloatingEdge } from "./FloatingEdge";
import { InkLayer } from "./InkLayer";
import {
  StickyNoteNode,
  type StickyFlowNode,
  type StickyNodeData,
} from "./StickyNoteNode";
import {
  ConnectedButtonGroup,
  IconButton,
  MaterialSymbol,
} from "./material";

const nodeTypes = { conversation: ConversationCard, sticky: StickyNoteNode };
const edgeTypes = { floating: FloatingEdge };
const fitViewOptions = { padding: 0.25, maxZoom: 1 };
const proOptions = { hideAttribution: true };
const PEN_COLORS: PenColor[] = ["ink", "acid", "red", "blue", "violet"];

type CanvasTool = "select" | "compare" | "note" | "pen" | "eraser";
export type BoardFlowNode = ConversationFlowNode | StickyFlowNode;
const EMPTY_TOKEN_SELECTION = new Set<string>();

type CanvasGroupSelection = {
  conversationIds: ReadonlySet<string>;
  noteIds: ReadonlySet<string>;
  strokeIds: ReadonlySet<string>;
};

type MutableCanvasGroupSelection = {
  conversationIds: Set<string>;
  noteIds: Set<string>;
  strokeIds: Set<string>;
};

export type BoardSelectionMove = {
  conversationPositions: Array<{ id: string; position: XYPosition }>;
  notePositions: Array<{ id: string; position: XYPosition }>;
  strokes?: InkStroke[];
};

type GroupDragSnapshot = {
  anchorId: string | null;
  anchorPosition: XYPosition | null;
  nodes: BoardFlowNode[];
  strokes: InkStroke[];
  delta: XYPosition;
  pointerId?: number;
  pointerStart?: XYPosition;
};

function selectionSize(selection: CanvasGroupSelection): number {
  return (
    selection.conversationIds.size +
    selection.noteIds.size +
    selection.strokeIds.size
  );
}

function selectedFlowIds(selection: CanvasGroupSelection): Set<string> {
  return new Set([...selection.conversationIds, ...selection.noteIds]);
}

export function screenSelectionToFlowRectangle(
  rectangle: AxisAlignedRectangle,
  transform: readonly [number, number, number],
): AxisAlignedRectangle {
  const [translateX, translateY, zoom] = transform;
  return {
    x: (rectangle.x - translateX) / zoom,
    y: (rectangle.y - translateY) / zoom,
    width: rectangle.width / zoom,
    height: rectangle.height / zoom,
  };
}

export type BoardCanvasHandle = {
  dismissTopLayer: () => boolean;
  executeShortcut: (command: ShortcutCommandId, shiftKey?: boolean) => boolean;
  focus: () => void;
};

function isConversationFlowNode(node: BoardFlowNode): node is ConversationFlowNode {
  return node.type === "conversation";
}

function isStickyFlowNode(node: BoardFlowNode): node is StickyFlowNode {
  return node.type === "sticky";
}

export function createConversationEdge(
  node: ConversationNode,
  parentId: string,
): Edge {
  return {
    id: `${parentId}-${node.id}`,
    source: parentId,
    target: node.id,
    type: "floating",
    animated: node.status === "streaming",
    selectable: false,
    className: [
      node.muted ? "muted-edge" : "",
      node.status === "draft" ? "draft-edge" : "",
      node.parentIds.length > 1 ? "merge-edge" : "",
      node.color ? `conversation-color-${node.color}` : "",
    ]
      .filter(Boolean)
      .join(" "),
  };
}

function getStickyFlowBounds(nodes: readonly StickyFlowNode[]): NodeBounds[] {
  return nodes.map((node) => ({
    id: node.id,
    x: node.position.x,
    y: node.position.y,
    width: node.measured?.width ?? node.width ?? node.data.note.size.width,
    height: node.measured?.height ?? node.height ?? node.data.note.size.height,
  }));
}

export function getCanvasSelectionBounds(
  nodes: readonly BoardFlowNode[],
  strokes: readonly InkStroke[],
  selection: CanvasGroupSelection,
  strokeOffset: XYPosition = { x: 0, y: 0 },
): AxisAlignedRectangle | null {
  const flowIds = selectedFlowIds(selection);
  const bounds: NodeBounds[] = nodes
    .filter((node) => flowIds.has(node.id))
    .map((node) => ({
      id: node.id,
      x: node.position.x,
      y: node.position.y,
      width:
        node.measured?.width ??
        node.width ??
        (isStickyFlowNode(node) ? node.data.note.size.width : 1),
      height:
        node.measured?.height ??
        node.height ??
        (isStickyFlowNode(node) ? node.data.note.size.height : 1),
    }));
  for (const stroke of strokes) {
    if (!selection.strokeIds.has(stroke.id)) continue;
    const strokeBounds = getInkStrokeBounds(stroke);
    bounds.push({
      ...strokeBounds,
      x: strokeBounds.x + strokeOffset.x,
      y: strokeBounds.y + strokeOffset.y,
    });
  }
  if (!bounds.length) return null;
  const left = Math.min(...bounds.map((bound) => bound.x));
  const top = Math.min(...bounds.map((bound) => bound.y));
  const right = Math.max(...bounds.map((bound) => bound.x + bound.width));
  const bottom = Math.max(...bounds.map((bound) => bound.y + bound.height));
  return { x: left, y: top, width: right - left, height: bottom - top };
}

export function applyCollisionSafeNodeChanges(
  changes: NodeChange<BoardFlowNode>[],
  current: BoardFlowNode[],
  selectedConversationIds: ReadonlySet<string> = EMPTY_TOKEN_SELECTION,
  selectedNoteIds: ReadonlySet<string> = EMPTY_TOKEN_SELECTION,
): BoardFlowNode[] {
  const groupSelectedIds = new Set([
    ...selectedConversationIds,
    ...selectedNoteIds,
  ]);
  const groupPositionChange = changes.find(
    (change) =>
      change.type === "position" &&
      Boolean(change.position) &&
      groupSelectedIds.has(change.id),
  );
  if (groupPositionChange?.type === "position" && groupPositionChange.position) {
    const anchor = current.find((node) => node.id === groupPositionChange.id);
    if (anchor) {
      const conversationNodes = current.filter(isConversationFlowNode);
      const stickyNodes = current.filter(isStickyFlowNode);
      const conversationBounds = getConversationNodeBounds(
        conversationNodes.map((node) => node.data.conversation),
        conversationNodes,
      );
      const stickyBounds = getStickyFlowBounds(stickyNodes);
      const requestedDelta = {
        x: groupPositionChange.position.x - anchor.position.x,
        y: groupPositionChange.position.y - anchor.position.y,
      };
      const delta = clampSharedDeltaBeforeCollision(
        [
          {
            moving: conversationBounds.filter((bound) =>
              selectedConversationIds.has(bound.id),
            ),
            obstacles: conversationBounds.filter((bound) =>
              !selectedConversationIds.has(bound.id),
            ),
          },
          {
            moving: stickyBounds.filter((bound) => selectedNoteIds.has(bound.id)),
            obstacles: stickyBounds.filter((bound) => !selectedNoteIds.has(bound.id)),
          },
        ],
        requestedDelta,
      );
      const groupChanges: NodeChange<BoardFlowNode>[] = current
        .filter((node) => groupSelectedIds.has(node.id))
        .map((node) => ({
          id: node.id,
          type: "position" as const,
          position: {
            x: node.position.x + delta.x,
            y: node.position.y + delta.y,
          },
          dragging: groupPositionChange.dragging,
        }));
      const moved = applyNodeChanges(groupChanges, current);
      const remaining = changes.filter(
        (change) =>
          change.type !== "position" || !groupSelectedIds.has(change.id),
      );
      return applyCollisionSafeNodeChanges(remaining, moved);
    }
  }

  return changes.reduce((nodes, change) => {
    if (change.type === "position" && change.position) {
      const movingNode = nodes.find((node) => node.id === change.id);
      if (!movingNode) return applyNodeChanges([change], nodes);

      const bounds = isConversationFlowNode(movingNode)
        ? (() => {
            const group = nodes.filter(isConversationFlowNode);
            return getConversationNodeBounds(
              group.map((node) => node.data.conversation),
              group,
            );
          })()
        : getStickyFlowBounds(nodes.filter(isStickyFlowNode));
      const movingBounds = bounds.find((node) => node.id === change.id);
      if (!movingBounds) return applyNodeChanges([change], nodes);

      const position = clampPositionBeforeCollision(
        movingNode.position,
        change.position,
        { width: movingBounds.width, height: movingBounds.height },
        bounds.filter((node) => node.id !== change.id),
      );
      return applyNodeChanges([{ ...change, position }], nodes);
    }

    if (change.type === "dimensions" && change.dimensions) {
      const movingNode = nodes.find((node) => node.id === change.id);
      if (movingNode && isStickyFlowNode(movingNode)) {
        const group = nodes.filter(isStickyFlowNode);
        const bounds = getStickyFlowBounds(group);
        const currentBounds = bounds.find((node) => node.id === change.id);
        if (currentBounds) {
          const dimensions = clampSizeBeforeCollision(
            movingNode.position,
            { width: currentBounds.width, height: currentBounds.height },
            change.dimensions,
            bounds.filter((node) => node.id !== change.id),
          );
          return applyNodeChanges([{ ...change, dimensions }], nodes);
        }
      }
    }

    return applyNodeChanges([change], nodes);
  }, current);
}

export function nudgeBoardFlowNode(
  nodes: BoardFlowNode[],
  nodeId: string,
  delta: XYPosition,
): BoardFlowNode[] {
  const selected = nodes.find((node) => node.id === nodeId);
  if (!selected) return nodes;
  return applyCollisionSafeNodeChanges(
    [{
      id: selected.id,
      type: "position",
      position: {
        x: selected.position.x + delta.x,
        y: selected.position.y + delta.y,
      },
      dragging: false,
    }],
    nodes,
  );
}

type BoardCanvasActionCallbacks = Pick<
  ConversationNodeData,
  | "onSelect"
  | "onCreateBranch"
  | "onRetry"
  | "onStartMerge"
  | "onToggleMuted"
  | "onStop"
  | "onDelete"
>;

type CardCallbacks = BoardCanvasActionCallbacks &
  Pick<
    ConversationNodeData,
    "onResizeStart" | "onResizeEnd" | "onResetSize"
  >;

type StickyCallbacks = Pick<
  StickyNodeData,
  | "onTextCommit"
  | "onColorCommit"
  | "onDelete"
  | "onResizeStart"
  | "onResizeEnd"
>;

type BoardCanvasProps = BoardCanvasActionCallbacks & {
  boardId: string;
  conversations: ConversationNode[];
  notes: StickyNote[];
  strokes: InkStroke[];
  viewport?: BoardViewport;
  selectedNodeId: string | null;
  mergeDraftIds: string[];
  onPositionCommit: (
    boardId: string,
    nodeId: string,
    position: XYPosition,
  ) => void;
  onSizeCommit: (
    boardId: string,
    nodeId: string,
    size: { width: number; height: number } | undefined,
  ) => void;
  onNoteCreate: (boardId: string, note: StickyNote) => void;
  onNotePositionCommit: (
    boardId: string,
    noteId: string,
    position: XYPosition,
  ) => void;
  onNoteSizeCommit: (
    boardId: string,
    noteId: string,
    size: { width: number; height: number },
  ) => void;
  onNoteTextCommit: (boardId: string, noteId: string, text: string) => void;
  onNoteColorCommit: (
    boardId: string,
    noteId: string,
    color: StickyColor,
  ) => void;
  onNoteDelete: (boardId: string, noteId: string) => void;
  onStrokesCommit: (boardId: string, strokes: InkStroke[]) => void;
  onSelectionMoveCommit: (
    boardId: string,
    movement: BoardSelectionMove,
  ) => void;
  onViewportCommit: (boardId: string, viewport: BoardViewport) => void;
  onNotice: (message: string) => void;
  onClearSelection: () => void;
  onColorCommit: (
    id: string,
    color: ConversationColor | undefined,
    scope: ConversationColorScope,
  ) => void;
  theme: "light" | "dark";
};

export function reconcileFlowNodes(
  current: ConversationFlowNode[],
  conversations: ConversationNode[],
  selectedNodeId: string | null,
  callbacks: CardCallbacks,
  frozenNodeId: string | null,
  mergeDraftIds: readonly string[] = [],
  tokenSelectedIds: ReadonlySet<string> = EMPTY_TOKEN_SELECTION,
  compareMode = false,
  familySelectedIds: ReadonlySet<string> = EMPTY_TOKEN_SELECTION,
  familySelectionMode = familySelectedIds.size > 0,
): ConversationFlowNode[] {
  const currentById = new Map(current.map((node) => [node.id, node]));
  const depths = getNodeDepths(conversations);
  const mergeSelected = mergeDraftIds
    .map((id) => conversations.find((node) => node.id === id))
    .filter((node): node is ConversationNode => Boolean(node));
  const mergeSelectedIds = new Set(mergeDraftIds);
  let changed = current.length !== conversations.length;

  const next = conversations.map((conversation) => {
    const existing = currentById.get(conversation.id);
    const depth = depths.get(conversation.id) ?? 1;
    const selected = conversation.id === selectedNodeId;
    const tokenSelected = tokenSelectedIds.has(conversation.id);
    const familySelected = familySelectedIds.has(conversation.id);
    // React Flow owns wrapper selection while a marquee is in progress. The
    // telemetry set is updated after that selection, so feeding it back here
    // would immediately undo each live selection change.
    const flowSelected = compareMode
      ? existing?.selected ?? tokenSelected
      : familySelectionMode
        ? familySelected
        : selected;
    const mergeState: ConversationNodeData["mergeState"] = !mergeSelected.length
      ? null
      : mergeSelectedIds.has(conversation.id)
        ? "selected"
        : canAddDraftToMerge(mergeSelected, conversation)
          ? "eligible"
          : "blocked";

    if (!existing) {
      changed = true;
      return {
        id: conversation.id,
        type: "conversation" as const,
        position: conversation.position,
        width: conversation.size?.width ?? getAutomaticNodeWidth(conversation),
        height: conversation.size?.height,
        selected: flowSelected,
        data: {
          conversation,
          depth,
          selected,
          tokenSelected,
          familySelected,
          mergeState,
          ...callbacks,
        },
      };
    }

    const visibleConversation =
      conversation.id === frozenNodeId
        ? existing.data.conversation
        : conversation;
    const desiredWidth =
      conversation.id === frozenNodeId
        ? existing.width
        : conversation.size?.width ?? getAutomaticNodeWidth(conversation);
    const desiredHeight =
      conversation.id === frozenNodeId
        ? existing.height
        : conversation.size?.height;
    const domainPositionChanged =
      existing.data.conversation.position.x !== conversation.position.x ||
      existing.data.conversation.position.y !== conversation.position.y;
    const desiredPosition =
      conversation.id !== frozenNodeId && domainPositionChanged
        ? conversation.position
        : existing.position;
    const geometryMatches =
      existing.width === desiredWidth &&
      existing.height === desiredHeight &&
      existing.selected === flowSelected &&
      existing.position.x === desiredPosition.x &&
      existing.position.y === desiredPosition.y;
    const dataMatches =
      existing.data.conversation === visibleConversation &&
      existing.data.depth === depth &&
      existing.data.selected === selected &&
      existing.data.tokenSelected === tokenSelected &&
      existing.data.familySelected === familySelected &&
      existing.data.mergeState === mergeState &&
      existing.data.onSelect === callbacks.onSelect &&
      existing.data.onCreateBranch === callbacks.onCreateBranch &&
      existing.data.onRetry === callbacks.onRetry &&
      existing.data.onStartMerge === callbacks.onStartMerge &&
      existing.data.onToggleMuted === callbacks.onToggleMuted &&
      existing.data.onStop === callbacks.onStop &&
      existing.data.onDelete === callbacks.onDelete;

    if (dataMatches && geometryMatches) return existing;

    changed = true;
    const resettingToAuto =
      conversation.id !== frozenNodeId &&
      !conversation.size &&
      Boolean(existing.data.conversation.size);
    return {
      ...existing,
      position: desiredPosition,
      width: desiredWidth,
      height: desiredHeight,
      selected: flowSelected,
      ...(resettingToAuto ? { measured: undefined } : {}),
      data: {
        conversation: visibleConversation,
        depth,
        selected,
        tokenSelected,
        familySelected,
        mergeState,
        ...callbacks,
      },
    };
  });

  if (!changed && next.every((node, index) => node === current[index])) {
    return current;
  }
  return next;
}

export function reconcileStickyNodes(
  current: StickyFlowNode[],
  notes: StickyNote[],
  callbacks: StickyCallbacks,
  frozenNodeId: string | null,
  autoFocusNoteId: string | null,
  selectedStickyId: string | null = null,
  selectable = true,
  groupSelectedIds: ReadonlySet<string> = EMPTY_TOKEN_SELECTION,
  groupSelectionMode = groupSelectedIds.size > 0,
): StickyFlowNode[] {
  const currentById = new Map(current.map((node) => [node.id, node]));
  let changed = current.length !== notes.length;
  const next = notes.map((note) => {
    const existing = currentById.get(note.id);
    const autoFocus = note.id === autoFocusNoteId;
    const groupSelected = groupSelectedIds.has(note.id);
    const selected = groupSelectionMode
      ? groupSelected
      : note.id === selectedStickyId;
    if (!existing) {
      changed = true;
      return {
        id: note.id,
        type: "sticky" as const,
        position: note.position,
        width: note.size.width,
        height: note.size.height,
        dragHandle: ".sticky-drag-handle",
        selected,
        selectable,
        data: { note, autoFocus, groupSelected, ...callbacks },
      };
    }

    const frozen = note.id === frozenNodeId;
    const domainPositionChanged =
      existing.data.note.position.x !== note.position.x ||
      existing.data.note.position.y !== note.position.y;
    const position = !frozen && domainPositionChanged
      ? note.position
      : existing.position;
    const width = frozen ? existing.width : note.size.width;
    const height = frozen ? existing.height : note.size.height;
    const dataMatches =
      existing.data.note === note &&
      existing.data.autoFocus === autoFocus &&
      existing.data.groupSelected === groupSelected &&
      existing.data.onTextCommit === callbacks.onTextCommit &&
      existing.data.onColorCommit === callbacks.onColorCommit &&
      existing.data.onDelete === callbacks.onDelete &&
      existing.data.onResizeStart === callbacks.onResizeStart &&
      existing.data.onResizeEnd === callbacks.onResizeEnd;
    if (
      dataMatches &&
      existing.position.x === position.x &&
      existing.position.y === position.y &&
      existing.width === width &&
      existing.height === height
      && existing.selected === selected
      && existing.selectable === selectable
    ) {
      return existing;
    }
    changed = true;
    return {
      ...existing,
      position,
      width,
      height,
      selected,
      selectable,
      data: { note, autoFocus, groupSelected, ...callbacks },
    };
  });
  return !changed && next.every((node, index) => node === current[index])
    ? current
    : next;
}

const BoardCanvasView = forwardRef<BoardCanvasHandle, BoardCanvasProps>(function BoardCanvasView({
  boardId,
  conversations,
  notes,
  strokes,
  viewport,
  selectedNodeId,
  mergeDraftIds,
  onSelect,
  onCreateBranch,
  onRetry,
  onStartMerge,
  onToggleMuted,
  onStop,
  onDelete,
  onPositionCommit,
  onSizeCommit,
  onNoteCreate,
  onNotePositionCommit,
  onNoteSizeCommit,
  onNoteTextCommit,
  onNoteColorCommit,
  onNoteDelete,
  onStrokesCommit,
  onSelectionMoveCommit,
  onViewportCommit,
  onNotice,
  onClearSelection,
  onColorCommit,
  theme,
}, forwardedRef) {
  const [tool, setTool] = useState<CanvasTool>("select");
  const [tokenSelectedIds, setTokenSelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [familySelectedIds, setFamilySelectedIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [groupSelectedNoteIds, setGroupSelectedNoteIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [groupSelectedStrokeIds, setGroupSelectedStrokeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [familySelecting, setFamilySelecting] = useState(false);
  const [handleDragDelta, setHandleDragDelta] = useState<XYPosition>({ x: 0, y: 0 });
  const [annotationTrayPinned, setAnnotationTrayPinned] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(min-width: 840px)").matches,
  );
  const [annotationTrayTransientOpen, setAnnotationTrayTransientOpen] = useState(false);
  const [colorTrayPinned, setColorTrayPinned] = useState(false);
  const [colorTrayTransientOpen, setColorTrayTransientOpen] = useState(false);
  const [penColor, setPenColor] = useState<PenColor>("ink");
  const [penWidth, setPenWidth] = useState(4);
  const [noteColor, setNoteColor] = useState<StickyColor>("yellow");
  const [colorScope, setColorScope] = useState<ConversationColorScope>(
    DEFAULT_CONVERSATION_COLOR_SCOPE,
  );
  const [currentStroke, setCurrentStroke] = useState<InkStroke | null>(null);
  const [hiddenStrokeIds, setHiddenStrokeIds] = useState<Set<string>>(
    () => new Set(),
  );
  const [autoFocusNoteId, setAutoFocusNoteId] = useState<string | null>(null);
  const [selectedStickyId, setSelectedStickyId] = useState<string | null>(null);
  const [historyVersion, setHistoryVersion] = useState(0);
  const draggingNodeId = useRef<string | null>(null);
  const familySelectionActive = useRef(false);
  const familySelectedIdsRef = useRef(familySelectedIds);
  const groupSelectedNoteIdsRef = useRef(groupSelectedNoteIds);
  const groupSelectedStrokeIdsRef = useRef(groupSelectedStrokeIds);
  const groupDragSnapshot = useRef<GroupDragSnapshot | null>(null);
  const acceptedDragPositions = useRef(new Map<string, XYPosition>());
  const resizingNodeId = useRef<string | null>(null);
  const acceptedStickySizes = useRef(new Map<string, { width: number; height: number }>());
  const drawingPointerId = useRef<number | null>(null);
  const currentStrokeRef = useRef<InkStroke | null>(null);
  const erasedStrokeIdsRef = useRef(new Set<string>());
  const strokesRef = useRef(strokes);
  const strokeBoundsRef = useRef(
    new Map(strokes.map((stroke) => [stroke.id, getInkStrokeBounds(stroke)])),
  );
  const undoStack = useRef<Array<{ before: InkStroke[]; after: InkStroke[] }>>([]);
  const redoStack = useRef<Array<{ before: InkStroke[]; after: InkStroke[] }>>([]);
  const [resizeEpoch, setResizeEpoch] = useState(0);
  const canvasFrameRef = useRef<HTMLDivElement>(null);
  const userSelectionRect = useStore((state) => state.userSelectionRect);
  const flowTransform = useStore((state) => state.transform);
  const {
    screenToFlowPosition,
    getViewport,
    fitBounds,
    zoomIn,
    zoomOut,
  } = useReactFlow<BoardFlowNode, Edge>();

  const replaceFamilySelection = useCallback((next: Set<string>) => {
    familySelectedIdsRef.current = next;
    setFamilySelectedIds((current) =>
      current.size === next.size && [...current].every((id) => next.has(id))
        ? current
        : next,
    );
  }, []);

  const replaceSelectedNotes = useCallback((next: Set<string>) => {
    groupSelectedNoteIdsRef.current = next;
    setGroupSelectedNoteIds((current) =>
      current.size === next.size && [...current].every((id) => next.has(id))
        ? current
        : next,
    );
  }, []);

  const replaceSelectedStrokes = useCallback((next: Set<string>) => {
    groupSelectedStrokeIdsRef.current = next;
    setGroupSelectedStrokeIds((current) =>
      current.size === next.size && [...current].every((id) => next.has(id))
        ? current
        : next,
    );
  }, []);

  const clearGroupSelection = useCallback(() => {
    replaceFamilySelection(new Set());
    replaceSelectedNotes(new Set());
    replaceSelectedStrokes(new Set());
  }, [replaceFamilySelection, replaceSelectedNotes, replaceSelectedStrokes]);

  const groupSelection = useMemo<CanvasGroupSelection>(
    () => ({
      conversationIds: familySelectedIds,
      noteIds: groupSelectedNoteIds,
      strokeIds: groupSelectedStrokeIds,
    }),
    [familySelectedIds, groupSelectedNoteIds, groupSelectedStrokeIds],
  );
  const groupSelectionCount = selectionSize(groupSelection);
  const groupFlowSelectedIds = useMemo(
    () => selectedFlowIds(groupSelection),
    [groupSelection],
  );

  useEffect(() => {
    if (strokesRef.current === strokes) return;
    strokesRef.current = strokes;
    strokeBoundsRef.current = new Map(
      strokes.map((stroke) => [stroke.id, getInkStrokeBounds(stroke)]),
    );
    undoStack.current = [];
    redoStack.current = [];
    setHistoryVersion((current) => current + 1);
  }, [strokes]);

  const handleResizeStart = useCallback((id: string) => {
    resizingNodeId.current = id;
  }, []);
  const handleResizeEnd = useCallback(
    (id: string, size: { width: number; height: number }) => {
      resizingNodeId.current = null;
      onSizeCommit(boardId, id, size);
      setResizeEpoch((current) => current + 1);
    },
    [boardId, onSizeCommit],
  );
  const handleResetSize = useCallback(
    (id: string) => onSizeCommit(boardId, id, undefined),
    [boardId, onSizeCommit],
  );
  const callbacks = useMemo<CardCallbacks>(
    () => ({
      onSelect,
      onCreateBranch,
      onRetry,
      onStartMerge,
      onToggleMuted,
      onStop,
      onDelete,
      onResizeStart: handleResizeStart,
      onResizeEnd: handleResizeEnd,
      onResetSize: handleResetSize,
    }),
    [
      handleResetSize,
      handleResizeEnd,
      handleResizeStart,
      onSelect,
      onCreateBranch,
      onRetry,
      onStartMerge,
      onDelete,
      onStop,
      onToggleMuted,
    ],
  );

  const handleStickyResizeStart = useCallback((id: string) => {
    resizingNodeId.current = id;
  }, []);
  const handleStickyResizeEnd = useCallback(
    (id: string, fallback: { width: number; height: number }) => {
      resizingNodeId.current = null;
      const size = acceptedStickySizes.current.get(id) ?? fallback;
      acceptedStickySizes.current.delete(id);
      onNoteSizeCommit(boardId, id, size);
      setResizeEpoch((current) => current + 1);
    },
    [boardId, onNoteSizeCommit],
  );
  const stickyCallbacks = useMemo<StickyCallbacks>(
    () => ({
      onTextCommit: (id, text) => onNoteTextCommit(boardId, id, text),
      onColorCommit: (id, color) => onNoteColorCommit(boardId, id, color),
      onDelete: (id) => onNoteDelete(boardId, id),
      onResizeStart: handleStickyResizeStart,
      onResizeEnd: handleStickyResizeEnd,
    }),
    [
      boardId,
      handleStickyResizeEnd,
      handleStickyResizeStart,
      onNoteColorCommit,
      onNoteDelete,
      onNoteTextCommit,
    ],
  );

  const initialNodes = useRef<BoardFlowNode[] | null>(null);
  if (!initialNodes.current) {
    initialNodes.current = [
      ...reconcileFlowNodes(
        [],
        conversations,
        selectedNodeId,
        callbacks,
        null,
        mergeDraftIds,
        EMPTY_TOKEN_SELECTION,
        false,
        familySelectedIds,
        groupSelectionCount > 0,
      ),
      ...reconcileStickyNodes(
        [],
        notes,
        stickyCallbacks,
        null,
        null,
        null,
        true,
        groupSelectedNoteIds,
        groupSelectionCount > 0,
      ),
    ];
  }
  const [flowNodes, setFlowNodes] = useNodesState<BoardFlowNode>(initialNodes.current);
  const edgeCache = useRef(new Map<string, Edge>());

  useLayoutEffect(() => {
    setFlowNodes((current) => [
      ...reconcileFlowNodes(
        current.filter(isConversationFlowNode),
        conversations,
        selectedNodeId,
        callbacks,
        draggingNodeId.current ?? resizingNodeId.current,
        mergeDraftIds,
        tokenSelectedIds,
        tool === "compare",
        familySelectedIds,
        familySelecting || groupSelectionCount > 0,
      ),
      ...reconcileStickyNodes(
        current.filter(isStickyFlowNode),
        notes,
        stickyCallbacks,
        draggingNodeId.current ?? resizingNodeId.current,
        autoFocusNoteId,
        tool === "compare" ? null : selectedStickyId,
        tool !== "compare",
        groupSelectedNoteIds,
        familySelecting || groupSelectionCount > 0,
      ),
    ]);
  }, [
    autoFocusNoteId,
    callbacks,
    conversations,
    familySelectedIds,
    familySelecting,
    groupSelectedNoteIds,
    groupSelectionCount,
    mergeDraftIds,
    notes,
    resizeEpoch,
    selectedNodeId,
    selectedStickyId,
    setFlowNodes,
    stickyCallbacks,
    tokenSelectedIds,
    tool,
  ]);

  const edges = useMemo<Edge[]>(() => {
    const nextCache = new Map<string, Edge>();
    const nextEdges = conversations.flatMap((node) =>
      node.parentIds.map((parentId) => {
        const candidate = createConversationEdge(node, parentId);
        const cached = edgeCache.current.get(candidate.id);
        const edge =
          cached &&
          cached.type === "floating" &&
          cached.animated === candidate.animated &&
          cached.className === candidate.className
            ? cached
            : candidate;
        nextCache.set(candidate.id, edge);
        return edge;
      }),
    );
    edgeCache.current = nextCache;
    return nextEdges;
  }, [conversations]);

  useEffect(() => {
    const validIds = new Set(conversations.map((conversation) => conversation.id));
    setTokenSelectedIds((current) => {
      if ([...current].every((id) => validIds.has(id))) return current;
      return new Set([...current].filter((id) => validIds.has(id)));
    });
    setFamilySelectedIds((current) => {
      if ([...current].every((id) => validIds.has(id))) return current;
      const next = new Set([...current].filter((id) => validIds.has(id)));
      familySelectedIdsRef.current = next;
      return next;
    });
    const validNoteIds = new Set(notes.map((note) => note.id));
    setGroupSelectedNoteIds((current) => {
      if ([...current].every((id) => validNoteIds.has(id))) return current;
      const next = new Set([...current].filter((id) => validNoteIds.has(id)));
      groupSelectedNoteIdsRef.current = next;
      return next;
    });
    const validStrokeIds = new Set(strokes.map((stroke) => stroke.id));
    setGroupSelectedStrokeIds((current) => {
      if ([...current].every((id) => validStrokeIds.has(id))) return current;
      const next = new Set([...current].filter((id) => validStrokeIds.has(id)));
      groupSelectedStrokeIdsRef.current = next;
      return next;
    });
  }, [conversations, notes, strokes]);

  useEffect(() => {
    if (!familySelectionActive.current || !userSelectionRect) return;
    const rectangle = screenSelectionToFlowRectangle(
      userSelectionRect,
      flowTransform,
    );
    replaceSelectedStrokes(
      new Set(
        strokes
          .filter((stroke) => strokeIntersectsRectangle(stroke, rectangle))
          .map((stroke) => stroke.id),
      ),
    );
  }, [flowTransform, replaceSelectedStrokes, strokes, userSelectionRect]);

  const handleNodeClick: NodeMouseHandler<BoardFlowNode> = useCallback(
    (_, node) => {
      if (tool === "compare") {
        if (isConversationFlowNode(node)) {
          setTokenSelectedIds(new Set([node.id]));
        }
        return;
      }
      if (isConversationFlowNode(node)) {
        if (!familySelectedIds.has(node.id)) clearGroupSelection();
        setSelectedStickyId(null);
        onSelect(node.id);
      } else {
        if (groupSelectedNoteIds.has(node.id)) return;
        clearGroupSelection();
        setSelectedStickyId(node.id);
        onClearSelection();
      }
    },
    [clearGroupSelection, familySelectedIds, groupSelectedNoteIds, onClearSelection, onSelect, tool],
  );

  const handleNodesChange = useCallback(
    (changes: NodeChange<BoardFlowNode>[]) => {
      setFlowNodes((current) => {
        const next = applyCollisionSafeNodeChanges(
          changes,
          current,
          familySelectedIds,
          groupSelectedNoteIds,
        );
        for (const change of changes) {
          if (!("id" in change)) continue;
          const node = next.find((candidate) => candidate.id === change.id);
          if (!node) continue;
          if (change.type === "position") {
            if (groupFlowSelectedIds.has(node.id)) {
              next
                .filter((candidate) => groupFlowSelectedIds.has(candidate.id))
                .forEach((candidate) =>
                  acceptedDragPositions.current.set(candidate.id, candidate.position),
                );
            } else {
              acceptedDragPositions.current.set(node.id, node.position);
            }
          } else if (change.type === "dimensions" && isStickyFlowNode(node)) {
            acceptedStickySizes.current.set(node.id, {
              width: node.width ?? node.measured?.width ?? node.data.note.size.width,
              height: node.height ?? node.measured?.height ?? node.data.note.size.height,
            });
          } else if (
            tool !== "compare" &&
            !familySelectionActive.current &&
            !groupSelectionCount &&
            change.type === "select" &&
            change.selected
          ) {
            if (isConversationFlowNode(node)) {
              setSelectedStickyId(null);
              onSelect(node.id);
            } else {
              setSelectedStickyId(node.id);
              onClearSelection();
            }
          }
        }
        return next;
      });
    },
    [familySelectedIds, groupFlowSelectedIds, groupSelectedNoteIds, groupSelectionCount, onClearSelection, onSelect, setFlowNodes, tool],
  );

  const handleSelectionChange = useCallback(
    ({ nodes: selectedNodes }: { nodes: BoardFlowNode[] }) => {
      const selectedConversationIds = selectedNodes
        .filter(isConversationFlowNode)
        .map((node) => node.id);
      if (tool === "compare") {
        const next = new Set(selectedConversationIds);
        setTokenSelectedIds((current) => {
          if (
            current.size === next.size &&
            [...current].every((id) => next.has(id))
          ) {
            return current;
          }
          return next;
        });
        return;
      }
      if (tool !== "select" || !familySelectionActive.current) return;
      const next = new Set<string>();
      for (const id of selectedConversationIds) {
        for (const descendantId of getDescendantIds(conversations, id)) {
          next.add(descendantId);
        }
      }
      replaceFamilySelection(next);
      replaceSelectedNotes(
        new Set(selectedNodes.filter(isStickyFlowNode).map((node) => node.id)),
      );
    },
    [conversations, replaceFamilySelection, replaceSelectedNotes, tool],
  );

  const handleSelectionStart = useCallback(
    (event: React.MouseEvent) => {
      if (tool === "compare") {
        setTokenSelectedIds(new Set());
        return;
      }
      if (tool === "select" && event.ctrlKey) {
        familySelectionActive.current = true;
        setFamilySelecting(true);
        clearGroupSelection();
        setSelectedStickyId(null);
        setFlowNodes((current) =>
          current.map((node) =>
            node.selected ? { ...node, selected: false } : node,
          ),
        );
      }
    },
    [clearGroupSelection, setFlowNodes, tool],
  );

  const handleSelectionEnd = useCallback(() => {
    familySelectionActive.current = false;
    setFamilySelecting(false);
    setFlowNodes((current) =>
      current.map((node) => {
        const selected =
          isConversationFlowNode(node)
            ? familySelectedIdsRef.current.has(node.id)
            : groupSelectedNoteIdsRef.current.has(node.id);
        return node.selected === selected ? node : { ...node, selected };
      }),
    );
  }, [setFlowNodes]);

  const handleNodeDragStart: OnNodeDrag<BoardFlowNode> = useCallback((_, node) => {
    draggingNodeId.current = node.id;
    const draggedIds = groupFlowSelectedIds.has(node.id)
      ? groupFlowSelectedIds
      : new Set([node.id]);
    if (groupFlowSelectedIds.has(node.id)) {
      groupDragSnapshot.current = {
        anchorId: node.id,
        anchorPosition: { ...node.position },
        nodes: flowNodes,
        strokes: strokesRef.current,
        delta: { x: 0, y: 0 },
      };
      setHandleDragDelta({ x: 0, y: 0 });
    }
    flowNodes
      .filter((candidate) => draggedIds.has(candidate.id))
      .forEach((candidate) =>
        acceptedDragPositions.current.set(candidate.id, candidate.position),
      );
  }, [flowNodes, groupFlowSelectedIds]);

  const handleNodeDrag: OnNodeDrag<BoardFlowNode> = useCallback(() => {
    const snapshot = groupDragSnapshot.current;
    if (!snapshot?.anchorId || !snapshot.anchorPosition) return;
    const position = acceptedDragPositions.current.get(snapshot.anchorId);
    if (!position) return;
    const delta = {
      x: position.x - snapshot.anchorPosition.x,
      y: position.y - snapshot.anchorPosition.y,
    };
    snapshot.delta = delta;
    setHandleDragDelta(delta);
  }, []);

  const commitGroupMovement = useCallback(() => {
    const snapshot = groupDragSnapshot.current;
    if (!snapshot) return;
    const acceptedAnchor = snapshot.anchorId
      ? acceptedDragPositions.current.get(snapshot.anchorId)
      : undefined;
    const delta = acceptedAnchor && snapshot.anchorPosition
      ? {
          x: acceptedAnchor.x - snapshot.anchorPosition.x,
          y: acceptedAnchor.y - snapshot.anchorPosition.y,
        }
      : snapshot.delta;
    const conversationPositions = [...familySelectedIdsRef.current].flatMap((id) => {
      const position = acceptedDragPositions.current.get(id);
      return position ? [{ id, position }] : [];
    });
    const notePositions = [...groupSelectedNoteIdsRef.current].flatMap((id) => {
      const position = acceptedDragPositions.current.get(id);
      return position ? [{ id, position }] : [];
    });
    const movedStrokes = groupSelectedStrokeIdsRef.current.size &&
      (delta.x !== 0 || delta.y !== 0)
      ? snapshot.strokes.map((stroke) =>
          groupSelectedStrokeIdsRef.current.has(stroke.id)
            ? translateInkStroke(stroke, delta)
            : stroke,
        )
      : undefined;

    if (movedStrokes) {
      undoStack.current.push({ before: snapshot.strokes, after: movedStrokes });
      redoStack.current = [];
      strokesRef.current = movedStrokes;
      strokeBoundsRef.current = new Map(
        movedStrokes.map((stroke) => [stroke.id, getInkStrokeBounds(stroke)]),
      );
      setHistoryVersion((current) => current + 1);
    }
    for (const id of groupFlowSelectedIds) {
      acceptedDragPositions.current.delete(id);
    }
    if (
      conversationPositions.length ||
      notePositions.length ||
      movedStrokes
    ) {
      onSelectionMoveCommit(boardId, {
        conversationPositions,
        notePositions,
        ...(movedStrokes ? { strokes: movedStrokes } : {}),
      });
    }
    groupDragSnapshot.current = null;
    setHandleDragDelta({ x: 0, y: 0 });
  }, [boardId, groupFlowSelectedIds, onSelectionMoveCommit]);

  const handleNodeDragStop: OnNodeDrag<BoardFlowNode> = useCallback(
    (_, node) => {
      draggingNodeId.current = null;
      const acceptedPosition =
        acceptedDragPositions.current.get(node.id) ?? node.position;
      if (isConversationFlowNode(node)) {
        if (groupFlowSelectedIds.has(node.id)) {
          commitGroupMovement();
        } else {
          acceptedDragPositions.current.delete(node.id);
          onPositionCommit(boardId, node.id, acceptedPosition);
        }
      } else {
        if (groupFlowSelectedIds.has(node.id)) {
          commitGroupMovement();
        } else {
          acceptedDragPositions.current.delete(node.id);
          onNotePositionCommit(boardId, node.id, acceptedPosition);
        }
      }
      setResizeEpoch((current) => current + 1);
    },
    [boardId, commitGroupMovement, groupFlowSelectedIds, onNotePositionCommit, onPositionCommit],
  );

  const handleSelectionHandlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      if (event.button !== 0 || familySelecting) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      const anchor = flowNodes.find((node) => groupFlowSelectedIds.has(node.id));
      groupDragSnapshot.current = {
        anchorId: anchor?.id ?? null,
        anchorPosition: anchor ? { ...anchor.position } : null,
        nodes: flowNodes,
        strokes: strokesRef.current,
        delta: { x: 0, y: 0 },
        pointerId: event.pointerId,
        pointerStart: { x: event.clientX, y: event.clientY },
      };
      for (const node of flowNodes) {
        if (groupFlowSelectedIds.has(node.id)) {
          acceptedDragPositions.current.set(node.id, node.position);
        }
      }
      setHandleDragDelta({ x: 0, y: 0 });
    },
    [familySelecting, flowNodes, groupFlowSelectedIds],
  );

  const handleSelectionHandlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const snapshot = groupDragSnapshot.current;
      if (
        snapshot?.pointerId !== event.pointerId ||
        !snapshot.pointerStart
      ) {
        return;
      }
      const zoom = getViewport().zoom;
      const requestedDelta = {
        x: (event.clientX - snapshot.pointerStart.x) / zoom,
        y: (event.clientY - snapshot.pointerStart.y) / zoom,
      };
      let next = snapshot.nodes;
      let delta = requestedDelta;
      if (snapshot.anchorId && snapshot.anchorPosition) {
        next = applyCollisionSafeNodeChanges(
          [{
            id: snapshot.anchorId,
            type: "position",
            position: {
              x: snapshot.anchorPosition.x + requestedDelta.x,
              y: snapshot.anchorPosition.y + requestedDelta.y,
            },
            dragging: true,
          }],
          snapshot.nodes,
          familySelectedIdsRef.current,
          groupSelectedNoteIdsRef.current,
        );
        const movedAnchor = next.find((node) => node.id === snapshot.anchorId);
        if (movedAnchor) {
          delta = {
            x: movedAnchor.position.x - snapshot.anchorPosition.x,
            y: movedAnchor.position.y - snapshot.anchorPosition.y,
          };
        }
        for (const node of next) {
          if (groupFlowSelectedIds.has(node.id)) {
            acceptedDragPositions.current.set(node.id, node.position);
          }
        }
        setFlowNodes(next);
      }
      snapshot.delta = delta;
      setHandleDragDelta(delta);
    },
    [getViewport, groupFlowSelectedIds, setFlowNodes],
  );

  const handleSelectionHandlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLButtonElement>) => {
      const snapshot = groupDragSnapshot.current;
      if (snapshot?.pointerId !== event.pointerId) return;
      event.currentTarget.releasePointerCapture(event.pointerId);
      commitGroupMovement();
      setResizeEpoch((current) => current + 1);
    },
    [commitGroupMovement],
  );

  const commitStrokeChange = useCallback(
    (next: InkStroke[], record = true) => {
      const before = strokesRef.current;
      if (before === next) return;
      if (record) {
        undoStack.current.push({ before, after: next });
        redoStack.current = [];
      }
      strokesRef.current = next;
      strokeBoundsRef.current = new Map(
        next.map((stroke) => [stroke.id, getInkStrokeBounds(stroke)]),
      );
      onStrokesCommit(boardId, next);
      setHistoryVersion((current) => current + 1);
    },
    [boardId, onStrokesCommit],
  );

  const undo = useCallback(() => {
    const entry = undoStack.current.pop();
    if (!entry) return;
    redoStack.current.push(entry);
    commitStrokeChange(entry.before, false);
  }, [commitStrokeChange]);

  const redo = useCallback(() => {
    const entry = redoStack.current.pop();
    if (!entry) return;
    undoStack.current.push(entry);
    commitStrokeChange(entry.after, false);
  }, [commitStrokeChange]);

  const cancelDrawing = useCallback((pointerId?: number) => {
    if (
      pointerId !== undefined &&
      drawingPointerId.current !== pointerId
    ) {
      return;
    }
    drawingPointerId.current = null;
    currentStrokeRef.current = null;
    setCurrentStroke(null);
    erasedStrokeIdsRef.current = new Set();
    setHiddenStrokeIds(new Set());
  }, []);

  const chooseTool = useCallback(
    (nextTool: CanvasTool) => {
      cancelDrawing();
      if (nextTool === "compare") {
        setTokenSelectedIds(new Set());
        setFlowNodes((current) =>
          current.map((node) =>
            node.selected ? { ...node, selected: false } : node,
          ),
        );
      }
      if (nextTool !== "select") clearGroupSelection();
      setTool(nextTool);
    },
    [cancelDrawing, clearGroupSelection, setFlowNodes],
  );

  const appendPointerSamples = useCallback(
    (events: PointerEvent[]) => {
      if (tool === "pen") {
        const stroke = currentStrokeRef.current;
        if (!stroke) return;
        const points = [...stroke.points];
        for (const event of events) {
          if (points.length >= MAX_STROKE_POINTS) break;
          const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
          const previous = points[points.length - 1];
          if (!previous || Math.hypot(point.x - previous.x, point.y - previous.y) >= 0.35) {
            points.push({
              ...point,
              ...(event.pressure > 0 ? { pressure: event.pressure } : {}),
            });
          }
        }
        const next = { ...stroke, points };
        currentStrokeRef.current = next;
        setCurrentStroke(next);
        return;
      }

      if (tool === "eraser") {
        const erased = new Set(erasedStrokeIdsRef.current);
        const radius = 12 / getViewport().zoom;
        for (const event of events) {
          const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
          for (const stroke of strokesRef.current) {
            if (erased.has(stroke.id)) continue;
            const bounds = strokeBoundsRef.current.get(stroke.id);
            if (
              bounds &&
              (point.x < bounds.x - radius ||
                point.x > bounds.x + bounds.width + radius ||
                point.y < bounds.y - radius ||
                point.y > bounds.y + bounds.height + radius)
            ) {
              continue;
            }
            if (strokeIntersectsPoint(stroke, point, radius)) {
              erased.add(stroke.id);
            }
          }
        }
        erasedStrokeIdsRef.current = erased;
        setHiddenStrokeIds(erased);
      }
    },
    [getViewport, screenToFlowPosition, tool],
  );

  const finishDrawing = useCallback((event: React.PointerEvent<HTMLDivElement>) => {
    if (drawingPointerId.current !== event.pointerId) return;
    const samples = event.nativeEvent.getCoalescedEvents?.() ?? [];
    appendPointerSamples([...samples, event.nativeEvent]);
    if (tool === "pen") {
      const draft = currentStrokeRef.current;
      if (draft) {
        const rawPoints = draft.points.length === 1
          ? [draft.points[0], { ...draft.points[0], x: draft.points[0].x + 0.1 }]
          : draft.points;
        const points = simplifyInkPoints(rawPoints, 0.7 / getViewport().zoom);
        if (strokesRef.current.length >= MAX_INK_STROKES) {
          onNotice(`A board can contain up to ${MAX_INK_STROKES} pen strokes.`);
        } else if (points.length >= 2) {
          commitStrokeChange([...strokesRef.current, { ...draft, points }]);
        }
      }
      currentStrokeRef.current = null;
      setCurrentStroke(null);
    } else if (tool === "eraser") {
      const erased = erasedStrokeIdsRef.current;
      if (erased.size) {
        commitStrokeChange(
          strokesRef.current.filter((stroke) => !erased.has(stroke.id)),
        );
      }
      erasedStrokeIdsRef.current = new Set();
      setHiddenStrokeIds(new Set());
    }
    drawingPointerId.current = null;
  }, [appendPointerSamples, commitStrokeChange, getViewport, onNotice, tool]);

  const handleDrawingPointerCancel = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => cancelDrawing(event.pointerId),
    [cancelDrawing],
  );

  const handleDrawingPointerDown = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (event.button !== 0 || drawingPointerId.current !== null) return;
      drawingPointerId.current = event.pointerId;
      event.currentTarget.setPointerCapture(event.pointerId);
      event.preventDefault();
      const point = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      if (tool === "pen") {
        const stroke: InkStroke = {
          id: `stroke-${crypto.randomUUID()}`,
          points: [{
            ...point,
            ...(event.pressure > 0 ? { pressure: event.pressure } : {}),
          }],
          color: penColor,
          width: penWidth,
          createdAt: Date.now(),
        };
        currentStrokeRef.current = stroke;
        setCurrentStroke(stroke);
      } else {
        erasedStrokeIdsRef.current = new Set();
        appendPointerSamples([event.nativeEvent]);
      }
    },
    [appendPointerSamples, penColor, penWidth, screenToFlowPosition, tool],
  );

  const handleDrawingPointerMove = useCallback(
    (event: React.PointerEvent<HTMLDivElement>) => {
      if (drawingPointerId.current !== event.pointerId) return;
      const samples = event.nativeEvent.getCoalescedEvents?.() ?? [event.nativeEvent];
      appendPointerSamples(samples);
      event.preventDefault();
    },
    [appendPointerSamples],
  );

  const handlePaneClick = useCallback(
    (event: React.MouseEvent) => {
      if (tool !== "note") {
        if (tool === "compare") {
          setTokenSelectedIds(new Set());
          return;
        }
        if (tool === "select") {
          clearGroupSelection();
          setSelectedStickyId(null);
          onClearSelection();
        }
        return;
      }
      if (notes.length >= MAX_STICKY_NOTES) {
        onNotice(`A board can contain up to ${MAX_STICKY_NOTES} sticky notes.`);
        setTool("select");
        return;
      }
      const clicked = screenToFlowPosition({ x: event.clientX, y: event.clientY });
      const preferred = {
        x: clicked.x - STICKY_NOTE_SIZE.width / 2,
        y: clicked.y - 22,
      };
      const position = findPositionForStickyNote(
        preferred,
        STICKY_NOTE_SIZE,
        notes,
      );
      const now = Date.now();
      const note: StickyNote = {
        id: `note-${crypto.randomUUID()}`,
        text: "",
        position,
        size: { ...STICKY_NOTE_SIZE },
        color: noteColor,
        createdAt: now,
        updatedAt: now,
      };
      setAutoFocusNoteId(note.id);
      onNoteCreate(boardId, note);
      setTool("select");
    },
    [boardId, clearGroupSelection, noteColor, notes, onClearSelection, onNoteCreate, onNotice, screenToFlowPosition, tool],
  );

  const fitBoard = useCallback(() => {
    const bounds = [
      ...flowNodes.map((node) => ({
        id: node.id,
        x: node.position.x,
        y: node.position.y,
        width: node.measured?.width ?? node.width ?? 1,
        height: node.measured?.height ?? node.height ?? 1,
      })),
      ...strokes.map(getInkStrokeBounds),
    ];
    if (!bounds.length) return;
    const left = Math.min(...bounds.map((bound) => bound.x));
    const top = Math.min(...bounds.map((bound) => bound.y));
    const right = Math.max(...bounds.map((bound) => bound.x + bound.width));
    const bottom = Math.max(...bounds.map((bound) => bound.y + bound.height));
    void fitBounds(
      { x: left, y: top, width: Math.max(1, right - left), height: Math.max(1, bottom - top) },
      { padding: 0.2, duration: 350 },
    );
  }, [fitBounds, flowNodes, strokes]);

  const miniMapNodeColor = useCallback(
    (node: BoardFlowNode) => {
      if (isStickyFlowNode(node)) return "var(--md-sys-color-tertiary)";
      if (tokenSelectedIds.has(node.id)) {
        return "var(--md-sys-color-tertiary)";
      }
      if (node.data.conversation.color) {
        return `var(--conversation-${node.data.conversation.color})`;
      }
      return node.id === selectedNodeId
        ? "var(--md-sys-color-primary)"
        : "var(--md-sys-color-outline)";
    },
    [selectedNodeId, tokenSelectedIds],
  );

  const drawing = tool === "pen" || tool === "eraser";
  const selectedConversation = conversations.find(
    (conversation) => conversation.id === selectedNodeId,
  );
  const colorAffectedCount = selectedConversation
    ? getConversationColorAffectedCount(
        conversations,
        selectedConversation.id,
        colorScope,
      )
    : 0;
  const familyColorAffectedCount = selectedConversation
    ? getConversationColorAffectedCount(
        conversations,
        selectedConversation.id,
        "family",
      )
    : 0;
  const selectedTokenUsage = useMemo(
    () => aggregateSelectedTokenUsage(conversations, tokenSelectedIds),
    [conversations, tokenSelectedIds],
  );
  const selectedTokenRate = selectedTokenUsage.outputTokensPerSecond === null
    ? "--"
    : `${selectedTokenUsage.rateEstimated ? "~" : ""}${selectedTokenUsage.outputTokensPerSecond.toFixed(1)}`;
  const familyTokenUsage = useMemo(
    () => aggregateSelectedTokenUsage(conversations, familySelectedIds),
    [conversations, familySelectedIds],
  );
  const familyTokenRate = familyTokenUsage.outputTokensPerSecond === null
    ? "--"
    : `${familyTokenUsage.rateEstimated ? "~" : ""}${familyTokenUsage.outputTokensPerSecond.toFixed(1)}`;
  const annotationTrayOpen = annotationTrayPinned || annotationTrayTransientOpen;
  const colorTrayOpen = colorTrayPinned || colorTrayTransientOpen;
  useEffect(() => {
    if (selectedConversation) return;
    setColorTrayPinned(false);
    setColorTrayTransientOpen(false);
  }, [selectedConversation]);
  void historyVersion;

  const nudgeSelection = useCallback(
    (delta: XYPosition): boolean => {
      if (drawing) return false;
      if (groupSelectionCount) {
        const anchor = flowNodes.find((node) => groupFlowSelectedIds.has(node.id));
        let next = flowNodes;
        let acceptedDelta = delta;
        if (anchor) {
          next = applyCollisionSafeNodeChanges(
            [{
              id: anchor.id,
              type: "position",
              position: {
                x: anchor.position.x + delta.x,
                y: anchor.position.y + delta.y,
              },
              dragging: false,
            }],
            flowNodes,
            familySelectedIds,
            groupSelectedNoteIds,
          );
          const movedAnchor = next.find((node) => node.id === anchor.id);
          if (!movedAnchor) return false;
          acceptedDelta = {
            x: movedAnchor.position.x - anchor.position.x,
            y: movedAnchor.position.y - anchor.position.y,
          };
        }
        groupDragSnapshot.current = {
          anchorId: anchor?.id ?? null,
          anchorPosition: anchor ? { ...anchor.position } : null,
          nodes: flowNodes,
          strokes: strokesRef.current,
          delta: acceptedDelta,
        };
        for (const node of next) {
          if (groupFlowSelectedIds.has(node.id)) {
            acceptedDragPositions.current.set(node.id, node.position);
          }
        }
        setFlowNodes(next);
        commitGroupMovement();
        return true;
      }
      const selectedId = selectedStickyId ?? selectedNodeId;
      if (!selectedId) return false;
      const selected = flowNodes.find((node) => node.id === selectedId);
      if (!selected) return false;
      const next = nudgeBoardFlowNode(flowNodes, selected.id, delta);
      const moved = next.find((node) => node.id === selected.id);
      if (!moved) return false;
      setFlowNodes(next);
      if (isConversationFlowNode(moved)) {
        onPositionCommit(boardId, moved.id, moved.position);
      } else {
        onNotePositionCommit(boardId, moved.id, moved.position);
      }
      return true;
    },
    [boardId, commitGroupMovement, drawing, familySelectedIds, flowNodes, groupFlowSelectedIds, groupSelectedNoteIds, groupSelectionCount, onNotePositionCommit, onPositionCommit, selectedNodeId, selectedStickyId, setFlowNodes],
  );

  const dismissTopLayer = useCallback((): boolean => {
    if (colorTrayPinned) {
      setColorTrayPinned(false);
      return true;
    }
    if (annotationTrayPinned) {
      setAnnotationTrayPinned(false);
      return true;
    }
    if (tool === "compare" || tokenSelectedIds.size) {
      setTokenSelectedIds(new Set());
      setTool("select");
      return true;
    }
    if (groupSelectionCount) {
      clearGroupSelection();
      return true;
    }
    if (drawingPointerId.current !== null || tool !== "select") {
      cancelDrawing();
      setTool("select");
      return true;
    }
    if (selectedStickyId) {
      setSelectedStickyId(null);
      return true;
    }
    if (selectedNodeId) {
      onClearSelection();
      return true;
    }
    return false;
  }, [annotationTrayPinned, cancelDrawing, clearGroupSelection, colorTrayPinned, groupSelectionCount, onClearSelection, selectedNodeId, selectedStickyId, tokenSelectedIds.size, tool]);

  const executeShortcut = useCallback(
    (command: ShortcutCommandId, shiftKey = false): boolean => {
      switch (command) {
        case "canvas.select":
          chooseTool("select");
          return true;
        case "canvas.compare":
          chooseTool("compare");
          return true;
        case "canvas.note":
          chooseTool("note");
          return true;
        case "canvas.pen":
          chooseTool("pen");
          return true;
        case "canvas.eraser":
          chooseTool("eraser");
          return true;
        case "canvas.fit":
          fitBoard();
          return true;
        case "canvas.zoomIn":
          void zoomIn({ duration: 160 });
          return true;
        case "canvas.zoomOut":
          void zoomOut({ duration: 160 });
          return true;
        case "canvas.undoInk":
          undo();
          return true;
        case "canvas.redoInk":
          redo();
          return true;
        case "selection.delete":
          if (!selectedStickyId) return false;
          onNoteDelete(boardId, selectedStickyId);
          setSelectedStickyId(null);
          return true;
        case "selection.nudgeUp":
        case "selection.nudgeDown":
        case "selection.nudgeLeft":
        case "selection.nudgeRight": {
          const amount = shiftKey ? 32 : 8;
          return nudgeSelection({
            x: command === "selection.nudgeLeft" ? -amount : command === "selection.nudgeRight" ? amount : 0,
            y: command === "selection.nudgeUp" ? -amount : command === "selection.nudgeDown" ? amount : 0,
          });
        }
        default:
          return false;
      }
    },
    [boardId, chooseTool, fitBoard, nudgeSelection, onNoteDelete, redo, selectedStickyId, undo, zoomIn, zoomOut],
  );

  const groupSelectionBounds = useMemo(
    () =>
      getCanvasSelectionBounds(
        flowNodes,
        strokes,
        groupSelection,
        handleDragDelta,
      ),
    [flowNodes, groupSelection, handleDragDelta, strokes],
  );

  useImperativeHandle(
    forwardedRef,
    () => ({
      dismissTopLayer,
      executeShortcut,
      focus: () => canvasFrameRef.current?.focus(),
    }),
    [dismissTopLayer, executeShortcut],
  );

  return (
    <div ref={canvasFrameRef} className="board-canvas-frame" tabIndex={-1}>
    <ReactFlow<BoardFlowNode, Edge>
      nodes={flowNodes}
      edges={edges}
      nodeTypes={nodeTypes}
      edgeTypes={edgeTypes}
      onNodesChange={handleNodesChange}
      onNodeClick={handleNodeClick}
      onNodeDragStart={handleNodeDragStart}
      onNodeDrag={handleNodeDrag}
      onNodeDragStop={handleNodeDragStop}
      onPaneClick={handlePaneClick}
      onSelectionStart={handleSelectionStart}
      onSelectionChange={handleSelectionChange}
      onSelectionEnd={handleSelectionEnd}
      onMoveEnd={(_, nextViewport: Viewport) =>
        onViewportCommit(boardId, nextViewport)
      }
      nodeDragThreshold={3}
      fitView={!viewport}
      defaultViewport={viewport}
      fitViewOptions={fitViewOptions}
      minZoom={0.2}
      maxZoom={1.5}
      deleteKeyCode={null}
      edgesFocusable={false}
      nodesConnectable={false}
      nodesDraggable={!drawing && tool !== "compare"}
      elementsSelectable={!drawing}
      panOnDrag={tool === "select"}
      selectionOnDrag={tool === "compare"}
      selectionKeyCode={tool === "select" ? "Control" : null}
      selectionMode={SelectionMode.Partial}
      multiSelectionKeyCode={null}
      zoomOnPinch={!drawing}
      zoomOnDoubleClick={tool === "select"}
      colorMode={theme}
      proOptions={proOptions}
      className={`board-canvas tool-${tool}`}
    >
      <Background
        variant={BackgroundVariant.Dots}
        gap={24}
        size={1.2}
        color="var(--md-sys-color-outline-variant)"
      />
      <InkLayer
        strokes={strokes}
        currentStroke={currentStroke}
        hiddenStrokeIds={hiddenStrokeIds}
        selectedStrokeIds={groupSelectedStrokeIds}
        selectionOffset={handleDragDelta}
      />
      {!familySelecting && groupSelectionBounds && (
        <ViewportPortal>
          <div
            className="group-selection-bounds"
            style={{
              left: groupSelectionBounds.x - 10,
              top: groupSelectionBounds.y - 10,
              width: groupSelectionBounds.width + 20,
              height: groupSelectionBounds.height + 20,
            }}
          >
            <button
              type="button"
              className="group-selection-drag-handle nodrag nopan"
              aria-label={`Move ${groupSelectionCount} selected board items`}
              onPointerDown={handleSelectionHandlePointerDown}
              onPointerMove={handleSelectionHandlePointerMove}
              onPointerUp={handleSelectionHandlePointerUp}
              onPointerCancel={handleSelectionHandlePointerUp}
            >
              <MaterialSymbol name="select_all" size={20} />
            </button>
          </div>
        </ViewportPortal>
      )}
      {drawing && (
        <div
          className={`drawing-capture drawing-${tool}`}
          aria-label={tool === "pen" ? "Pen drawing surface" : "Stroke eraser surface"}
          onPointerDown={handleDrawingPointerDown}
          onPointerMove={handleDrawingPointerMove}
          onPointerUp={finishDrawing}
          onPointerCancel={handleDrawingPointerCancel}
        />
      )}
      <Panel position="top-left" className="annotation-toolbar">
        <div
          className={`annotation-tray${annotationTrayOpen ? " is-open" : ""}${annotationTrayPinned ? " is-pinned" : ""}`}
          onMouseEnter={() => setAnnotationTrayTransientOpen(true)}
          onMouseLeave={() => setAnnotationTrayTransientOpen(false)}
          onFocus={() => setAnnotationTrayTransientOpen(true)}
          onBlur={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget)) {
              setAnnotationTrayTransientOpen(false);
            }
          }}
        >
          <IconButton
            className="annotation-tray-handle"
            label={annotationTrayPinned ? "Unpin whiteboard tools" : "Open and pin whiteboard tools"}
            icon={annotationTrayPinned ? "chevron_left" : "draw"}
            aria-expanded={annotationTrayOpen}
            selected={annotationTrayPinned}
            onClick={() =>
              setAnnotationTrayPinned((current) => {
                if (current) setAnnotationTrayTransientOpen(false);
                return !current;
              })
            }
          />
          <div
            className="annotation-tray-content"
            aria-hidden={!annotationTrayOpen}
            inert={!annotationTrayOpen}
          >
          <div className="annotation-tools" role="toolbar" aria-label="Whiteboard tools">
          <IconButton
            className={tool === "select" ? "active" : ""}
            label="Select and pan (V)"
            icon="select_all"
            selected={tool === "select"}
            aria-keyshortcuts="V"
            onClick={() => chooseTool("select")}
          />
          <IconButton
            className={tool === "compare" ? "active" : ""}
            label="Box-select token comparison (X)"
            icon="compare"
            selected={tool === "compare"}
            aria-keyshortcuts="X"
            onClick={() => chooseTool("compare")}
          />
          <IconButton
            className={tool === "note" ? "active" : ""}
            label="Add sticky note (N)"
            icon="note_add"
            selected={tool === "note"}
            aria-keyshortcuts="N"
            onClick={() => chooseTool("note")}
          />
          <IconButton
            className={tool === "pen" ? "active" : ""}
            label="Pen (P)"
            icon="draw"
            selected={tool === "pen"}
            aria-keyshortcuts="P"
            onClick={() => chooseTool("pen")}
          />
          <IconButton
            className={tool === "eraser" ? "active" : ""}
            label="Erase entire strokes (E)"
            icon="ink_eraser"
            selected={tool === "eraser"}
            aria-keyshortcuts="E"
            onClick={() => chooseTool("eraser")}
          />
          <span className="annotation-tool-separator" />
          <IconButton
            label="Undo ink change (Ctrl/Cmd+Z)"
            icon="undo"
            aria-keyshortcuts="Control+Z"
            disabled={!undoStack.current.length}
            onClick={undo}
          />
          <IconButton
            label="Redo ink change (Ctrl/Cmd+Shift+Z)"
            icon="redo"
            aria-keyshortcuts="Control+Shift+Z"
            disabled={!redoStack.current.length}
            onClick={redo}
          />
          <IconButton
            label="Fit conversations, notes, and ink (F)"
            icon="fit_screen"
            aria-keyshortcuts="F"
            onClick={fitBoard}
          />
        </div>
        {tool === "pen" && (
          <div className="annotation-options">
            <div className="pen-colors" aria-label="Pen color">
              {PEN_COLORS.map((color) => (
                <button
                  key={color}
                  type="button"
                  className={`pen-color pen-${color}${penColor === color ? " active" : ""}`}
                  aria-label={`${color} pen`}
                  aria-pressed={penColor === color}
                  onClick={() => setPenColor(color)}
                />
              ))}
            </div>
            <label>
              <span>WIDTH</span>
              <input
                type="range"
                min="2"
                max="16"
                step="1"
                value={penWidth}
                aria-label="Pen width"
                onChange={(event) => setPenWidth(Number(event.target.value))}
              />
              <b>{penWidth}</b>
            </label>
          </div>
        )}
        {tool === "note" && (
          <div className="annotation-options note-options">
            <span>COLOR</span>
            {(["yellow", "pink", "blue", "green", "neutral"] as StickyColor[]).map((color) => (
              <button
                key={color}
                type="button"
               className={`sticky-color sticky-color-${color}${noteColor === color ? " active" : ""}`}
               aria-label={`${color} new sticky note`}
               aria-pressed={noteColor === color}
               onClick={() => setNoteColor(color)}
              />
            ))}
            <em>Click the canvas to place</em>
          </div>
        )}
          </div>
        </div>
      </Panel>
      {selectedConversation && (
        <Panel position="top-right" className="conversation-color-tray-panel">
          <div
            className={`conversation-color-tray${colorTrayOpen ? " is-open" : ""}${colorTrayPinned ? " is-pinned" : ""}`}
            onMouseEnter={() => setColorTrayTransientOpen(true)}
            onMouseLeave={() => setColorTrayTransientOpen(false)}
            onFocus={() => setColorTrayTransientOpen(true)}
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setColorTrayTransientOpen(false);
              }
            }}
          >
          <div
            className="conversation-color-tray-content"
            aria-hidden={!colorTrayOpen}
            inert={!colorTrayOpen}
          >
          <div className="conversation-color-panel">
          <div className="conversation-color-heading">
            <span><MaterialSymbol name="palette" size={20} /> Color code</span>
            <strong>{colorAffectedCount} {colorAffectedCount === 1 ? "NODE" : "NODES"}</strong>
          </div>
          <div className="conversation-color-scope">
            <ConnectedButtonGroup<ConversationColorScope>
              value={colorScope}
              ariaLabel="Color scope"
              options={[
                { value: "node", label: "Node" },
                { value: "family", label: `Family · ${familyColorAffectedCount}` },
              ]}
              onChange={setColorScope}
            />
          </div>
          <div className="conversation-color-swatches" aria-label="Conversation colors">
            <button
              type="button"
              className={`conversation-color-swatch no-color${selectedConversation.color ? "" : " active"}`}
              aria-label={`Clear ${colorScope} color`}
              onClick={() =>
                onColorCommit(selectedConversation.id, undefined, colorScope)
              }
            >
              <MaterialSymbol name="close" size={20} />
            </button>
            {CONVERSATION_COLORS.map((color) => (
              <button
                key={color}
                type="button"
                className={`conversation-color-swatch conversation-color-${color}${selectedConversation.color === color ? " active" : ""}`}
                aria-label={`${color} ${colorScope} color`}
                aria-pressed={selectedConversation.color === color}
                onClick={() =>
                  onColorCommit(selectedConversation.id, color, colorScope)
                }
              />
            ))}
          </div>
          </div>
          </div>
          <IconButton
            className="conversation-color-tray-handle"
            label={colorTrayPinned ? "Unpin conversation colors" : "Open and pin conversation colors"}
            icon="palette"
            aria-expanded={colorTrayOpen}
            selected={colorTrayPinned}
            onClick={() =>
              setColorTrayPinned((current) => {
                if (current) setColorTrayTransientOpen(false);
                return !current;
              })
            }
          />
          </div>
        </Panel>
      )}
      {selectedTokenUsage.selectedNodes > 0 && (
        <Panel position="top-center" className="token-selection-panel">
          <div className="token-selection-summary" role="status" aria-live="polite">
            <div className="token-selection-metrics">
              <div>
                <span>TOKENS</span>
                <strong>
                  {selectedTokenUsage.estimated ? "~" : ""}
                  {formatTokenCount(selectedTokenUsage.totalTokens, true)}
                </strong>
              </div>
              <div>
                <span>REQUEST TIME</span>
                <strong>
                  {selectedTokenUsage.timedNodes
                    ? formatDuration(selectedTokenUsage.totalDurationMs)
                    : "--"}
                </strong>
              </div>
              <div>
                <span>AVG SPEED</span>
                <strong>{selectedTokenRate}{selectedTokenRate === "--" ? "" : " tok/s"}</strong>
              </div>
            </div>
            <p>
              {selectedTokenUsage.selectedNodes} selected · {selectedTokenUsage.recordedNodes} tracked
              {selectedTokenUsage.untrackedNodes > 0
                ? ` · ${selectedTokenUsage.untrackedNodes} untracked`
                : ""}
            </p>
            <button
              type="button"
              onClick={() => setTokenSelectedIds(new Set())}
            >
              Clear
            </button>
          </div>
        </Panel>
      )}
      {groupSelectionCount > 0 && (
        <Panel position="top-center" className="family-selection-panel">
          <div className="family-selection-summary" role="status">
            <strong className="group-selection-count">{groupSelectionCount}</strong>
            <div className="family-selection-details">
              <span>
                {familySelectedIds.size} nodes · {groupSelectedNoteIds.size} notes · {groupSelectedStrokeIds.size} strokes
              </span>
              {familyTokenUsage.selectedNodes > 0 && (
                <div className="family-selection-metrics">
                  <span>
                    <b>TOKENS</b>
                    <strong>
                      {familyTokenUsage.estimated ? "~" : ""}
                      {formatTokenCount(familyTokenUsage.totalTokens, true)}
                    </strong>
                  </span>
                  <span>
                    <b>REQUEST TIME</b>
                    <strong>
                      {familyTokenUsage.timedNodes
                        ? formatDuration(familyTokenUsage.totalDurationMs)
                        : "--"}
                    </strong>
                  </span>
                  <span>
                    <b>AVG SPEED</b>
                    <strong>{familyTokenRate}{familyTokenRate === "--" ? "" : " tok/s"}</strong>
                  </span>
                </div>
              )}
            </div>
            <button type="button" onClick={clearGroupSelection}>
              Clear
            </button>
          </div>
        </Panel>
      )}
      <Panel position="bottom-left" className="viewport-toolbar" role="toolbar" aria-label="Canvas zoom">
        <IconButton label="Zoom out" icon="zoom_out" onClick={() => void zoomOut({ duration: 350 })} />
        <IconButton label="Zoom in" icon="zoom_in" onClick={() => void zoomIn({ duration: 350 })} />
      </Panel>
      {flowNodes.length > 3 && (
        <MiniMap
          pannable
          zoomable
          position="bottom-right"
          nodeColor={miniMapNodeColor}
          maskColor={theme === "dark" ? "rgba(20, 18, 24, 0.78)" : "rgba(254, 247, 255, 0.76)"}
        />
      )}
    </ReactFlow>
    </div>
  );
});

export const BoardCanvas = memo(BoardCanvasView);
