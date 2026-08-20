import type { Chapter } from '@/types/manga';
import {
  resolveAdjacentChapterNumber,
  resolveHasNextChapter,
  resolveHasPreviousChapter,
} from '@/utils/chapterNavigation';

function chapter(number: string): Chapter {
  return {
    number,
    title: `Chapter ${number}`,
    date: '',
    url: `/chapter/${number}`,
  };
}

describe('chapterNavigation', () => {
  describe('resolveHasNextChapter', () => {
    it('returns true when a newer chapter exists in the loaded list', () => {
      const chapters = [chapter('10'), chapter('9'), chapter('8')];

      expect(
        resolveHasNextChapter({
          currentChapterIndex: 1,
          chapterNumber: '9',
          chapters,
        })
      ).toBe(true);
    });

    it('returns false on the newest loaded chapter', () => {
      expect(
        resolveHasNextChapter({
          currentChapterIndex: 0,
          chapterNumber: '10',
          chapters: [chapter('10'), chapter('9')],
        })
      ).toBe(false);
    });

    it('does not enable next chapter past the reported series end', () => {
      expect(
        resolveHasNextChapter({
          currentChapterIndex: -1,
          chapterNumber: '2427',
          chapters: [chapter('2427'), chapter('2426')],
          totalChapters: 2427,
        })
      ).toBe(false);
    });

    it('allows next chapter when absent from a partial list but below totalChapters', () => {
      expect(
        resolveHasNextChapter({
          currentChapterIndex: -1,
          chapterNumber: '100',
          chapters: [chapter('2427'), chapter('2426')],
          totalChapters: 2427,
        })
      ).toBe(true);
    });

    it('falls back to loaded chapter numbers when totalChapters is unknown', () => {
      expect(
        resolveHasNextChapter({
          currentChapterIndex: -1,
          chapterNumber: '100',
          chapters: [chapter('2427'), chapter('150')],
        })
      ).toBe(true);

      expect(
        resolveHasNextChapter({
          currentChapterIndex: -1,
          chapterNumber: '2427',
          chapters: [chapter('2427'), chapter('2426')],
        })
      ).toBe(false);
    });

    it('enables next on chapter 0 when 0.1 or 0.5 exists', () => {
      const chapters = [
        chapter('1'),
        chapter('0.5'),
        chapter('0.1'),
        chapter('0'),
      ];

      expect(
        resolveHasNextChapter({
          currentChapterIndex: 3,
          chapterNumber: '0',
          chapters,
        })
      ).toBe(true);
    });

    it('enables next on chapter 0 when absent from a newest-first page', () => {
      expect(
        resolveHasNextChapter({
          currentChapterIndex: -1,
          chapterNumber: '0',
          chapters: [chapter('100'), chapter('99')],
          totalChapters: 100,
        })
      ).toBe(true);
    });
  });

  describe('resolveHasPreviousChapter', () => {
    it('returns true when an older chapter exists in the loaded list', () => {
      expect(
        resolveHasPreviousChapter({
          currentChapterIndex: 0,
          chapterNumber: '10',
          chapters: [chapter('10'), chapter('9')],
        })
      ).toBe(true);
    });

    it('returns false on chapter 1 when absent from a partial list', () => {
      expect(
        resolveHasPreviousChapter({
          currentChapterIndex: -1,
          chapterNumber: '1',
          chapters: [chapter('2427'), chapter('2426')],
          totalChapters: 2427,
        })
      ).toBe(false);
    });

    it('allows previous chapter when absent from a partial list and above chapter 1', () => {
      expect(
        resolveHasPreviousChapter({
          currentChapterIndex: -1,
          chapterNumber: '100',
          chapters: [chapter('2427'), chapter('2426')],
          totalChapters: 2427,
        })
      ).toBe(true);
    });

    it('allows previous from 0.1 when chapter 0 is in the list', () => {
      expect(
        resolveHasPreviousChapter({
          currentChapterIndex: 2,
          chapterNumber: '0.1',
          chapters: [chapter('1'), chapter('0.5'), chapter('0.1'), chapter('0')],
        })
      ).toBe(true);
    });
  });

  describe('resolveAdjacentChapterNumber', () => {
    const extras = [
      chapter('1'),
      chapter('0.5'),
      chapter('0.1'),
      chapter('0'),
    ];

    it('goes 3.5 → 4 → 4.5 instead of adding 1 to the decimal', () => {
      const chapters = [
        chapter('5'),
        chapter('4.5'),
        chapter('4'),
        chapter('3.5'),
        chapter('3'),
      ];

      expect(
        resolveAdjacentChapterNumber({
          direction: 'next',
          chapterNumber: '3.5',
          chapters,
          currentChapterIndex: 3,
        })
      ).toBe('4');

      expect(
        resolveAdjacentChapterNumber({
          direction: 'next',
          chapterNumber: '4',
          chapters,
          currentChapterIndex: 2,
        })
      ).toBe('4.5');

      expect(
        resolveAdjacentChapterNumber({
          direction: 'previous',
          chapterNumber: '4.5',
          chapters,
          currentChapterIndex: 1,
        })
      ).toBe('4');
    });

    it('finds 4 after 3.5 even when 3.5 is missing from the loaded list', () => {
      const chapters = [
        chapter('5'),
        chapter('4.5'),
        chapter('4'),
        chapter('3'),
      ];

      expect(
        resolveAdjacentChapterNumber({
          direction: 'next',
          chapterNumber: '3.5',
          chapters,
          currentChapterIndex: -1,
        })
      ).toBe('4');
    });

    it('steps decimals to the next whole chapter when outside the loaded window', () => {
      // Zom 100: reading 3.5 while only the newest page (~90–30) is loaded.
      expect(
        resolveAdjacentChapterNumber({
          direction: 'next',
          chapterNumber: '3.5',
          chapters: [chapter('90'), chapter('89'), chapter('30')],
          currentChapterIndex: -1,
        })
      ).toBe('4');

      expect(
        resolveAdjacentChapterNumber({
          direction: 'next',
          chapterNumber: '100.5',
          chapters: [],
          currentChapterIndex: -1,
        })
      ).toBe('101');
    });

    it('goes 0 → 0.1 → 0.5 → 1 instead of incrementing by 1', () => {
      expect(
        resolveAdjacentChapterNumber({
          direction: 'next',
          chapterNumber: '0',
          chapters: extras,
          currentChapterIndex: 3,
        })
      ).toBe('0.1');

      expect(
        resolveAdjacentChapterNumber({
          direction: 'next',
          chapterNumber: '0.1',
          chapters: extras,
          currentChapterIndex: 2,
        })
      ).toBe('0.5');

      expect(
        resolveAdjacentChapterNumber({
          direction: 'next',
          chapterNumber: '0.5',
          chapters: extras,
          currentChapterIndex: 1,
        })
      ).toBe('1');
    });

    it('steps 0.1 to chapter 1 when extras are missing from page 1 (not 1.1)', () => {
      expect(
        resolveAdjacentChapterNumber({
          direction: 'next',
          chapterNumber: '0.1',
          chapters: [chapter('100'), chapter('99')],
          currentChapterIndex: -1,
        })
      ).toBe('1');
    });

    it('still uses sequential numbering in the middle of a long series', () => {
      expect(
        resolveAdjacentChapterNumber({
          direction: 'next',
          chapterNumber: '100',
          chapters: [chapter('2427'), chapter('2426')],
          currentChapterIndex: -1,
        })
      ).toBe('101');
    });
  });
});
