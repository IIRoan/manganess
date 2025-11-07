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
});
