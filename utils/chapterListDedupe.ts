/**
 * MangaFire often returns both official and unofficial rows for the same
 * chapter number (One Piece ~2,400 mixed vs ~1,240 unique). Always fetch the
 * mixed list and collapse duplicates preferring official — never drop numbers
 * that only appear as unofficial (extras like 25.5 / 1080.1).
 *
 * Separately, users can hide "extra" / half chapters (3.1, 3.5) in the UI.
 */

import { parseChapterNumber } from '@/utils/chapterOrdering';

/** True for half-chapters / extras like 3.1, 3.5, 1.10 — not for 3 or 3.0. */
export function isExtraChapterNumber(
  number: string | number | null | undefined
): boolean {
  const raw = String(number ?? '').trim();
  if (!raw) {
    return false;
  }

  const value = parseChapterNumber(raw);
  if (value === Number.MAX_SAFE_INTEGER) {
    return false;
  }

  return !Number.isInteger(value);
}

export function filterOutExtraChapters<T extends { number: string }>(
  chapters: T[],
  hideExtras: boolean
): T[] {
  if (!hideExtras || chapters.length === 0) {
    return chapters;
  }
  return chapters.filter((chapter) => !isExtraChapterNumber(chapter.number));
}

function chapterNumberKey(number: string | number | null | undefined): string {
  return String(number ?? '').trim();
}

function isOfficialType(type: string | null | undefined): boolean {
  return String(type ?? '').trim().toLowerCase() === 'official';
}

/**
 * Collapse duplicate chapter numbers, keeping official rows when present.
 * Preserves first-seen order (MangaFire lists are newest-first).
 */
export function dedupeChaptersPreferringOfficial<
  T extends { number: string | number; type?: string | null },
>(chapters: T[]): T[] {
  if (chapters.length <= 1) {
    return chapters;
  }

  const chosen = new Map<string, T>();
  const order: string[] = [];

  for (const chapter of chapters) {
    const key = chapterNumberKey(chapter.number);
    if (!key) {
      continue;
    }

    const existing = chosen.get(key);
    if (!existing) {
      chosen.set(key, chapter);
      order.push(key);
      continue;
    }

    if (!isOfficialType(existing.type) && isOfficialType(chapter.type)) {
      chosen.set(key, chapter);
    }
  }

  return order.map((key) => chosen.get(key)!);
}

/**
 * Merge newly fetched chapter pages into an existing list.
 * First-seen order is preserved; a later official row replaces an unofficial one.
 */
export function mergeChaptersPreferringOfficial<
  T extends { number: string; type?: string | null },
>(existing: T[], incoming: T[]): T[] {
  if (!incoming.length) {
    return existing;
  }
  if (!existing.length) {
    return dedupeChaptersPreferringOfficial(incoming);
  }

  return dedupeChaptersPreferringOfficial([...existing, ...incoming]);
}

/**
 * Mixed-list API totals count duplicates. Trust the total only when no
 * duplicates have been seen yet, or when pagination is finished (unique count).
 */
export function resolveReportedChapterTotal(options: {
  rawCount: number;
  uniqueCount: number;
  apiTotal?: number;
  hasMore: boolean;
}): number | undefined {
  const { rawCount, uniqueCount, apiTotal, hasMore } = options;

  if (!hasMore) {
    return uniqueCount > 0 ? uniqueCount : undefined;
  }

  // Still paginating: only trust API total while the mixed list looks
  // duplication-free (Chainsaw Man / Naruto). One Piece fails this on page 1.
  if (
    rawCount === uniqueCount &&
    typeof apiTotal === 'number' &&
    apiTotal > 0
  ) {
    return apiTotal;
  }

  return undefined;
}
