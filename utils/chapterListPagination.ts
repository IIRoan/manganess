import type { Chapter } from '@/types/manga';

export interface MappedChapterPage {
  chapters: Chapter[];
  hasMore: boolean;
  page: number;
  lastPage?: number;
  total?: number;
}

/** MangaFire chapter lists are newest-first. The true first/oldest chapter is the lowest chapter number (not merely the last item in a partial page-1 list). */
export function pickOldestChapter(chapters: Chapter[]): Chapter | null {
  if (!chapters.length) {
    return null;
  }

  let oldest = chapters[0]!;
  let oldestValue = Number.parseFloat(oldest.number);

  for (let i = 1; i < chapters.length; i += 1) {
    const chapter = chapters[i]!;
    const value = Number.parseFloat(chapter.number);
    if (!Number.isFinite(value)) {
      continue;
    }
    if (!Number.isFinite(oldestValue) || value < oldestValue) {
      oldest = chapter;
      oldestValue = value;
    }
  }

  return oldest;
}

/** Most series begin near chapter 0/1. A newest-first page-1 window like 40–90 must never be sealed as a complete archive. */
export const MAX_OLDEST_CHAPTER_FOR_COMPLETE_LIST = 2;

export function getOldestChapterNumber(
  chapters: Chapter[] | null | undefined
): number | null {
  const oldest = pickOldestChapter(chapters ?? []);
  if (!oldest) {
    return null;
  }
  const value = Number.parseFloat(oldest.number);
  return Number.isFinite(value) ? value : null;
}

/** True when the loaded list reaches near the natural series start. Allows prologues / 0.x / 1.5, but rejects truncated mid-series windows. */
export function chapterListReachesSeriesStart(
  chapters: Chapter[] | null | undefined
): boolean {
  const oldest = getOldestChapterNumber(chapters);
  if (oldest == null) {
    return false;
  }
  return oldest <= MAX_OLDEST_CHAPTER_FOR_COMPLETE_LIST;
}

function isOfficialSource(type: string | null | undefined): boolean {
  return String(type ?? '').trim().toLowerCase() === 'official';
}

/** Append newly fetched pages while preserving newest-first order and deduping. */
export function appendUniqueChapters(
  existing: Chapter[],
  incoming: Chapter[]
): Chapter[] {
  if (!incoming.length) {
    return existing;
  }

  if (!existing.length) {
    const seen = new Set<string>();
    return incoming.filter((chapter) => {
      if (!chapter.number || seen.has(chapter.number)) {
        return false;
      }
      seen.add(chapter.number);
      return true;
    });
  }

  const byNumber = new Map(
    existing.map((chapter) => [chapter.number, chapter] as const)
  );
  const order = existing.map((chapter) => chapter.number);
  let changed = false;

  for (const chapter of incoming) {
    if (!chapter.number) {
      continue;
    }
    const prior = byNumber.get(chapter.number);
    if (!prior) {
      byNumber.set(chapter.number, chapter);
      order.push(chapter.number);
      changed = true;
      continue;
    }
    if (
      !isOfficialSource(prior.sourceType) &&
      isOfficialSource(chapter.sourceType)
    ) {
      byNumber.set(chapter.number, chapter);
      changed = true;
    }
  }

  if (!changed) {
    return existing;
  }

  return order.map((number) => byNumber.get(number)!);
}

export interface LoadRemainingChaptersResult {
  chapters: Chapter[];
  nextPage: number;
  hasMore: boolean;
}

