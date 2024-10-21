import AsyncStorage from '@react-native-async-storage/async-storage';
import { fetchBookmarkStatus, saveBookmark, removeBookmark } from '@/services/bookmarkService';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

describe('bookmarkService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchBookmarkStatus', () => {
    it('fetches bookmark status from AsyncStorage', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue('Reading');
      const status = await fetchBookmarkStatus('123');
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('bookmark_123');
      expect(status).toBe('Reading');
    });
  });

  describe('saveBookmark', () => {
    it('saves bookmark data to AsyncStorage', async () => {
      const setBookmarkStatus = jest.fn();
      const setIsAlertVisible = jest.fn();
      const markAllChaptersAsRead = jest.fn();

      const mangaDetails = {
        title: 'Test Manga',
        bannerImage: 'http://example.com/image.jpg',
        chapters: [{ number: '1' }, { number: '2' }],
      };

      const readChapters = ['1'];

      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      await saveBookmark(
        '123',
        'Reading',
        mangaDetails,
        readChapters,
        setBookmarkStatus,
        setIsAlertVisible,
        markAllChaptersAsRead
      );

      expect(AsyncStorage.setItem).toHaveBeenCalledWith('bookmark_123', 'Reading');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('title_123', 'Test Manga');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('image_123', 'http://example.com/image.jpg');
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('bookmarkKeys');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('bookmarkKeys', JSON.stringify(['bookmark_123']));
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('last_notified_chapter_123', '1');
    });

    it('handles errors when saving bookmark', async () => {
      (AsyncStorage.setItem as jest.Mock).mockRejectedValue(new Error('Storage Error'));

      const setBookmarkStatus = jest.fn();
      const setIsAlertVisible = jest.fn();
      const markAllChaptersAsRead = jest.fn();

      console.error = jest.fn();

      await saveBookmark(
        '123',
        'Reading',
        {},
        [],
        setBookmarkStatus,
        setIsAlertVisible,
        markAllChaptersAsRead
      );

      expect(console.error).toHaveBeenCalledWith('Error saving bookmark:', expect.any(Error));
    });
  });

  describe('removeBookmark', () => {
    it('removes bookmark data from AsyncStorage', async () => {
      const setBookmarkStatus = jest.fn();
      const setIsAlertVisible = jest.fn();

      jest.spyOn(AsyncStorage, 'getItem').mockResolvedValue(JSON.stringify(['bookmark_123']));

      await removeBookmark('123', setBookmarkStatus, setIsAlertVisible);

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('bookmark_123');
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('title_123');
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('bookmarkKeys');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('bookmarkKeys', JSON.stringify([]));
    });

    it('handles errors when removing bookmark', async () => {
      (AsyncStorage.removeItem as jest.Mock).mockRejectedValue(new Error('Remove Error'));

      const setBookmarkStatus = jest.fn();
      const setIsAlertVisible = jest.fn();

      console.error = jest.fn();

      await removeBookmark('123', setBookmarkStatus, setIsAlertVisible);

      expect(console.error).toHaveBeenCalledWith('Error removing bookmark:', expect.any(Error));
    });
  });
});
