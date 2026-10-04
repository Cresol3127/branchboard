import { annotationBounds } from './annotations';
import { absolutePosition } from './graph';
import type { Board } from './types';

/** Full world bounds, independent of the current pan/zoom, with bounded raster memory. */
export function exportGeometry(board: Board) {
  const rectangles = board.nodes
    .filter((n) => !n.hidden)
    .map((node) => ({
      ...absolutePosition(node, board.nodes),
      width: node.measured?.width || Number(node.style?.width) || 340,
      height: node.measured?.height || Number(node.style?.height) || 380,
    }));
  const marks = annotationBounds(board.annotations);
  if (marks) rectangles.push(marks);
  if (!rectangles.length) throw new Error('Add a node or visible annotation before exporting.');
  let x = Infinity,
    y = Infinity,
    right = -Infinity,
    bottom = -Infinity;
  for (const rect of rectangles) {
    x = Math.min(x, rect.x);
    y = Math.min(y, rect.y);
    right = Math.max(right, rect.x + rect.width);
    bottom = Math.max(bottom, rect.y + rect.height);
  }
  const padding = 80;
  const width = Math.ceil(right - x + padding * 2);
  const height = Math.ceil(bottom - y + padding * 2);
  const scale = Math.min(2, 4096 / width, 4096 / height, Math.sqrt(16_000_000 / (width * height)));
  return {
    x: x - padding,
    y: y - padding,
    width,
    height,
    scale,
    pixelWidth: Math.max(1, Math.floor(width * scale)),
    pixelHeight: Math.max(1, Math.floor(height * scale)),
  };
}

/** Exclude editing chrome, without excluding saved text or checklist values. */
export function exportFilter(node: HTMLElement) {
  return (
    !(node instanceof Element) ||
    !node.matches(
      '.react-flow__handle, .react-flow__resize-control, .react-flow__edgelabel-renderer, ' +
        '.node-heading-actions, .note-toolbar, .rich-note-hint, .composer, .model-selector, ' +
        '.conversation-bottom, .node-context-button, .context-chip, .message-tools, .annotation-hit, [data-export-ignore]',
    )
  );
}

export async function renderCanvas(viewport: HTMLElement, board: Board) {
  const geometry = exportGeometry(board);
  await document.fonts.ready;
  const { toCanvas, getFontEmbedCSS } = await import('html-to-image');
  const fonts = await getFontEmbedCSS(viewport, { preferredFontFormat: 'woff2' });
  const background = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim();
  const result = await toCanvas(viewport, {
    width: geometry.width,
    height: geometry.height,
    canvasWidth: geometry.pixelWidth,
    canvasHeight: geometry.pixelHeight,
    pixelRatio: 1,
    backgroundColor: background || '#fff',
    filter: exportFilter,
    // Embedded in the exported clone only: retain clipping without native scrollbars.
    fontEmbedCSS: `${fonts}\n.sizing-region, .markdown pre, .markdown table { overflow: hidden !important; } * { scrollbar-width: none !important; }`,
    preferredFontFormat: 'woff2',
    style: {
      transform: `translate(${-geometry.x}px, ${-geometry.y}px)`,
      transformOrigin: '0 0',
      overflow: 'visible',
    },
  });
  return { url: result.toDataURL('image/png'), ...geometry };
}

export function exportFilename(name: string) {
  return (
    name
      .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '-')
      .trim()
      .slice(0, 100) || 'Untitled canvas'
  );
}

export async function downloadCanvas(url: string, name: string, format: 'png' | 'pdf') {
  const filename = exportFilename(name);
  if (format === 'png') {
    const link = document.createElement('a');
    link.href = url;
    link.download = `${filename}.png`;
    link.click();
    return;
  }
  const { jsPDF } = await import('jspdf');
  const image = new Image();
  image.src = url;
  await image.decode();
  const pdf = new jsPDF({
    orientation: image.width > image.height ? 'landscape' : 'portrait',
    format: 'a4',
  });
  pdf.setProperties({ title: name, creator: 'Branchboard' });
  const pageWidth = pdf.internal.pageSize.getWidth(),
    pageHeight = pdf.internal.pageSize.getHeight();
  const scale = Math.min((pageWidth - 20) / image.width, (pageHeight - 20) / image.height);
  const w = image.width * scale,
    h = image.height * scale;
  pdf.addImage(url, 'PNG', (pageWidth - w) / 2, (pageHeight - h) / 2, w, h);
  pdf.save(`${filename}.pdf`);
}
