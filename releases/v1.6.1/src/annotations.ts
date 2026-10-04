import type { Annotation, AnnotationState } from './types';

export const annotationKinds = ['pen', 'rectangle', 'ellipse', 'arrow', 'highlight'] as const;

export function annotationBounds(value?: AnnotationState) {
  const visible = new Set(value?.layers.filter((l) => l.visible).map((l) => l.id));
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const mark of value?.items || []) {
    if (!visible.has(mark.layerId)) continue;
    const padding = Math.max(
      24,
      mark.kind === 'arrow'
        ? 12 + mark.width * 2
        : mark.width * (mark.kind === 'highlight' ? 2.5 : 1),
    );
    for (const p of mark.points) {
      x = Math.min(x, p.x - padding);
      y = Math.min(y, p.y - padding);
      right = Math.max(right, p.x + padding);
      bottom = Math.max(bottom, p.y + padding);
    }
  }
  return Number.isFinite(x) ? { x, y, width: right - x, height: bottom - y } : undefined;
}

// Keep imported SVG attributes strictly numeric or hex colors; never accept markup/URLs.
export function validateAnnotations(input: unknown): AnnotationState {
  const value = input as AnnotationState | null;
  if (
    !value ||
    !Array.isArray(value.layers) ||
    !Array.isArray(value.items) ||
    value.layers.length > 30 ||
    value.items.length > 2000
  )
    throw new Error('Invalid annotations (maximum 30 layers and 2,000 marks).');
  const ids = new Set<string>();
  const layers = value.layers.map((l) => {
    if (
      !l ||
      typeof l.id !== 'string' ||
      !l.id ||
      ids.has(l.id) ||
      typeof l.name !== 'string' ||
      !l.name.trim() ||
      l.name.length > 80 ||
      typeof l.visible !== 'boolean' ||
      typeof l.locked !== 'boolean'
    )
      throw new Error('Invalid annotation layer.');
    ids.add(l.id);
    return { id: l.id, name: l.name.trim(), visible: l.visible, locked: l.locked };
  });
  const markIds = new Set<string>();
  let total = 0;
  const items = value.items.map((a) => {
    if (
      !a ||
      typeof a.id !== 'string' ||
      !a.id ||
      markIds.has(a.id) ||
      !ids.has(a.layerId) ||
      !annotationKinds.includes(a.kind) ||
      !/^#[0-9a-f]{6}$/i.test(a.color) ||
      !Number.isFinite(a.width) ||
      a.width < 1 ||
      a.width > 40 ||
      !Array.isArray(a.points) ||
      a.points.length < 2 ||
      a.points.length > 5000 ||
      (a.kind !== 'pen' && a.kind !== 'highlight' && a.points.length !== 2) ||
      a.points.some(
        (p) =>
          !p ||
          !Number.isFinite(p.x) ||
          !Number.isFinite(p.y) ||
          Math.abs(p.x) >= 1e8 ||
          Math.abs(p.y) >= 1e8,
      )
    )
      throw new Error('Invalid annotation mark.');
    total += a.points.length;
    if (total > 100_000) throw new Error('Annotations exceed the 100,000 point limit.');
    markIds.add(a.id);
    return {
      id: a.id,
      layerId: a.layerId,
      kind: a.kind,
      color: a.color,
      width: a.width,
      points: a.points.map((p) => ({ x: p.x, y: p.y })),
    };
  });
  return { layers, items };
}

export function annotationPath(a: Annotation): string {
  const [start, end] = a.points;
  if (a.kind === 'rectangle') {
    return `M ${start.x} ${start.y} H ${end.x} V ${end.y} H ${start.x} Z`;
  }
  if (a.kind === 'ellipse') {
    const rx = Math.abs(end.x - start.x) / 2,
      ry = Math.abs(end.y - start.y) / 2;
    const cx = (start.x + end.x) / 2,
      cy = (start.y + end.y) / 2;
    return `M ${cx - rx} ${cy} a ${rx} ${ry} 0 1 0 ${2 * rx} 0 a ${rx} ${ry} 0 1 0 ${-2 * rx} 0`;
  }
  const line = a.points.map((p, i) => `${i ? 'L' : 'M'} ${p.x} ${p.y}`).join(' ');
  if (a.kind !== 'arrow') return line;
  const angle = Math.atan2(end.y - start.y, end.x - start.x),
    size = 12 + a.width * 2;
  return (
    line +
    [angle - Math.PI / 6, angle + Math.PI / 6]
      .map(
        (r) => ` M ${end.x - size * Math.cos(r)} ${end.y - size * Math.sin(r)} L ${end.x} ${end.y}`,
      )
      .join('')
  );
}
