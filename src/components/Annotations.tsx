import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { Panel, ViewportPortal, useReactFlow } from '@xyflow/react';
import {
  ArrowDown,
  ArrowUp,
  Circle,
  Highlighter,
  Layers,
  MousePointer2,
  Pencil,
  Square,
  MoveUpRight,
  Trash2,
  X,
} from 'lucide-react';
import { annotationKinds, annotationPath } from '../annotations';
import { currentBoard, useStore } from '../store';
import type { Annotation, AnnotationLayer, AnnotationState } from '../types';
import { IconButton, Modal } from './ui';
import { Presence, useMotionPresence } from './Motion';
import { motion } from '../motion';

type Point = { x: number; y: number };
type Gesture = {
  start: Point;
  mark: Annotation;
  points: Point[];
  moving: boolean;
  pointerId: number;
};
const tools = [MousePointer2, Pencil, Square, Circle, MoveUpRight, Highlighter];
const kinds = ['select', ...annotationKinds] as const;
const labels = [
  'Select annotations',
  'Freehand pen',
  'Rectangle',
  'Ellipse',
  'Arrow',
  'Highlighter',
];

export function Annotations({ open, onClose }: { open: boolean; onClose: () => void }) {
  const toolsRendered = useMotionPresence(open, motion.spatial.fast.duration);
  const state = useStore(),
    board = currentBoard(state),
    flow = useReactFlow();
  const [initialLayer] = useState<AnnotationLayer>(() => ({
    id: crypto.randomUUID(),
    name: 'Ink',
    visible: true,
    locked: false,
  }));
  const value: AnnotationState = board.annotations || { layers: [initialLayer], items: [] };
  const [layerId, setLayerId] = useState(initialLayer.id);
  const layer = value.layers.find((l) => l.id === layerId) || value.layers[0];
  const [tool, setTool] = useState<(typeof kinds)[number]>('select');
  const [color, setColor] = useState('#8db89a'),
    [width, setWidth] = useState(3);
  const [selected, setSelected] = useState('');
  const [draft, setDraft] = useState<Annotation | null>(null);
  const [layersOpen, setLayersOpen] = useState(false);
  const [deleting, setDeleting] = useState<AnnotationLayer | null>(null);
  const [error, setError] = useState('');
  const gesture = useRef<Gesture | null>(null);
  const busy = Object.values(state.streaming).some(Boolean);
  const mark = value.items.find((a) => a.id === selected);
  const editable =
    !!mark && value.layers.some((l) => l.id === mark.layerId && l.visible && !l.locked);
  const canDraw = open && !busy && !!layer && layer.visible && !layer.locked && !layersOpen;
  const commit = (next: AnnotationState) => {
    try {
      if (!useStore.getState().setAnnotations(next)) return false;
      setError('');
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Unable to save annotation.');
      return false;
    }
  };
  useEffect(() => {
    if (!open || busy || layersOpen) {
      gesture.current = null;
      setDraft(null);
    }
  }, [open, busy, layersOpen]);
  useEffect(() => {
    // Undo/redo or another annotation mutation cancels an unfinished gesture.
    gesture.current = null;
    setDraft(null);
  }, [board.annotations]);
  useEffect(() => {
    if (!open) return;
    const key = (e: KeyboardEvent) => {
      if (
        document.querySelector('[role="dialog"], [role="menu"]') ||
        (e.target as Element).closest('input, select, textarea, [contenteditable="true"]')
      )
        return;
      if (e.key === 'Escape') {
        gesture.current = null;
        setDraft(null);
        setTool('select');
        setSelected('');
      }
    };
    window.addEventListener('keydown', key);
    return () => window.removeEventListener('keydown', key);
  }, [open]);
  const point = (e: PointerEvent): Point =>
    flow.screenToFlowPosition({ x: e.clientX, y: e.clientY }, { snapToGrid: false });
  const start = (e: PointerEvent, existing?: Annotation) => {
    if (e.button !== 0 || busy || gesture.current) return;
    e.stopPropagation();
    e.preventDefault();
    if (existing) {
      setSelected(existing.id);
      setLayerId(existing.layerId);
      setColor(existing.color);
      setWidth(existing.width);
    }
    const p = point(e);
    const next = existing || {
      id: crypto.randomUUID(),
      layerId: layer!.id,
      kind: tool as Annotation['kind'],
      color,
      width,
      points: [p, p],
    };
    gesture.current = {
      start: p,
      mark: next,
      points: next.points,
      moving: !!existing,
      pointerId: e.pointerId,
    };
    setDraft(next);
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const move = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g || e.pointerId !== g.pointerId) return;
    e.stopPropagation();
    const p = point(e);
    let points: Point[];
    if (g.moving)
      points = g.mark.points.map((q) => ({ x: q.x + p.x - g.start.x, y: q.y + p.y - g.start.y }));
    else if (g.mark.kind === 'pen' || g.mark.kind === 'highlight') {
      const previous = g.mark.points.at(-1)!;
      if (
        g.mark.points.length >= 5000 ||
        Math.hypot(p.x - previous.x, p.y - previous.y) * flow.getZoom() < 2
      )
        return;
      points = [...g.mark.points, p];
      g.mark = { ...g.mark, points };
    } else points = [g.start, p];
    g.points = points;
    setDraft({ ...g.mark, points });
  };
  const finish = (e: PointerEvent) => {
    const g = gesture.current;
    if (!g || g.pointerId !== e.pointerId) return;
    e.stopPropagation();
    gesture.current = null;
    const finished = { ...g.mark, points: g.points };
    const moved = g.points.some(
      (p) => Math.hypot(p.x - g.start.x, p.y - g.start.y) * flow.getZoom() >= 3,
    );
    const changed = g.moving && JSON.stringify(g.points) !== JSON.stringify(g.mark.points);
    if (
      (g.moving ? changed : moved) &&
      commit({
        ...value,
        items: g.moving
          ? value.items.map((a) => (a.id === finished.id ? finished : a))
          : [...value.items, finished],
      })
    )
      setSelected(finished.id);
    setDraft(null);
  };
  const cancel = () => {
    gesture.current = null;
    setDraft(null);
  };
  const changeMark = (patch: Partial<Annotation>) => {
    if (editable)
      commit({
        ...value,
        items: value.items.map((a) => (a.id === selected ? { ...a, ...patch } : a)),
      });
  };
  const remove = () => {
    if (editable && commit({ ...value, items: value.items.filter((a) => a.id !== selected) }))
      setSelected('');
  };
  const updateLayer = (id: string, patch: Partial<AnnotationLayer>) =>
    commit({ ...value, layers: value.layers.map((l) => (l.id === id ? { ...l, ...patch } : l)) });
  const reorder = (index: number, delta: number) => {
    const layers = [...value.layers];
    [layers[index], layers[index + delta]] = [layers[index + delta], layers[index]];
    commit({ ...value, layers });
  };
  return (
    <>
      <ViewportPortal>
        <svg className="annotation-world" aria-label="Canvas annotations">
          {value.layers
            .filter((l) => l.visible)
            .map((l) => (
              <g key={l.id} data-layer-id={l.id}>
                {value.items
                  .filter((a) => a.layerId === l.id && a.id !== draft?.id)
                  .concat(draft?.layerId === l.id ? [draft] : [])
                  .map((a) => {
                    const interactive =
                      open && tool === 'select' && !l.locked && !busy && !layersOpen;
                    return (
                      <g key={a.id} data-annotation-id={a.id} data-kind={a.kind}>
                        {open && a.id === selected && (
                          <path
                            data-export-ignore
                            d={annotationPath(a)}
                            fill="none"
                            stroke="var(--text)"
                            strokeWidth={a.width + 5}
                            strokeDasharray="4 6"
                            opacity="0.4"
                            pointerEvents="none"
                          />
                        )}
                        <path
                          d={annotationPath(a)}
                          fill="none"
                          stroke={a.color}
                          strokeWidth={a.kind === 'highlight' ? a.width * 5 : a.width}
                          opacity={a.kind === 'highlight' ? 0.3 : 1}
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          pointerEvents="none"
                        />
                        {interactive && (
                          <path
                            className="annotation-hit nodrag nopan"
                            d={annotationPath(a)}
                            fill="none"
                            stroke="transparent"
                            strokeWidth={Math.max(a.width, 14 / flow.getZoom())}
                            tabIndex={0}
                            role="button"
                            aria-label={`${a.kind} annotation on ${l.name}`}
                            onFocus={() => setSelected(a.id)}
                            onPointerDown={(e) => start(e, a)}
                            onPointerMove={move}
                            onPointerUp={finish}
                            onPointerCancel={cancel}
                            onLostPointerCapture={cancel}
                            onKeyDown={(e) => {
                              if (
                                [
                                  'Delete',
                                  'Backspace',
                                  'Enter',
                                  ' ',
                                  'ArrowLeft',
                                  'ArrowRight',
                                  'ArrowUp',
                                  'ArrowDown',
                                ].includes(e.key)
                              ) {
                                e.preventDefault();
                                e.stopPropagation();
                                setSelected(a.id);
                                if (e.key === 'Delete' || e.key === 'Backspace')
                                  commit({
                                    ...value,
                                    items: value.items.filter((m) => m.id !== a.id),
                                  });
                                else if (e.key.startsWith('Arrow'))
                                  commit({
                                    ...value,
                                    items: value.items.map((m) =>
                                      m.id !== a.id
                                        ? m
                                        : {
                                            ...m,
                                            points: m.points.map((p) => ({
                                              x:
                                                p.x +
                                                (e.key === 'ArrowRight'
                                                  ? 10
                                                  : e.key === 'ArrowLeft'
                                                    ? -10
                                                    : 0),
                                              y:
                                                p.y +
                                                (e.key === 'ArrowDown'
                                                  ? 10
                                                  : e.key === 'ArrowUp'
                                                    ? -10
                                                    : 0),
                                            })),
                                          },
                                    ),
                                  });
                                else {
                                  setColor(a.color);
                                  setWidth(a.width);
                                }
                              }
                            }}
                          />
                        )}
                      </g>
                    );
                  })}
              </g>
            ))}
        </svg>
      </ViewportPortal>
      {canDraw && tool !== 'select' && (
        <div
          className="annotation-surface nodrag nopan nowheel"
          aria-label="Annotation drawing surface"
          onPointerDown={(e) => start(e)}
          onPointerMove={move}
          onPointerUp={finish}
          onPointerCancel={cancel}
          onLostPointerCapture={cancel}
          onDoubleClick={(e) => e.stopPropagation()}
        />
      )}
      {toolsRendered && (
        <Panel
          position="top-left"
          className="annotation-panel nodrag nopan nowheel"
          data-motion-state={open ? 'open' : 'closing'}
          inert={!open}
          aria-hidden={!open}
          onKeyDown={(e) => {
            if (e.key === 'Delete' || e.key === 'Backspace') e.stopPropagation();
          }}
        >
          <div role="toolbar" aria-label="Annotation tools" className="annotation-toolbar">
            {kinds.map((kind, i) => {
              const Icon = tools[i];
              return (
                <IconButton
                  key={kind}
                  label={labels[i]}
                  aria-pressed={tool === kind}
                  disabled={busy}
                  onClick={() => {
                    cancel();
                    setTool(kind);
                    setSelected('');
                  }}
                >
                  <Icon size={18} />
                </IconButton>
              );
            })}
            <IconButton label="Delete annotation" disabled={!editable || busy} onClick={remove}>
              <Trash2 size={16} />
            </IconButton>
            <IconButton label="Annotation layers" onClick={() => setLayersOpen(true)}>
              <Layers size={18} />
            </IconButton>
            <IconButton label="Close annotation tools" onClick={onClose}>
              <X size={18} />
            </IconButton>
          </div>
          <div className="annotation-options">
            <label>
              Color{' '}
              <input
                type="color"
                aria-label="Annotation color"
                value={editable ? mark.color : color}
                disabled={busy}
                onChange={(e) => {
                  setColor(e.target.value);
                  changeMark({ color: e.target.value });
                }}
              />
            </label>
            <label>
              Width{' '}
              <select
                aria-label="Annotation width"
                value={editable ? mark.width : width}
                disabled={busy}
                onChange={(e) => {
                  setWidth(Number(e.target.value));
                  changeMark({ width: Number(e.target.value) });
                }}
              >
                {[
                  1,
                  3,
                  6,
                  10,
                  20,
                  ...(mark && ![1, 3, 6, 10, 20].includes(mark.width) ? [mark.width] : []),
                ].map((n) => (
                  <option key={n}>{n}</option>
                ))}
              </select>
            </label>
            <label>
              Layer{' '}
              <select
                aria-label="Drawing layer"
                value={layer?.id || ''}
                disabled={busy || !value.layers.length}
                onChange={(e) => {
                  cancel();
                  setLayerId(e.target.value);
                  setSelected('');
                }}
              >
                {value.layers.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                    {l.locked ? ' (locked)' : !l.visible ? ' (hidden)' : ''}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <p>
            {busy
              ? 'Annotation editing is paused during generation.'
              : !layer
                ? 'Add a layer to draw.'
                : !layer.visible || layer.locked
                  ? 'Choose a visible, unlocked layer to draw.'
                  : tool === 'select'
                    ? 'Select a mark to move, recolor or delete. Arrow keys move 10 px.'
                    : 'Drag to draw · Escape cancels · Select to move marks.'}
          </p>
          {error && <p role="alert">{error}</p>}
        </Panel>
      )}
      <Presence>
        {layersOpen && (
          <Modal
            kind="layers"
            title="Annotation layers"
            onClose={() => setLayersOpen(false)}
            className="annotation-layers"
          >
            <p>
              Layers stack from bottom to top, above canvas nodes. Hidden layers stay in backups;
              locked layers cannot be drawn on or edited.
            </p>
            {value.layers.map((l, i) => (
              <div className="annotation-layer" key={l.id}>
                <input
                  key={`${l.id}-${l.name}`}
                  aria-label={`Layer name ${i + 1}`}
                  defaultValue={l.name}
                  maxLength={80}
                  disabled={busy}
                  onBlur={(e) => {
                    const name = e.target.value.trim();
                    if (name && name !== l.name) updateLayer(l.id, { name });
                    else e.target.value = l.name;
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') e.currentTarget.blur();
                  }}
                />
                <label>
                  <input
                    type="checkbox"
                    checked={l.visible}
                    disabled={busy}
                    onChange={(e) => updateLayer(l.id, { visible: e.target.checked })}
                  />
                  Visible
                </label>
                <label>
                  <input
                    type="checkbox"
                    checked={l.locked}
                    disabled={busy}
                    onChange={(e) => updateLayer(l.id, { locked: e.target.checked })}
                  />
                  Locked
                </label>
                <IconButton
                  label={`Lower ${l.name}`}
                  disabled={busy || i === 0}
                  onClick={() => reorder(i, -1)}
                >
                  <ArrowDown size={16} />
                </IconButton>
                <IconButton
                  label={`Raise ${l.name}`}
                  disabled={busy || i === value.layers.length - 1}
                  onClick={() => reorder(i, 1)}
                >
                  <ArrowUp size={16} />
                </IconButton>
                <IconButton
                  label={`Delete layer ${l.name}`}
                  disabled={busy || l.locked}
                  onClick={() => setDeleting(l)}
                >
                  <Trash2 size={16} />
                </IconButton>
              </div>
            ))}
            {!value.layers.length && <p>No layers yet.</p>}
            <button
              className="annotation-add-layer"
              disabled={busy || value.layers.length >= 30}
              onClick={() => {
                const next = {
                  id: crypto.randomUUID(),
                  name: `Layer ${value.layers.length + 1}`,
                  visible: true,
                  locked: false,
                };
                if (commit({ ...value, layers: [...value.layers, next] })) setLayerId(next.id);
              }}
            >
              Add annotation layer
            </button>
            {deleting && (
              <section role="region" aria-label="Delete annotation layer?">
                <h3>Delete annotation layer?</h3>
                <p>
                  Delete “{deleting.name}” and its{' '}
                  {value.items.filter((a) => a.layerId === deleting.id).length} marks? You can undo
                  this change.
                </p>
                <div className="history-dialog-actions">
                  <button autoFocus onClick={() => setDeleting(null)}>
                    Cancel
                  </button>
                  <button
                    className="danger-button"
                    disabled={busy}
                    onClick={() => {
                      if (
                        commit({
                          layers: value.layers.filter((l) => l.id !== deleting.id),
                          items: value.items.filter((a) => a.layerId !== deleting.id),
                        })
                      )
                        setDeleting(null);
                    }}
                  >
                    Delete layer
                  </button>
                </div>
              </section>
            )}
            {error && <p role="alert">{error}</p>}
          </Modal>
        )}
      </Presence>
    </>
  );
}
