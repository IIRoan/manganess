import type { Chapter } from '@/types/manga';
import {
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
  });
});
