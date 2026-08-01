/**
 * Vertical (manhwa) reading progress from scroll offset + known page heights.
 *
 * FlatList `contentSize` is unreliable here: windowing + sequential image
 * gating leave later pages at placeholder height, so contentSize grows while
 * the user scrolls and `offset / maxScroll` jumps or goes backwards.
 * Tracking measured heights (and averaging for unknowns) keeps the denominator
 * aligned with how VirtualizedList estimates unmeasured rows.
 */

export const DEFAULT_MANHWA_PAGE_HEIGHT = 400;

export function averageMeasuredHeight(
  heights: ReadonlyMap<number, number>,
  fallback = DEFAULT_MANHWA_PAGE_HEIGHT
): number {
  if (heights.size === 0) {
    return fallback;
  }

  let sum = 0;
  for (const height of heights.values()) {
    sum += height;
  }
  return sum / heights.size;
}

export function estimateManhwaContentHeight(options: {
  pageCount: number;
  heights: ReadonlyMap<number, number>;
  footerHeight: number;
  fallbackPageHeight?: number;
}): number {
  const {
    pageCount,
    heights,
    footerHeight,
    fallbackPageHeight = DEFAULT_MANHWA_PAGE_HEIGHT,
  } = options;

  if (pageCount <= 0) {
    return footerHeight;
  }

  const estimated = averageMeasuredHeight(heights, fallbackPageHeight);
  let total = footerHeight;
  for (let index = 0; index < pageCount; index++) {
    total += heights.get(index) ?? estimated;
  }
  return total;
}

export function computeManhwaScrollProgress(options: {
  offsetY: number;
  viewportHeight: number;
  pageCount: number;
  heights: ReadonlyMap<number, number>;
  footerHeight: number;
  fallbackPageHeight?: number;
}): number {
  const {
    offsetY,
    viewportHeight,
    pageCount,
    heights,
    footerHeight,
    fallbackPageHeight = DEFAULT_MANHWA_PAGE_HEIGHT,
  } = options;

  if (pageCount <= 0 || viewportHeight <= 0) {
    return 0;
  }

  const contentHeight = estimateManhwaContentHeight({
    pageCount,
    heights,
    footerHeight,
    fallbackPageHeight,
  });
  const maxScroll = contentHeight - viewportHeight;
  if (maxScroll <= 0) {
    return 0;
  }

  return Math.min(1, Math.max(0, offsetY / maxScroll));
}