/** Keep fetching chapter pages until the API reports no more (or cancel). Used when the UI needs the true end of the list (start reading / scroll bottom). */
export async function loadRemainingChapterPages(options: {
  currentChapters: Chapter[];
  nextPage: number;
  hasMore: boolean;
  fetchPage: (page: number) => Promise<MappedChapterPage>;
  shouldCancel?: () => boolean;
  onPage?: (result: LoadRemainingChaptersResult) => void;
}): Promise<LoadRemainingChaptersResult> {
  let chapters = options.currentChapters;
  let page = options.nextPage;
  let hasMore = options.hasMore;

  while (hasMore) {
    if (options.shouldCancel?.()) {
      break;
    }

    const result = await options.fetchPage(page);
    chapters = appendUniqueChapters(chapters, result.chapters);
    hasMore = result.hasMore;
    page += 1;

    const progress: LoadRemainingChaptersResult = {
      chapters,
      nextPage: page,
      hasMore,
    };
    options.onPage?.(progress);
  }

  return { chapters, nextPage: page, hasMore };
}

/** Resolve the oldest chapter when only a partial newest-first list is loaded. Prefers fetching the API's last page over crawling every middle page. */
export async function resolveOldestChapter(options: {
  loadedChapters: Chapter[];
  hasMore: boolean;
  lastPage?: number;
  fetchPage: (page: number) => Promise<MappedChapterPage>;
}): Promise<Chapter | null> {
  const { loadedChapters, hasMore, lastPage, fetchPage } = options;

  if (!hasMore) {
    return pickOldestChapter(loadedChapters);
  }

  const targetPage =
    typeof lastPage === 'number' && lastPage > 0 ? lastPage : null;

  if (targetPage != null && targetPage > 1) {
    const last = await fetchPage(targetPage);
    return (
      pickOldestChapter(last.chapters) ?? pickOldestChapter(loadedChapters)
    );
  }

  // Unknown last page — crawl remaining pages from page 2 onward.
  const full = await loadRemainingChapterPages({
    currentChapters: loadedChapters,
    nextPage: 2,
    hasMore: true,
    fetchPage,
  });
  return pickOldestChapter(full.chapters);
}

/** Prefer the API-reported total over the currently loaded (possibly partial) list. */
export function getReportedChapterCount(details: {
  chapters?: Array<unknown>;
  totalChapters?: number;
} | null | undefined): number {
  if (!details) {
    return 0;
  }
  if (typeof details.totalChapters === 'number' && details.totalChapters > 0) {
    return details.totalChapters;
  }
  return details.chapters?.length ?? 0;
}

export interface CachedChapterPaginationMeta {
  nextPage?: number;
  hasMore?: boolean;
  lastPage?: number;
}

export interface CachedChapterPagination {
  hasMore: boolean;
  nextPage: number;
  lastPage?: number;
}

const DEFAULT_CHAPTER_PAGE_SIZE = 60;

function estimateNextChapterPage(cachedCount: number): number {
  if (cachedCount <= 0) {
    return 2;
  }

  return Math.floor(cachedCount / DEFAULT_CHAPTER_PAGE_SIZE) + 1;
}

/** True when we already have a durable full chapter list and should not crawl every MangaFire page again (One Piece ~40 pages). A page-1 window like chapters 40–90 must never count as complete, even when totalChapters was wrongly stamped to the partial length or hasMore was sealed false. */
export function isChapterListCacheComplete(details: {
  chapters?: Chapter[];
  totalChapters?: number;
  chapterPagination?: CachedChapterPaginationMeta;
} | null | undefined): boolean {
  if (!details) {
    return false;
  }

  const chapters = details.chapters ?? [];
  const count = chapters.length;
  if (count <= 0) {
    return false;
  }

  // Truncated newest-first caches are never durable, regardless of metadata.
  if (!chapterListReachesSeriesStart(chapters)) {
    return false;
  }

  if (details.chapterPagination?.hasMore === false) {
    return true;
  }

  const total = details.totalChapters;
  // Only trust totals that look like unique counts (not mixed official+unofficial).
  if (typeof total === 'number' && total > 0 && count >= total) {
    return true;
  }

  return false;
}

