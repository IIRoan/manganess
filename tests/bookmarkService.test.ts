import AsyncStorage from '@react-native-async-storage/async-storage';
import { Alert } from 'react-native';

import {
  fetchBookmarkStatus,
  saveBookmark,
  removeBookmark,
} from '@/services/bookmarkService';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

// Mock Alert
jest.mock('react-native/Libraries/Alert/Alert', () => ({
  alert: jest.fn(),
}));

// Mock updateAniListStatusAndAlert to do nothing
jest.mock('@/services/bookmarkService', () => {
  const originalModule = jest.requireActual('@/services/bookmarkService');
  return {
    ...originalModule,
    updateAniListStatusAndAlert: jest.fn(),
  };
});

describe('bookmarkService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('fetchBookmarkStatus', () => {
    it('fetches bookmark status from AsyncStorage', async () => {
      AsyncStorage.getItem.mockResolvedValue('Reading');
      const status = await fetchBookmarkStatus('123');
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('bookmark_123');
      expect(status).toBe('Reading');
    });
  });

  describe('saveBookmark', () => {
    it('saves bookmark and updates state', async () => {
      const setBookmarkStatus = jest.fn();
      const setIsAlertVisible = jest.fn();
      const markAllChaptersAsRead = jest.fn();

      const mangaDetails = {
        title: 'Test Manga',
        bannerImage: 'http://example.com/image.jpg',
        chapters: [{ number: '1' }, { number: '2' }],
      };

      const readChapters = ['1'];

      // Since we're not testing updateAniListStatus, we don't need to mock it.

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
      expect(setBookmarkStatus).toHaveBeenCalledWith('Reading');
      expect(setIsAlertVisible).toHaveBeenCalledWith(false);

      // Verify that bookmarkKeys are updated
      expect(AsyncStorage.getItem).toHaveBeenCalledWith('bookmarkKeys');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('bookmarkKeys', JSON.stringify(['bookmark_123']));
    });

    it('handles status "Read" with Alert prompt', async () => {
      const setBookmarkStatus = jest.fn();
      const setIsAlertVisible = jest.fn();
      const markAllChaptersAsRead = jest.fn();

      const mangaDetails = {
        title: 'Test Manga',
        chapters: [{ number: '1' }, { number: '2' }],
      };

      const readChapters = ['1'];

      // Mock Alert.alert to simulate pressing "No"
      Alert.alert.mockImplementation((title, message, buttons) => {
        const noButton = buttons.find(button => button.text === 'No');
        noButton.onPress();
      });

      await saveBookmark(
        '123',
        'Read',
        mangaDetails,
        readChapters,
        setBookmarkStatus,
        setIsAlertVisible,
        markAllChaptersAsRead
      );

      expect(Alert.alert).toHaveBeenCalledWith(
        'Mark All Chapters as Read',
        'Do you want to mark all chapters as read?',
        expect.any(Array)
      );

      // Since we simulate pressing "No", markAllChaptersAsRead should not be called
      expect(markAllChaptersAsRead).not.toHaveBeenCalled();
    });

    it('handles errors gracefully', async () => {
      AsyncStorage.setItem.mockRejectedValue(new Error('Storage Error'));

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
      expect(Alert.alert).toHaveBeenCalledWith('Error', 'Failed to update status. Please try again.');
    });
  });

  describe('removeBookmark', () => {
    it('removes bookmark and updates state', async () => {
      const setBookmarkStatus = jest.fn();
      const setIsAlertVisible = jest.fn();

      AsyncStorage.getItem.mockResolvedValue(JSON.stringify(['bookmark_123']));

      await removeBookmark('123', setBookmarkStatus, setIsAlertVisible);

      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('bookmark_123');
      expect(AsyncStorage.removeItem).toHaveBeenCalledWith('title_123');

      expect(AsyncStorage.getItem).toHaveBeenCalledWith('bookmarkKeys');
      expect(AsyncStorage.setItem).toHaveBeenCalledWith('bookmarkKeys', JSON.stringify([]));

      expect(setBookmarkStatus).toHaveBeenCalledWith(null);
      expect(setIsAlertVisible).toHaveBeenCalledWith(false);
    });

    it('handles errors gracefully', async () => {
      AsyncStorage.removeItem.mockRejectedValue(new Error('Remove Error'));

      const setBookmarkStatus = jest.fn();
      const setIsAlertVisible = jest.fn();

      console.error = jest.fn();

      await removeBookmark('123', setBookmarkStatus, setIsAlertVisible);

      expect(console.error).toHaveBeenCalledWith('Error removing bookmark:', expect.any(Error));
    });
  });
});
