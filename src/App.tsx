import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ReactFlowProvider,
  type XYPosition,
  useReactFlow,
} from "@xyflow/react";
import {
  Button,
  Dialog,
  IconButton,
  MaterialSymbol,
  Menu,
  MenuItem,
  ProgressIndicator,
  SideSheet,
  SnackbarHost,
} from "./components/material";
import "@xyflow/react/dist/style.css";
import {
  BoardCanvas,
  type BoardCanvasHandle,
  type BoardSelectionMove,
} from "./components/BoardCanvas";
import {
  AttachmentTray,
  type PendingAttachment,
} from "./components/Attachments";
import {
  MarkdownComposer,
  type MarkdownComposerHandle,
} from "./components/MarkdownComposer";
import { SettingsPanel } from "./components/SettingsPanel";
import { ShortcutHelpDialog } from "./components/ShortcutHelpDialog";
import { buildChatContext } from "./lib/context";
import {
  applyConversationColor,
  getInheritedConversationColor,
  type ConversationColorScope,
} from "./lib/conversation-colors";
import {
  attachmentRefForFile,
  garbageCollectAttachments,
  storeAttachments,
  validateFiles,
} from "./lib/assets";
import {
  canAddDraftToMerge,
  getContextNodes,
  getDescendantIds,
  getMergedDraftParentIds,
} from "./lib/graph";
import {
  getModelOptions,
  hasSameProviderConfig,
  selectActiveModel,
  selectProvider,
} from "./lib/model-selection";
import {
  aggregateBoardTokenUsage,
  createGenerationMetrics,
  formatTokenCount,
} from "./lib/metrics";
import {
  estimateConversationNodeHeight,
  findCollisionFreePosition,
  findPositionForNewNode,
  findPositionForSiblingNode,
  getConversationNodeBounds,
} from "./lib/node-collision";
import {
  ensureEndpointPermission,
  getActiveProviderConfig,
  getActiveModel,
  getProviderConfigError,
  getProviderLabel,
  listProviderModels,
  streamProvider,
  type ProviderModel,
  validateAttachmentsForProvider,
} from "./lib/providers";
import {
  canRetryConversation,
  createSiblingRetryInput,
} from "./lib/retry";
import {
  createEmptyWhiteboard,
  loadSettings,
  loadWhiteboards,
  removeWhiteboard,
  saveSettings,
  saveWhiteboards,
} from "./lib/storage";
import { oppositeTheme, resolveTheme, themeColor } from "./lib/theme";
import {
  normalizeReadingFontSize,
  normalizeReadingFontStyle,
} from "./lib/typography";
import { getAutomaticNodeWidth } from "./lib/node-sizing";
import { useMediaQuery } from "./hooks/useMediaQuery";
import {
  findShortcutCommand,
  isEditableShortcutTarget,
  resolveEscapeLayer,
} from "./lib/shortcuts";
import {
  DEFAULT_SETTINGS,
  type AttachmentRef,
  type ConversationNode,
  type ConversationColor,
  type ProviderId,
  type Settings,
  type StickyColor,
  type StickyNote,
  type InkStroke,
  type BoardViewport,
  type ThemePreference,
  type Whiteboard,
  type WhiteboardCollection,
} from "./types";
import "./styles.css";
import "./styles/m3-overrides.css";

const PROVIDER_OPTIONS: Array<{ id: ProviderId; label: string }> = [
  { id: "gemini", label: "Gemini" },
  { id: "openai", label: "OpenAI" },
  { id: "anthropic", label: "Anthropic" },
  { id: "ollama-cloud", label: "Ollama Cloud" },
  { id: "local", label: "Local" },
];

type RetryRoute = {
  boardId: string;
  sourceId: string;
  settings: Settings;
};

type GenerationOverride = {
  boardId: string;
  parentIds: string[];
  placementSourceId: string;
  prompt: string;
  attachments: AttachmentRef[];
  settings: Settings;
  color?: ConversationColor;
};

type ConfirmationState =
  | { kind: "create-board"; name: string; fallbackName: string }
  | { kind: "delete-board"; boardId: string }
  | { kind: "clear-conversations"; boardId: string }
  | { kind: "clear-annotations"; boardId: string }
  | { kind: "delete-node"; boardId: string; nodeId: string }
  | null;

function normalizeLoadedNodes(nodes: ConversationNode[]): ConversationNode[] {
  return nodes.map((node) =>
    node.status === "streaming"
      ? {
          ...node,
          status: "error",
          error: "This response was interrupted when Branchboard closed.",
        }
      : node,
  );
}

function normalizeLoadedBoards(
  collection: WhiteboardCollection,
): WhiteboardCollection {
  return {
    ...collection,
    boards: collection.boards.map((board) => {
      const nodes = normalizeLoadedNodes(board.nodes);
      const selectionExists = nodes.some(
        (node) => node.id === board.selectedNodeId,
      );
      return {
        ...board,
        nodes,
        selectedNodeId: selectionExists ? board.selectedNodeId : null,
      };
    }),
  };
}

function sanitizeSettings(settings: Settings): Settings {
  return {
    ...settings,
    readingFontStyle: normalizeReadingFontStyle(settings.readingFontStyle),
    readingFontSizePx: normalizeReadingFontSize(settings.readingFontSizePx),
    providers: {
      gemini: {
        apiKey: settings.providers.gemini.apiKey.trim(),
        model: settings.providers.gemini.model.trim(),
      },
      openai: {
        apiKey: settings.providers.openai.apiKey.trim(),
        model: settings.providers.openai.model.trim(),
      },
      anthropic: {
        apiKey: settings.providers.anthropic.apiKey.trim(),
        model: settings.providers.anthropic.model.trim(),
      },
      "ollama-cloud": {
        apiKey: settings.providers["ollama-cloud"].apiKey.trim(),
        model: settings.providers["ollama-cloud"].model.trim(),
      },
      local: {
        ...settings.providers.local,
        apiKey: settings.providers.local.apiKey.trim(),
        model: settings.providers.local.model.trim(),
        endpoint: settings.providers.local.endpoint.trim(),
      },
    },
  };
}

function cacheThemePreference(theme: ThemePreference): void {
  try {
    localStorage.setItem("branchboard.theme", theme);
  } catch {
    // The persisted settings remain authoritative when localStorage is unavailable.
  }
}

