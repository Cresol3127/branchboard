import { expect, test } from '@playwright/test';
import { clickEdge } from './helpers';

test.use({ viewport: { width: 1440, height: 960 } });

test('automatic connections use one hidden center origin and family-colored edges', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const edge = page.locator('.react-flow__edge');
  await expect(edge).toHaveCount(1);
  await expect(edge).toHaveClass(/family-(sage|blue|amber|rose|violet|teal)/);

  const family = (await edge.getAttribute('class'))!.match(/family-(\w+)/)![1];
  const appearance = await edge.evaluate((element, family) => {
    const path = element.querySelector<SVGPathElement>('.react-flow__edge-path')!;
    const colorProbe = document.createElement('span');
    colorProbe.style.color = getComputedStyle(document.documentElement)
      .getPropertyValue(`--branch-${family}`)
      .trim();
    document.body.append(colorProbe);
    const expectedColor = getComputedStyle(colorProbe).color;
    colorProbe.remove();
    const pathStyle = getComputedStyle(path);
    return {
      stroke: pathStyle.stroke,
      width: pathStyle.strokeWidth,
      opacity: pathStyle.opacity,
      expectedColor,
    };
  }, family);

  expect(appearance.stroke).toBe(appearance.expectedColor);
  expect(appearance.width).toBe('3px');
  expect(appearance.opacity).toBe('0.92');

  const handles = page.locator('.react-flow__handle');
  await expect(handles).toHaveCount(6);
  await expect(handles.first()).toHaveCSS('opacity', '0');
  await expect(handles.first()).toHaveCSS('pointer-events', 'none');
  await expect(page.locator('.react-flow__node').first()).not.toHaveClass(/connectable/);

  const geometry = await page.locator('.react-flow__node').evaluateAll((nodes) =>
    nodes.map((node) => {
      const card = node.getBoundingClientRect();
      return [...node.querySelectorAll<HTMLElement>('.react-flow__handle')].map((handle) => {
        const box = handle.getBoundingClientRect();
        return {
          type: handle.classList.contains('source') ? 'source' : 'target',
          x: box.x + box.width / 2,
          y: box.y + box.height / 2,
          card: { x: card.x, y: card.y, width: card.width, height: card.height },
        };
      });
    }),
  );
  for (const anchors of geometry) {
    const center = {
      x: anchors[0].card.x + anchors[0].card.width / 2,
      y: anchors[0].card.y + anchors[0].card.height / 2,
    };
    expect(anchors).toHaveLength(2);
    for (const anchor of anchors) {
      if (anchor.type === 'source') {
        expect(anchor.x).toBeCloseTo(center.x, 0);
        expect(anchor.y).toBeCloseTo(center.y, 0);
      } else {
        // The hidden target stays on the facing edge so the arrowhead remains visible.
        expect(Math.abs(anchor.x - anchor.card.x)).toBeLessThanOrEqual(2);
        expect(anchor.y).toBeCloseTo(center.y, 0);
      }
    }
  }

  await clickEdge(page, edge);
  await expect(page.getByRole('region', { name: 'Connection context' })).toBeVisible();
  await expect
    .poll(() =>
      edge.locator('.react-flow__edge-path').evaluate((path) => getComputedStyle(path).strokeWidth),
    )
    .toBe('3.75px');
});
