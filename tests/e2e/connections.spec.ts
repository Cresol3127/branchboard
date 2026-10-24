import { expect, test } from '@playwright/test';

test.use({ viewport: { width: 1440, height: 960 } });

test('connections use family colors, prominent ports and a distinct selected state', async ({
  page,
}) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.goto('/');
  const edge = page.locator('.react-flow__edge');
  await expect(edge).toHaveCount(1);
  await expect(edge).toHaveClass(/family-(sage|blue|amber|rose|violet|teal)/);

  const family = (await edge.getAttribute('class'))!.match(/family-(\w+)/)![1];
  const appearance = await edge.evaluate((element, name) => {
    const path = element.querySelector<SVGPathElement>('.react-flow__edge-path')!;
    const source = document.querySelector<HTMLElement>(`.react-flow__node.family-${name}`);
    const handle = source?.querySelector<HTMLElement>('.source') || null;
    const colorProbe = document.createElement('span');
    colorProbe.style.color = getComputedStyle(document.documentElement)
      .getPropertyValue(`--branch-${name}`)
      .trim();
    document.body.append(colorProbe);
    const expectedColor = getComputedStyle(colorProbe).color;
    colorProbe.remove();
    const pathStyle = getComputedStyle(path);
    const handleStyle = handle ? getComputedStyle(handle) : null;
    return {
      familyClass: source?.className || null,
      stroke: pathStyle.stroke,
      width: pathStyle.strokeWidth,
      opacity: pathStyle.opacity,
      expectedColor,
      handleWidth: handleStyle?.width || null,
      handleColor: handleStyle?.backgroundColor || null,
    };
  }, family);

  expect(appearance.familyClass).toContain(`family-${family}`);
  expect(appearance.stroke).toBe(appearance.expectedColor);
  expect(appearance.width).toBe('3px');
  expect(appearance.opacity).toBe('0.92');
  expect(appearance.handleWidth).toBe('12px');
  expect(appearance.handleColor).toBe(appearance.expectedColor);

  await edge.locator('.react-flow__edge-interaction').click({ force: true });
  await expect(page.getByRole('region', { name: 'Connection context' })).toBeVisible();
  await expect
    .poll(() =>
      edge.locator('.react-flow__edge-path').evaluate((path) => getComputedStyle(path).strokeWidth),
    )
    .toBe('3.75px');
});
