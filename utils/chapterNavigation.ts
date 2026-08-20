import type { Chapter } from '@/types/manga';
import {
  chapterNumbersMatch,
  findNextChapterInList,
  findPreviousChapterInList,
  parseChapterNumber,
} from '@/utils/chapterOrdering';

function isCurrentChapterInList(options: {
  currentChapterIndex: number;
  chapterNumber: string;
  chapters?: Chapter[];
}): boolean {
  if (options.currentChapterIndex >= 0) {
    return true;
  }

  return Boolean(
    options.chapters?.some((chapter) =>
      chapterNumbersMatch(chapter.number, options.chapterNumber)
    )
  );
}

export function resolveHasNextChapter(options: {
  currentChapterIndex: number;
  chapterNumber: string;
  chapters?: Chapter[];
  totalChapters?: number;
}): boolean {
  const chapters = options.chapters ?? [];
  const inList = isCurrentChapterInList({
    currentChapterIndex: options.currentChapterIndex,
    chapterNumber: options.chapterNumber,
    chapters,
  });

  if (inList) {
    return Boolean(findNextChapterInList(chapters, options.chapterNumber));
  }

  const current = parseChapterNumber(options.chapterNumber);
  if (current === Number.MAX_SAFE_INTEGER) {
    return false;
  }

  if (
    typeof options.totalChapters === 'number' &&
    options.totalChapters > 0
  ) {
    return current < options.totalChapters;
  }

  return chapters.some(
    (chapter) => parseChapterNumber(chapter.number) > current
  );
}

export function resolveHasPreviousChapter(options: {
  currentChapterIndex: number;
  chapterNumber: string;
  chapters?: Chapter[];
  totalChapters?: number;
}): boolean {
  const chapters = options.chapters ?? [];
  const inList = isCurrentChapterInList({
    currentChapterIndex: options.currentChapterIndex,
    chapterNumber: options.chapterNumber,
    chapters,
  });

  if (inList) {
    return Boolean(findPreviousChapterInList(chapters, options.chapterNumber));
  }

  const current = parseChapterNumber(options.chapterNumber);
  return current > 1 && current !== Number.MAX_SAFE_INTEGER;
}

/**
 * Pick the chapter to open for next/previous.
 *
 * Prefer the true numeric neighbor in the loaded list (3.5 → 4 → 4.5), never
 * invent decimal+1. When the current chapter sits outside a partial
 * newest-first window (Zom 100 ch.3.5 while only ~90–30 are loaded), step to
 * the next whole chapter (3.5 → 4) so Next still works.
 */
export function resolveAdjacentChapterNumber(options: {
  direction: 'next' | 'previous';
  chapterNumber: string;
  chapters?: Chapter[];
  currentChapterIndex?: number;
}): string | null {
  const chapters = options.chapters ?? [];
  const current = options.chapterNumber;
  const currentValue = parseChapterNumber(current);
  if (currentValue === Number.MAX_SAFE_INTEGER) {
    return null;
  }

  const inList = isCurrentChapterInList({
    currentChapterIndex: options.currentChapterIndex ?? -1,
    chapterNumber: current,
    chapters,
  });

  const adjacentInList =
    options.direction === 'next'
      ? findNextChapterInList(chapters, current)
      : findPreviousChapterInList(chapters, current);

  if (inList) {
    return adjacentInList?.number ?? null;
  }

  if (chapters.length && adjacentInList) {
    let oldest = Number.POSITIVE_INFINITY;
    let newest = Number.NEGATIVE_INFINITY;
    for (const chapter of chapters) {
      const value = parseChapterNumber(chapter.number);
      if (!Number.isFinite(value) || value === Number.MAX_SAFE_INTEGER) {
        continue;
      }
      if (value < oldest) {
        oldest = value;
      }
      if (value > newest) {
        newest = value;
      }
    }

    // Inside the loaded numeric window: trust list neighbors even when the
    // current chapter id is missing (e.g. 3.5 absent but 4 is present).
    if (
      Number.isFinite(oldest) &&
      Number.isFinite(newest) &&
      currentValue >= oldest &&
      currentValue <= newest
    ) {
      return adjacentInList.number;
    }
  }

  // Outside the loaded window (or empty list): step to the next whole chapter.
  // 3.5 → 4 (not 4.5); 4 → 5. This keeps Next working on Zom 100 ch.3.5 while
  // only the newest API page is loaded.
  if (options.direction === 'next') {
    const ceiling = Math.ceil(currentValue);
    const target = ceiling > currentValue ? ceiling : currentValue + 1;
    return Number.isInteger(target) ? String(target) : String(target);
  }

  const floor = Math.floor(currentValue);
  const target = floor < currentValue ? floor : currentValue - 1;
  if (target < 0) {
    return null;
  }
  return Number.isInteger(target) ? String(target) : String(target);
}
