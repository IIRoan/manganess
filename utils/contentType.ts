/**
 * Helpers for manga vs manhwa (and related webtoon) content types.
 *
 * Manhwa / manhua / webtoon titles are long-strip vertical readers.
 * LTR and RTL page modes only apply to traditional page-format manga.
 */

const VERTICAL_ONLY_TYPES = new Set([
  'manhwa',
  'manhua',
  'webtoon',
  'webtoons',
]);

/** Normalize provider type labels for comparison. */
export function normalizeContentTypeLabel(
  type: string | null | undefined
): string {
  return (type ?? '').trim().toLowerCase();
}

/**
 * True when this title should never use LTR/RTL page modes.
 * Manhwa (and similar webtoon formats) are always vertical scroll.
 */
export function isVerticalOnlyContentType(
  type: string | null | undefined
): boolean {
  return VERTICAL_ONLY_TYPES.has(normalizeContentTypeLabel(type));
}

/**
 * Resolve the effective reader layout for a title.
 *
 * Vertical-only titles always return `vertical`, even if the user preference
 * is LTR/RTL. Manga (and unknown titles) follow the reading-mode preference,
 * with `auto` falling back to detected image layout.
 */
export function resolveEffectiveReaderLayout(options: {
  readingMode: 'auto' | 'vertical' | 'ltr' | 'rtl';
  titleType?: string | null;
  /** Aspect-ratio detection result when title type is missing/ambiguous. */
  detectedType?: 'manhwa' | 'manga' | null;
}): 'vertical' | 'ltr' | 'rtl' | null {
  const { readingMode, titleType, detectedType } = options;

  const verticalOnly =
    isVerticalOnlyContentType(titleType) || detectedType === 'manhwa';

  if (verticalOnly) {
    return 'vertical';
  }

  if (readingMode === 'vertical') return 'vertical';
  if (readingMode === 'ltr') return 'ltr';
  if (readingMode === 'rtl') return 'rtl';

  // auto — manga defaults to LTR once detection finishes
  if (detectedType === 'manga') return 'ltr';
  return null;
}
