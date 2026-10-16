/** Center on the window, but never cover the header's other controls. */
export function headerSearchLayout({
  windowWidth,
  headerLeft,
  leftEnd,
  rightStart,
  gap,
}: {
  windowWidth: number;
  headerLeft: number;
  leftEnd: number;
  rightStart: number;
  gap: number;
}) {
  const center = windowWidth / 2;
  const width = Math.min(420, 2 * Math.min(center - leftEnd - gap, rightStart - gap - center));
  const centered =
    [windowWidth, headerLeft, leftEnd, rightStart, gap].every(Number.isFinite) &&
    windowWidth > 700 &&
    width >= 160;
  return { centered, left: center - headerLeft, width: centered ? width : 40 };
}
