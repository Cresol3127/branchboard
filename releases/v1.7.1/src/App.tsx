import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  MarkerType,
  SelectionMode,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useNodesInitialized,
  getViewportForBounds,
  type OnConnectStartParams,
  type XYPosition,
} from '@xyflow/react';
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  Blocks,
  Check,
  FolderOpen,
  GitBranch,
  Grid2X2,
  ImageDown,
  HelpCircle,
  LayoutGrid,
  Map,
  Maximize,
  MousePointer2,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeftOpen,
  Pencil,
  Plus,
  Search,
  Settings as SettingsIcon,
  StickyNote,
  Star,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  MoreHorizontal,
  Scan,
  Type,
  Unlink,
} from 'lucide-react';
import { absolutePosition, canConnect, workspaceTokenCounts, contextNodesFor } from './graph';
import { currentBoard, saveWorkspace, useStore, workspaceBackup } from './store';
import { CanvasNode } from './components/Nodes';
import { MessageBar } from './components/MessageBar';
import { useModelDiscovery } from './components/useModelDiscovery';
import { Help, Settings } from './components/Settings';
import { useCanvasLayout } from './components/useCanvasLayout';
import { IconButton, Menu, Modal } from './components/ui';
import { colorTokens } from './theme';
import type { BoardNode } from './types';
import type { SearchResult } from './search';
import { HistorySearch } from './components/HistorySearch';
import { Backups } from './components/Backups';
import { Annotations } from './components/Annotations';
import { annotationBounds } from './annotations';
import { CanvasExport } from './components/CanvasExport';
import { ConversationImport } from './components/ConversationImport';
import { WorkspaceLibrary } from './components/WorkspaceLibrary';
import { folderPath, folderSubtree } from './organization';

const nodeTypes = { chat: CanvasNode, note: CanvasNode, group: CanvasNode };
type Theme = 'light' | 'dark' | 'system';
type Action = { label: string; run: () => void; category?: string; available?: boolean };

