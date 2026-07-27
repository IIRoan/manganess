export function horizontalPageIndexFromOffset(options: {
  offsetX: number;
  pageWidth: number;
  pageCount: number;
  inverted: boolean;
}): number {
  const { offsetX, pageWidth, pageCount, inverted } = options;
  if (pageCount <= 0 || pageWidth <= 0) {
    return 0;
  }

  const rawIndex = Math.round(offsetX / pageWidth);
  const clampedIndex = Math.max(0, Math.min(pageCount - 1, rawIndex));

  if (!inverted) {
    return clampedIndex;
  }

  return pageCount - 1 - clampedIndex;
}

export function horizontalScrollIndexForPage(options: {
  pageIndex: number;
  pageCount: number;
  inverted: boolean;
}): number {
  const { pageIndex, pageCount, inverted } = options;
  if (pageCount <= 0) {
    return 0;
  }

  const clampedPage = Math.max(0, Math.min(pageCount - 1, pageIndex));
  if (!inverted) {
    return clampedPage;
  }

  return pageCount - 1 - clampedPage;
}
