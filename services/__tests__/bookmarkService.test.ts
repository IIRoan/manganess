import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getMangaData,
  setMangaData,
  fetchBookmarkStatus,
  saveBookmark,
  removeBookmark,
  getBookmarkPopupConfig,
  getChapterLongPressAlertConfig,
} from '../bookmarkService';

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Platform: { OS: 'ios' },
}));

jest.mock('@/services/anilistService', () => ({
  updateAniListStatus: jest
    .fn()
    .mockResolvedValue({ success: true, message: '' }),
}));

const { Alert } = require('react-native');
const { updateAniListStatus } = require('@/services/anilistService');

describe('bookmarkService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  it('reads and writes manga data with metadata updates', async () => {
    const manga = {
      id: '123',
      title: 'Example',
      bannerImage: 'image.jpg',
      bookmarkStatus: 'Reading' as const,
      readChapters: ['1'],
      lastUpdated: 111,
      totalChapters: 10,
    };

    await setMangaData(manga);

    const stored = await AsyncStorage.getItem('manga_123');
    expect(stored).not.toBeNull();
    expect(JSON.parse(stored!)).toMatchObject(manga);

    const keys = await AsyncStorage.getItem('bookmarkKeys');
    expect(JSON.parse(keys!)).toContain('bookmark_123');
    expect(await AsyncStorage.getItem('bookmarkChanged')).toBe('true');

    const fetched = await getMangaData('123');
    expect(fetched).toEqual(manga);
  });

  it('returns bookmark status and removes bookmarks cleanly', async () => {
    await AsyncStorage.setItem(
      'manga_abc',
      JSON.stringify({ id: 'abc', bookmarkStatus: 'Read' })
    );
    await AsyncStorage.setItem(
      'bookmarkKeys',
      JSON.stringify(['bookmark_abc'])
    );

    expect(await fetchBookmarkStatus('abc')).toBe('Read');

    const setBookmarkStatus = jest.fn();
    const setIsAlertVisible = jest.fn();
    await removeBookmark('abc', setBookmarkStatus, setIsAlertVisible);

    expect(await AsyncStorage.getItem('manga_abc')).toBeNull();
    expect(setBookmarkStatus).toHaveBeenCalledWith(null);
    expect(setIsAlertVisible).toHaveBeenCalledWith(false);
    expect(await AsyncStorage.getItem('bookmarkChanged')).toBe('true');
  });

  it('builds popup configuration based on current status', () => {
    const handler = jest.fn();
    const popup = getBookmarkPopupConfig('Reading', 'Title', handler, handler);
    expect(popup.options).toHaveLength(5);

    const popupNew = getBookmarkPopupConfig(null, 'Title', handler, handler);
    expect(popupNew.options).toHaveLength(4);
  });

  it('saves bookmark and triggers AniList update', async () => {
    const setBookmarkStatus = jest.fn();
    const setIsAlertVisible = jest.fn();
    const setReadChapters = jest.fn();

    const mangaDetails = {
      title: 'Series',
      bannerImage: 'img',
      chapters: [{ number: '1' }],
    };

    await saveBookmark(
      'm1',
      'Reading',
      mangaDetails,
      ['1'],
      setBookmarkStatus,
      setIsAlertVisible,
      setReadChapters
    );

    expect(setBookmarkStatus).toHaveBeenCalledWith('Reading');
    expect(setIsAlertVisible).toHaveBeenCalledWith(false);
    expect(updateAniListStatus).toHaveBeenCalledWith(
      'Series',
      'Reading',
      ['1'],
      1
    );
    expect(Alert.alert).not.toHaveBeenCalled();
  });

  it('prompts when marking series as read', async () => {
    const setBookmarkStatus = jest.fn();
    const setIsAlertVisible = jest.fn();
    const setReadChapters = jest.fn();

    const mangaDetails = {
      title: 'Series',
      bannerImage: 'img',
      chapters: [{ number: '1' }, { number: '2' }],
    };

    await saveBookmark(
      'm2',
      'Read',
      mangaDetails,
      ['1'],
      setBookmarkStatus,
      setIsAlertVisible,
      setReadChapters
    );

    expect(Alert.alert).toHaveBeenCalled();
    const args = (Alert.alert as jest.Mock).mock.calls[0];
    const options = args[2];
    expect(options).toHaveLength(2);

    await options[1].onPress();
    expect(updateAniListStatus).toHaveBeenCalledWith(
      'Series',
      'Read',
      ['1'],
      2
    );
  });

  it('marks chapters as read via long press config', async () => {
    const setReadChapters = jest.fn();
    await AsyncStorage.setItem(
      'manga_1',
      JSON.stringify({ id: '1', readChapters: ['1'], lastReadChapter: '1' })
    );

    const mangaDetails = {
      chapters: [{ number: '1' }, { number: '2' }, { number: '3' }],
    };

    const config = getChapterLongPressAlertConfig(
      false,
      '2',
      mangaDetails,
      '1',
      ['1'],
      setReadChapters
    );

    expect(config?.options).toHaveLength(2);
    await config?.options?.[1]?.onPress?.();

    const stored = await AsyncStorage.getItem('manga_1');
    const parsed = stored ? JSON.parse(stored) : null;
    expect(parsed?.readChapters).toEqual(['1', '2']);
    expect(parsed?.lastReadChapter).toBe('2');
    expect(setReadChapters).toHaveBeenCalledWith(['1', '2']);
  });
});
