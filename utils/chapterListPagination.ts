import type { Chapter } from '@/types/manga';

export interface MappedChapterPage {
  chapters: Chapter[];
  hasMore: boolean;
  page: number;
  lastPage?: number;
  total?: number;
}

/**
 * MangaFire chapter lists are newest-first. The true first/oldest chapter is
 * the lowest chapter number (not merely the last item in a partial page-1 list).
 */
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

/** Append newly fetched pages while preserving newest-first order and deduping. */
export function appendUniqueChapters(
  existing: Chapter[],
  incoming: Chapter[]
): Chapter[] {
  if (!incoming.length) {
    return existing;
  }

  const seen = new Set(existing.map((chapter) => chapter.number));
  const appended = incoming.filter((chapter) => {
    if (seen.has(chapter.number)) {
      return false;
    }
    seen.add(chapter.number);
    return true;
  });

  if (!appended.length) {
    return existing;
  }

  return [...existing, ...appended];
}

export interface LoadRemainingChaptersResult {
  chapters: Chapter[];
  nextPage: number;
  hasMore: boolean;
}

/**
 * Keep fetching chapter pages until the API reports no more (or cancel).
 * Used when the UI needs the true end of the list (start reading / scroll bottom).
 */
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

/**
 * Resolve the oldest chapter when only a partial newest-first list is loaded.
 * Prefers fetching the API's last page over crawling every middle page.
 */
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

/**
 * Prefer the API-reported total over the currently loaded (possibly partial) list.
 */
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

/**
 * Bootstrap chapter pagination from offline cache using stored metadata or
 * API-reported totals instead of modulo page-size heuristics.
 */
export function resolveCachedChapterPagination(details: {
  chapters?: Chapter[];
  totalChapters?: number;
  chapterPagination?: CachedChapterPaginationMeta;
}): CachedChapterPagination {
  if (details.chapterPagination) {
    return {
      hasMore: details.chapterPagination.hasMore ?? false,
      nextPage: details.chapterPagination.nextPage ?? 2,
      ...(typeof details.chapterPagination.lastPage === 'number'
        ? { lastPage: details.chapterPagination.lastPage }
        : {}),
    };
  }

  const cachedCount = details.chapters?.length ?? 0;
  const total = details.totalChapters;

  if (typeof total === 'number' && total > 0) {
    const hasMore = cachedCount < total;
    return {
      hasMore,
      nextPage: hasMore ? estimateNextChapterPage(cachedCount) : 2,
    };
  }

  return { hasMore: false, nextPage: 2 };
}
