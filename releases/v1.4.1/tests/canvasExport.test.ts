import { describe, expect, it } from 'vitest';
import { exportFilename, exportGeometry } from '../src/canvasExport';
import type { Board, BoardNode } from '../src/types';

const node = (id: string, x: number, y: number, parentId?: string): BoardNode => ({
  id,
  type: 'note',
  position: { x, y },
  parentId,
  style: { width: 340, height: 260 },
  data: { title: id, color: 'amber', note: 'Text', messages: [] },
});
const board = (nodes: BoardNode[] = []): Board => ({
  id: 'b',
  name: 'Canvas',
  nodes,
  edges: [],
  updatedAt: 1,
});
describe('canvas export', () => {
  it('includes full group-relative coordinates, measured collapsed sizes and padding', () => {
    const group = node('group', -1000, 8000);
    const child = node('child', 400, 500, 'group');
    child.measured = { width: 400, height: 50 };
    const geometry = exportGeometry(board([group, child]));
    expect(geometry).toMatchObject({
      x: -1080,
      y: 7920,
      width: 960,
      height: 710,
      pixelWidth: 1920,
      pixelHeight: 1420,
    });
  });
  it('does not depend on saved pan/zoom and caps very large canvases', () => {
    const value = board([node('a', -1e7, -1e7), node('b', 1e7, 1e7)]);
    const result = exportGeometry(value);
    value.viewport = { x: 900, y: -300, zoom: 0.15 };
    expect(exportGeometry(value)).toEqual(result);
    expect(result.pixelWidth).toBeLessThanOrEqual(4096);
    expect(result.pixelHeight).toBeLessThanOrEqual(4096);
    expect(result.pixelWidth * result.pixelHeight).toBeLessThanOrEqual(16_000_000);
  });
  it('exports annotation-only boards and excludes hidden layers', () => {
    const value = board();
    value.annotations = {
      layers: [{ id: 'ink', name: 'Ink', visible: true, locked: true }],
      items: [
        {
          id: 'mark',
          layerId: 'ink',
          kind: 'arrow',
          color: '#8064c3',
          width: 3,
          points: [
            { x: -900, y: 800 },
            { x: -600, y: 900 },
          ],
        },
      ],
    };
    expect(exportGeometry(value)).toMatchObject({ x: -1004, y: 696, width: 508, height: 308 });
    value.annotations.layers[0].visible = false;
    expect(() => exportGeometry(value)).toThrow('visible annotation');
  });
  it('rejects empty boards and omits hidden nodes', () => {
    const hidden = node('hidden', 0, 0);
    hidden.hidden = true;
    expect(() => exportGeometry(board())).toThrow('Add a node');
    expect(() => exportGeometry(board([hidden]))).toThrow('Add a node');
  });
  it('normalizes download filenames without changing the canvas name', () => {
    expect(exportFilename(' Plan / first: idea? ')).toBe('Plan - first- idea-');
    expect(exportFilename('   ')).toBe('Untitled canvas');
    expect(exportFilename('a'.repeat(200))).toHaveLength(100);
  });
});