function WorkspaceApp() {
  const [collection, setCollection] = useState<WhiteboardCollection | null>(null);
  const [settings, setSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [draftSettings, setDraftSettings] = useState<Settings>(DEFAULT_SETTINGS);
  const [prompt, setPrompt] = useState("");
  const [pendingAttachments, setPendingAttachments] = useState<PendingAttachment[]>([]);
  const [hydrated, setHydrated] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [shortcutHelpOpen, setShortcutHelpOpen] = useState(false);
  const [notice, setNotice] = useState("");
  const [modelCatalogs, setModelCatalogs] = useState<
    Partial<Record<ProviderId, ProviderModel[]>>
  >({});
  const [refreshingModels, setRefreshingModels] = useState<ProviderId | null>(null);
  const [routePickerOpen, setRoutePickerOpen] = useState(false);
  const [retryRoute, setRetryRoute] = useState<RetryRoute | null>(null);
  const [attachmentMenuOpen, setAttachmentMenuOpen] = useState(false);
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [appMenuOpen, setAppMenuOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationState>(null);
  const [mergeDraftIds, setMergeDraftIds] = useState<string[]>([]);
  const [canPersistBoards, setCanPersistBoards] = useState(false);
  const [systemTheme, setSystemTheme] = useState<Exclude<ThemePreference, "system">>(
    () => window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark",
  );
  const composerRef = useRef<MarkdownComposerHandle>(null);
  const boardCanvasRef = useRef<BoardCanvasHandle>(null);
  const routePickerTriggerRef = useRef<HTMLButtonElement>(null);
  const attachmentMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const boardMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const appMenuTriggerRef = useRef<HTMLButtonElement>(null);
  const confirmationInputRef = useRef<HTMLInputElement>(null);
  const settingsTriggerRef = useRef<HTMLButtonElement>(null);
  const shortcutsTriggerRef = useRef<HTMLButtonElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const videoInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const pendingAttachmentsRef = useRef(pendingAttachments);
  const stagedAttachmentIds = useRef(new Set<string>());
  const controllers = useRef(new Map<string, AbortController>());
  const collectionRef = useRef<WhiteboardCollection | null>(null);
  const settingsRef = useRef(settings);
  const retryRouteRef = useRef(retryRoute);
  const saveQueue = useRef<Promise<void>>(Promise.resolve());
  const settingsSaveQueue = useRef<Promise<void>>(Promise.resolve());
  const { getNodes, setCenter } = useReactFlow();
  const compactViewport = useMediaQuery("(max-width: 599px)");

  collectionRef.current = collection;
  settingsRef.current = settings;
  retryRouteRef.current = retryRoute;
  pendingAttachmentsRef.current = pendingAttachments;

  const activeBoard = collection?.boards.find(
    (board) => board.id === collection.activeBoardId,
  );
  const activeBoardId = activeBoard?.id ?? "";
  const nodes = activeBoard?.nodes ?? [];
  const selectedNodeId = activeBoard?.selectedNodeId ?? null;
  const resolvedTheme = resolveTheme(settings.theme, systemTheme);

  const updateBoard = useCallback(
    (boardId: string, updater: (board: Whiteboard) => Whiteboard) => {
      setCollection((current) => {
        if (!current) return current;
        let changed = false;
        const boards = current.boards.map((board) => {
          if (board.id !== boardId) return board;
          const next = updater(board);
          changed = next !== board;
          return next;
        });
        return changed ? { ...current, boards } : current;
      });
    },
    [],
  );

  const closeRoutePicker = useCallback(() => {
    setRoutePickerOpen(false);
    setRetryRoute(null);
  }, []);

  useEffect(() => {
    let active = true;
    Promise.allSettled([loadWhiteboards(), loadSettings()])
      .then(([boardsResult, settingsResult]) => {
        if (!active) return;
        if (boardsResult.status === "fulfilled") {
          const loaded = normalizeLoadedBoards(boardsResult.value);
          setCollection(loaded);
          setCanPersistBoards(true);
          void garbageCollectAttachments(loaded).catch(() => {
            if (active) setNotice("Could not clean up unused local files.");
          });
        } else {
          const board = createEmptyWhiteboard("Board 1");
          setCollection({ version: 1, boards: [board], activeBoardId: board.id });
          setNotice("Storage is unavailable. This recovery board will not overwrite saved data.");
        }
        if (settingsResult.status === "fulfilled") {
          setSettings(settingsResult.value);
          setDraftSettings(settingsResult.value);
          cacheThemePreference(settingsResult.value.theme);
        } else if (boardsResult.status === "fulfilled") {
          setNotice("Could not read saved model settings.");
        }
      })
      .finally(() => active && setHydrated(true));

    return () => {
      active = false;
      controllers.current.forEach((controller) => controller.abort());
    };
  }, []);

  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: light)");
    const update = () => setSystemTheme(media.matches ? "light" : "dark");
    update();
    media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    document.documentElement.dataset.theme = resolvedTheme;
    document.documentElement.dataset.readingFont = settings.readingFontStyle;
    document.documentElement.style.setProperty(
      "--reading-font-size",
      `${settings.readingFontSizePx}px`,
    );
    document.documentElement.style.colorScheme = resolvedTheme;
    document
      .querySelector('meta[name="theme-color"]')
      ?.setAttribute("content", themeColor(resolvedTheme));
  }, [resolvedTheme, settings.readingFontSizePx, settings.readingFontStyle]);

  useEffect(() => {
    if (!hydrated || !collection || !canPersistBoards) return;
    const snapshot = collection;
    const timer = window.setTimeout(() => {
      saveQueue.current = saveQueue.current
        .catch(() => undefined)
        .then(() => saveWhiteboards(snapshot))
        .then(() => {
          if (collectionRef.current === snapshot) {
            return garbageCollectAttachments(
              snapshot,
              new Set(stagedAttachmentIds.current),
            ).catch(() =>
              setNotice("Whiteboards saved, but unused local files could not be cleaned up."),
            );
          }
        })
        .catch(() => setNotice("Could not save the whiteboards."));
    }, 400);
    return () => window.clearTimeout(timer);
  }, [canPersistBoards, collection, hydrated]);

  useEffect(() => {
    if (!hydrated || !canPersistBoards) return;
    const flushLatestBoardState = () => {
      const snapshot = collectionRef.current;
      if (!snapshot) return;
      saveQueue.current = saveQueue.current
        .catch(() => undefined)
        .then(() => saveWhiteboards(snapshot))
        .catch(() => undefined);
    };
    const flushWhenHidden = () => {
      if (document.visibilityState === "hidden") flushLatestBoardState();
    };
    document.addEventListener("visibilitychange", flushWhenHidden);
    window.addEventListener("pagehide", flushLatestBoardState);
    return () => {
      document.removeEventListener("visibilitychange", flushWhenHidden);
      window.removeEventListener("pagehide", flushLatestBoardState);
    };
  }, [canPersistBoards, hydrated]);

  const selectedNode = nodes.find((node) => node.id === selectedNodeId);
  const selectedMergeDrafts = mergeDraftIds
    .map((id) => nodes.find((node) => node.id === id))
    .filter((node): node is ConversationNode => Boolean(node));
  const mergeParentCount = new Set(
    selectedMergeDrafts.flatMap((node) => node.parentIds),
  ).size;
  const mergeCanConfirm = Boolean(getMergedDraftParentIds(selectedMergeDrafts));
  const selectedContext = useMemo(() => {
    try {
      const targetIds = selectedNodeId
        ? nodes.find((node) => node.id === selectedNodeId)?.status === "draft"
          ? nodes.find((node) => node.id === selectedNodeId)?.parentIds ?? []
          : [selectedNodeId]
        : [];
      return getContextNodes(nodes, targetIds);
    } catch {
      return [];
    }
  }, [nodes, selectedNodeId]);

  const activeProviderConfig = getActiveProviderConfig(settings);
  const routeSettings = retryRoute?.settings ?? settings;
  const routeProviderConfig = getActiveProviderConfig(routeSettings);
  const routeModels = getModelOptions(
    modelCatalogs[routeSettings.provider] ?? [],
    routeProviderConfig.model,
  );

  const includedCount = selectedContext.filter(
    (node) => !node.muted && node.status === "complete",
  ).length;
  const boardUsage = useMemo(() => aggregateBoardTokenUsage(nodes), [nodes]);

  const queueSettingsSave = useCallback((next: Settings): Promise<void> => {
    const operation = settingsSaveQueue.current
      .catch(() => undefined)
      .then(() => saveSettings(next));
    settingsSaveQueue.current = operation.catch(() => undefined);
    return operation;
  }, []);

  const persistComposerSettings = useCallback(
    (next: Settings) => {
      settingsRef.current = next;
      setSettings(next);
      void queueSettingsSave(next).catch(() =>
        setNotice("Could not save the model selection."),
      );
    },
    [queueSettingsSave],
  );

  const changeRouteProvider = (provider: ProviderId) => {
    if (retryRoute) {
      setRetryRoute({
        ...retryRoute,
        settings: selectProvider(retryRoute.settings, provider),
      });
      return;
    }
    persistComposerSettings(selectProvider(settings, provider));
  };

  const changeRouteModel = (model: string) => {
    if (retryRoute) {
      setRetryRoute({
        ...retryRoute,
        settings: selectActiveModel(retryRoute.settings, model),
      });
      return;
    }
    persistComposerSettings(selectActiveModel(settings, model));
    setRoutePickerOpen(false);
    window.setTimeout(() => composerRef.current?.focus(), 0);
  };

  const addPendingFiles = useCallback((files: File[]) => {
    if (!files.length) return;
    const current = pendingAttachmentsRef.current;
    try {
      validateFiles(
        files,
        current.length,
        current.reduce((total, attachment) => total + attachment.ref.size, 0),
      );
      const next = [
        ...current,
        ...files.map((file) => ({ ref: attachmentRefForFile(file), file })),
      ];
      pendingAttachmentsRef.current = next;
      setPendingAttachments(next);
      setAttachmentMenuOpen(false);
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not attach these files.");
    }
  }, []);

  const removePendingAttachment = useCallback((id: string) => {
    setPendingAttachments((current) => {
      const next = current.filter((attachment) => attachment.ref.id !== id);
      pendingAttachmentsRef.current = next;
      return next;
    });
  }, []);

  const clearPendingAttachments = useCallback(() => {
    pendingAttachmentsRef.current = [];
    setPendingAttachments([]);
    setAttachmentMenuOpen(false);
  }, []);

  const refreshComposerModels = async () => {
    const retrySnapshot = retryRouteRef.current;
    const requestSettings = structuredClone(
      retrySnapshot?.settings ?? settingsRef.current,
    );
    const provider = requestSettings.provider;
    const providerLabel = getProviderLabel(provider);
    const configError =
      provider === "ollama-cloud"
        ? null
        : getProviderConfigError(requestSettings, false);
    if (configError) {
      setNotice(configError);
      return;
    }

    setRefreshingModels(provider);
    try {
      const granted = await ensureEndpointPermission(requestSettings);
      if (!granted) throw new Error("Endpoint access was not granted.");
      const models = await listProviderModels(requestSettings);
      if (!models.length) throw new Error(`${providerLabel} returned no models.`);
      const latestRetry = retryRouteRef.current;
      const latestSettings = retrySnapshot
        ? latestRetry?.boardId === retrySnapshot.boardId &&
          latestRetry.sourceId === retrySnapshot.sourceId
          ? latestRetry.settings
          : null
        : settingsRef.current;
      if (!latestSettings || latestSettings.provider !== provider ||
        !hasSameProviderConfig(latestSettings, requestSettings, provider)) {
        setNotice("The model connection changed. Refresh its catalog again.");
        return;
      }
      setModelCatalogs((current) => ({ ...current, [provider]: models }));

      if (!getActiveModel(latestSettings)) {
        const selected = selectActiveModel(latestSettings, models[0].id);
        if (retrySnapshot) {
          setRetryRoute((current) =>
            current?.boardId === retrySnapshot.boardId &&
            current.sourceId === retrySnapshot.sourceId
              ? { ...current, settings: selected }
              : current,
          );
        } else {
          persistComposerSettings(selected);
        }
      }
      setNotice(
        `Found ${models.length} ${providerLabel} model${models.length === 1 ? "" : "s"}.`,
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Could not load models.");
    } finally {
      setRefreshingModels(null);
    }
  };

  const confirmMergeDrafts = useCallback(
    () => {
      if (mergeDraftIds.length < 2) return;
      const current = collectionRef.current;
      const board = current?.boards.find(
        (candidate) => candidate.id === current.activeBoardId,
      );
      const drafts = mergeDraftIds
        .map((id) => board?.nodes.find((node) => node.id === id))
        .filter((node): node is ConversationNode => Boolean(node));
      const source = drafts[0];
      if (!board || !source || drafts.length !== mergeDraftIds.length) {
        setMergeDraftIds([]);
        setNotice("One or more merge drafts are no longer available.");
        return;
      }

      const parentIds = getMergedDraftParentIds(drafts);
      if (!parentIds) {
        setNotice("Choose at least two empty drafts with distinct parents.");
        return;
      }

      const bounds = getConversationNodeBounds(board.nodes, getNodes());
      const sourceBounds = bounds.find((node) => node.id === source.id);
      const selectedBounds = drafts.map(
        (draft) => bounds.find((node) => node.id === draft.id) ?? {
          id: draft.id,
          x: draft.position.x,
          y: draft.position.y,
          width: getAutomaticNodeWidth(draft),
          height: estimateConversationNodeHeight(draft, getAutomaticNodeWidth(draft)),
        },
      );
      const sourceSize = {
        width: sourceBounds?.width ?? getAutomaticNodeWidth(source),
        height:
          sourceBounds?.height ??
          estimateConversationNodeHeight(
            source,
            sourceBounds?.width ?? getAutomaticNodeWidth(source),
          ),
      };
      const preferredPosition = {
        x: selectedBounds.reduce(
          (total, bound) => total + bound.x + bound.width / 2,
          0,
        ) / selectedBounds.length - sourceSize.width / 2,
        y: selectedBounds.reduce(
          (total, bound) => total + bound.y + bound.height / 2,
          0,
        ) / selectedBounds.length - sourceSize.height / 2,
      };
      const selectedIds = new Set(mergeDraftIds);
      const position = findCollisionFreePosition(
        preferredPosition,
        sourceSize,
        bounds.filter((node) => !selectedIds.has(node.id)),
      );
      updateBoard(board.id, (latest) => ({
        ...latest,
        nodes: latest.nodes
          .filter((node) => node.id === source.id || !selectedIds.has(node.id))
          .map((node) =>
            node.id === source.id
              ? {
                  ...node,
                  parentIds,
                  position,
                  color: getInheritedConversationColor(latest.nodes, parentIds),
                }
              : node,
          ),
        selectedNodeId: source.id,
        updatedAt: Date.now(),
      }));
      setMergeDraftIds([]);
      setNotice(
        `${drafts.length} drafts merged into one node with ${parentIds.length} parents.`,
      );
      window.setTimeout(() => composerRef.current?.focus(), 0);
    },
    [getNodes, mergeDraftIds, updateBoard],
  );

  const selectNode = useCallback(
    (id: string) => {
      if (mergeDraftIds.length) {
        const current = collectionRef.current;
        const board = current?.boards.find(
          (candidate) => candidate.id === current.activeBoardId,
        );
        const candidate = board?.nodes.find((node) => node.id === id);
        const selectedDrafts = mergeDraftIds
          .map((draftId) => board?.nodes.find((node) => node.id === draftId))
          .filter((node): node is ConversationNode => Boolean(node));
        if (!candidate || !board) return;
        if (mergeDraftIds.includes(id)) {
          setMergeDraftIds((ids) => ids.filter((draftId) => draftId !== id));
          return;
        }
        if (!canAddDraftToMerge(selectedDrafts, candidate)) {
          setNotice("Choose an empty draft that contributes at least one new parent.");
          return;
        }
        setMergeDraftIds((ids) => [...ids, id]);
        return;
      }
      if (!activeBoardId) return;
      updateBoard(activeBoardId, (board) => ({
        ...board,
        selectedNodeId: id,
        updatedAt: Date.now(),
      }));
      window.setTimeout(() => composerRef.current?.focus(), 0);
    },
    [activeBoardId, mergeDraftIds, updateBoard],
  );

  const clearSelection = useCallback(() => {
    if (!activeBoardId) return;
    updateBoard(activeBoardId, (board) =>
      board.selectedNodeId === null
        ? board
        : { ...board, selectedNodeId: null, updatedAt: Date.now() },
    );
  }, [activeBoardId, updateBoard]);

  const createBranchDraft = useCallback(
    (id: string) => {
      const current = collectionRef.current;
      const board = current?.boards.find(
        (candidate) => candidate.id === current.activeBoardId,
      );
      const source = board?.nodes.find((node) => node.id === id);
      if (!board || !source || source.status !== "complete") return;

      const draftId = crypto.randomUUID();
      const width = getAutomaticNodeWidth({ prompt: "", response: "" });
      const height = estimateConversationNodeHeight(
        { prompt: "", response: "", status: "draft" },
        width,
      );
      const bounds = getConversationNodeBounds(board.nodes, getNodes());
      const position = findPositionForNewNode(
        board.nodes,
        bounds,
        id,
        { width, height },
      );
      const draft: ConversationNode = {
        id: draftId,
        parentIds: [id],
        prompt: "",
        response: "",
        muted: false,
        status: "draft",
        position,
        createdAt: Date.now(),
        ...(source.color ? { color: source.color } : {}),
      };

      setMergeDraftIds([]);
      updateBoard(board.id, (latest) => ({
        ...latest,
        nodes: [...latest.nodes, draft],
        selectedNodeId: draftId,
        updatedAt: Date.now(),
      }));
      window.setTimeout(() => {
        setCenter(position.x + width / 2, position.y + 180, {
          zoom: 0.9,
          duration: 400,
        });
        composerRef.current?.focus();
      }, 0);
    },
    [getNodes, setCenter, updateBoard],
  );

  const beginRetry = useCallback((id: string) => {
    if (mergeDraftIds.length) {
      setNotice("Confirm or cancel the draft merge before retrying.");
      return;
    }
    const current = collectionRef.current;
    const board = current?.boards.find(
      (candidate) => candidate.id === current.activeBoardId,
    );
    const source = board?.nodes.find((node) => node.id === id);
    if (!board || !source || !canRetryConversation(source)) {
      setNotice("Only completed or failed conversations can be retried.");
      return;
    }

    setAttachmentMenuOpen(false);
    setRetryRoute({
      boardId: board.id,
      sourceId: source.id,
      settings: structuredClone(settingsRef.current),
    });
    setRoutePickerOpen(true);
  }, [mergeDraftIds.length]);

  const startMerge = useCallback((id: string) => {
    const current = collectionRef.current;
    const board = current?.boards.find(
      (candidate) => candidate.id === current.activeBoardId,
    );
    const draft = board?.nodes.find((node) => node.id === id);
    if (!board || !draft || draft.status !== "draft" || !draft.parentIds.length) {
      setNotice("Only an empty draft with at least one parent can join a merge.");
      return;
    }
    if (mergeDraftIds.length) {
      selectNode(id);
      return;
    }
    setMergeDraftIds([id]);
    updateBoard(board.id, (latest) => ({
      ...latest,
      selectedNodeId: id,
      updatedAt: Date.now(),
    }));
  }, [mergeDraftIds.length, selectNode, updateBoard]);

  const toggleMuted = useCallback((id: string) => {
    if (!activeBoardId) return;
    updateBoard(activeBoardId, (board) => ({
      ...board,
      nodes: board.nodes.map((node) =>
        node.id === id ? { ...node, muted: !node.muted } : node,
      ),
      updatedAt: Date.now(),
    }));
  }, [activeBoardId, updateBoard]);

  const commitConversationColor = useCallback(
    (
      id: string,
      color: ConversationColor | undefined,
      scope: ConversationColorScope,
    ) => {
      if (!activeBoardId) return;
      updateBoard(activeBoardId, (board) => {
        const nodes = applyConversationColor(board.nodes, id, color, scope);
        return nodes === board.nodes
          ? board
          : { ...board, nodes, updatedAt: Date.now() };
      });
    },
    [activeBoardId, updateBoard],
  );

  const stopGeneration = useCallback((id: string) => {
    controllers.current.get(id)?.abort();
  }, []);

  const deleteNode = useCallback((id: string) => {
    const current = collectionRef.current;
    const board = current?.boards.find(
      (candidate) => candidate.id === current.activeBoardId,
    );
    if (!board?.nodes.some((candidate) => candidate.id === id)) return;
    setConfirmation({ kind: "delete-node", boardId: board.id, nodeId: id });
  }, []);

  const commitNodePosition = useCallback(
    (boardId: string, nodeId: string, position: XYPosition) => {
      updateBoard(boardId, (board) => {
        let changed = false;
        const nextNodes = board.nodes.map((node) => {
          if (
            node.id !== nodeId ||
            (node.position.x === position.x && node.position.y === position.y)
          ) {
            return node;
          }
          changed = true;
          return { ...node, position };
        });
        return changed
          ? { ...board, nodes: nextNodes, updatedAt: Date.now() }
          : board;
      });
    },
    [updateBoard],
  );

  const commitNodeSize = useCallback(
    (
      boardId: string,
      nodeId: string,
      size: { width: number; height: number } | undefined,
    ) => {
      updateBoard(boardId, (board) => {
        let changed = false;
        const nextNodes = board.nodes.map((node) => {
          if (node.id !== nodeId) return node;
          if (
            node.size?.width === size?.width &&
            node.size?.height === size?.height
          ) {
            return node;
          }
          changed = true;
          return { ...node, size };
        });
        return changed
          ? { ...board, nodes: nextNodes, updatedAt: Date.now() }
          : board;
      });
    },
    [updateBoard],
  );

  const createNote = useCallback(
    (boardId: string, note: StickyNote) => {
      updateBoard(boardId, (board) => ({
        ...board,
        notes: [...board.notes, note],
        updatedAt: Date.now(),
      }));
    },
    [updateBoard],
  );

  const commitNotePosition = useCallback(
    (boardId: string, noteId: string, position: XYPosition) => {
      updateBoard(boardId, (board) => {
        let changed = false;
        const notes = board.notes.map((note) => {
          if (
            note.id !== noteId ||
            note.position.x === position.x && note.position.y === position.y
          ) {
            return note;
          }
          changed = true;
          return { ...note, position, updatedAt: Date.now() };
        });
        return changed ? { ...board, notes, updatedAt: Date.now() } : board;
      });
    },
    [updateBoard],
  );

  const commitNoteSize = useCallback(
    (boardId: string, noteId: string, size: { width: number; height: number }) => {
      updateBoard(boardId, (board) => {
        let changed = false;
        const notes = board.notes.map((note) => {
          if (
            note.id !== noteId ||
            note.size.width === size.width && note.size.height === size.height
          ) {
            return note;
          }
          changed = true;
          return { ...note, size, updatedAt: Date.now() };
        });
        return changed ? { ...board, notes, updatedAt: Date.now() } : board;
      });
    },
    [updateBoard],
  );

  const commitNoteText = useCallback(
    (boardId: string, noteId: string, text: string) => {
      updateBoard(boardId, (board) => {
        let changed = false;
        const notes = board.notes.map((note) => {
          if (note.id !== noteId || note.text === text) return note;
          changed = true;
          return { ...note, text, updatedAt: Date.now() };
        });
        return changed ? { ...board, notes, updatedAt: Date.now() } : board;
      });
    },
    [updateBoard],
  );

  const commitNoteColor = useCallback(
    (boardId: string, noteId: string, color: StickyColor) => {
      updateBoard(boardId, (board) => {
        let changed = false;
        const notes = board.notes.map((note) => {
          if (note.id !== noteId || note.color === color) return note;
          changed = true;
          return { ...note, color, updatedAt: Date.now() };
        });
        return changed ? { ...board, notes, updatedAt: Date.now() } : board;
      });
    },
    [updateBoard],
  );

  const deleteNote = useCallback(
    (boardId: string, noteId: string) => {
      updateBoard(boardId, (board) => {
        const notes = board.notes.filter((note) => note.id !== noteId);
        return notes.length === board.notes.length
          ? board
          : { ...board, notes, updatedAt: Date.now() };
      });
    },
    [updateBoard],
  );

  const commitStrokes = useCallback(
    (boardId: string, strokes: InkStroke[]) => {
      updateBoard(boardId, (board) =>
        board.strokes === strokes
          ? board
          : { ...board, strokes, updatedAt: Date.now() },
      );
    },
    [updateBoard],
  );

  const commitSelectionMove = useCallback(
    (boardId: string, movement: BoardSelectionMove) => {
      const conversationPositions = new Map(
        movement.conversationPositions.map(({ id, position }) => [id, position]),
      );
      const notePositions = new Map(
        movement.notePositions.map(({ id, position }) => [id, position]),
      );
      updateBoard(boardId, (board) => {
        let changed = false;
        const now = Date.now();
        const nodes = board.nodes.map((node) => {
          const position = conversationPositions.get(node.id);
          if (
            !position ||
            node.position.x === position.x && node.position.y === position.y
          ) {
            return node;
          }
          changed = true;
          return { ...node, position };
        });
        const notes = board.notes.map((note) => {
          const position = notePositions.get(note.id);
          if (
            !position ||
            note.position.x === position.x && note.position.y === position.y
          ) {
            return note;
          }
          changed = true;
          return { ...note, position, updatedAt: now };
        });
        const strokes = movement.strokes ?? board.strokes;
        if (strokes !== board.strokes) changed = true;
        return changed
          ? { ...board, nodes, notes, strokes, updatedAt: now }
          : board;
      });
    },
    [updateBoard],
  );

  const commitViewport = useCallback(
    (boardId: string, viewport: BoardViewport) => {
      updateBoard(boardId, (board) => {
        const current = board.viewport;
        if (
          current &&
          Math.abs(current.x - viewport.x) < 0.01 &&
          Math.abs(current.y - viewport.y) < 0.01 &&
          Math.abs(current.zoom - viewport.zoom) < 0.0001
        ) {
          return board;
        }
        return { ...board, viewport, updatedAt: Date.now() };
      });
    },
    [updateBoard],
  );

  const submitPrompt = async (
    submittedPrompt = prompt,
    override?: GenerationOverride,
  ) => {
    const text = override?.prompt ?? submittedPrompt;
    const requestAttachments = override
      ? []
      : [...pendingAttachmentsRef.current];
    const attachmentRefs = override?.attachments ??
      requestAttachments.map((attachment) => attachment.ref);
    const requestBoardId = override?.boardId ?? activeBoardId;
    const requestBoard = collectionRef.current?.boards.find(
      (board) => board.id === requestBoardId,
    );
    if ((!text.trim() && !attachmentRefs.length) || !requestBoard) return;
    if (mergeDraftIds.length) {
      setNotice("Confirm or cancel the draft merge before sending.");
      return;
    }
    const requestNodes = requestBoard.nodes;
    const requestSelectedNode = override
      ? null
      : requestNodes.find((node) => node.id === requestBoard.selectedNodeId);
    if (
      requestSelectedNode &&
      requestSelectedNode.status !== "complete" &&
      requestSelectedNode.status !== "draft"
    ) {
      setNotice("Select a completed node, an empty draft, or start a new root before sending.");
      return;
    }
    const requestSettings = structuredClone(
      override?.settings ?? settingsRef.current,
    );
    const configError = getProviderConfigError(requestSettings);
    if (configError) {
      if (!override) {
        setDraftSettings(requestSettings);
        setSettingsOpen(true);
      }
      setNotice(configError);
      return;
    }

    let context;
    const draftNode = requestSelectedNode?.status === "draft"
      ? requestSelectedNode
      : null;
    const fillsDraft = Boolean(draftNode);
    const parentIds = override?.parentIds ?? (
      draftNode
        ? draftNode.parentIds
        : requestBoard.selectedNodeId
          ? [requestBoard.selectedNodeId]
          : []
    );
    try {
      context = buildChatContext(
        requestNodes,
        parentIds,
        text,
        attachmentRefs,
      );
      validateAttachmentsForProvider(
        requestSettings,
        context.messages.flatMap((message) => message.attachments ?? []),
      );
    } catch (error) {
      setNotice(error instanceof Error ? error.message : "Invalid conversation graph.");
      return;
    }

    try {
      const granted = await ensureEndpointPermission(requestSettings);
      if (!granted) {
        setNotice("Endpoint access was not granted.");
        return;
      }
      requestAttachments.forEach((attachment) =>
        stagedAttachmentIds.current.add(attachment.ref.id),
      );
      await storeAttachments(requestAttachments);
    } catch (error) {
      requestAttachments.forEach((attachment) =>
        stagedAttachmentIds.current.delete(attachment.ref.id),
      );
      setNotice(
        error instanceof Error
          ? error.message
          : "Could not store the attachments or access the selected endpoint.",
      );
      return;
    }

    const id = draftNode?.id ?? crypto.randomUUID();
    const controller = new AbortController();
    const newNodeWidth = getAutomaticNodeWidth({
      prompt: text,
      response: "",
      attachments: attachmentRefs,
    });
    const newNodeHeight = estimateConversationNodeHeight(
      {
        prompt: text,
        response: "",
        status: "streaming",
        attachments: attachmentRefs,
      },
      newNodeWidth,
    );
    const bounds = fillsDraft
      ? []
      : getConversationNodeBounds(requestNodes, getNodes());
    const inheritedColor = override
      ? override.color
      : draftNode
        ? draftNode.color
        : getInheritedConversationColor(requestNodes, parentIds);
    const newNode: ConversationNode = {
      id,
      parentIds,
      prompt: text,
      response: "",
      muted: false,
      status: "streaming",
      position: draftNode
        ? draftNode.position
        : override
          ? findPositionForSiblingNode(
              bounds,
              override.placementSourceId,
              { width: newNodeWidth, height: newNodeHeight },
            )
          : findPositionForNewNode(
              requestNodes,
              bounds,
              requestBoard.selectedNodeId,
              { width: newNodeWidth, height: newNodeHeight },
            ),
      size: draftNode?.size,
      createdAt: draftNode?.createdAt ?? Date.now(),
      provider: requestSettings.provider,
      model: getActiveModel(requestSettings),
      ...(inheritedColor ? { color: inheritedColor } : {}),
      ...(attachmentRefs.length
        ? { attachments: attachmentRefs }
        : {}),
    };

    controllers.current.set(id, controller);
    updateBoard(requestBoardId, (board) => ({
      ...board,
      nodes: fillsDraft
        ? board.nodes.map((node) => node.id === id ? newNode : node)
        : [...board.nodes, newNode],
      selectedNodeId: id,
      updatedAt: Date.now(),
    }));
    requestAttachments.forEach((attachment) =>
      stagedAttachmentIds.current.delete(attachment.ref.id),
    );
    setMergeDraftIds([]);
    if (override) {
      closeRoutePicker();
    } else {
      setPrompt("");
      const submittedAttachmentIds = new Set(
        requestAttachments.map((attachment) => attachment.ref.id),
      );
      setPendingAttachments((current) => {
        const next = current.filter(
          (attachment) => !submittedAttachmentIds.has(attachment.ref.id),
        );
        pendingAttachmentsRef.current = next;
        return next;
      });
    }
    if (!fillsDraft) {
      window.setTimeout(
        () =>
          setCenter(newNode.position.x + newNodeWidth / 2, newNode.position.y + 180, {
            zoom: 0.9,
            duration: 400,
          }),
        0,
      );
    }

    const requestStartedAt = performance.now();
    let streamedText = "";
    try {
      const result = await streamProvider({
        settings: requestSettings,
        context,
        signal: controller.signal,
        onText: (chunk) => {
          streamedText += chunk;
          updateBoard(requestBoardId, (board) => ({
            ...board,
            nodes: board.nodes.map((node) =>
              node.id === id
                ? { ...node, response: node.response + chunk }
                : node,
            ),
            updatedAt: Date.now(),
          }));
        },
      });
      const metrics = createGenerationMetrics(
        context,
        result.text,
        performance.now() - requestStartedAt,
        result.usage,
      );
      updateBoard(requestBoardId, (board) => ({
        ...board,
        nodes: board.nodes.map((node) =>
          node.id === id
            ? {
                ...node,
                status: "complete",
                model: result.model || node.model,
                metrics,
              }
            : node,
        ),
        updatedAt: Date.now(),
      }));
    } catch (error) {
      const message =
        error instanceof DOMException && error.name === "AbortError"
          ? "Generation stopped. This exchange is excluded from future context."
          : error instanceof Error
            ? error.message
            : "Model request failed.";
      const metrics = createGenerationMetrics(
        context,
        streamedText,
        performance.now() - requestStartedAt,
      );
      updateBoard(requestBoardId, (board) => ({
        ...board,
        nodes: board.nodes.map((node) =>
          node.id === id
            ? { ...node, status: "error", error: message, metrics }
            : node,
        ),
        updatedAt: Date.now(),
      }));
    } finally {
      controllers.current.delete(id);
    }
  };

  const confirmRetry = () => {
    const retry = retryRouteRef.current;
    const board = collectionRef.current?.boards.find(
      (candidate) => candidate.id === retry?.boardId,
    );
    const source = board?.nodes.find((node) => node.id === retry?.sourceId);
    if (!retry || !board || !source || !canRetryConversation(source)) {
      closeRoutePicker();
      setNotice("The conversation selected for retry is no longer available.");
      return;
    }
    if (mergeDraftIds.length) {
      setNotice("Confirm or cancel the draft merge before retrying.");
      return;
    }

    const input = createSiblingRetryInput(source);
    void submitPrompt(input.prompt, {
      boardId: board.id,
      parentIds: input.parentIds,
      placementSourceId: input.sourceId,
      prompt: input.prompt,
      attachments: input.attachments,
      settings: retry.settings,
      ...(input.color ? { color: input.color } : {}),
    });
  };

  const saveSettingsForm = async (draft: Settings) => {
    const next = sanitizeSettings(draft);
    await queueSettingsSave(next);
    cacheThemePreference(next.theme);
    settingsRef.current = next;
    setSettings(next);
    setDraftSettings(next);
    setModelCatalogs({});
    setSettingsOpen(false);
    setNotice("Settings saved locally.");
    window.setTimeout(() => settingsTriggerRef.current?.focus(), 0);
  };

  const toggleTheme = () => {
    const nextTheme: ThemePreference = oppositeTheme(resolvedTheme);
    const next = { ...settings, theme: nextTheme };
    settingsRef.current = next;
    setSettings(next);
    setDraftSettings((current) => ({ ...current, theme: nextTheme }));
    cacheThemePreference(nextTheme);
    void queueSettingsSave(next).catch(() =>
      setNotice("Could not save the theme preference."),
    );
  };

  const clearConversations = () => {
    if (!activeBoardId || !nodes.length) {
      setNotice("There are no conversations to clear.");
      return;
    }
    setConfirmation({ kind: "clear-conversations", boardId: activeBoardId });
  };

  const clearAnnotations = () => {
    if (!activeBoard || !activeBoard.notes.length && !activeBoard.strokes.length) {
      setNotice("There are no annotations to clear.");
      return;
    }
    setConfirmation({ kind: "clear-annotations", boardId: activeBoard.id });
  };

  const addWhiteboard = () => {
    if (!collection) return;
    const suggestedName = `Board ${collection.boards.length + 1}`;
    setConfirmation({
      kind: "create-board",
      name: suggestedName,
      fallbackName: suggestedName,
    });
  };

  const switchWhiteboard = (boardId: string) => {
    setCollection((current) =>
      current?.boards.some((board) => board.id === boardId)
        ? { ...current, activeBoardId: boardId }
        : current,
    );
    setPrompt("");
    clearPendingAttachments();
    setMergeDraftIds([]);
    setSettingsOpen(false);
  };

  const deleteActiveWhiteboard = () => {
    const current = collectionRef.current;
    const board = current?.boards.find(
      (candidate) => candidate.id === current.activeBoardId,
    );
    if (!current || !board) return;
    setConfirmation({ kind: "delete-board", boardId: board.id });
  };

  const confirmPendingAction = useCallback(() => {
    const pending = confirmation;
    const current = collectionRef.current;
    if (!pending || !current) return;

    if (pending.kind === "create-board") {
      const name = pending.name.trim().slice(0, 60) || pending.fallbackName;
      const board = createEmptyWhiteboard(name);
      setCollection((latest) => latest ? {
        ...latest,
        boards: [...latest.boards, board],
        activeBoardId: board.id,
      } : latest);
      setPrompt("");
      clearPendingAttachments();
      setMergeDraftIds([]);
      setSettingsOpen(false);
      closeRoutePicker();
      setConfirmation(null);
      return;
    }

    const board = current.boards.find((candidate) => candidate.id === pending.boardId);
    if (!board) {
      setConfirmation(null);
      setNotice("That whiteboard is no longer available.");
      return;
    }

    if (pending.kind === "delete-node") {
      const node = board.nodes.find((candidate) => candidate.id === pending.nodeId);
      if (!node) {
        setConfirmation(null);
        setNotice("That conversation is no longer available.");
        return;
      }
      const removedIds = getDescendantIds(board.nodes, node.id);
      removedIds.forEach((id) => controllers.current.get(id)?.abort());
      updateBoard(board.id, (latest) => ({
        ...latest,
        nodes: latest.nodes.filter((candidate) => !removedIds.has(candidate.id)),
        selectedNodeId:
          latest.selectedNodeId && removedIds.has(latest.selectedNodeId)
            ? node.parentIds[0] ?? null
            : latest.selectedNodeId,
        updatedAt: Date.now(),
      }));
      setMergeDraftIds((ids) => ids.filter((id) => !removedIds.has(id)));
    } else if (pending.kind === "clear-conversations") {
      board.nodes.forEach((node) => controllers.current.get(node.id)?.abort());
      updateBoard(board.id, (latest) => ({
        ...latest,
        nodes: [],
        selectedNodeId: null,
        updatedAt: Date.now(),
      }));
      setPrompt("");
      clearPendingAttachments();
      setMergeDraftIds([]);
      setSettingsOpen(false);
      closeRoutePicker();
    } else if (pending.kind === "clear-annotations") {
      updateBoard(board.id, (latest) => ({
        ...latest,
        notes: [],
        strokes: [],
        updatedAt: Date.now(),
      }));
      setSettingsOpen(false);
    } else if (pending.kind === "delete-board") {
      board.nodes.forEach((node) => controllers.current.get(node.id)?.abort());
      setCollection((latest) => latest ? removeWhiteboard(latest, board.id) : latest);
      setPrompt("");
      clearPendingAttachments();
      setMergeDraftIds([]);
      setSettingsOpen(false);
      closeRoutePicker();
      setNotice(`Deleted “${board.name}”.`);
    }
    setConfirmation(null);
  }, [clearPendingAttachments, closeRoutePicker, confirmation, updateBoard]);

  const openSettings = () => {
    closeRoutePicker();
    setDraftSettings(settingsRef.current);
    setShortcutHelpOpen(false);
    setSettingsOpen(true);
  };

  const closeSettings = () => {
    setSettingsOpen(false);
    window.setTimeout(() => settingsTriggerRef.current?.focus(), 0);
  };

  const closeShortcutHelp = () => {
    setShortcutHelpOpen(false);
    window.setTimeout(() => shortcutsTriggerRef.current?.focus(), 0);
  };

  const startNewRoot = () => {
    if (!activeBoardId) return;
    updateBoard(activeBoardId, (board) => ({
      ...board,
      selectedNodeId: null,
      updatedAt: Date.now(),
    }));
    setMergeDraftIds([]);
    closeRoutePicker();
    composerRef.current?.focus();
  };

  useEffect(() => {
    const consume = (event: KeyboardEvent) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      const target = event.target instanceof HTMLElement ? event.target : null;
      const inStickyEditor = Boolean(target?.closest(".sticky-note textarea"));

      if (event.key === "Escape") {
        if (confirmation) {
          consume(event);
          setConfirmation(null);
          return;
        }
        if (appMenuOpen) {
          consume(event);
          setAppMenuOpen(false);
          appMenuTriggerRef.current?.focus();
          return;
        }
        if (boardMenuOpen) {
          consume(event);
          setBoardMenuOpen(false);
          boardMenuTriggerRef.current?.focus();
          return;
        }
        const layer = resolveEscapeLayer({
          help: shortcutHelpOpen,
          settings: settingsOpen,
          routePicker: routePickerOpen,
          attachmentMenu: attachmentMenuOpen,
          stickyEditor: inStickyEditor,
          merge: mergeDraftIds.length > 0,
        });
        if (layer === "help") {
          consume(event);
          closeShortcutHelp();
          return;
        }
        if (layer === "settings") {
          consume(event);
          closeSettings();
          return;
        }
        if (layer === "route-picker") {
          consume(event);
          closeRoutePicker();
          window.setTimeout(() => routePickerTriggerRef.current?.focus(), 0);
          return;
        }
        if (layer === "attachment-menu") {
          consume(event);
          setAttachmentMenuOpen(false);
          window.setTimeout(() => attachmentMenuTriggerRef.current?.focus(), 0);
          return;
        }
        if (layer === "sticky-editor") return;
        if (layer === "merge") {
          consume(event);
          setMergeDraftIds([]);
          setNotice("Merge cancelled.");
          return;
        }
        if (boardCanvasRef.current?.dismissTopLayer()) {
          consume(event);
          boardCanvasRef.current.focus();
          return;
        }
        if (target?.closest(".cm-editor")) {
          consume(event);
          composerRef.current?.blur();
          boardCanvasRef.current?.focus();
        }
        return;
      }

      if (
        shortcutHelpOpen ||
        settingsOpen ||
        routePickerOpen ||
        attachmentMenuOpen ||
        boardMenuOpen ||
        appMenuOpen ||
        confirmation !== null ||
        isEditableShortcutTarget(event.target)
      ) {
        return;
      }

      const command = findShortcutCommand(event);
      if (!command) return;
      const repeatable = command.startsWith("selection.nudge");
      if (event.repeat && !repeatable) return;

      let handled = false;
      switch (command) {
        case "help":
          setSettingsOpen(false);
          setShortcutHelpOpen(true);
          handled = true;
          break;
        case "composer.focus":
          composerRef.current?.focus();
          handled = true;
          break;
        case "settings.open":
          openSettings();
          handled = true;
          break;
        case "workspace.new":
          addWhiteboard();
          handled = true;
          break;
        case "workspace.previous":
        case "workspace.next": {
          const current = collectionRef.current;
          if (!current || current.boards.length < 2) break;
          const index = current.boards.findIndex((board) => board.id === current.activeBoardId);
          const delta = command === "workspace.previous" ? -1 : 1;
          const next = current.boards[(index + delta + current.boards.length) % current.boards.length];
          switchWhiteboard(next.id);
          handled = true;
          break;
        }
        case "workspace.newRoot":
          startNewRoot();
          handled = true;
          break;
        case "theme.toggle":
          toggleTheme();
          handled = true;
          break;
        case "selection.branch":
          if (selectedNode?.status === "complete") {
            createBranchDraft(selectedNode.id);
            handled = true;
          }
          break;
        case "selection.mute":
          if (selectedNode?.status === "complete") {
            toggleMuted(selectedNode.id);
            handled = true;
          }
          break;
        case "selection.merge":
          if (mergeDraftIds.length >= 2 && mergeCanConfirm) {
            confirmMergeDrafts();
            handled = true;
          } else if (selectedNode?.status === "draft") {
            startMerge(selectedNode.id);
            handled = true;
          }
          break;
        case "selection.stop":
          if (selectedNode?.status === "streaming") {
            stopGeneration(selectedNode.id);
            handled = true;
          }
          break;
        case "selection.resetSize":
          if (selectedNode?.size) {
            commitNodeSize(activeBoardId, selectedNode.id, undefined);
            handled = true;
          }
          break;
        case "selection.delete":
          handled = boardCanvasRef.current?.executeShortcut(command) ?? false;
          if (!handled && selectedNode) {
            deleteNode(selectedNode.id);
            handled = true;
          }
          break;
        default:
          handled = boardCanvasRef.current?.executeShortcut(command, event.shiftKey) ?? false;
      }

      if (handled) consume(event);
    };

    document.addEventListener("keydown", handleKeyDown, true);
    return () => document.removeEventListener("keydown", handleKeyDown, true);
  }, [
    activeBoardId,
    appMenuOpen,
    attachmentMenuOpen,
    boardMenuOpen,
    collection,
    confirmation,
    confirmMergeDrafts,
    mergeCanConfirm,
    mergeDraftIds,
    routePickerOpen,
    selectedNode,
    settings,
    settingsOpen,
    shortcutHelpOpen,
  ]);

  const confirmationBoard = confirmation && confirmation.kind !== "create-board"
    ? collection?.boards.find((board) => board.id === confirmation.boardId)
    : null;
  const confirmationNode = confirmation?.kind === "delete-node"
    ? confirmationBoard?.nodes.find((node) => node.id === confirmation.nodeId)
    : null;
  const deletedDescendantCount = confirmationNode && confirmationBoard
    ? getDescendantIds(confirmationBoard.nodes, confirmationNode.id).size - 1
    : 0;
  const confirmationCopy = (() => {
    if (!confirmation) return null;
    if (confirmation.kind === "create-board") {
      return {
        title: "Create whiteboard",
        body: "Give the new canvas a short, recognizable name.",
        action: "Create",
        destructive: false,
      };
    }
    if (confirmation.kind === "delete-board") {
      const board = confirmationBoard;
      const summary = board
        ? `${board.nodes.length} conversation${board.nodes.length === 1 ? "" : "s"}, ${board.notes.length} note${board.notes.length === 1 ? "" : "s"}, and ${board.strokes.length} stroke${board.strokes.length === 1 ? "" : "s"}`
        : "all of its content";
      return {
        title: `Delete ${board?.name ?? "whiteboard"}`,
        body: `This permanently deletes ${summary}.`,
        action: "Delete",
        destructive: true,
      };
    }
    if (confirmation.kind === "delete-node") {
      return {
        title: "Delete conversation",
        body: deletedDescendantCount
          ? `This also deletes ${deletedDescendantCount} descendant${deletedDescendantCount === 1 ? "" : "s"}.`
          : "This permanently deletes the selected conversation.",
        action: "Delete",
        destructive: true,
      };
    }
    if (confirmation.kind === "clear-conversations") {
      return {
        title: "Clear conversations",
        body: "Delete every conversation from this whiteboard. Sticky notes and pen strokes remain.",
        action: "Clear",
        destructive: true,
      };
    }
    return {
      title: "Clear annotations",
      body: "Delete every sticky note and pen stroke from this whiteboard. Conversations remain.",
      action: "Clear",
      destructive: true,
    };
  })();

  if (!hydrated) {
    return (
      <main className="loading-screen">
        <ProgressIndicator label="Opening Branchboard" />
        <p>Opening canvas...</p>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <MaterialSymbol name="account_tree" filled />
          </span>
          <div>
            <strong>Branchboard</strong>
            <span>AI whiteboard</span>
          </div>
        </div>

        <div className="topbar-center">
          <div className="board-picker">
            <Button
              ref={boardMenuTriggerRef}
              variant="text"
              trailingIcon="arrow_drop_down"
              aria-haspopup="menu"
              aria-expanded={boardMenuOpen}
              onClick={() => {
                setAppMenuOpen(false);
                setBoardMenuOpen((open) => !open);
              }}
            >
              {activeBoard?.name ?? "Board"}
            </Button>
            <Menu
              open={boardMenuOpen}
              anchorRef={boardMenuTriggerRef}
              label="Whiteboards"
              onRequestClose={() => setBoardMenuOpen(false)}
            >
              {(collection?.boards ?? []).map((board) => (
                <MenuItem
                  key={board.id}
                  role="menuitemradio"
                  checked={board.id === activeBoardId}
                  onSelect={() => switchWhiteboard(board.id)}
                >
                  {board.name}
                </MenuItem>
              ))}
              <MenuItem onSelect={addWhiteboard}>
                <MaterialSymbol name="add" /> Create whiteboard
              </MenuItem>
              <MenuItem className="md-menu__item--error" onSelect={deleteActiveWhiteboard}>
                <MaterialSymbol name="delete" /> Delete current whiteboard
              </MenuItem>
            </Menu>
          </div>
         </div>

        <aside className="workspace-status" aria-label="Whiteboard status">
          <div className="context-readout" aria-label={`${includedCount} exchanges in active context`}>
            <span>Active context</span>
            <strong>{String(includedCount).padStart(2, "0")}</strong>
          </div>
          <div
            className="usage-readout"
            aria-label={
              boardUsage.recordedNodes
                ? `${boardUsage.estimated ? "Includes estimated usage. " : ""}${formatTokenCount(boardUsage.totalTokens)} recorded tokens across ${boardUsage.recordedNodes} node${boardUsage.recordedNodes === 1 ? "" : "s"}. Legacy nodes are not included.`
                : "No recorded token usage yet. Legacy nodes are not included."
            }
          >
            <span>Board tokens</span>
            <strong>
              {boardUsage.estimated ? "~" : ""}
              {formatTokenCount(boardUsage.totalTokens, true)}
            </strong>
          </div>
        </aside>

        <div className="topbar-actions">
          <Button
            variant="filled"
            leadingIcon="add"
            aria-keyshortcuts="Shift+R"
            onClick={startNewRoot}
          >
            New root
          </Button>
          <IconButton
            ref={appMenuTriggerRef}
            label="More app actions"
            icon="more_vert"
            tooltipPlacement="below"
            aria-haspopup="menu"
            aria-expanded={appMenuOpen}
            onClick={() => {
              setBoardMenuOpen(false);
              setAppMenuOpen((open) => !open);
            }}
          />
          <Menu
            open={appMenuOpen}
            anchorRef={appMenuTriggerRef}
            label="App actions"
            onRequestClose={() => setAppMenuOpen(false)}
          >
            <MenuItem onSelect={startNewRoot}>
              <MaterialSymbol name="add" /> New root conversation
            </MenuItem>
            <MenuItem onSelect={toggleTheme}>
              <MaterialSymbol name={resolvedTheme === "dark" ? "light_mode" : "dark_mode"} />
              Use {resolvedTheme === "dark" ? "light" : "dark"} theme
            </MenuItem>
            <MenuItem onSelect={() => {
              setSettingsOpen(false);
              setShortcutHelpOpen(true);
            }}>
              <MaterialSymbol name="keyboard" /> Keyboard shortcuts
            </MenuItem>
            <MenuItem onSelect={openSettings}>
              <MaterialSymbol name="settings" /> Settings
            </MenuItem>
          </Menu>
        </div>
      </header>

      <section className="canvas" aria-label="Conversation graph">
        <BoardCanvas
          ref={boardCanvasRef}
          key={activeBoardId}
          boardId={activeBoardId}
          conversations={nodes}
          notes={activeBoard?.notes ?? []}
          strokes={activeBoard?.strokes ?? []}
          viewport={activeBoard?.viewport}
          selectedNodeId={selectedNodeId}
          mergeDraftIds={mergeDraftIds}
          onSelect={selectNode}
          onCreateBranch={createBranchDraft}
          onRetry={beginRetry}
          onStartMerge={startMerge}
          onToggleMuted={toggleMuted}
          onColorCommit={commitConversationColor}
          onStop={stopGeneration}
          onDelete={deleteNode}
          onPositionCommit={commitNodePosition}
          onSizeCommit={commitNodeSize}
          onNoteCreate={createNote}
          onNotePositionCommit={commitNotePosition}
          onNoteSizeCommit={commitNoteSize}
          onNoteTextCommit={commitNoteText}
          onNoteColorCommit={commitNoteColor}
          onNoteDelete={deleteNote}
          onStrokesCommit={commitStrokes}
          onSelectionMoveCommit={commitSelectionMove}
          onViewportCommit={commitViewport}
          onNotice={setNotice}
          onClearSelection={clearSelection}
          theme={resolvedTheme}
        />

        {nodes.length === 0 &&
          (activeBoard?.notes.length ?? 0) === 0 &&
          (activeBoard?.strokes.length ?? 0) === 0 && (
            <div className="empty-state">
              <div className="empty-illustration" aria-hidden="true">
                <MaterialSymbol name="account_tree" size={40} filled />
              </div>
              <span className="empty-kicker">A workspace for ideas</span>
              <h1>One conversation.<br />Many ways forward.</h1>
              <p>
                Start with one prompt. Branch to explore a direction, compare
                answers, and bring the useful parts together.
              </p>
              <div className="empty-workflow" aria-label="Prompt, branch, and merge">
                <span><MaterialSymbol name="edit_note" size={20} /> Prompt</span>
                <span className="workflow-arrow" aria-hidden="true">→</span>
                <span><MaterialSymbol name="account_tree" size={20} /> Branch</span>
                <span className="workflow-arrow" aria-hidden="true">→</span>
                <span><MaterialSymbol name="merge_type" size={20} /> Merge</span>
              </div>
              <Button
                variant="filled"
                className="empty-start-button"
                leadingIcon={getProviderConfigError(settings) ? "settings" : "edit_note"}
                onClick={() => {
                  if (getProviderConfigError(settings)) openSettings();
                  else composerRef.current?.focus();
                }}
              >
                {getProviderConfigError(settings) ? "Add a model" : "Start a conversation"}
              </Button>
              <span className="empty-state-hint">
                {getProviderConfigError(settings)
                  ? "Add a provider in Settings to send your first prompt."
                  : "You can change models for any new branch."}
              </span>
            </div>
          )}
      </section>

      <section className="composer-wrap">
        <div className={`composer-context${mergeDraftIds.length ? " is-merge" : selectedNode ? " is-branch" : " is-root"}`}>
          <MaterialSymbol name="account_tree" size={20} />
          {mergeDraftIds.length ? (
            <div className="merge-session-summary">
              <span>
                Merge basket <b>{mergeDraftIds.length} drafts · {mergeParentCount} parents</b>
              </span>
              <Button
                variant="filled"
                disabled={!mergeCanConfirm}
                onClick={confirmMergeDrafts}
              >
                Confirm
              </Button>
              <Button variant="text" onClick={() => setMergeDraftIds([])}>
                Cancel
              </Button>
            </div>
          ) : selectedNode?.status === "draft" ? (
            <span>
              {selectedNode.parentIds.length > 1 ? "Merged draft" : "Empty branch"}
              {" · "}<b>{selectedNode.parentIds.length} parent{selectedNode.parentIds.length === 1 ? "" : "s"}</b>
            </span>
          ) : selectedNodeId ? (
            <span>Branching from <b>{selectedNodeId.slice(0, 6)}</b></span>
          ) : (
            <span>Starting a new root</span>
          )}
        </div>
        <div className="composer">
          <div className="attachment-picker">
            <IconButton
              ref={attachmentMenuTriggerRef}
              label="Add attachments"
              icon="attach_file"
              className="attachment-picker-trigger"
              aria-expanded={attachmentMenuOpen}
              aria-haspopup="menu"
              onClick={() => {
                closeRoutePicker();
                setAttachmentMenuOpen((open) => !open);
              }}
            />
            <Menu
              open={attachmentMenuOpen}
              anchorRef={attachmentMenuTriggerRef}
              label="Add attachments"
              onRequestClose={() => setAttachmentMenuOpen(false)}
            >
              <MenuItem onSelect={() => imageInputRef.current?.click()}>
                <MaterialSymbol name="image" />
                <span><strong>Images</strong><small>Photos and diagrams</small></span>
              </MenuItem>
              <MenuItem onSelect={() => videoInputRef.current?.click()}>
                <MaterialSymbol name="movie" />
                <span><strong>Videos</strong><small>Gemini vision models</small></span>
              </MenuItem>
              <MenuItem onSelect={() => fileInputRef.current?.click()}>
                <MaterialSymbol name="description" />
                <span><strong>Files</strong><small>PDF, text, code, and documents</small></span>
              </MenuItem>
            </Menu>
            <input
              ref={imageInputRef}
              className="attachment-input"
              type="file"
              accept="image/*"
              multiple
              tabIndex={-1}
              onChange={(event) => {
                addPendingFiles(Array.from(event.currentTarget.files ?? []));
                event.currentTarget.value = "";
              }}
            />
            <input
              ref={videoInputRef}
              className="attachment-input"
              type="file"
              accept="video/*"
              multiple
              tabIndex={-1}
              onChange={(event) => {
                addPendingFiles(Array.from(event.currentTarget.files ?? []));
                event.currentTarget.value = "";
              }}
            />
            <input
              ref={fileInputRef}
              className="attachment-input"
              type="file"
              multiple
              tabIndex={-1}
              onChange={(event) => {
                addPendingFiles(Array.from(event.currentTarget.files ?? []));
                event.currentTarget.value = "";
              }}
            />
          </div>
          <div className="composer-body">
            <AttachmentTray
              attachments={pendingAttachments}
              onRemove={removePendingAttachment}
            />
            <MarkdownComposer
              ref={composerRef}
              value={prompt}
              maxLength={12000}
              placeholder={selectedNode?.status === "draft"
                ? "Write this empty node..."
                : selectedNodeId
                  ? "Take this branch somewhere new..."
                  : "Plant the first idea..."}
               onChange={setPrompt}
               onFiles={addPendingFiles}
               onSubmit={(value) => void submitPrompt(value)}
             />
          </div>
          <div className="route-picker">
            <Button
              ref={routePickerTriggerRef}
              variant="text"
              trailingIcon="arrow_drop_down"
              className="route-picker-trigger"
              aria-expanded={routePickerOpen}
              aria-haspopup="dialog"
              onClick={() => {
                setAttachmentMenuOpen(false);
                if (routePickerOpen) closeRoutePicker();
                else setRoutePickerOpen(true);
              }}
            >
              <span>
                {retryRoute ? "Retry · " : ""}
                {getProviderLabel(routeSettings.provider)} · {routeProviderConfig.model || "Select model"}
              </span>
            </Button>
          </div>
          <Button
            variant="filled"
            leadingIcon="send"
            className="send-button"
            disabled={
              mergeDraftIds.length > 0 ||
              (!prompt.trim() && !pendingAttachments.length) ||
              Boolean(
                selectedNode &&
                selectedNode.status !== "complete" &&
                selectedNode.status !== "draft",
              )
            }
            onClick={() => void submitPrompt()}
          >
            Send
          </Button>
        </div>
        <span className="composer-hint">
          <MaterialSymbol name="attach_file" size={20} /> Paste or drop files · Markdown + LaTeX · Shift+Enter for a new line
        </span>
      </section>

      <Dialog
        open={routePickerOpen}
        labelledBy="model-dialog-title"
        variant={compactViewport ? "fullscreen" : "basic"}
        returnFocusRef={routePickerTriggerRef}
        onRequestClose={closeRoutePicker}
      >
        <section className="model-dialog">
          <header className="material-dialog-header">
            <div>
              <span className="panel-kicker">Generation route</span>
              <h2 id="model-dialog-title">
                {retryRoute ? "Retry as sibling" : "Choose model"}
              </h2>
              <p>
                {retryRoute
                  ? "This provider and model apply to the sibling generation only."
                  : "Choose the provider and model for new conversations."}
              </p>
            </div>
            <IconButton label="Close model dialog" icon="close" onClick={closeRoutePicker} />
          </header>
          <div className="material-field-grid">
            <label htmlFor="composer-provider">Provider</label>
            <select
              id="composer-provider"
              aria-label={retryRoute ? "Provider for sibling retry" : "Provider for next node"}
              value={routeSettings.provider}
              disabled={refreshingModels !== null}
              onChange={(event) => changeRouteProvider(event.target.value as ProviderId)}
            >
              {PROVIDER_OPTIONS.map((provider) => (
                <option key={provider.id} value={provider.id}>{provider.label}</option>
              ))}
            </select>
            <div className="route-picker-model-label">
              <label htmlFor="composer-model">Model</label>
              <IconButton
                label={`Refresh ${getProviderLabel(routeSettings.provider)} models`}
                icon="refresh"
                disabled={refreshingModels !== null}
                className={refreshingModels === routeSettings.provider ? "spin" : ""}
                onClick={() => void refreshComposerModels()}
              />
            </div>
            <select
              id="composer-model"
              className="composer-model-select"
              aria-label={retryRoute ? "Model for sibling retry" : "Model for next node"}
              value={routeProviderConfig.model}
              disabled={refreshingModels !== null}
              onChange={(event) => changeRouteModel(event.target.value)}
            >
              {!routeProviderConfig.model && <option value="">Refresh models to choose</option>}
              {routeModels.map((model) => (
                <option key={model.id} value={model.id}>
                  {model.name && model.name !== model.id ? `${model.name} (${model.id})` : model.id}
                </option>
              ))}
            </select>
          </div>
          <footer className="material-dialog-actions">
            <Button variant="text" onClick={closeRoutePicker}>Cancel</Button>
            {retryRoute ? (
              <Button
                variant="filled"
                disabled={refreshingModels !== null || !routeProviderConfig.model}
                onClick={confirmRetry}
              >
                Generate sibling
              </Button>
            ) : null}
          </footer>
        </section>
      </Dialog>

      <Dialog
        open={shortcutHelpOpen}
        labelledBy="shortcut-dialog-title"
        variant={compactViewport ? "fullscreen" : "basic"}
        returnFocusRef={shortcutsTriggerRef}
        onRequestClose={closeShortcutHelp}
      >
        <ShortcutHelpDialog onClose={closeShortcutHelp} />
      </Dialog>

      <SideSheet
        open={settingsOpen}
        modal={compactViewport}
        labelledBy="settings-panel-title"
        onRequestClose={closeSettings}
      >
        <SettingsPanel
          settings={draftSettings}
          boardName={activeBoard?.name ?? "this whiteboard"}
          onChange={setDraftSettings}
          onSave={saveSettingsForm}
          onClose={closeSettings}
          onClearConversations={clearConversations}
          onClearAnnotations={clearAnnotations}
        />
      </SideSheet>

      <Dialog
        open={confirmation !== null}
        labelledBy="confirmation-dialog-title"
        describedBy="confirmation-dialog-body"
        initialFocusRef={confirmation?.kind === "create-board" ? confirmationInputRef : undefined}
        dismissible
        onRequestClose={() => setConfirmation(null)}
      >
        {confirmationCopy ? (
          <section className="confirmation-dialog">
            <h2 id="confirmation-dialog-title">{confirmationCopy.title}</h2>
            <p id="confirmation-dialog-body">{confirmationCopy.body}</p>
            {confirmation?.kind === "create-board" ? (
              <label className="material-text-field" htmlFor="new-board-name">
                <span>Whiteboard name</span>
                <input
                  ref={confirmationInputRef}
                  id="new-board-name"
                  value={confirmation.name}
                  maxLength={60}
                  onChange={(event) => setConfirmation({
                    ...confirmation,
                    name: event.target.value,
                  })}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") confirmPendingAction();
                  }}
                />
              </label>
            ) : null}
            <footer className="material-dialog-actions">
              <Button variant="text" onClick={() => setConfirmation(null)}>Cancel</Button>
              <Button
                variant={confirmationCopy.destructive ? "text" : "filled"}
                tone={confirmationCopy.destructive ? "error" : "default"}
                onClick={confirmPendingAction}
              >
                {confirmationCopy.action}
              </Button>
            </footer>
          </section>
        ) : null}
      </Dialog>

      <SnackbarHost
        message={notice ? { id: notice, text: notice, durationMs: 6000 } : null}
        onDismiss={() => setNotice("")}
      />
    </main>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <WorkspaceApp />
    </ReactFlowProvider>
  );
}
