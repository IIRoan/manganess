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
 * When the current chapter is in the loaded list, use true numeric neighbors
 * (0 → 0.1 → 0.5 → 1 → 1.1) instead of ±1. Sequential ±1 is only a fallback
 * for the middle of a long series whose oldest chapters are not loaded yet.
 */
export function resolveAdjacentChapterNumber(options: {
  direction: 'next' | 'previous';
  chapterNumber: string;
  chapters?: Chapter[];
  currentChapterIndex?: number;
}): string | null {
  const chapters = options.chapters ?? [];
  const current = options.chapterNumber;
  const inList = isCurrentChapterInList({
    currentChapterIndex: options.currentChapterIndex ?? -1,
    chapterNumber: current,
    chapters,
  });

  if (inList) {
    const adjacent =
      options.direction === 'next'
        ? findNextChapterInList(chapters, current)
        : findPreviousChapterInList(chapters, current);
    return adjacent?.number ?? null;
  }

  const currentValue = parseChapterNumber(current);
  if (currentValue === Number.MAX_SAFE_INTEGER) {
    return null;
  }

  if (chapters.length) {
    let oldest = Number.POSITIVE_INFINITY;
    for (const chapter of chapters) {
      const value = parseChapterNumber(chapter.number);
      if (value < oldest) {
        oldest = value;
      }
    }

    // Prologue / decimal chapters live on the oldest API page. Do not invent
    // 0+1=1 or 0.1+1=1.1 while that page is still missing.
    const isDecimalOrPrologue =
      currentValue < 1 || !Number.isInteger(currentValue);
    if (
      Number.isFinite(oldest) &&
      currentValue < oldest &&
      isDecimalOrPrologue
    ) {
      return null;
    }
  }

  const targetValue =
    currentValue + (options.direction === 'next' ? 1 : -1);
  if (targetValue < 0) {
    return null;
  }

  return Number.isInteger(targetValue)
    ? String(targetValue)
    : String(targetValue);
}