/** Bootstrap chapter pagination from offline cache using stored metadata or API-reported totals instead of modulo page-size heuristics. */
export function resolveCachedChapterPagination(details: {
  chapters?: Chapter[];
  totalChapters?: number;
  chapterPagination?: CachedChapterPaginationMeta;
}): CachedChapterPagination {
  const chapters = details.chapters ?? [];
  const cachedCount = chapters.length;
  const reachesStart = chapterListReachesSeriesStart(chapters);

  if (isChapterListCacheComplete(details)) {
    return {
      hasMore: false,
      nextPage:
        typeof details.chapterPagination?.nextPage === 'number'
          ? details.chapterPagination.nextPage
          : 2,
      ...(typeof details.chapterPagination?.lastPage === 'number'
        ? { lastPage: details.chapterPagination.lastPage }
        : typeof details.totalChapters === 'number' && details.totalChapters > 0
          ? {
            lastPage: Math.max(
              1,
              Math.ceil(details.totalChapters / DEFAULT_CHAPTER_PAGE_SIZE)
            ),
          }
          : {}),
    };
  }

  // Previously sealed incomplete lists (e.g. 40–90) must reopen the crawl.
  if (!reachesStart && cachedCount > 0) {
    return {
      hasMore: true,
      nextPage:
        typeof details.chapterPagination?.nextPage === 'number' &&
          details.chapterPagination.nextPage > 1
          ? details.chapterPagination.nextPage
          : estimateNextChapterPage(cachedCount),
      ...(typeof details.chapterPagination?.lastPage === 'number'
        ? { lastPage: details.chapterPagination.lastPage }
        : {}),
    };
  }

  if (details.chapterPagination) {
    return {
      hasMore: details.chapterPagination.hasMore ?? false,
      nextPage: details.chapterPagination.nextPage ?? 2,
      ...(typeof details.chapterPagination.lastPage === 'number'
        ? { lastPage: details.chapterPagination.lastPage }
        : {}),
    };
  }

  const total = details.totalChapters;

  if (typeof total === 'number' && total > 0) {
    const hasMore = cachedCount < total;
    return {
      hasMore,
      nextPage: hasMore ? estimateNextChapterPage(cachedCount) : 2,
    };
  }

  // Unknown total: a single-page-sized list that already reaches chapter 1 is likely complete; otherwise keep crawling.
  if (cachedCount > 0 && cachedCount <= DEFAULT_CHAPTER_PAGE_SIZE + 10) {
    return {
      hasMore: !reachesStart,
      nextPage: reachesStart ? 2 : estimateNextChapterPage(cachedCount),
    };
  }

  return { hasMore: false, nextPage: 2 };
}

export function buildCompleteChapterPagination(options: {
  chapterCount: number;
  lastPage?: number;
}): CachedChapterPagination {
  return {
    hasMore: false,
    nextPage:
      typeof options.lastPage === 'number' && options.lastPage > 0
        ? options.lastPage + 1
        : Math.max(2, estimateNextChapterPage(options.chapterCount)),
    ...(typeof options.lastPage === 'number'
      ? { lastPage: options.lastPage }
      : {}),
  };
}

/** Apply API pagination truth after a crawl finishes. When the API is exhausted (`apiHasMore: false`), always stop requesting more pages — even if the list does not reach chapter 1 — so the background loader cannot loop forever. Truncated lists are still treated as untrusted by `isChapterListCacheComplete` / `resolveCachedChapterPagination` and will reopen on the next screen open. */
export function resolveFinishedChapterPagination(options: {
  chapters: Chapter[];
  apiHasMore: boolean;
  nextPage: number;
  lastPage?: number;
}): CachedChapterPagination {
  const { apiHasMore, nextPage } = options;

  if (!apiHasMore) {
    return buildCompleteChapterPagination({
      chapterCount: options.chapters.length,
      ...(typeof options.lastPage === 'number'
        ? { lastPage: options.lastPage }
        : {}),
    });
  }

  return {
    hasMore: true,
    nextPage: Math.max(2, nextPage),
    ...(typeof options.lastPage === 'number'
      ? { lastPage: options.lastPage }
      : {}),
  };
}
