import type { Chapter } from '@/types';

export const parseChapterNumber = (value: string): number => {
  const parsed = Number.parseFloat(value);
  if (Number.isNaN(parsed)) {
    return Number.MAX_SAFE_INTEGER;
  }
  return parsed;
};

/**
 * Split a chapter id into numeric segments so 0 < 0.1 < 0.5 < 1 < 1.1 < 1.10.
 * Missing trailing segments compare as 0 ("1" === "1.0").
 */
const parseChapterSegments = (value: string): number[] | null => {
  const trimmed = String(value ?? '').trim();
  if (!trimmed) {
    return null;
  }

  const parts = trimmed.split('.');
  const segments: number[] = [];
  for (const part of parts) {
    if (!/^\d+$/.test(part)) {
      const parsed = Number.parseFloat(trimmed);
      return Number.isNaN(parsed) ? null : [parsed];
    }
    segments.push(Number.parseInt(part, 10));
  }

  return segments.length > 0 ? segments : null;
};

export const compareChapterNumbers = (a: string, b: string): number => {
  const left = parseChapterSegments(a);
  const right = parseChapterSegments(b);
  if (left == null && right == null) {
    return 0;
  }
  if (left == null) {
    return 1;
  }
  if (right == null) {
    return -1;
  }

  const length = Math.max(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const leftValue = left[index] ?? 0;
    const rightValue = right[index] ?? 0;
    if (leftValue !== rightValue) {
      return leftValue - rightValue;
    }
  }

  return 0;
};

export const chapterNumbersMatch = (a: string, b: string): boolean => {
  const left = String(a ?? '').trim();
  const right = String(b ?? '').trim();
  if (!left || !right) {
    return false;
  }
  if (left === right) {
    return true;
  }
  return compareChapterNumbers(left, right) === 0;
};

export const findNextChapterInList = <T extends { number: string }>(
  chapters: T[] | undefined,
  currentNumber: string
): T | undefined => {
  if (!chapters?.length) {
    return undefined;
  }

  let best: T | undefined;
  for (const chapter of chapters) {
    if (compareChapterNumbers(chapter.number, currentNumber) <= 0) {
      continue;
    }
    if (!best || compareChapterNumbers(chapter.number, best.number) < 0) {
      best = chapter;
    }
  }
  return best;
};

export const findPreviousChapterInList = <T extends { number: string }>(
  chapters: T[] | undefined,
  currentNumber: string
): T | undefined => {
  if (!chapters?.length) {
    return undefined;
  }

  let best: T | undefined;
  for (const chapter of chapters) {
    if (compareChapterNumbers(chapter.number, currentNumber) >= 0) {
      continue;
    }
    if (!best || compareChapterNumbers(chapter.number, best.number) > 0) {
      best = chapter;
    }
  }
  return best;
};

export const sortChaptersByNumber = <T extends { number: string }>(
  items: T[]
): T[] =>
  [...items].sort((a, b) => compareChapterNumbers(a.number, b.number));

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
