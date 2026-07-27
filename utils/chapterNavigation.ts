import type { Chapter } from '@/types/manga';
import { parseChapterNumber } from '@/utils/chapterOrdering';

export function resolveHasNextChapter(options: {
  currentChapterIndex: number;
  chapterNumber: string;
  chapters?: Chapter[];
  totalChapters?: number;
}): boolean {
  if (options.currentChapterIndex > 0) {
    return true;
  }

  if (options.currentChapterIndex === 0) {
    return false;
  }

  const current = parseChapterNumber(options.chapterNumber);
  if (current <= 0 || current === Number.MAX_SAFE_INTEGER) {
    return false;
  }

  if (
    typeof options.totalChapters === 'number' &&
    options.totalChapters > 0
  ) {
    return current < options.totalChapters;
  }

  const chapters = options.chapters ?? [];
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
  if (
    options.currentChapterIndex > -1 &&
    options.currentChapterIndex <
      (options.chapters?.length ?? 0) - 1 &&
    !!options.chapters?.[options.currentChapterIndex + 1]
  ) {
    return true;
  }

  if (options.currentChapterIndex >= 0) {
    return false;
  }

  const current = parseChapterNumber(options.chapterNumber);
  return current > 1 && current !== Number.MAX_SAFE_INTEGER;
}
