import { useEffect, useRef, useState } from 'react';
import { Modal } from './ui';
import { currentBoard, useStore } from '../store';
import { downloadCanvas, renderCanvas } from '../canvasExport';

export function CanvasExport({
  format: initialFormat,
  onClose,
}: {
  format: 'png' | 'pdf';
  onClose: () => void;
}) {
  const state = useStore();
  const board = currentBoard(state);
  const generating = Object.values(state.streaming).some(Boolean);
  const [format, setFormat] = useState(initialFormat);
  const [preview, setPreview] = useState<Awaited<ReturnType<typeof renderCanvas>> | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const alive = useRef(true);
  const version = JSON.stringify({
    name: board.name,
    nodes: board.nodes.map((n) => ({
      id: n.id,
      data: n.data,
      position: n.position,
      style: n.style,
    })),
    edges: board.edges,
    annotations: board.annotations,
  });
  const latest = useRef(version);
  latest.current = version;
  const [previewVersion, setPreviewVersion] = useState('');
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);
  const generate = async () => {
    const viewport = document.querySelector<HTMLElement>('.react-flow__viewport');
    if (!viewport) {
      setError('Canvas is not ready. Close this dialog and try again.');
      return;
    }
    setBusy(true);
    setError('');
    setPreview(null);
    const requestedVersion = latest.current;
    try {
      const image = await renderCanvas(viewport, board);
      if (alive.current && latest.current === requestedVersion) {
        setPreview(image);
        setPreviewVersion(requestedVersion);
      } else if (alive.current)
        setError('The canvas changed while rendering. Generate a new preview.');
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Could not render the canvas.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  const save = async () => {
    if (!preview || previewVersion !== latest.current) return;
    setBusy(true);
    setError('');
    try {
      await downloadCanvas(preview.url, board.name, format);
    } catch (e) {
      if (alive.current) setError(e instanceof Error ? e.message : 'Download failed.');
    } finally {
      if (alive.current) setBusy(false);
    }
  };
  return (
    <Modal title="Export canvas" kind="export" className="canvas-export" onClose={onClose}>
      <p>
        Export the whole canvas, not just the current view. Visible layers and current node
        presentation are included; controls and the grid are omitted. Content overflowing a node
        stays clipped.
      </p>
      <label>
        Format
        <select
          data-autofocus
          value={format}
          disabled={busy}
          onChange={(e) => setFormat(e.target.value as 'png' | 'pdf')}
        >
          <option value="png">PNG image</option>
          <option value="pdf">PDF document</option>
        </select>
      </label>
      <p className="export-hint">
        Up to 4,096 px per side / 16 megapixels. Large canvases scale down. PDF fits the same image
        on one A4 page; text is not selectable. Use Markdown or JSON for complete text and backups.
      </p>
      {generating && <p role="status">Stop generation before exporting a stable canvas.</p>}
      {preview && previewVersion !== version && (
        <p role="status">The canvas changed. Refresh the preview before downloading.</p>
      )}
      {error && (
        <p role="alert" className="error">
          {error}
        </p>
      )}
      {preview && (
        <figure className="export-preview">
          <img src={preview.url} alt={`Export preview of ${board.name}`} />
          <figcaption>
            {preview.pixelWidth} × {preview.pixelHeight} pixels
          </figcaption>
        </figure>
      )}
      <div className="dialog-actions">
        <button disabled={busy || generating} onClick={() => void generate()}>
          {busy ? 'Rendering…' : preview ? 'Refresh preview' : 'Generate preview'}
        </button>
        <button
          className="primary"
          disabled={busy || generating || !preview || previewVersion !== version}
          onClick={() => void save()}
        >
          Download {format.toUpperCase()}
        </button>
      </div>
    </Modal>
  );
}
