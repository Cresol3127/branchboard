import { useCallback, useEffect, useRef, useState } from 'react';
import {
  Background,
  BackgroundVariant,
  MiniMap,
  ReactFlow,
  ReactFlowProvider,
  useReactFlow,
  useNodesInitialized,
  type OnConnectStartParams,
  type XYPosition,
} from '@xyflow/react';
import {
  ArrowDownToLine,
  Blocks,
  Check,
  GitBranch,
  Grid2X2,
  HelpCircle,
  LayoutGrid,
  Map,
  Maximize,
  MousePointer2,
  Moon,
  Sun,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Search,
  Settings as SettingsIcon,
  StickyNote,
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import { absolutePosition, canConnect } from './graph';
import { currentBoard, saveWorkspace, useStore } from './store';
import { CanvasNode } from './components/Nodes';
import { Help, Settings } from './components/Settings';
import { IconButton, Menu, Modal } from './components/ui';
import { colorTokens } from './theme';
import type { BoardNode } from './types';

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
  const state = useStore(),
    board = currentBoard(state),
    flow = useReactFlow<BoardNode>();
  const nodesInitialized = useNodesInitialized();
  const initiallyFitted = useRef(new Set<string>());
  const hasSelection = board.nodes.some((n) => n.selected);
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
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return (localStorage.getItem('branchboard.theme') as Theme) || 'system';
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
  const dragStart = useRef<XYPosition | null>(null);
  const file = useRef<HTMLInputElement>(null),
    canvas = useRef<HTMLElement>(null);
  const fit = useCallback(() => {
    void flow.fitView({ padding: 0.18, duration: 250, maxZoom: 1 });
  }, [flow]);
  useEffect(() => {
    if (!nodesInitialized || initiallyFitted.current.has(board.id)) return;
    initiallyFitted.current.add(board.id);
    if (!board.viewport) {
      const reading = window.matchMedia('(max-width: 700px)').matches && board.nodes.find((n) => n.type === 'chat');
      void flow.fitView({ padding: 0.18, maxZoom: 1, ...(reading ? { nodes: [{ id: reading.id }], minZoom: 0.65 } : {}) });
    }
  }, [board.id, board.viewport, flow, nodesInitialized]);
  const add = (type: BoardNode['type'], point?: XYPosition) => {
    const rect = canvas.current!.querySelector('.react-flow')!.getBoundingClientRect();
    const center = flow.screenToFlowPosition({
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    });
    const height = type === 'note' ? 260 : 380;
    const position = point || { x: center.x - 170, y: center.y - height / 2 };
    if (!point) {
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
    state.addNode(type, position);
    if (!point) requestAnimationFrame(() => requestAnimationFrame(fit));
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
        void useStore.getState().refreshModels(undefined, controller.signal);
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
    { label: 'New canvas', run: state.newBoard },
    { label: 'Group selection', run: state.group, available: hasSelection },
    { label: 'Duplicate selection', run: state.duplicate, available: hasSelection },
    { label: 'Delete selection', run: state.removeSelected, available: hasDeletion },
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
    { label: 'Fit canvas', run: fit, available: board.nodes.length > 0 },
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
    { label: 'Export Markdown', run: exportMarkdown },
    { label: 'Import board backup', run: () => file.current?.click() },
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
        void flow.fitView({ nodes: [{ id: n.id }], padding: 0.5, maxZoom: 1, duration: 200 });
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
      } else if (mod && e.key.toLowerCase() === 'g') {
        e.preventDefault();
        state.group();
      } else if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        state.removeSelected();
      } else if (!mod && e.key.toLowerCase() === 'g') setGrid((v) => !v);
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
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
    <div className="workspace">
      <div className="sidebar-shell" data-collapsed={sidebarCollapsed}>
        <aside
          id="workspace-sidebar"
          className="workspace-sidebar"
          aria-label="Projects and boards"
          aria-hidden={sidebarCollapsed}
          inert={sidebarCollapsed}
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
              onClick={state.newBoard}
            >
              <Plus size={16} />
              <span>New canvas</span>
            </button>
          <button className="search-button" aria-label="Search" onClick={openPalette}>
            <Search size={16} />
            <span>Search</span>
            <kbd>{shortcut}</kbd>
          </button>
          <nav aria-label="Boards">
            <p className="section-label">YOUR CANVASES</p>
            {state.boards.map((b) => (
              <button
                key={b.id}
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
            ))}

          </nav>
          <div className="sidebar-bottom">
            <button
              aria-label="Back up your canvas"
              title="Back up your canvas"
              onClick={exportJSON}
            >
              <ArrowDownToLine size={17} />
              <span>Back up your canvas</span>
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
            <p className="local-status">Local workspace · saved on this device</p>
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
          <div className="header-right">
            <span className="saved">
              {!state.storageError && <Check size={13} />}
              {state.storageError ? 'Not saved' : 'Saved locally'}
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
            <h1>A thought. A connection.</h1>
            <span className="edition-badge">Prototype · 1.1.1</span>
            <p>
              {board.nodes.length
                ? 'Connect nodes to share context.'
                : 'Add a conversation or note to get started.'}
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
            <span className="tool-divider" />
            {hasSelection && (
              <IconButton label="Group selection" onClick={state.group}>
                <Blocks size={19} />
              </IconButton>
            )}
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
              nodes={board.nodes.map((n) => ({
                ...n,
                className: suggested === n.id ? 'suggested-input' : '',
              }))}
              edges={board.edges}
              nodeTypes={nodeTypes}
              onNodesChange={state.nodesChange}
              onEdgesChange={state.edgesChange}
              onConnect={({ source, target }) => state.connect(source, target)}
              isValidConnection={(c) => canConnect(c.source, c.target, board.edges)}
              defaultViewport={board.viewport}
              fitViewOptions={{ padding: 0.2, maxZoom: 0.9 }}
              minZoom={0.15}
              maxZoom={2}
              snapToGrid={grid}
              snapGrid={[20, 20]}
              panActivationKeyCode="Space"
              selectionOnDrag
              panOnDrag={[1, 2]}
              selectionKeyCode={null}
              multiSelectionKeyCode="Shift"
              deleteKeyCode={null}
              connectionRadius={1}
              zoomOnDoubleClick={false}
              onMoveEnd={(_e, viewport) => state.setViewport(viewport)}
              onConnectStart={(_e, params) => {
                connection.current = params;
              }}
              onConnectEnd={(event) => {
                const pointer = 'changedTouches' in event ? event.changedTouches[0] : event;
                const target = nearestInput(pointer.clientX, pointer.clientY);
                if (target && connection.current?.nodeId)
                  state.connect(connection.current.nodeId, target);
                connection.current = null;
                candidate.current = null;
                setSuggested(null);
              }}
              onNodeDragStart={(_e, node) => {
                state.checkpoint();
                dragStart.current = { ...node.position };
              }}
              onNodeDragStop={(event, node) => {
                if (event.shiftKey || !dragStart.current) return;
                const pointer = 'changedTouches' in event ? event.changedTouches[0] : event;
                document
                  .querySelectorAll<HTMLElement>('.react-flow__node .source')
                  .forEach((el) => {
                    const id = el.closest<HTMLElement>('.react-flow__node')!.dataset.id!;
                    if (id === node.id || node.parentId === id) return;
                    const rect = el.getBoundingClientRect();
                    if (
                      Math.hypot(
                        pointer.clientX - rect.x - rect.width / 2,
                        pointer.clientY - rect.y - rect.height / 2,
                      ) <= 35
                    )
                      state.branchOnDrop(id, node.id, dragStart.current!);
                  });
                dragStart.current = null;
              }}
              onPaneClick={() => setMenu(null)}
              onDoubleClick={(e) => {
                if ((e.target as HTMLElement).closest('.react-flow__pane'))
                  add('chat', flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }));
              }}
              onPaneContextMenu={(e) => {
                e.preventDefault();
                setMenu({ x: e.clientX, y: e.clientY });
              }}
              proOptions={{ hideAttribution: true }}
            >
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
                    n.type === 'note' ? '#e9c46a' : n.type === 'group' ? '#c7c6d1' : '#a991df'
                  }
                />
              )}
            </ReactFlow>
          </div>
          <div className="canvas-bottom">
            <span className="canvas-hint">
              <MousePointer2 size={13} />
              Double-click to start a thought<span>·</span>Space to pan
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
              <span className="zoom-label">{Math.round((board.viewport?.zoom || 1) * 100)}%</span>
              {(board.viewport?.zoom || 1) < 2 && (
                <IconButton label="Zoom in" onClick={() => void flow.zoomIn()}>
                  <ZoomIn size={16} />
                </IconButton>
              )}
              {board.nodes.length > 0 && (
                <IconButton label="Fit canvas" onClick={fit}>
                  <Maximize size={16} />
                </IconButton>
              )}
            </div>
          </div>
        </section>
        <footer className="workspace-footer">
          <span>Local-first workspace</span>
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
            state.importBoard(value.board);
          } catch (error) {
            useStore.setState({ toast: error instanceof Error ? error.message : 'Import failed.' });
          }
          e.target.value = '';
        }}
      />
      {state.settingsOpen && <Settings />}
      {help && <Help onClose={() => setHelp(false)} />}
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
          {hasSelection && (
            <button role="menuitem" onClick={state.group}>
              Group selection
            </button>
          )}
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
