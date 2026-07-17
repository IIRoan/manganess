import type { Chapter } from '@/types/manga';
import {
  appendUniqueChapters,
  getReportedChapterCount,
  loadRemainingChapterPages,
  pickOldestChapter,
  resolveOldestChapter,
  type MappedChapterPage,
} from '@/utils/chapterListPagination';

function chapter(number: string): Chapter {
  return {
    number,
    title: `Chapter ${number}`,
    date: '',
    url: `/chapter/${number}`,
  };
}

describe('chapterListPagination', () => {
  describe('pickOldestChapter', () => {
    it('returns null for an empty list', () => {
      expect(pickOldestChapter([])).toBeNull();
    });

    it('picks the lowest chapter number from a newest-first partial page', () => {
      // Page 1 of a long series: chapters 2427..2368 — not the real first chapter.
      const partialPage = [
        chapter('2427'),
        chapter('2426'),
        chapter('2368'),
      ];

      expect(pickOldestChapter(partialPage)?.number).toBe('2368');
    });

    it('finds chapter 1 even when it is not the last list item', () => {
      const chapters = [chapter('3'), chapter('1'), chapter('2')];
      expect(pickOldestChapter(chapters)?.number).toBe('1');
    });

    it('handles decimal chapter numbers', () => {
      const chapters = [chapter('10'), chapter('0.5'), chapter('1')];
      expect(pickOldestChapter(chapters)?.number).toBe('0.5');
    });
  });

  describe('appendUniqueChapters', () => {
    it('appends only unseen chapter numbers', () => {
      const existing = [chapter('100'), chapter('99')];
      const incoming = [chapter('99'), chapter('98'), chapter('97')];

      expect(appendUniqueChapters(existing, incoming).map((c) => c.number)).toEqual([
        '100',
        '99',
        '98',
        '97',
      ]);
    });

    it('returns the same array reference when nothing new is added', () => {
      const existing = [chapter('100')];
      const result = appendUniqueChapters(existing, [chapter('100')]);
      expect(result).toBe(existing);
    });
  });

  describe('loadRemainingChapterPages', () => {
    it('loads every remaining page until hasMore is false', async () => {
      const pages: Record<number, MappedChapterPage> = {
        2: {
          page: 2,
          hasMore: true,
          chapters: [chapter('60'), chapter('59')],
        },
        3: {
          page: 3,
          hasMore: false,
          chapters: [chapter('2'), chapter('1')],
        },
      };

      const fetchPage = jest.fn(async (page: number) => pages[page]!);
      const onPage = jest.fn();

      const result = await loadRemainingChapterPages({
        currentChapters: [chapter('120'), chapter('61')],
        nextPage: 2,
        hasMore: true,
        fetchPage,
        onPage,
      });

      expect(fetchPage).toHaveBeenCalledTimes(2);
      expect(fetchPage).toHaveBeenNthCalledWith(1, 2);
      expect(fetchPage).toHaveBeenNthCalledWith(2, 3);
      expect(result.hasMore).toBe(false);
      expect(result.nextPage).toBe(4);
      expect(result.chapters.map((c) => c.number)).toEqual([
        '120',
        '61',
        '60',
        '59',
        '2',
        '1',
      ]);
      expect(onPage).toHaveBeenCalledTimes(2);
    });

    it('stops when shouldCancel returns true', async () => {
      const fetchPage = jest.fn(async (page: number) => ({
        page,
        hasMore: true,
        chapters: [chapter(String(100 - page))],
      }));

      const result = await loadRemainingChapterPages({
        currentChapters: [chapter('100')],
        nextPage: 2,
        hasMore: true,
        fetchPage,
        shouldCancel: () => fetchPage.mock.calls.length >= 1,
      });

      expect(fetchPage).toHaveBeenCalledTimes(1);
      expect(result.hasMore).toBe(true);
      expect(result.chapters.map((c) => c.number)).toEqual(['100', '98']);
    });
  });

  describe('resolveOldestChapter', () => {
    it('uses loaded chapters when nothing more remains', async () => {
      const fetchPage = jest.fn();
      const oldest = await resolveOldestChapter({
        loadedChapters: [chapter('5'), chapter('1')],
        hasMore: false,
        fetchPage,
      });

      expect(oldest?.number).toBe('1');
      expect(fetchPage).not.toHaveBeenCalled();
    });

    it('fetches only the last API page when lastPage is known', async () => {
      const fetchPage = jest.fn(async (page: number) => {
        if (page === 41) {
          return {
            page: 41,
            hasMore: false,
            lastPage: 41,
            chapters: [chapter('3'), chapter('2'), chapter('1')],
          };
        }
        throw new Error(`unexpected page ${page}`);
      });

      const oldest = await resolveOldestChapter({
        loadedChapters: [chapter('2427'), chapter('2368')],
        hasMore: true,
        lastPage: 41,
        fetchPage,
      });

      expect(fetchPage).toHaveBeenCalledTimes(1);
      expect(fetchPage).toHaveBeenCalledWith(41);
      expect(oldest?.number).toBe('1');
    });

    it('does not treat the last loaded page-1 chapter as the first chapter', async () => {
      const fetchPage = jest.fn(async (page: number) => ({
        page,
        hasMore: page < 3,
        chapters:
          page === 2
            ? [chapter('100'), chapter('50')]
            : [chapter('2'), chapter('1')],
      }));

      const oldest = await resolveOldestChapter({
        loadedChapters: [chapter('2427'), chapter('2368')],
        hasMore: true,
        fetchPage,
      });

      expect(oldest?.number).toBe('1');
      expect(fetchPage.mock.calls.map((call) => call[0])).toEqual([2, 3]);
    });
  });

  describe('getReportedChapterCount', () => {
    it('prefers API totalChapters over the partial loaded list length', () => {
      expect(
        getReportedChapterCount({
          chapters: [chapter('2427'), chapter('2368')],
          totalChapters: 2427,
        })
      ).toBe(2427);
    });

    it('falls back to loaded list length when total is missing', () => {
      expect(
        getReportedChapterCount({
          chapters: [chapter('3'), chapter('2'), chapter('1')],
        })
      ).toBe(3);
    });

    it('returns 0 for empty details', () => {
      expect(getReportedChapterCount(null)).toBe(0);
      expect(getReportedChapterCount({ chapters: [] })).toBe(0);
    });
  });
});
