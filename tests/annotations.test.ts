import { describe, expect, it } from 'vitest';
import { annotationBounds, annotationPath, validateAnnotations } from '../src/annotations';
import type { AnnotationState } from '../src/types';

const sample = (): AnnotationState => ({
  layers: [{ id: 'ink', name: 'Ink', visible: true, locked: false }],
  items: [
    {
      id: 'mark',
      layerId: 'ink',
      kind: 'pen',
      color: '#8064c3',
      width: 3,
      points: [
        { x: -20, y: 10 },
        { x: 80, y: 60 },
      ],
    },
  ],
});
describe('annotation validation and paths', () => {
  it('fits visible ink including stroke width and ignores hidden layers', () => {
    const value = sample();
    expect(annotationBounds(value)).toEqual({ x: -44, y: -14, width: 148, height: 98 });
    value.items[0].kind = 'highlight';
    value.items[0].width = 40;
    expect(annotationBounds(value)).toEqual({ x: -120, y: -90, width: 300, height: 250 });
    value.layers[0].visible = false;
    expect(annotationBounds(value)).toBeUndefined();
  });
  it('makes independent sanitized copies and accepts all five mark kinds', () => {
    for (const kind of ['pen', 'rectangle', 'ellipse', 'arrow', 'highlight'] as const) {
      const value = sample();
      value.items[0].kind = kind;
      const result = validateAnnotations(value);
      expect(result).toEqual(value);
      expect(result.items[0].points).not.toBe(value.items[0].points);
      expect(annotationPath(result.items[0])).toMatch(/^M /);
      expect(annotationPath(result.items[0])).not.toMatch(/NaN|undefined/);
    }
  });
  it('rejects dangling IDs, duplicates, unsafe SVG colors, malformed points and overlarge data', () => {
    const bad = [
      (v: AnnotationState) => {
        v.items[0].layerId = 'missing';
      },
      (v: AnnotationState) => {
        v.items.push(v.items[0]);
      },
      (v: AnnotationState) => {
        v.layers.push(v.layers[0]);
      },
      (v: AnnotationState) => {
        v.items[0].color = 'url(https://example.com)';
      },
      (v: AnnotationState) => {
        v.items[0].points[0].x = Infinity;
      },
      (v: AnnotationState) => {
        v.items[0].points = [];
      },
      (v: AnnotationState) => {
        v.items[0].width = 0;
      },
      (v: AnnotationState) => {
        v.items[0].kind = 'rectangle';
        v.items[0].points.push({ x: 0, y: 0 });
      },
      (v: AnnotationState) => {
        v.items[0].points = Array.from({ length: 5001 }, () => ({ x: 0, y: 0 }));
      },
      (v: AnnotationState) => {
        v.layers[0].name = ' ';
      },
    ];
    for (const change of bad) {
      const value = sample();
      change(value);
      expect(() => validateAnnotations(value)).toThrow();
    }
    expect(() => validateAnnotations(null)).toThrow();
    expect(validateAnnotations({ layers: [], items: [] })).toEqual({ layers: [], items: [] });
  });
  it('draws reverse rectangles/ellipses and directional arrowheads using numeric coordinates', () => {
    const a = sample().items[0];
    expect(annotationPath({ ...a, kind: 'rectangle' })).toContain('H 80 V 60 H -20 Z');
    expect(annotationPath({ ...a, kind: 'ellipse' })).toContain('a 50 25');
    expect(annotationPath({ ...a, kind: 'arrow' }).match(/ L 80 60/g)).toHaveLength(3);
  });
});
