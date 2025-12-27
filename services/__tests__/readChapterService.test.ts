import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getReadChapters,
  getLastReadChapter,
  markChapterAsRead,
  markChapterAsUnread,
  setLastReadManga,
  getRecentlyReadManga,
  getLastReadManga,
} from '../readChapterService';

jest.mock('../bookmarkService', () => ({
  getMangaData: jest.fn(),
  setMangaData: jest.fn(),
}));

const { getMangaData, setMangaData } = require('../bookmarkService');

describe('readChapterService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('returns read chapters array from storage', async () => {
    (getMangaData as jest.Mock).mockResolvedValue({
      readChapters: ['1', '2'],
    });

    const chapters = await getReadChapters('123');
    expect(chapters).toEqual(['1', '2']);
  });

  it('derives last read chapter label', async () => {
    (getMangaData as jest.Mock).mockResolvedValue({ readChapters: [] });
    expect(await getLastReadChapter('1')).toBe('Not started');

    (getMangaData as jest.Mock).mockResolvedValue({ readChapters: ['1', '3'] });
    expect(await getLastReadChapter('1')).toBe('Chapter 3');
  });

  it('marks chapter as read and updates metadata', async () => {
    const manga = { id: 'm1', title: 'Manga', readChapters: ['1'] };
    (getMangaData as jest.Mock).mockResolvedValue(manga);
    (setMangaData as jest.Mock).mockResolvedValue(undefined);
    const updated = await markChapterAsRead('m1', '2', ['1']);

    expect(setMangaData).toHaveBeenCalledWith(
      expect.objectContaining({
        readChapters: ['1', '2'],
        lastReadChapter: '2',
      })
    );
    expect(updated).toEqual(['1', '2']);

    const meta = await AsyncStorage.getItem('last_read_manga');
    expect(meta).not.toBeNull();
    expect(JSON.parse(meta!)).toMatchObject({
      id: 'm1',
      title: 'Manga',
      chapterNumber: '2',
    });
  });

  it('marks chapter as unread and recalculates last read', async () => {
    const manga = { id: 'm1', title: 'Manga', readChapters: ['1', '2'] };
    (getMangaData as jest.Mock).mockResolvedValue(manga);
    (setMangaData as jest.Mock).mockResolvedValue(undefined);

    const result = await markChapterAsUnread('m1', '2', ['1', '2']);

    expect(setMangaData).toHaveBeenCalledWith(
      expect.objectContaining({
        readChapters: ['1'],
        lastReadChapter: '1',
      })
    );
    expect(result).toEqual({
      updatedChapters: ['1'],
      newLastReadChapter: '1',
    });
  });

  it('persists last read manga metadata', async () => {
    await setLastReadManga('m2', 'Title', '5');
    const data = await AsyncStorage.getItem('last_read_manga');
    expect(data).not.toBeNull();
    const parsed = JSON.parse(data!);
    expect(parsed).toMatchObject({
      id: 'm2',
      chapterNumber: '5',
      title: 'Title',
    });
  });

  it('returns recently read manga sorted by lastUpdated', async () => {
    const mangaA = {
      id: 'a',
      bannerImage: 'a.jpg',
      readChapters: ['1'],
      lastUpdated: 200,
    };
    const mangaB = {
      id: 'b',
      bannerImage: 'b.jpg',
      readChapters: ['1', '2'],
      lastUpdated: 500,
    };

    await AsyncStorage.setItem('manga_a', JSON.stringify(mangaA));
    await AsyncStorage.setItem('manga_b', JSON.stringify(mangaB));

    const result = await getRecentlyReadManga();
    expect(result.map((m) => m.id)).toEqual(['b', 'a']);
  });

  it('reads last read manga summary', async () => {
    const meta = { id: 'x', title: 'X', chapterNumber: '3', timestamp: 10 };
    await AsyncStorage.setItem('last_read_manga', JSON.stringify(meta));

    const stored = await getLastReadManga();
    expect(stored).toEqual(meta);
  });

  describe('error handling', () => {
    it('returns empty array when getReadChapters throws', async () => {
      (getMangaData as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const chapters = await getReadChapters('123');
      expect(chapters).toEqual([]);
    });

    it('returns empty array when getMangaData returns null', async () => {
      (getMangaData as jest.Mock).mockResolvedValue(null);

      const chapters = await getReadChapters('123');
      expect(chapters).toEqual([]);
    });

    it('returns null when getLastReadChapter throws', async () => {
      (getMangaData as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const lastChapter = await getLastReadChapter('123');
      expect(lastChapter).toBeNull();
    });

    it('returns current chapters when markChapterAsRead throws', async () => {
      (getMangaData as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const result = await markChapterAsRead('m1', '2', ['1']);
      expect(result).toEqual(['1']);
    });

    it('returns current chapters when markChapterAsRead has no manga data', async () => {
      (getMangaData as jest.Mock).mockResolvedValue(null);

      const result = await markChapterAsRead('m1', '2', ['1']);
      expect(result).toEqual(['1']);
    });

    it('returns current chapters when markChapterAsUnread throws', async () => {
      (getMangaData as jest.Mock).mockRejectedValue(new Error('Storage error'));

      const result = await markChapterAsUnread('m1', '2', ['1', '2']);
      expect(result).toEqual({
        updatedChapters: ['1', '2'],
        newLastReadChapter: null,
      });
    });

    it('returns current chapters when markChapterAsUnread has no manga data', async () => {
      (getMangaData as jest.Mock).mockResolvedValue(null);

      const result = await markChapterAsUnread('m1', '2', ['1', '2']);
      expect(result).toEqual({
        updatedChapters: ['1', '2'],
        newLastReadChapter: null,
      });
    });

    it('handles setLastReadManga error gracefully', async () => {
      jest
        .spyOn(AsyncStorage, 'setItem')
        .mockRejectedValueOnce(new Error('Storage error'));

      // Should not throw
      await expect(
        setLastReadManga('m1', 'Title', '1')
      ).resolves.not.toThrow();
    });

    it('returns empty array when getRecentlyReadManga throws', async () => {
      jest
        .spyOn(AsyncStorage, 'getAllKeys')
        .mockRejectedValueOnce(new Error('Storage error'));

      const result = await getRecentlyReadManga();
      expect(result).toEqual([]);
    });

    it('returns null when getLastReadManga has no data', async () => {
      const result = await getLastReadManga();
      expect(result).toBeNull();
    });

    it('returns null when getLastReadManga throws', async () => {
      jest
        .spyOn(AsyncStorage, 'getItem')
        .mockRejectedValueOnce(new Error('Storage error'));

      const result = await getLastReadManga();
      expect(result).toBeNull();
    });
  });

  describe('markChapterAsUnread edge cases', () => {
    it('sets lastReadChapter to empty string when all chapters unread', async () => {
      const manga = { id: 'm1', title: 'Manga', readChapters: ['1'] };
      (getMangaData as jest.Mock).mockResolvedValue(manga);
      (setMangaData as jest.Mock).mockResolvedValue(undefined);

      const result = await markChapterAsUnread('m1', '1', ['1']);

      expect(setMangaData).toHaveBeenCalledWith(
        expect.objectContaining({
          readChapters: [],
          lastReadChapter: '',
        })
      );
      expect(result).toEqual({
        updatedChapters: [],
        newLastReadChapter: null,
      });
    });

    it('updates lastReadManga when current chapter is the last read', async () => {
      // Set up last read manga
      await AsyncStorage.setItem(
        'last_read_manga',
        JSON.stringify({
          id: 'm1',
          title: 'Manga',
          chapterNumber: '3',
          timestamp: Date.now(),
        })
      );

      const manga = { id: 'm1', title: 'Manga', readChapters: ['1', '2', '3'] };
      (getMangaData as jest.Mock).mockResolvedValue(manga);
      (setMangaData as jest.Mock).mockResolvedValue(undefined);

      const result = await markChapterAsUnread('m1', '3', ['1', '2', '3']);

      expect(result.newLastReadChapter).toBe('2');

      // Check that last read manga was updated
      const lastReadManga = await AsyncStorage.getItem('last_read_manga');
      expect(JSON.parse(lastReadManga!).chapterNumber).toBe('2');
    });

    it('marks manga as not_started when all chapters unread and is last read', async () => {
      // Set up last read manga
      await AsyncStorage.setItem(
        'last_read_manga',
        JSON.stringify({
          id: 'm1',
          title: 'Manga',
          chapterNumber: '1',
          timestamp: Date.now(),
        })
      );

      const manga = { id: 'm1', title: 'Manga', readChapters: ['1'] };
      (getMangaData as jest.Mock).mockResolvedValue(manga);
      (setMangaData as jest.Mock).mockResolvedValue(undefined);

      await markChapterAsUnread('m1', '1', ['1']);

      // Check that last read manga was updated to not_started
      const lastReadManga = await AsyncStorage.getItem('last_read_manga');
      expect(JSON.parse(lastReadManga!).chapterNumber).toBe('not_started');
    });
  });

  describe('getRecentlyReadManga edge cases', () => {
    it('filters out manga without bannerImage', async () => {
      const mangaA = {
        id: 'a',
        bannerImage: 'a.jpg',
        readChapters: ['1'],
        lastUpdated: 200,
      };
      const mangaB = {
        id: 'b',
        bannerImage: null,
        readChapters: ['1'],
        lastUpdated: 500,
      };

      await AsyncStorage.setItem('manga_a', JSON.stringify(mangaA));
      await AsyncStorage.setItem('manga_b', JSON.stringify(mangaB));

      const result = await getRecentlyReadManga();
      expect(result.map((m) => m.id)).toEqual(['a']);
    });

    it('filters out manga without readChapters', async () => {
      const mangaA = {
        id: 'a',
        bannerImage: 'a.jpg',
        readChapters: ['1'],
        lastUpdated: 200,
      };
      const mangaB = {
        id: 'b',
        bannerImage: 'b.jpg',
        readChapters: [],
        lastUpdated: 500,
      };

      await AsyncStorage.setItem('manga_a', JSON.stringify(mangaA));
      await AsyncStorage.setItem('manga_b', JSON.stringify(mangaB));

      const result = await getRecentlyReadManga();
      expect(result.map((m) => m.id)).toEqual(['a']);
    });

    it('respects limit parameter', async () => {
      for (let i = 0; i < 10; i++) {
        const manga = {
          id: `m${i}`,
          bannerImage: `${i}.jpg`,
          readChapters: ['1'],
          lastUpdated: i * 100,
        };
        await AsyncStorage.setItem(`manga_m${i}`, JSON.stringify(manga));
      }

      const result = await getRecentlyReadManga(3);
      expect(result.length).toBe(3);
    });

    it('ignores _read_chapters keys', async () => {
      const manga = {
        id: 'a',
        bannerImage: 'a.jpg',
        readChapters: ['1'],
        lastUpdated: 200,
      };

      await AsyncStorage.setItem('manga_a', JSON.stringify(manga));
      await AsyncStorage.setItem('manga_a_read_chapters', JSON.stringify(['1', '2']));

      const result = await getRecentlyReadManga();
      expect(result.length).toBe(1);
      expect(result[0].id).toBe('a');
    });
  });
});