function download(name: string, content: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function Workspace() {
  useModelDiscovery();
  const state = useStore(),
    board = currentBoard(state),
    flow = useReactFlow<BoardNode>();
  const nodesInitialized = useNodesInitialized();
  const initiallyFitted = useRef(new Set<string>());
  const hasSelection = board.nodes.some((n) => n.selected);
  const tokenCounts = workspaceTokenCounts(board.nodes);
  const hasDeletion = hasSelection || board.edges.some((e) => e.selected);
  const generating = Object.values(state.streaming).some(Boolean);
  const canUndo = Boolean(state.past.length) && !generating;
  const canRedo = Boolean(state.future.length) && !generating;
  const shortcut = /Mac|iPhone|iPad/.test(navigator.platform) ? '⌘ K' : 'Ctrl K';
  const [palette, setPalette] = useState(false),
    [query, setQuery] = useState(''),
    [active, setActive] = useState(0);
  const [help, setHelp] = useState(false),
    [grid, setGrid] = useState(false),
    [minimap, setMinimap] = useState(false);
  const [textSelection, setTextSelection] = useState(false);
  const [spacePressed, setSpacePressed] = useState(false);
  const [utilities, setUtilities] = useState<{ x: number; y: number } | null>(null);
  const [historySearch, setHistorySearch] = useState(false);
  const [historyQuery, setHistoryQuery] = useState('');
  const [backups, setBackups] = useState(false);
  const [conversationImport, setConversationImport] = useState(false);
  const [library, setLibrary] = useState<'projects' | 'templates' | null>(null);
  const [folderFilter, setFolderFilter] = useState('all');
  const [favoritesOnly, setFavoritesOnly] = useState(false);
  const { folders, boardFolders, favoriteBoardIds } = state.organization;
  const activeFolderFilter = folders.some((f) => f.id === folderFilter)
    ? folderFilter
    : folderFilter === 'unfiled'
      ? 'unfiled'
      : 'all';
  const visibleFolders = folderSubtree(activeFolderFilter, folders);
  const visibleBoards = state.boards.filter(
    (b) =>
      (!favoritesOnly || favoriteBoardIds.includes(b.id)) &&
      (activeFolderFilter === 'all' ||
        (activeFolderFilter === 'unfiled'
          ? !boardFolders[b.id]
          : visibleFolders.has(boardFolders[b.id]))),
  );
  const [exportFormat, setExportFormat] = useState<'png' | 'pdf' | null>(null);
  const [annotationsOpen, setAnnotationsOpen] = useState(false);
  const [readyBoardId, setReadyBoardId] = useState<string | null>(null);
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const saved = localStorage.getItem('branchboard.theme');
      return saved === 'light' || saved === 'dark' ? saved : 'system';
    } catch {
      return 'system';
    }
  });
  const [dark, setDark] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(() => {
    try {
      return localStorage.getItem('branchboard.sidebarCollapsed') === 'true';
    } catch {
      return false;
    }
  });
  useEffect(() => {
    try {
      localStorage.setItem('branchboard.sidebarCollapsed', String(sidebarCollapsed));
    } catch {
      // The toggle still works when browser storage is unavailable.
    }
  }, [sidebarCollapsed]);
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null);
  const [suggested, setSuggested] = useState<string | null>(null);
  const connection = useRef<OnConnectStartParams | null>(null),
    candidate = useRef<string | null>(null);
  const connected = useRef(false);
  const dragStart = useRef<XYPosition | null>(null);
  const file = useRef<HTMLInputElement>(null),
    canvas = useRef<HTMLElement>(null);
  useCanvasLayout(canvas, minimap, board.id);
  const fitPadding = useCallback(
    () => ({
      top: '88px' as const,
      bottom:
        `${Number.parseFloat(canvas.current?.style.getPropertyValue('--canvas-bottom-reserved') || '') || (canvas.current?.querySelector<HTMLElement>('.message-bar')?.offsetHeight || 90) + 104}px` as `${number}px`,
      left: '32px' as const,
      right: '32px' as const,
    }),
    [],
  );
  const focusComposer = () =>
    document.querySelector<HTMLTextAreaElement>('.unified-composer textarea')?.focus();
  const related = useMemo(() => {
    const ids = new Set(board.nodes.filter((n) => n.selected).map((n) => n.id));
    for (const edge of board.edges) {
      if (board.nodes.some((n) => n.selected && (n.id === edge.source || n.id === edge.target))) {
        ids.add(edge.source);
        ids.add(edge.target);
      }
    }
    return ids;
  }, [board.nodes, board.edges]);
  const selectedEdge = board.edges.find((edge) => edge.selected);
  const fit = useCallback(() => {
    const b = currentBoard(useStore.getState());
    const saveViewport = () => {
      if (useStore.getState().currentId === b.id)
        useStore.getState().setViewport(flow.getViewport());
    };
    const bounds = annotationBounds(b.annotations);
    if (bounds) {
      let { x, y } = bounds;
      let right = x + bounds.width,
        bottom = y + bounds.height;
      for (const n of b.nodes) {
        const p = absolutePosition(n, b.nodes);
        x = Math.min(x, p.x);
        y = Math.min(y, p.y);
        right = Math.max(right, p.x + (Number(n.style?.width) || 340));
        bottom = Math.max(bottom, p.y + (Number(n.style?.height) || 380));
      }
      const rect = canvas.current!.getBoundingClientRect();
      void flow
        .setViewport(
          getViewportForBounds(
            { x, y, width: right - x, height: bottom - y },
            rect.width,
            rect.height,
            0.15,
            1,
            fitPadding(),
          ),
          { duration: 250 },
        )
        .then(saveViewport);
      return;
    }
    void flow.fitView({ padding: fitPadding(), duration: 250, maxZoom: 1 }).then(() => {
      // Fit can be a no-op after undo even though its saved viewport is older.
      saveViewport();
    });
  }, [flow, fitPadding]);
  useEffect(() => {
    if (
      (!nodesInitialized && board.nodes.length > 0) ||
      readyBoardId !== board.id ||
      !flow.viewportInitialized ||
      initiallyFitted.current.has(board.id)
    )
      return;
    initiallyFitted.current.add(board.id);
    if (!board.viewport) {
      // On phones, start with one readable card rather than a miniature whole board.
      if (window.matchMedia('(max-width: 700px)').matches && board.nodes.length) {
        const first = board.nodes.find((n) => n.type === 'chat') || board.nodes[0];
        void flow.fitView({
          nodes: [{ id: first.id }],
          padding: fitPadding(),
          minZoom: 0.75,
          maxZoom: 1,
        });
      } else if (board.annotations?.items.length) fit();
      else void flow.fitView({ padding: fitPadding(), maxZoom: 1 });
    }
  }, [
    board.id,
    board.nodes.length,
    board.annotations,
    board.viewport,
    fit,
    fitPadding,
    flow,
    nodesInitialized,
    readyBoardId,
  ]);
  const historyTarget = state.historyTarget;
  useEffect(() => {
    if (!nodesInitialized || !historyTarget || historyTarget.boardId !== board.id) return;
    let cancelled = false;
    void flow
      .fitView({
        nodes: [{ id: historyTarget.nodeId }],
        padding: fitPadding(),
        maxZoom: 1,
        duration: 200,
      })
      .then(() => {
        if (cancelled || historyTarget.focus === false) return;
        const node = [...document.querySelectorAll<HTMLElement>('.react-flow__node')].find(
          (el) => el.dataset.id === historyTarget.nodeId,
        );
        const message = [...(node?.querySelectorAll<HTMLElement>('[data-message-id]') || [])].find(
          (el) => el.dataset.messageId === historyTarget.messageId,
        );
        const container = message?.closest<HTMLElement>('.messages');
        if (message && container) {
          // DOM rectangles are zoomed by React Flow, but scrollTop is in local CSS pixels.
          container.scrollTop +=
            (message.getBoundingClientRect().top - container.getBoundingClientRect().top) /
              flow.getZoom() -
            8;
          message.focus({ preventScroll: true });
        } else
          node
            ?.querySelector<HTMLElement>('.note-editor, .node-title')
            ?.focus({ preventScroll: true });
      });
    return () => {
      cancelled = true;
    };
  }, [board.id, flow, fitPadding, historyTarget, nodesInitialized]);
  const openSearchResult = (result: SearchResult) => {
    setHistorySearch(false);
    if (state.currentId !== result.boardId) state.switchBoard(result.boardId);
    const target = currentBoard(useStore.getState());
    useStore
      .getState()
      .nodesChange(
        target.nodes.map((n) => ({ type: 'select', id: n.id, selected: n.id === result.nodeId })),
      );
    if (target.nodes.find((n) => n.id === result.nodeId)?.data.collapsed)
      useStore.getState().updateNode(result.nodeId, { collapsed: false }, true);
    // A new object also permits navigating to the same result more than once.
    useStore.setState({
      historyTarget: {
        boardId: result.boardId,
        nodeId: result.nodeId,
        messageId: result.messageId,
      },
    });
  };
  const positionFor = (type: BoardNode['type'], point?: XYPosition) => {
    const rect = canvas.current!.querySelector('.react-flow')!.getBoundingClientRect();
    const center = flow.screenToFlowPosition({
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    });
    const height = type === 'note' ? 260 : 380;
    const position = point || { x: center.x - 170, y: center.y - height / 2 };
    {
      // Place beside existing content, never on top of it.
      const obstacles = board.nodes.filter((n) => n.type !== 'group');
      while (
        obstacles.some((n) => {
          const p = absolutePosition(n, board.nodes);
          return (
            position.x < p.x + Number(n.style?.width || 340) + 32 &&
            position.x + 340 + 32 > p.x &&
            position.y < p.y + Number(n.style?.height || 380) + 32 &&
            position.y + height + 32 > p.y
          );
        })
      )
        position.x += 388;
    }
    return position;
  };
  const add = (type: BoardNode['type'], point?: XYPosition) => {
    const id = state.addNode(type, positionFor(type, point));
    if (!point) requestAnimationFrame(() => requestAnimationFrame(fit));
    requestAnimationFrame(() =>
      requestAnimationFrame(() => {
        if (type === 'chat') focusComposer();
        else
          document
            .querySelector<HTMLElement>(`.react-flow__node[data-id="${id}"] .note-editor`)
            ?.focus();
      }),
    );
  };
  const exportJSON = () => {
    saveWorkspace();
    download(
      `${board.name || 'Untitled canvas'}.json`,
      JSON.stringify({ version: 1, board }, null, 2),
      'application/json',
    );
  };
  const exportMarkdown = () =>
    download(
      `${board.name || 'Untitled canvas'}.md`,
      `# ${board.name}\n\n` +
        board.nodes
          .filter((n) => n.type !== 'group')
          .map(
            (n) =>
              `## ${n.data.title}\n\n${n.type === 'note' ? n.data.note : n.data.messages.map((m) => `### ${m.role}\n\n${m.content}`).join('\n\n')}`,
          )
          .join('\n\n'),
      'text/markdown',
    );
  const exportWorkspace = () => {
    const content = JSON.stringify(workspaceBackup(), null, 2);
    if (new Blob([content]).size > 20_000_000)
      throw new Error(
        'Workspace backup exceeds the 20 MB import limit. Export individual canvases and remove older snapshots first.',
      );
    download('branchboard-workspace.json', content, 'application/json');
  };

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)');
    const apply = () => {
      const dark = theme === 'dark' || (theme === 'system' && media.matches);
      setDark(dark);
      document.documentElement.dataset.theme = dark ? 'dark' : 'light';
      Object.entries(colorTokens('#8DB89A', dark)).forEach(([key, value]) =>
        document.documentElement.style.setProperty(key, value),
      );
    };
    apply();
    media.addEventListener('change', apply);
    try {
      localStorage.setItem('branchboard.theme', theme);
    } catch {
      /* Workspace saving reports unavailable storage. */
    }
    return () => media.removeEventListener('change', apply);
  }, [theme]);
  useEffect(() => {
    const controller = new AbortController();
    void fetch('/api/config', { signal: controller.signal })
      .then(async (res) => {
        if (!res.ok) throw new Error('API unavailable');
        const config = await res.json();
        useStore.getState().applyConfig(config);
      })
      .catch((error) => {
        if (!controller.signal.aborted)
          useStore.setState({ toast: `Local AI server unavailable: ${error.message}` });
      });
    return () => controller.abort();
  }, []);
  useEffect(() => {
    if (!state.toast) return;
    const timer = setTimeout(() => useStore.setState({ toast: '' }), 5000);
    return () => clearTimeout(timer);
  }, [state.toast]);

  const actions: Action[] = [
    { label: 'New conversation', run: () => add('chat') },
    { label: 'New note', run: () => add('note') },
    { label: 'Drawing & annotations', run: () => setAnnotationsOpen(true) },
    { label: 'New canvas', run: state.newBoard },
    { label: 'Projects & folders', run: () => setLibrary('projects') },
    { label: 'Canvas templates', run: () => setLibrary('templates') },
    {
      label: favoriteBoardIds.includes(board.id)
        ? 'Unfavorite current canvas'
        : 'Favorite current canvas',
      run: () => state.toggleFavorite(board.id),
    },
    {
      label: 'Search saved content',
      run: () => {
        setHistoryQuery('');
        setHistorySearch(true);
      },
    },
    { label: 'Focus message composer', run: focusComposer },
    {
      label: textSelection ? 'Disable text selection mode' : 'Enable text selection mode',
      run: () => setTextSelection((value) => !value),
    },
    { label: 'Reset zoom', run: () => void flow.zoomTo(1, { duration: 180 }) },

    { label: 'Duplicate selection', run: state.duplicate, available: hasSelection },
    { label: 'Copy selected nodes', run: state.copySelection, available: hasSelection },
    {
      label: 'Paste nodes',
      run: () => state.pasteSelection(positionFor('chat')),
      available: Boolean(state.nodeClipboard),
    },
    { label: 'Delete selection', run: removeSelection, available: hasDeletion },
    { label: 'Undo', run: state.undo, available: canUndo },
    { label: 'Redo', run: state.redo, available: canRedo },
    {
      label: 'Auto-arrange nodes',
      available: board.nodes.length > 1,
      run: () => {
        state.layout();
        setTimeout(fit, 50);
      },
    },
    {
      label: 'Fit canvas',
      run: fit,
      available: board.nodes.length > 0 || !!board.annotations?.items.length,
    },
    { label: 'Zoom in', run: () => void flow.zoomIn(), available: (board.viewport?.zoom || 1) < 2 },
    {
      label: 'Zoom out',
      run: () => void flow.zoomOut(),
      available: (board.viewport?.zoom || 1) > 0.15,
    },
    { label: 'Toggle minimap', run: () => setMinimap((v) => !v) },
    { label: 'Toggle grid', run: () => setGrid((v) => !v) },
    {
      label: sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar',
      run: () => setSidebarCollapsed((value) => !value),
    },
    { label: 'Settings', run: () => useStore.setState({ settingsOpen: true }) },
    { label: 'Keyboard shortcuts & help', run: () => setHelp(true) },
    { label: 'Export board backup (JSON)', run: exportJSON },
    { label: 'Backups & snapshots', run: () => setBackups(true) },
    { label: 'Export Markdown', run: exportMarkdown },
    { label: 'Export canvas (PNG)', run: () => setExportFormat('png') },
    { label: 'Export canvas (PDF)', run: () => setExportFormat('pdf') },
    { label: 'Import board backup', run: () => file.current?.click() },
    { label: 'Import conversations', run: () => setConversationImport(true) },
    ...(['light', 'dark', 'system'] as const).map((value) => ({
      label: `Theme: ${value}`,
      run: () => setTheme(value),
      available: value !== theme,
    })),
    {
      label: 'Delete current canvas',
      run: () => {
        if (
          confirm('Delete this canvas and its conversations? Export a backup first if you need it.')
        )
          state.deleteBoard();
      },
    },
    ...state.boards
      .filter((b) => b.id !== board.id)
      .map((b) => ({
        label: `Switch canvas: ${b.name}`,
        run: () => state.switchBoard(b.id),
        category: 'Canvas',
      })),
    ...board.nodes.map((n) => ({
      label: `Find node: ${n.data.title}`,
      category: 'Node',
      run: () => {
        state.nodesChange(
          board.nodes.map((node) => ({ type: 'select', id: node.id, selected: node.id === n.id })),
        );
        void flow.fitView({
          nodes: [{ id: n.id }],
          padding: fitPadding(),
          maxZoom: 1,
          duration: 200,
        });
      },
    })),
  ];
  const filtered = actions.filter(
    (a) => a.available !== false && a.label.toLowerCase().includes(query.toLowerCase()),
  );
  useEffect(() => {
    document.getElementById(`command-${active}`)?.scrollIntoView({ block: 'nearest' });
  }, [active]);
  const openPalette = () => {
    setQuery('');
    setActive(0);
    setPalette(true);
  };
  const execute = (action: Action) => {
    setPalette(false);
    requestAnimationFrame(action.run);
  };
  function removeSelection() {
    const selected = board.nodes.filter((n) => n.selected);
    if (
      (selected.length < 5 && !selected.some((n) => n.type === 'group')) ||
      confirm('Delete the selected nodes and their connected content?')
    )
      state.removeSelected();
  }
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
        if (!document.querySelector('[role="dialog"]')) {
          e.preventDefault();
          openPalette();
        }
        return;
      }
      if (
        (e.target as HTMLElement).closest(
          'input, textarea, select, [contenteditable="true"], [role="dialog"], [role="menu"]',
        )
      )
        return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) state.redo();
        else state.undo();
      } else if (mod && e.key.toLowerCase() === 'd') {
        e.preventDefault();
        state.duplicate();
      } else if (
        mod &&
        e.key.toLowerCase() === 'c' &&
        hasSelection &&
        !window.getSelection()?.toString()
      ) {
        e.preventDefault();
        state.copySelection();
      } else if (mod && e.key.toLowerCase() === 'v' && state.nodeClipboard) {
        e.preventDefault();
        state.pasteSelection(positionFor('chat'));
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        removeSelection();
      } else if (!mod && e.key === '/') {
        e.preventDefault();
        focusComposer();
      } else if (!mod && e.key.toLowerCase() === 't') {
        setTextSelection((value) => !value);
      } else if (e.code === 'Space') {
        e.preventDefault();
        setSpacePressed(true);
      } else if (!mod && e.key.toLowerCase() === 'g') setGrid((v) => !v);
    };
    const release = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpacePressed(false);
    };
    const blur = () => setSpacePressed(false);
    window.addEventListener('keydown', key);
    window.addEventListener('keyup', release);
    window.addEventListener('blur', blur);
    return () => {
      window.removeEventListener('keydown', key);
      window.removeEventListener('keyup', release);
      window.removeEventListener('blur', blur);
    };
  });

  const nearestInput = (x: number, y: number) => {
    const start = connection.current;
    if (!start?.nodeId || start.handleType !== 'source') return null;
    const b = currentBoard(useStore.getState());
    let best: string | null = null,
      distance = 20;
    document.querySelectorAll<HTMLElement>('.react-flow__node .target').forEach((el) => {
      const id = el.closest<HTMLElement>('.react-flow__node')!.dataset.id!;
      if (!canConnect(start.nodeId!, id, b.edges)) return;
      const rect = el.getBoundingClientRect(),
        d = Math.hypot(rect.x + rect.width / 2 - x, rect.y + rect.height / 2 - y);
      if (d <= distance) {
        distance = d;
        best = id;
      }
    });
    return best;
  };
  useEffect(() => {
    const move = (e: PointerEvent) => {
      if (!connection.current) return;
      candidate.current = nearestInput(e.clientX, e.clientY);
      setSuggested(candidate.current);
    };
    window.addEventListener('pointermove', move);
    return () => window.removeEventListener('pointermove', move);
  });

  return (
    <div
      className={`workspace ${textSelection ? 'text-selection-mode' : ''} ${spacePressed ? 'space-panning' : ''}`}
    >
      <div className="sidebar-shell" data-collapsed={sidebarCollapsed}>
        <aside
          id="workspace-sidebar"
          className="workspace-sidebar"
          aria-label="Projects and boards"
        >
          <a href="/" className="brand" aria-label="Branchboard home">
            <span className="brand-mark">
              <GitBranch size={22} />
            </span>
            <span>
              branchboard<span className="brand-dot">.</span>
            </span>
          </a>
          <button
            className="board-link new-board"
            aria-label="New board"
            title="New canvas"
            onClick={() => {
              state.newBoard();
              if (folders.some((f) => f.id === activeFolderFilter))
                state.moveBoard(useStore.getState().currentId, activeFolderFilter);
              setFavoritesOnly(false);
            }}
          >
            <Plus size={24} />
            <span>New canvas</span>
          </button>
          <div className="workspace-section">
            <div className="project-heading">
              <span className="project-icon">
                <FolderOpen size={17} />
              </span>
              <button onClick={() => setLibrary('projects')}>Projects & folders</button>
            </div>
            <select
              aria-label="Filter canvases by project or folder"
              className="folder-filter"
              value={activeFolderFilter}
              onChange={(e) => setFolderFilter(e.target.value)}
            >
              <option value="all">All projects</option>
              <option value="unfiled">Unfiled</option>
              {[...folders]
                .sort((a, b) => folderPath(a.id, folders).localeCompare(folderPath(b.id, folders)))
                .map((f) => (
                  <option key={f.id} value={f.id}>
                    {folderPath(f.id, folders)}
                  </option>
                ))}
            </select>
            <div className="library-sidebar-actions">
              <button
                aria-pressed={favoritesOnly}
                onClick={() => setFavoritesOnly((value) => !value)}
              >
                <Star size={14} />
                Favorites
              </button>
              <button onClick={() => setLibrary('templates')}>
                <Blocks size={14} />
                Templates
              </button>
            </div>
          </div>
          <nav aria-label="Boards">
            <p className="section-label">Your canvases</p>
            {visibleBoards.map((b) => (
              <div className="board-row" key={b.id}>
                <button
                  aria-label={b.name || 'Untitled canvas'}
                  title={b.name || 'Untitled canvas'}
                  className={`board-link ${b.id === board.id ? 'active' : ''}`}
                  aria-current={b.id === board.id ? 'page' : undefined}
                  onClick={() => state.switchBoard(b.id)}
                >
                  <LayoutGrid size={16} />
                  <span>{b.name || 'Untitled canvas'}</span>
                  {b.id === board.id && <span className="active-dot" />}
                </button>
                <IconButton
                  label={`${favoriteBoardIds.includes(b.id) ? 'Unfavorite' : 'Favorite'} canvas: ${b.name || 'Untitled canvas'}`}
                  aria-pressed={favoriteBoardIds.includes(b.id)}
                  onClick={() => state.toggleFavorite(b.id)}
                >
                  <Star
                    size={14}
                    fill={favoriteBoardIds.includes(b.id) ? 'currentColor' : 'none'}
                  />
                </IconButton>
              </div>
            ))}
            {!visibleBoards.length && (
              <p className="muted empty-boards">No canvases match these filters.</p>
            )}
          </nav>
          <div className="sidebar-bottom">
            <button
              aria-label="Workspace utilities"
              title="Workspace utilities"
              onClick={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                setUtilities({ x: rect.left, y: rect.top - 220 });
              }}
            >
              <MoreHorizontal size={17} />
              <span>Workspace tools</span>
            </button>
            <button
              aria-label="Tips & shortcuts"
              title="Tips & shortcuts"
              onClick={() => setHelp(true)}
            >
              <HelpCircle size={17} />
              <span>Tips & shortcuts</span>
            </button>
            <button
              aria-label="Settings"
              title="Settings"
              onClick={() => useStore.setState({ settingsOpen: true })}
            >
              <SettingsIcon size={17} />
              <span>Settings</span>
            </button>
            <p className="local-status">Local workspace · browser autosave</p>
          </div>
        </aside>
      </div>
      <main className="workspace-main">
        <header className="workspace-header">
          <div className="header-left">
            <IconButton
              label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
              aria-expanded={!sidebarCollapsed}
              aria-controls="workspace-sidebar"
              onClick={() => setSidebarCollapsed((value) => !value)}
            >
              {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
            </IconButton>
            <div className="breadcrumbs">
              <input
                aria-label="Canvas name"
                value={board.name}
                onChange={(e) => state.renameBoard(e.target.value)}
                onBlur={() => {
                  if (!board.name.trim()) state.renameBoard('Untitled canvas');
                }}
              />
            </div>
          </div>
          <button className="search-button header-search" aria-label="Search" onClick={openPalette}>
            <Search size={20} />
            <span>Search your workspace</span>
            <kbd>{shortcut}</kbd>
          </button>
          <div className="header-right">
            <span className="saved">
              {!state.storageError && <Check size={13} />}
              {state.storageError ? 'Not saved' : 'Autosave enabled'}
            </span>
            <button
              className="ai-status"
              aria-label="AI provider settings"
              onClick={() => useStore.setState({ settingsOpen: true })}
            >
              <span className={state.configured ? 'online-dot' : 'offline-dot'} />
              {state.configured ? 'AI configured' : 'Connect AI'}
            </button>
            <IconButton
              label={dark ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => setTheme(dark ? 'light' : 'dark')}
            >
              {dark ? <Sun size={17} /> : <Moon size={17} />}
            </IconButton>
          </div>
        </header>
        <section ref={canvas} className="canvas-area" aria-label="Infinite canvas">
          <div className="canvas-caption">
            <h1>{board.nodes.length ? 'Your ideas, connected.' : 'Make room for an idea.'}</h1>
            <p>
              {board.nodes.length
                ? 'Connect nodes to share context.'
                : 'Start with a conversation, or put a thought on a note.'}
            </p>
          </div>
          <div className="board-tools" role="toolbar" aria-label="Board tools">
            <button
              className="add-conversation"
              aria-label="Add conversation"
              onClick={() => add('chat')}
            >
              <Plus size={18} />
              <span>Conversation</span>
            </button>
            <IconButton label="Add note" onClick={() => add('note')}>
              <StickyNote size={19} />
            </IconButton>
            <IconButton
              label="Drawing & annotations"
              aria-pressed={annotationsOpen}
              onClick={() => setAnnotationsOpen((v) => !v)}
            >
              <Pencil size={19} />
            </IconButton>
            <IconButton
              label="Text selection mode"
              title="Select and copy card text (T)"
              aria-pressed={textSelection}
              onClick={() => setTextSelection((value) => !value)}
            >
              <Type size={17} />
            </IconButton>

            {board.nodes.length > 1 && (
              <IconButton
                label="Auto-arrange nodes"
                onClick={() => {
                  state.layout();
                  setTimeout(fit, 50);
                }}
              >
                <LayoutGrid size={19} />
              </IconButton>
            )}
            <IconButton
              label="Toggle minimap"
              onClick={() => setMinimap((v) => !v)}
              aria-pressed={minimap}
            >
              <Map size={19} />
            </IconButton>
          </div>
          <div className="flow-viewport">
            <ReactFlow<BoardNode>
              key={board.id}
              onInit={() => setReadyBoardId(board.id)}
              nodes={board.nodes.map((n) => ({
                ...n,
                dragHandle: undefined,
                className: [
                  textSelection ? 'nopan' : '',
                  suggested === n.id ? 'suggested-input' : '',
                  related.has(n.id) && !n.selected ? 'related-node' : '',
                ].join(' '),
              }))}
              edges={board.edges.map((edge) => ({
                ...edge,
                className:
                  related.has(edge.source) && related.has(edge.target) ? 'related-edge' : '',
                markerEnd: {
                  type: MarkerType.ArrowClosed,
                  width: 15,
                  height: 15,
                  color: 'var(--edge)',
                },
              }))}
              nodeTypes={nodeTypes}
              onNodesChange={state.nodesChange}
              onEdgesChange={state.edgesChange}
              onConnect={({ source, target }) => {
                connected.current = true;
                state.connect(source, target);
              }}
              isValidConnection={(c) => canConnect(c.source, c.target, board.edges)}
              defaultViewport={board.viewport}
              fitViewOptions={{ padding: 0.2, maxZoom: 0.9 }}
              minZoom={0.15}
              maxZoom={2}
              snapToGrid={grid}
              snapGrid={[20, 20]}
              panActivationKeyCode="Space"
              nodeDragThreshold={5}
              nodesDraggable={!textSelection && !spacePressed}
              noPanClassName={spacePressed ? 'pan-lock' : 'nopan'}
              panOnDrag={[0, 1, 2]}
              selectionKeyCode={["Control", "Meta"]}
              selectionMode={SelectionMode.Partial}
              multiSelectionKeyCode="Shift"
              deleteKeyCode={null}
              connectionRadius={1}
              zoomOnDoubleClick={false}
              onMoveEnd={(_e, viewport) => state.setViewport(viewport)}
              onConnectStart={(_e, params) => {
                connection.current = params;
                connected.current = false;
              }}
              onConnectEnd={(event) => {
                const pointer = 'changedTouches' in event ? event.changedTouches[0] : event;
                const target = nearestInput(pointer.clientX, pointer.clientY);
                const nearCard = [
                  ...document.querySelectorAll<HTMLElement>('.react-flow__node'),
                ].some((el) => {
                  const rect = el.getBoundingClientRect();
                  return (
                    pointer.clientX >= rect.left - 35 &&
                    pointer.clientX <= rect.right + 35 &&
                    pointer.clientY >= rect.top - 35 &&
                    pointer.clientY <= rect.bottom + 35
                  );
                });
                if (!connected.current && target && connection.current?.nodeId)
                  state.connect(connection.current.nodeId, target);
                else if (
                  !connected.current &&
                  !nearCard &&
                  connection.current?.handleType === 'source' &&
                  connection.current.nodeId &&
                  (pointer.target as HTMLElement)?.closest('.react-flow__pane')
                ) {
                  const id = state.branch(connection.current.nodeId);
                  if (id) {
                    const position = flow.screenToFlowPosition({
                      x: pointer.clientX,
                      y: pointer.clientY,
                    });
                    state.nodesChange([{ type: 'position', id, position }]);
                    state.settleNodes([id]);
                    focusComposer();
                  }
                }
                connection.current = null;
                candidate.current = null;
                setSuggested(null);
              }}
              onNodeDragStart={(_e, node) => {
                state.checkpoint();
                dragStart.current = { ...node.position };
              }}
              onNodeDragStop={(event, node, draggedNodes) => {
                if (!dragStart.current) return;
                let branched = false;
                const pointer = 'changedTouches' in event ? event.changedTouches[0] : event;
                if (!event.shiftKey && draggedNodes.length === 1)
                  document
                    .querySelectorAll<HTMLElement>('.react-flow__node .source')
                    .forEach((el) => {
                      const id = el.closest<HTMLElement>('.react-flow__node')!.dataset.id!;
                      if (branched || id === node.id || node.parentId === id) return;
                      const rect = el.getBoundingClientRect();
                      if (
                        Math.hypot(
                          pointer.clientX - rect.x - rect.width / 2,
                          pointer.clientY - rect.y - rect.height / 2,
                        ) <= 35
                      ) {
                        state.branchOnDrop(id, node.id, dragStart.current!);
                        branched = true;
                      }
                    });
                if (!branched) state.settleNodes(draggedNodes.map((n) => n.id));
                dragStart.current = null;
              }}
              onPaneClick={() => setMenu(null)}
              onDoubleClick={(e) => {
                if ((e.target as HTMLElement).closest('.react-flow__pane'))
                  setMenu({ x: e.clientX, y: e.clientY });
              }}
              onPaneContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY });
              }}
              proOptions={{ hideAttribution: true }}
            >
              <Annotations
                key={board.id}
                open={annotationsOpen}
                onClose={() => setAnnotationsOpen(false)}
              />
              {grid && (
                <Background
                  variant={BackgroundVariant.Dots}
                  gap={20}
                  size={1.3}
                  color="var(--grid)"
                />
              )}
              {minimap && (
                <MiniMap
                  pannable
                  zoomable
                  nodeColor={(n) =>
                    n.type === 'note' ? '#a9b69b' : n.type === 'group' ? '#34483a' : '#8db89a'
                  }
                />
              )}
            </ReactFlow>
          </div>
          <div className="canvas-bottom">
            {minimap && (
              <span className="minimap-space-notice" role="status">
                Minimap paused in this short viewport.
              </span>
            )}
            <span className="canvas-hint">
              <MousePointer2 size={13} />
              Drag to pan<span>·</span>Ctrl/⌘-drag to select<span>·</span>/ to write
            </span>
            <div className="view-controls">
              {canUndo && (
                <IconButton label="Undo" onClick={state.undo}>
                  <Undo2 size={16} />
                </IconButton>
              )}
              {canRedo && (
                <IconButton label="Redo" onClick={state.redo}>
                  <Redo2 size={16} />
                </IconButton>
              )}
              {(canUndo || canRedo) && <span className="tool-divider" />}
              <IconButton
                label="Toggle grid"
                aria-pressed={grid}
                onClick={() => setGrid((v) => !v)}
              >
                <Grid2X2 size={16} />
              </IconButton>
              {(board.viewport?.zoom || 1) > 0.15 && (
                <IconButton label="Zoom out" onClick={() => void flow.zoomOut()}>
                  <ZoomOut size={16} />
                </IconButton>
              )}
              <button
                className="zoom-label"
                aria-label="Reset zoom"
                title="Reset zoom to 100%"
                onClick={() => void flow.zoomTo(1, { duration: 180 })}
              >
                {Math.round((board.viewport?.zoom || 1) * 100)}%
              </button>
              {(board.viewport?.zoom || 1) < 2 && (
                <IconButton label="Zoom in" onClick={() => void flow.zoomIn()}>
                  <ZoomIn size={16} />
                </IconButton>
              )}
              {(board.nodes.length > 0 || !!board.annotations?.items.length) && (
                <IconButton label="Fit canvas" onClick={fit}>
                  <Maximize size={16} />
                </IconButton>
              )}
              {board.nodes.some((n) => n.type !== 'group') && (
                <IconButton
                  label="Focus conversation"
                  title="Bring one card into reading view"
                  onClick={() => {
                    const node =
                      board.nodes.find((n) => n.selected && n.type !== 'group') ||
                      board.nodes.find((n) => n.type === 'chat') ||
                      board.nodes.find((n) => n.type !== 'group');
                    if (node) {
                      state.nodesChange(
                        board.nodes.map((n) => ({
                          type: 'select',
                          id: n.id,
                          selected: n.id === node.id,
                        })),
                      );
                      void flow.fitView({
                        nodes: [{ id: node.id }],
                        padding: fitPadding(),
                        minZoom: 0.75,
                        maxZoom: 1,
                        duration: 200,
                      });
                    }
                  }}
                >
                  <Scan size={18} />
                </IconButton>
              )}
            </div>
          </div>
          <MessageBar
            positionForConversation={() => positionFor('chat')}
            onCreate={(id) =>
              useStore.setState({ historyTarget: { boardId: board.id, nodeId: id, focus: false } })
            }
          />
          {selectedEdge && (
            <div
              className="edge-preview nodrag nopan"
              role="region"
              aria-label="Connection context"
            >
              <GitBranch size={15} />
              <span>
                <strong>{board.nodes.find((n) => n.id === selectedEdge.source)?.data.title}</strong>{' '}
                → {board.nodes.find((n) => n.id === selectedEdge.target)?.data.title}
                <small>
                  {contextNodesFor(selectedEdge.target, board.nodes, board.edges, false).length}{' '}
                  context sources ·{' '}
                  {selectedEdge.data?.historyMessageIds
                    ? 'Through the branched turn'
                    : 'Live upstream context'}
                </small>
              </span>
              <IconButton
                label="Disconnect nodes"
                onClick={() => {
                  state.checkpoint();
                  state.edgesChange([{ type: 'remove', id: selectedEdge.id }]);
                }}
              >
                <Unlink size={16} />
              </IconButton>
            </div>
          )}
        </section>
        <footer className="workspace-footer">
          <span
            className="workspace-token-counts"
            title="Estimated tokens in local node content, counted once per node, not a sum of inherited branches. Selected groups include their descendants. Not billed usage."
          >
            Board ~{tokenCounts.board.toLocaleString()} tokens
            {hasSelection && <> · Selected ~{tokenCounts.selected.toLocaleString()}</>}
            <span className="token-estimate-label"> · estimated</span>
          </span>
          <span>
            {board.nodes.filter((n) => n.type !== 'group').length}{' '}
            {board.nodes.filter((n) => n.type !== 'group').length === 1 ? 'node' : 'nodes'}
            <span className="footer-divider">·</span>
            {board.edges.length} {board.edges.length === 1 ? 'connection' : 'connections'}
            <button
              aria-label="Open command palette"
              title="Open command palette"
              onClick={openPalette}
            >
              <kbd>{shortcut}</kbd>
            </button>
          </span>
        </footer>
      </main>
      {state.storageError && (
        <div className="storage-warning" role="alert">
          {state.storageError}
          <button onClick={exportJSON}>Export backup</button>
        </div>
      )}
      {state.toast && (
        <div className="toast" role="status">
          {state.toast}
        </div>
      )}
      <input
        ref={file}
        type="file"
        accept=".json,application/json"
        hidden
        onChange={async (e) => {
          const chosen = e.target.files?.[0];
          if (!chosen) return;
          try {
            if (chosen.size > 20_000_000) throw new Error('Backup is too large (maximum 20 MB).');
            const value = JSON.parse(await chosen.text());
            if (value.version !== 1) throw new Error('Unsupported backup version.');
            if (value.kind === 'workspace') state.importWorkspace(value);
            else state.importBoard(value.board);
          } catch (error) {
            useStore.setState({ toast: error instanceof Error ? error.message : 'Import failed.' });
          }
          e.target.value = '';
        }}
      />
      {state.settingsOpen && <Settings />}
      {conversationImport && <ConversationImport onClose={() => setConversationImport(false)} />}
      {exportFormat && (
        <CanvasExport key={board.id} format={exportFormat} onClose={() => setExportFormat(null)} />
      )}
      {library && <WorkspaceLibrary section={library} onClose={() => setLibrary(null)} />}
      {backups && (
        <Backups
          onClose={() => setBackups(false)}
          onExport={exportWorkspace}
          onImport={() => file.current?.click()}
        />
      )}
      {help && <Help onClose={() => setHelp(false)} />}
      {historySearch && (
        <HistorySearch
          initialQuery={historyQuery}
          onClose={() => setHistorySearch(false)}
          onSelect={openSearchResult}
        />
      )}
      {palette && (
        <Modal
          title="Command palette"
          onClose={() => setPalette(false)}
          className="command-palette"
        >
          <div className="palette-search">
            <Search size={20} />
            <input
              data-autofocus
              role="combobox"
              aria-label="Search commands and nodes"
              aria-expanded="true"
              aria-controls="command-results"
              aria-activedescendant={filtered[active] ? `command-${active}` : undefined}
              placeholder="What would you like to do?"
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setActive(0);
              }}
              onKeyDown={(e) => {
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((i) => Math.min(i + 1, filtered.length - 1));
                }
                if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((i) => Math.max(i - 1, 0));
                }
                if (e.key === 'Enter' && filtered[active]) {
                  e.preventDefault();
                  execute(filtered[active]);
                }
              }}
            />
          </div>
          <button
            className="palette-history"
            onClick={() => {
              setHistoryQuery(query);
              setPalette(false);
              setHistorySearch(true);
            }}
          >
            <Search size={15} />
            <span>Search saved messages & notes{query ? ` for “${query}”` : ''}</span>
          </button>
          <div className="command-results" id="command-results" role="listbox">
            {filtered.map((action, i) => (
              <button
                key={action.label}
                id={`command-${i}`}
                role="option"
                aria-label={action.label}
                aria-selected={active === i}
                onClick={() => execute(action)}
                onPointerMove={() => setActive(i)}
              >
                <span>{action.label}</span>
                <span>{action.category || 'Command'}</span>
              </button>
            ))}
            {!filtered.length && <p>No matching commands or nodes.</p>}
          </div>
          <div className="palette-footer">
            ↑ ↓ to navigate<span>↵ to select</span>
            <span>esc to close</span>
          </div>
        </Modal>
      )}
      {menu && (
        <Menu x={menu.x} y={menu.y} label="Canvas actions" onClose={() => setMenu(null)}>
          <button role="menuitem" onClick={() => add('chat', flow.screenToFlowPosition(menu))}>
            New conversation
          </button>
          <button role="menuitem" onClick={() => add('note', flow.screenToFlowPosition(menu))}>
            New note
          </button>

          <button role="menuitem" onClick={() => file.current?.click()}>
            Import board backup
          </button>
          {board.nodes.length > 0 && (
            <button role="menuitem" onClick={fit}>
              Fit canvas
            </button>
          )}
        </Menu>
      )}
      {utilities && (
        <Menu
          x={utilities.x}
          y={utilities.y}
          label="Workspace utilities"
          onClose={() => setUtilities(null)}
        >
          <button role="menuitem" onClick={() => setConversationImport(true)}>
            <ArrowUpFromLine size={15} /> Import conversations
          </button>
          <button role="menuitem" onClick={() => file.current?.click()}>
            <FolderOpen size={15} /> Import board backup
          </button>
          <button role="menuitem" onClick={() => setExportFormat('png')}>
            <ImageDown size={15} /> Export image / PDF
          </button>
          <button role="menuitem" onClick={exportJSON}>
            <ArrowDownToLine size={15} /> Back up your canvas
          </button>
          <button role="menuitem" onClick={() => setBackups(true)}>
            <FolderOpen size={15} /> Backups & snapshots
          </button>
        </Menu>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ReactFlowProvider>
      <Workspace />
    </ReactFlowProvider>
  );
}
