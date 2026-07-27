/**
 * Map horizontal FlatList scroll metrics to logical page indices.
 *
 * React Native's `inverted` FlatList uses a scale transform of -1. Data indices
 * and `contentOffset` still line up the same way as a normal list — do not
 * mirror the index when `inverted` is set, or RTL will open on the last page
 * and edge navigation / progress will fight the list.
 */

export function horizontalPageIndexFromOffset(options: {
  offsetX: number;
  pageWidth: number;
  pageCount: number;
}): number {
  const { offsetX, pageWidth, pageCount } = options;
  if (pageCount <= 0 || pageWidth <= 0) {
    return 0;
  }

  const rawIndex = Math.round(offsetX / pageWidth);
  return Math.max(0, Math.min(pageCount - 1, rawIndex));
}

export function horizontalScrollIndexForPage(options: {
  pageIndex: number;
  pageCount: number;
}): number {
  const { pageIndex, pageCount } = options;
  if (pageCount <= 0) {
    return 0;
  }

  return Math.max(0, Math.min(pageCount - 1, pageIndex));
}
