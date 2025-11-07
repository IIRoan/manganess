import type { Chapter } from '@/types';

export const parseChapterNumber = (value: string): number => {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return parsed;
};

export const sortChaptersByNumber = <T extends { number: string }>(
  items: T[]
): T[] =>
  [...items].sort(
    (a, b) => parseChapterNumber(a.number) - parseChapterNumber(b.number)
  );

export const filterChaptersUpTo = (
  chapters: Chapter[],
  maxChapterNumber: number
): Chapter[] =>
  sortChaptersByNumber(chapters).filter(
    (chapter) => parseChapterNumber(chapter.number) <= maxChapterNumber
  );

export const filterChaptersInRange = (
  chapters: Chapter[],
  fromChapterNumber: number,
  toChapterNumber: number
): Chapter[] =>
  sortChaptersByNumber(chapters).filter((chapter) => {
    const parsed = parseChapterNumber(chapter.number);
    return parsed >= fromChapterNumber && parsed <= toChapterNumber;
  });
