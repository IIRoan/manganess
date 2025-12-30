import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  getMangaData,
  setMangaData,
  fetchBookmarkStatus,
  saveBookmark,
  removeBookmark,
  getBookmarkPopupConfig,
  getChapterLongPressAlertConfig,
  updateDownloadStatus,
  removeDownloadStatus,
  updateTotalDownloadSize,
  getDownloadedChapters,
  getChapterDownloadStatus,
  isChapterDownloaded,
  getAllDownloadedManga,
  getTotalDownloadSize,
} from '../bookmarkService';
import { DownloadStatus } from '@/types';

jest.mock('react-native', () => ({
  Alert: { alert: jest.fn() },
  Platform: { OS: 'ios' },
}));

jest.mock('@/services/anilistService', () => ({
  updateAniListStatus: jest
    .fn()
    .mockResolvedValue({ success: true, message: '' }),
}));

jest.mock('@/services/offlineCacheService', () => ({
  offlineCacheService: {
    cacheMangaDetails: jest.fn().mockResolvedValue(undefined),
    updateMangaBookmarkStatus: jest.fn().mockResolvedValue(undefined),
  },
}));

const { Alert } = require('react-native');
const { updateAniListStatus } = require('@/services/anilistService');

describe('bookmarkService', () => {
  beforeEach(async () => {
    jest.clearAllMocks();
    await AsyncStorage.clear();
  });

  describe('getMangaData and setMangaData', () => {
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

    it('returns null for non-existent manga', async () => {
      const result = await getMangaData('non-existent');
      expect(result).toBeNull();
    });

    it('handles storage errors gracefully', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Storage error'));

      const result = await getMangaData('error-id');
      expect(result).toBeNull();
    });

    it('does not duplicate bookmark keys', async () => {
      const manga = {
        id: '123',
        title: 'Example',
        bannerImage: 'image.jpg',
        bookmarkStatus: 'Reading' as const,
        readChapters: ['1'],
        lastUpdated: 111,
      };

      await setMangaData(manga);
      await setMangaData({ ...manga, readChapters: ['1', '2'] });

      const keys = await AsyncStorage.getItem('bookmarkKeys');
      const parsed = JSON.parse(keys!);
      const count = parsed.filter((k: string) => k === 'bookmark_123').length;
      expect(count).toBe(1);
    });
  });

  describe('fetchBookmarkStatus', () => {
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

    it('returns null when manga has no bookmark status', async () => {
      await AsyncStorage.setItem(
        'manga_noStatus',
        JSON.stringify({ id: 'noStatus' })
      );

      const status = await fetchBookmarkStatus('noStatus');
      expect(status).toBeNull();
    });
  });

  describe('getBookmarkPopupConfig', () => {
    it('builds popup configuration based on current status', () => {
      const handler = jest.fn();
      const popup = getBookmarkPopupConfig('Reading', 'Title', handler, handler);
      expect(popup.options).toHaveLength(5);
      expect(popup.title).toContain('Update');
      expect(popup.title).toContain('Title');

      const popupNew = getBookmarkPopupConfig(null, 'Title', handler, handler);
      expect(popupNew.options).toHaveLength(4);
      expect(popupNew.title).toContain('Bookmark');
      expect(popupNew.title).toContain('Title');
    });

    it('includes all bookmark status options', () => {
      const handler = jest.fn();
      const popup = getBookmarkPopupConfig(null, 'Title', handler, handler);

      const optionTexts = popup.options.map((o: any) => o.text);
      expect(optionTexts).toContain('To Read');
      expect(optionTexts).toContain('Reading');
      expect(optionTexts).toContain('On Hold');
      expect(optionTexts).toContain('Read');
    });

    it('includes unbookmark option when already bookmarked', () => {
      const handler = jest.fn();
      const popup = getBookmarkPopupConfig('Reading', 'Title', handler, handler);

      const optionTexts = popup.options.map((o: any) => o.text);
      expect(optionTexts).toContain('Unbookmark');
    });
  });

  describe('saveBookmark', () => {
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

    it('handles "No" response when marking as read', async () => {
      const setBookmarkStatus = jest.fn();
      const setIsAlertVisible = jest.fn();
      const setReadChapters = jest.fn();

      const mangaDetails = {
        title: 'Series',
        bannerImage: 'img',
        chapters: [{ number: '1' }, { number: '2' }],
      };

      await saveBookmark(
        'm3',
        'Read',
        mangaDetails,
        ['1'],
        setBookmarkStatus,
        setIsAlertVisible,
        setReadChapters
      );

      const args = (Alert.alert as jest.Mock).mock.calls[0];
      const options = args[2];

      // Press "No"
      await options[0].onPress();
      expect(updateAniListStatus).toHaveBeenCalled();
    });

    it('skips AniList update for On Hold status', async () => {
      const setBookmarkStatus = jest.fn();
      const setIsAlertVisible = jest.fn();
      const setReadChapters = jest.fn();

      const mangaDetails = {
        title: 'Series',
        bannerImage: 'img',
        chapters: [{ number: '1' }],
      };

      await saveBookmark(
        'm4',
        'On Hold',
        mangaDetails,
        ['1'],
        setBookmarkStatus,
        setIsAlertVisible,
        setReadChapters
      );

      expect(updateAniListStatus).not.toHaveBeenCalled();
    });

    it('sets lastNotifiedChapter for Reading status', async () => {
      const setBookmarkStatus = jest.fn();
      const setIsAlertVisible = jest.fn();
      const setReadChapters = jest.fn();

      const mangaDetails = {
        title: 'Series',
        bannerImage: 'img',
        chapters: [{ number: '5' }, { number: '4' }],
      };

      await saveBookmark(
        'm5',
        'Reading',
        mangaDetails,
        [],
        setBookmarkStatus,
        setIsAlertVisible,
        setReadChapters
      );

      const stored = await AsyncStorage.getItem('manga_m5');
      const parsed = JSON.parse(stored!);
      expect(parsed.lastNotifiedChapter).toBe('5');
    });

    it('handles marking as Read with no chapters (empty chapters array)', async () => {
      const setBookmarkStatus = jest.fn();
      const setIsAlertVisible = jest.fn();
      const setReadChapters = jest.fn();

      const mangaDetails = {
        title: 'Series',
        bannerImage: 'img',
        chapters: [],
      };

      await saveBookmark(
        'm6',
        'Read',
        mangaDetails,
        [],
        setBookmarkStatus,
        setIsAlertVisible,
        setReadChapters
      );

      expect(Alert.alert).toHaveBeenCalled();
      const args = (Alert.alert as jest.Mock).mock.calls[0];
      const options = args[2];

      // Press "Yes" - should handle empty chapters gracefully
      await options[1].onPress();
      expect(setReadChapters).not.toHaveBeenCalled();
    });

    it('handles marking as Read with null mangaDetails', async () => {
      const setBookmarkStatus = jest.fn();
      const setIsAlertVisible = jest.fn();
      const setReadChapters = jest.fn();

      // mangaDetails is null
      await saveBookmark(
        'm7',
        'Read',
        null,
        [],
        setBookmarkStatus,
        setIsAlertVisible,
        setReadChapters
      );

      // Should still work with null mangaDetails
      expect(setBookmarkStatus).toHaveBeenCalledWith('Read');
      expect(setIsAlertVisible).toHaveBeenCalledWith(false);
    });

    it('handles "No" response with empty readChapters', async () => {
      const setBookmarkStatus = jest.fn();
      const setIsAlertVisible = jest.fn();
      const setReadChapters = jest.fn();

      const mangaDetails = {
        title: 'Series',
        bannerImage: 'img',
        chapters: [{ number: '1' }, { number: '2' }],
      };

      await saveBookmark(
        'm8',
        'Read',
        mangaDetails,
        [], // empty readChapters
        setBookmarkStatus,
        setIsAlertVisible,
        setReadChapters
      );

      const args = (Alert.alert as jest.Mock).mock.calls[0];
      const options = args[2];

      // Press "No" with empty readChapters - should still update AniList
      await options[0].onPress();
      expect(updateAniListStatus).toHaveBeenCalledWith('Series', 'Read', [], 2);
    });

    it('handles To Read status correctly', async () => {
      const setBookmarkStatus = jest.fn();
      const setIsAlertVisible = jest.fn();
      const setReadChapters = jest.fn();

      const mangaDetails = {
        title: 'Series',
        bannerImage: 'img',
        chapters: [{ number: '1' }],
      };

      await saveBookmark(
        'm9',
        'To Read',
        mangaDetails,
        [],
        setBookmarkStatus,
        setIsAlertVisible,
        setReadChapters
      );

      expect(setBookmarkStatus).toHaveBeenCalledWith('To Read');
      expect(updateAniListStatus).toHaveBeenCalledWith('Series', 'To Read', [], 1);
      expect(Alert.alert).not.toHaveBeenCalled(); // No prompt for To Read
    });
  });

  describe('getChapterLongPressAlertConfig', () => {
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

    it('returns null when chapter is already read', () => {
      const setReadChapters = jest.fn();

      const config = getChapterLongPressAlertConfig(
        true,
        '1',
        { chapters: [{ number: '1' }] },
        '1',
        ['1'],
        setReadChapters
      );

      expect(config).toBeNull();
    });

    it('does nothing when manga data does not exist', async () => {
      const setReadChapters = jest.fn();
      const onSuccess = jest.fn();

      // No manga data exists for 'nonexistent'
      const config = getChapterLongPressAlertConfig(
        false,
        '2',
        { chapters: [{ number: '1' }, { number: '2' }] },
        'nonexistent',
        [],
        setReadChapters,
        onSuccess
      );

      await config?.options?.[1]?.onPress?.();

      // setReadChapters should not be called when manga data doesn't exist
      expect(setReadChapters).not.toHaveBeenCalled();
      expect(onSuccess).not.toHaveBeenCalled();
    });

    it('handles empty mangaDetails.chapters gracefully', async () => {
      const setReadChapters = jest.fn();

      await AsyncStorage.setItem(
        'manga_empty-chapters',
        JSON.stringify({ id: 'empty-chapters', readChapters: [] })
      );

      const config = getChapterLongPressAlertConfig(
        false,
        '2',
        { chapters: [] }, // Empty chapters array
        'empty-chapters',
        [],
        setReadChapters
      );

      await config?.options?.[1]?.onPress?.();

      // Should not crash, but readChapters should be updated (even if empty)
      expect(setReadChapters).toHaveBeenCalledWith([]);
    });
  });

  describe('Download status functions', () => {
    it('updates download status for a chapter', async () => {
      await AsyncStorage.setItem(
        'manga_dl1',
        JSON.stringify({
          id: 'dl1',
          title: 'Download Test',
          readChapters: [],
          bookmarkStatus: 'Reading',
        })
      );

      await updateDownloadStatus('dl1', '5', {
        status: DownloadStatus.DOWNLOADING,
        progress: 50,
      });

      const stored = await AsyncStorage.getItem('manga_dl1');
      const parsed = JSON.parse(stored!);
      expect(parsed.downloadStatus['5'].status).toBe(DownloadStatus.DOWNLOADING);
      expect(parsed.downloadStatus['5'].progress).toBe(50);
    });

    it('adds chapter to downloadedChapters when completed', async () => {
      await AsyncStorage.setItem(
        'manga_dl2',
        JSON.stringify({
          id: 'dl2',
          title: 'Download Test',
          readChapters: [],
          bookmarkStatus: 'Reading',
          downloadedChapters: [],
        })
      );

      await updateDownloadStatus('dl2', '3', {
        status: DownloadStatus.COMPLETED,
        progress: 100,
      });

      const stored = await AsyncStorage.getItem('manga_dl2');
      const parsed = JSON.parse(stored!);
      expect(parsed.downloadedChapters).toContain('3');
    });

    it('does nothing when manga data not found', async () => {
      await updateDownloadStatus('non-existent', '1', {
        status: DownloadStatus.DOWNLOADING,
        progress: 0,
      });

      // Should not throw
      expect(true).toBe(true);
    });

    it('removes download status for a chapter', async () => {
      await AsyncStorage.setItem(
        'manga_rm1',
        JSON.stringify({
          id: 'rm1',
          title: 'Remove Test',
          readChapters: [],
          bookmarkStatus: 'Reading',
          downloadStatus: {
            '1': { status: DownloadStatus.COMPLETED, progress: 100 },
          },
          downloadedChapters: ['1'],
        })
      );

      await removeDownloadStatus('rm1', '1');

      const stored = await AsyncStorage.getItem('manga_rm1');
      const parsed = JSON.parse(stored!);
      expect(parsed.downloadStatus['1']).toBeUndefined();
      expect(parsed.downloadedChapters).not.toContain('1');
    });

    it('updates total download size', async () => {
      await AsyncStorage.setItem(
        'manga_size1',
        JSON.stringify({
          id: 'size1',
          title: 'Size Test',
          readChapters: [],
          bookmarkStatus: 'Reading',
          totalDownloadSize: 1000,
        })
      );

      await updateTotalDownloadSize('size1', 500);

      const stored = await AsyncStorage.getItem('manga_size1');
      const parsed = JSON.parse(stored!);
      expect(parsed.totalDownloadSize).toBe(1500);
    });

    it('does not allow negative total download size', async () => {
      await AsyncStorage.setItem(
        'manga_size2',
        JSON.stringify({
          id: 'size2',
          title: 'Size Test',
          readChapters: [],
          bookmarkStatus: 'Reading',
          totalDownloadSize: 100,
        })
      );

      await updateTotalDownloadSize('size2', -500);

      const stored = await AsyncStorage.getItem('manga_size2');
      const parsed = JSON.parse(stored!);
      expect(parsed.totalDownloadSize).toBe(0);
    });
  });

  describe('getDownloadedChapters', () => {
    it('returns downloaded chapters for a manga', async () => {
      await AsyncStorage.setItem(
        'manga_dch1',
        JSON.stringify({
          id: 'dch1',
          downloadedChapters: ['1', '2', '3'],
        })
      );

      const chapters = await getDownloadedChapters('dch1');
      expect(chapters).toEqual(['1', '2', '3']);
    });

    it('returns empty array when no downloaded chapters', async () => {
      await AsyncStorage.setItem(
        'manga_dch2',
        JSON.stringify({ id: 'dch2' })
      );

      const chapters = await getDownloadedChapters('dch2');
      expect(chapters).toEqual([]);
    });

    it('returns empty array on error', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Storage error'));

      const chapters = await getDownloadedChapters('error-id');
      expect(chapters).toEqual([]);
    });
  });

  describe('getChapterDownloadStatus', () => {
    it('returns download status for a chapter', async () => {
      await AsyncStorage.setItem(
        'manga_cds1',
        JSON.stringify({
          id: 'cds1',
          downloadStatus: {
            '5': { status: DownloadStatus.COMPLETED, progress: 100 },
          },
        })
      );

      const status = await getChapterDownloadStatus('cds1', '5');
      expect(status?.status).toBe(DownloadStatus.COMPLETED);
    });

    it('returns null when chapter not downloaded', async () => {
      await AsyncStorage.setItem(
        'manga_cds2',
        JSON.stringify({ id: 'cds2', downloadStatus: {} })
      );

      const status = await getChapterDownloadStatus('cds2', '5');
      expect(status).toBeNull();
    });
  });

  describe('isChapterDownloaded', () => {
    it('returns true when chapter is downloaded', async () => {
      await AsyncStorage.setItem(
        'manga_icd1',
        JSON.stringify({
          id: 'icd1',
          downloadedChapters: ['1', '2'],
        })
      );

      const result = await isChapterDownloaded('icd1', '2');
      expect(result).toBe(true);
    });

    it('returns false when chapter is not downloaded', async () => {
      await AsyncStorage.setItem(
        'manga_icd2',
        JSON.stringify({
          id: 'icd2',
          downloadedChapters: ['1'],
        })
      );

      const result = await isChapterDownloaded('icd2', '5');
      expect(result).toBe(false);
    });
  });

  describe('getAllDownloadedManga', () => {
    it('returns all manga with downloaded chapters', async () => {
      await AsyncStorage.setItem(
        'manga_all1',
        JSON.stringify({
          id: 'all1',
          title: 'Manga 1',
          downloadedChapters: ['1', '2'],
        })
      );
      await AsyncStorage.setItem(
        'manga_all2',
        JSON.stringify({
          id: 'all2',
          title: 'Manga 2',
          downloadedChapters: [],
        })
      );
      await AsyncStorage.setItem(
        'manga_all3',
        JSON.stringify({
          id: 'all3',
          title: 'Manga 3',
          downloadedChapters: ['5'],
        })
      );

      const result = await getAllDownloadedManga();

      expect(result).toHaveLength(2);
      expect(result.map(m => m.id)).toContain('all1');
      expect(result.map(m => m.id)).toContain('all3');
      expect(result.map(m => m.id)).not.toContain('all2');
    });

    it('returns empty array when no manga with downloads', async () => {
      await AsyncStorage.setItem(
        'manga_empty1',
        JSON.stringify({ id: 'empty1', downloadedChapters: [] })
      );

      const result = await getAllDownloadedManga();
      expect(result).toEqual([]);
    });
  });

  describe('getTotalDownloadSize', () => {
    it('calculates total download size across all manga', async () => {
      await AsyncStorage.setItem(
        'manga_ts1',
        JSON.stringify({
          id: 'ts1',
          downloadedChapters: ['1'],
          totalDownloadSize: 1000,
        })
      );
      await AsyncStorage.setItem(
        'manga_ts2',
        JSON.stringify({
          id: 'ts2',
          downloadedChapters: ['2'],
          totalDownloadSize: 2000,
        })
      );

      const result = await getTotalDownloadSize();
      expect(result).toBe(3000);
    });

    it('returns 0 when no downloads exist', async () => {
      const result = await getTotalDownloadSize();
      expect(result).toBe(0);
    });

    it('returns 0 on error', async () => {
      jest.spyOn(AsyncStorage, 'getAllKeys').mockRejectedValueOnce(new Error('Storage error'));

      const result = await getTotalDownloadSize();
      expect(result).toBe(0);
    });
  });

  describe('Error handling', () => {
    it('handles error in setMangaData gracefully', async () => {
      jest.spyOn(AsyncStorage, 'setItem').mockRejectedValueOnce(new Error('Storage error'));

      // Should not throw
      await expect(
        setMangaData({
          id: 'error-test',
          title: 'Test',
          bannerImage: 'img.jpg',
          readChapters: [],
          bookmarkStatus: 'Reading',
          lastUpdated: Date.now(),
        })
      ).resolves.not.toThrow();
    });

    it('handles error in removeBookmark gracefully', async () => {
      jest.spyOn(AsyncStorage, 'removeItem').mockRejectedValueOnce(new Error('Storage error'));

      const setBookmarkStatus = jest.fn();
      const setIsAlertVisible = jest.fn();

      // Should not throw
      await expect(
        removeBookmark('error-id', setBookmarkStatus, setIsAlertVisible)
      ).resolves.not.toThrow();
    });

    it('handles error in removeDownloadStatus gracefully', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Storage error'));

      // Should not throw
      await expect(
        removeDownloadStatus('error-id', '1')
      ).resolves.not.toThrow();
    });

    it('handles error in updateTotalDownloadSize gracefully', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Storage error'));

      // Should not throw
      await expect(
        updateTotalDownloadSize('error-id', 100)
      ).resolves.not.toThrow();
    });

    it('handles error in getChapterDownloadStatus gracefully', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Storage error'));

      const result = await getChapterDownloadStatus('error-id', '1');
      expect(result).toBeNull();
    });

    it('handles error in isChapterDownloaded gracefully', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Storage error'));

      const result = await isChapterDownloaded('error-id', '1');
      expect(result).toBe(false);
    });

    it('handles error in getAllDownloadedManga gracefully', async () => {
      jest.spyOn(AsyncStorage, 'getAllKeys').mockRejectedValueOnce(new Error('Storage error'));

      const result = await getAllDownloadedManga();
      expect(result).toEqual([]);
    });

    it('handles saveBookmark error gracefully', async () => {
      // Mock offlineCacheService to throw an error after setMangaData succeeds
      // This triggers the catch block in saveBookmark since setMangaData swallows its own errors
      const { offlineCacheService } = require('@/services/offlineCacheService');
      offlineCacheService.cacheMangaDetails.mockRejectedValueOnce(new Error('Cache error'));

      const setBookmarkStatus = jest.fn();
      const setIsAlertVisible = jest.fn();
      const setReadChapters = jest.fn();

      // Should not throw and should show error alert
      await saveBookmark(
        'error-manga',
        'Reading',
        { title: 'Test', bannerImage: 'img', chapters: [] },
        [],
        setBookmarkStatus,
        setIsAlertVisible,
        setReadChapters
      );

      expect(Alert.alert).toHaveBeenCalledWith('Error', expect.any(String));
    });

    it('handles updateDownloadStatus error gracefully', async () => {
      jest.spyOn(AsyncStorage, 'getItem').mockRejectedValueOnce(new Error('Storage error'));

      // Should not throw
      await expect(
        updateDownloadStatus('error-id', '1', { status: DownloadStatus.DOWNLOADING, progress: 50 })
      ).resolves.not.toThrow();
    });
  });

  describe('getChapterLongPressAlertConfig edge cases', () => {
    it('handles error during chapter marking', async () => {
      // setReadChapters throws to trigger the catch block and onError callback
      // Note: setMangaData and getMangaData catch their own errors, so we need
      // to throw from setReadChapters which is called after those complete
      const setReadChapters = jest.fn().mockImplementation(() => {
        throw new Error('Component error');
      });
      const onError = jest.fn();

      // Set up valid manga data so getMangaData returns it
      await AsyncStorage.setItem(
        'manga_error-manga',
        JSON.stringify({ id: 'error-manga', readChapters: [], lastReadChapter: '' })
      );

      const config = getChapterLongPressAlertConfig(
        false,
        '2',
        { chapters: [{ number: '1' }, { number: '2' }] },
        'error-manga',
        [],
        setReadChapters,
        undefined,
        onError
      );

      await config?.options?.[1]?.onPress?.();

      expect(onError).toHaveBeenCalled();
    });

    it('calls success callback with correct count', async () => {
      const setReadChapters = jest.fn();
      const onSuccess = jest.fn();

      await AsyncStorage.setItem(
        'manga_success',
        JSON.stringify({ id: 'success', readChapters: [], lastReadChapter: '' })
      );

      const config = getChapterLongPressAlertConfig(
        false,
        '3',
        { chapters: [{ number: '1' }, { number: '2' }, { number: '3' }] },
        'success',
        [],
        setReadChapters,
        onSuccess
      );

      await config?.options?.[1]?.onPress?.();

      expect(onSuccess).toHaveBeenCalledWith(3, '3');
    });

    it('cancel option does nothing', async () => {
      const setReadChapters = jest.fn();

      const config = getChapterLongPressAlertConfig(
        false,
        '2',
        { chapters: [{ number: '1' }, { number: '2' }] },
        'manga1',
        [],
        setReadChapters
      );

      config?.options?.[0]?.onPress?.();

      expect(setReadChapters).not.toHaveBeenCalled();
    });
  });

  describe('getBookmarkPopupConfig edge cases', () => {
    it('truncates long titles', () => {
      const handler = jest.fn();
      const longTitle = 'This is a very long title that should be truncated';
      const popup = getBookmarkPopupConfig(null, longTitle, handler, handler);

      expect(popup.title.length).toBeLessThan(longTitle.length + 20);
      expect(popup.title).toContain('...');
    });

    it('marks correct option as selected', () => {
      const handler = jest.fn();
      const popup = getBookmarkPopupConfig('To Read', 'Title', handler, handler);

      const toReadOption = popup.options.find((o: any) => o.text === 'To Read');
      const readingOption = popup.options.find((o: any) => o.text === 'Reading');

      expect(toReadOption?.isSelected).toBe(true);
      expect(readingOption?.isSelected).toBe(false);
    });

    it('option handlers trigger callbacks', () => {
      const handleSave = jest.fn();
      const handleRemove = jest.fn();
      const popup = getBookmarkPopupConfig('Reading', 'Title', handleSave, handleRemove);

      const toReadOption = popup.options.find((o: any) => o.text === 'To Read');
      toReadOption?.onPress();

      expect(handleSave).toHaveBeenCalledWith('To Read');

      const unbookmarkOption = popup.options.find((o: any) => o.text === 'Unbookmark');
      unbookmarkOption?.onPress();

      expect(handleRemove).toHaveBeenCalled();
    });

    it('triggers all status option handlers', () => {
      const handleSave = jest.fn();
      const handleRemove = jest.fn();
      const popup = getBookmarkPopupConfig(null, 'Title', handleSave, handleRemove);

      // Trigger Reading option
      const readingOption = popup.options.find((o: any) => o.text === 'Reading');
      readingOption?.onPress();
      expect(handleSave).toHaveBeenCalledWith('Reading');

      // Trigger On Hold option
      const onHoldOption = popup.options.find((o: any) => o.text === 'On Hold');
      onHoldOption?.onPress();
      expect(handleSave).toHaveBeenCalledWith('On Hold');

      // Trigger Read option
      const readOption = popup.options.find((o: any) => o.text === 'Read');
      readOption?.onPress();
      expect(handleSave).toHaveBeenCalledWith('Read');
    });

    it('marks On Hold as selected when current status', () => {
      const handler = jest.fn();
      const popup = getBookmarkPopupConfig('On Hold', 'Title', handler, handler);

      const onHoldOption = popup.options.find((o: any) => o.text === 'On Hold');
      expect(onHoldOption?.isSelected).toBe(true);
    });

    it('marks Read as selected when current status', () => {
      const handler = jest.fn();
      const popup = getBookmarkPopupConfig('Read', 'Title', handler, handler);

      const readOption = popup.options.find((o: any) => o.text === 'Read');
      expect(readOption?.isSelected).toBe(true);
    });
  });
});
