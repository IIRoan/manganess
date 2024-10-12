import AsyncStorage from '@react-native-async-storage/async-storage';
import { markChapterAsRead, getBookmarkStatus } from '@/services/mangaFireService';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

describe('mangaFireService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('markChapterAsRead', () => {
    it('marks a chapter as read and updates AsyncStorage', async () => {
      const id = '123';
      const chapterNumber = '1';
      const mangaTitle = 'Test Manga';

      // Mock initial state of read chapters
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce('[]');

      await markChapterAsRead(id, chapterNumber, mangaTitle);

      expect(AsyncStorage.getItem).toHaveBeenCalledWith(`manga_${id}_read_chapters`);
      expect(AsyncStorage.setItem).toHaveBeenCalledWith(
        `manga_${id}_read_chapters`,
        JSON.stringify([chapterNumber])
      );
    });

    it('does not mark a chapter as read if it is already read', async () => {
      const id = '123';
      const chapterNumber = '1';
      const mangaTitle = 'Test Manga';

      // Mock initial state with the chapter already read
      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(JSON.stringify([chapterNumber]));

      await markChapterAsRead(id, chapterNumber, mangaTitle);

      expect(AsyncStorage.getItem).toHaveBeenCalledWith(`manga_${id}_read_chapters`);
      expect(AsyncStorage.setItem).not.toHaveBeenCalled();
    });

    it('handles errors gracefully', async () => {
      const id = '123';
      const chapterNumber = '1';
      const mangaTitle = 'Test Manga';

      (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('AsyncStorage error'));

      console.error = jest.fn();

      await markChapterAsRead(id, chapterNumber, mangaTitle);

      expect(console.error).toHaveBeenCalledWith('Error marking chapter as read:', expect.any(Error));
    });
  });

  describe('getBookmarkStatus', () => {
    it('retrieves bookmark status from AsyncStorage', async () => {
      const id = '123';
      const status = 'Reading';

      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(status);

      const result = await getBookmarkStatus(id);

      expect(AsyncStorage.getItem).toHaveBeenCalledWith(`bookmark_${id}`);
      expect(result).toBe(status);
    });

    it('returns null if bookmark status is not found', async () => {
      const id = '123';

      (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

      const result = await getBookmarkStatus(id);

      expect(AsyncStorage.getItem).toHaveBeenCalledWith(`bookmark_${id}`);
      expect(result).toBeNull();
    });

    it('handles errors gracefully', async () => {
      const id = '123';

      (AsyncStorage.getItem as jest.Mock).mockRejectedValueOnce(new Error('AsyncStorage error'));

      console.error = jest.fn();

      const result = await getBookmarkStatus(id);

      expect(console.error).toHaveBeenCalledWith('Error getting bookmark status:', expect.any(Error));
      expect(result).toBeNull();
    });
  });
});
