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
 * True when the provider explicitly labeled the title as page-format manga.
 * Explicit manga must not be forced into the manhwa profile by tall-page
 * aspect detection (most manga pages are taller than wide).
 */
export function isExplicitMangaContentType(
  type: string | null | undefined
): boolean {
  return normalizeContentTypeLabel(type) === 'manga';
}

/**
 * Which reader settings profile to use for a title.
 *
 * Provider type wins. Aspect detection is only a fallback when the title type
 * is missing or ambiguous — never when the provider said "Manga".
 */
export function resolveReaderContentProfile(options: {
  titleType?: string | null;
  detectedType?: 'manhwa' | 'manga' | null;
}): 'manga' | 'manhwa' {
  const { titleType, detectedType } = options;

  if (isVerticalOnlyContentType(titleType)) {
    return 'manhwa';
  }
  if (isExplicitMangaContentType(titleType)) {
    return 'manga';
  }
  if (detectedType === 'manhwa') {
    return 'manhwa';
  }
  return 'manga';
}

/**
 * Resolve the effective reader layout for a title.
 *
 * Vertical-only provider types always return `vertical`. Explicit LTR/RTL/
 * vertical preferences are honored for every other title — including manga
 * pages that aspect detection might misclassify as manhwa. `auto` uses
 * detection only when the provider type does not already decide the layout.
 */
export function resolveEffectiveReaderLayout(options: {
  readingMode: 'auto' | 'vertical' | 'ltr' | 'rtl';
  titleType?: string | null;
  /** Aspect-ratio detection result when title type is missing/ambiguous. */
  detectedType?: 'manhwa' | 'manga' | null;
}): 'vertical' | 'ltr' | 'rtl' | null {
  const { readingMode, titleType, detectedType } = options;

  // Provider manhwa/webtoon — never page modes.
  if (isVerticalOnlyContentType(titleType)) {
    return 'vertical';
  }

  // Explicit user choice always wins for non-vertical-only titles.
  if (readingMode === 'vertical') return 'vertical';
  if (readingMode === 'ltr') return 'ltr';
  if (readingMode === 'rtl') return 'rtl';

  // auto — prefer provider type, then aspect detection.
  if (isExplicitMangaContentType(titleType)) {
    return 'ltr';
  }
  if (detectedType === 'manhwa') return 'vertical';
  if (detectedType === 'manga') return 'ltr';
  return null;
}
