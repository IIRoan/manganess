import {
  parseChapterNumber,
  sortChaptersByNumber,
  filterChaptersUpTo,
  filterChaptersInRange,
} from '../chapterOrdering';
import type { Chapter } from '@/types';

describe('chapterOrdering', () => {
  describe('parseChapterNumber', () => {
    it('parses integer chapter numbers', () => {
      expect(parseChapterNumber('1')).toBe(1);
      expect(parseChapterNumber('10')).toBe(10);
      expect(parseChapterNumber('100')).toBe(100);
    });

    it('parses decimal chapter numbers', () => {
      expect(parseChapterNumber('1.5')).toBe(1.5);
      expect(parseChapterNumber('10.1')).toBe(10.1);
      expect(parseChapterNumber('100.25')).toBe(100.25);
    });

    it('parses zero', () => {
      expect(parseChapterNumber('0')).toBe(0);
      expect(parseChapterNumber('0.5')).toBe(0.5);
    });

    it('parses negative numbers', () => {
      expect(parseChapterNumber('-1')).toBe(-1);
      expect(parseChapterNumber('-0.5')).toBe(-0.5);
    });

    it('returns MAX_SAFE_INTEGER for invalid strings', () => {
      expect(parseChapterNumber('')).toBe(Number.MAX_SAFE_INTEGER);
      expect(parseChapterNumber('abc')).toBe(Number.MAX_SAFE_INTEGER);
      expect(parseChapterNumber('chapter 1')).toBe(Number.MAX_SAFE_INTEGER);
      expect(parseChapterNumber('NaN')).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('handles whitespace', () => {
      expect(parseChapterNumber(' 5 ')).toBe(5);
      expect(parseChapterNumber('  10.5  ')).toBe(10.5);
    });

    it('handles special number formats', () => {
      expect(parseChapterNumber('1e2')).toBe(100); // Scientific notation
      expect(parseChapterNumber('.5')).toBe(0.5); // Leading decimal
    });
  });

  describe('sortChaptersByNumber', () => {
    it('sorts chapters in ascending order', () => {
      const chapters = [
        { number: '3' },
        { number: '1' },
        { number: '2' },
      ];

      const sorted = sortChaptersByNumber(chapters);

      expect(sorted.map((c) => c.number)).toEqual(['1', '2', '3']);
    });

    it('handles decimal chapter numbers', () => {
      const chapters = [
        { number: '2' },
        { number: '1.5' },
        { number: '1' },
        { number: '1.1' },
      ];

      const sorted = sortChaptersByNumber(chapters);

      expect(sorted.map((c) => c.number)).toEqual(['1', '1.1', '1.5', '2']);
    });

    it('does not mutate original array', () => {
      const original = [{ number: '3' }, { number: '1' }, { number: '2' }];
      const originalCopy = [...original];

      sortChaptersByNumber(original);

      expect(original).toEqual(originalCopy);
    });

    it('handles empty array', () => {
      expect(sortChaptersByNumber([])).toEqual([]);
    });

    it('handles single item array', () => {
      const chapters = [{ number: '1' }];
      expect(sortChaptersByNumber(chapters)).toEqual([{ number: '1' }]);
    });

    it('places invalid chapter numbers at end', () => {
      const chapters = [
        { number: '2' },
        { number: 'special' },
        { number: '1' },
      ];

      const sorted = sortChaptersByNumber(chapters);

      expect(sorted.map((c) => c.number)).toEqual(['1', '2', 'special']);
    });

    it('preserves other properties', () => {
      const chapters = [
        { number: '2', title: 'Chapter 2', id: 'ch2' },
        { number: '1', title: 'Chapter 1', id: 'ch1' },
      ];

      const sorted = sortChaptersByNumber(chapters);

      expect(sorted[0]).toEqual({ number: '1', title: 'Chapter 1', id: 'ch1' });
      expect(sorted[1]).toEqual({ number: '2', title: 'Chapter 2', id: 'ch2' });
    });
  });

  describe('filterChaptersUpTo', () => {
    const createChapters = (numbers: string[]): Chapter[] =>
      numbers.map((number) => ({
        number,
        title: `Chapter ${number}`,
        url: `/chapter/${number}`,
        date: '2024-01-01',
      }));

    it('filters chapters up to and including max number', () => {
      const chapters = createChapters(['1', '2', '3', '4', '5']);

      const filtered = filterChaptersUpTo(chapters, 3);

      expect(filtered.map((c) => c.number)).toEqual(['1', '2', '3']);
    });

    it('returns sorted chapters', () => {
      const chapters = createChapters(['5', '3', '1', '4', '2']);

      const filtered = filterChaptersUpTo(chapters, 3);

      expect(filtered.map((c) => c.number)).toEqual(['1', '2', '3']);
    });

    it('handles decimal chapter numbers', () => {
      const chapters = createChapters(['1', '1.5', '2', '2.5', '3']);

      const filtered = filterChaptersUpTo(chapters, 2);

      expect(filtered.map((c) => c.number)).toEqual(['1', '1.5', '2']);
    });

    it('returns empty array when no chapters match', () => {
      const chapters = createChapters(['5', '6', '7']);

      const filtered = filterChaptersUpTo(chapters, 3);

      expect(filtered).toEqual([]);
    });

    it('returns all chapters when max is higher than all', () => {
      const chapters = createChapters(['1', '2', '3']);

      const filtered = filterChaptersUpTo(chapters, 100);

      expect(filtered.map((c) => c.number)).toEqual(['1', '2', '3']);
    });

    it('handles empty array', () => {
      expect(filterChaptersUpTo([], 5)).toEqual([]);
    });
  });

  describe('filterChaptersInRange', () => {
    const createChapters = (numbers: string[]): Chapter[] =>
      numbers.map((number) => ({
        number,
        title: `Chapter ${number}`,
        url: `/chapter/${number}`,
        date: '2024-01-01',
      }));

    it('filters chapters within range inclusive', () => {
      const chapters = createChapters(['1', '2', '3', '4', '5']);

      const filtered = filterChaptersInRange(chapters, 2, 4);

      expect(filtered.map((c) => c.number)).toEqual(['2', '3', '4']);
    });

    it('returns sorted chapters', () => {
      const chapters = createChapters(['5', '3', '1', '4', '2']);

      const filtered = filterChaptersInRange(chapters, 2, 4);

      expect(filtered.map((c) => c.number)).toEqual(['2', '3', '4']);
    });

    it('handles decimal chapter numbers', () => {
      const chapters = createChapters(['1', '1.5', '2', '2.5', '3', '3.5']);

      const filtered = filterChaptersInRange(chapters, 1.5, 3);

      expect(filtered.map((c) => c.number)).toEqual(['1.5', '2', '2.5', '3']);
    });

    it('returns empty array when no chapters in range', () => {
      const chapters = createChapters(['1', '2', '10', '11']);

      const filtered = filterChaptersInRange(chapters, 5, 8);

      expect(filtered).toEqual([]);
    });

    it('handles single chapter in range', () => {
      const chapters = createChapters(['1', '5', '10']);

      const filtered = filterChaptersInRange(chapters, 5, 5);

      expect(filtered.map((c) => c.number)).toEqual(['5']);
    });

    it('handles inverted range (from > to)', () => {
      const chapters = createChapters(['1', '2', '3', '4', '5']);

      const filtered = filterChaptersInRange(chapters, 4, 2);

      expect(filtered).toEqual([]);
    });

    it('handles empty array', () => {
      expect(filterChaptersInRange([], 1, 10)).toEqual([]);
    });

    it('handles negative range values', () => {
      const chapters = createChapters(['-2', '-1', '0', '1', '2']);

      const filtered = filterChaptersInRange(chapters, -1, 1);

      expect(filtered.map((c) => c.number)).toEqual(['-1', '0', '1']);
    });
  });
});
