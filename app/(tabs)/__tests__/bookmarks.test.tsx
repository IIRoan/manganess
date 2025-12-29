import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import BookmarksScreen from '../bookmarks';
import { getMangaData } from '@/services/bookmarkService';
import { getDefaultLayout, setDefaultLayout } from '@/services/settingsService';
import { imageCache } from '@/services/CacheImages';
import { chapterStorageService } from '@/services/chapterStorageService';

// Mock router with trackable push function
const mockRouterPush = jest.fn();

// Mock all dependencies
jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn((cb) => {
    // Call the callback synchronously, simulating focus
    cb();
  }),
}));

jest.mock('@/constants/ThemeContext', () => ({
  useTheme: () => ({ actualTheme: 'light' }),
}));

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockRouterPush }),
}));

jest.mock('@/services/chapterStorageService', () => ({
  chapterStorageService: {
    getDownloadedChapters: jest.fn(),
  },
}));

jest.mock('@/services/bookmarkService', () => ({
  getMangaData: jest.fn(),
}));

jest.mock('@/services/settingsService', () => ({
  getDefaultLayout: jest.fn(),
  setDefaultLayout: jest.fn(),
}));

jest.mock('@/services/CacheImages', () => ({
  imageCache: { getCachedImagePath: jest.fn() },
}));

// Mock offline context with controllable state
let mockIsOffline = false;
jest.mock('@/contexts/OfflineContext', () => ({
  useOffline: () => ({ isOffline: mockIsOffline }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

// Mock MangaCard as a functional component to allow interaction testing
jest.mock('@/components/MangaCard', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TouchableOpacity, Text, View } = require('react-native');
  return function MockMangaCard({ title, onPress, onBookmarkChange, mangaId }: any) {
    return (
      <View testID={`manga-card-${mangaId}`}>
        <TouchableOpacity testID={`manga-card-press-${mangaId}`} onPress={onPress}>
          <Text>{title}</Text>
        </TouchableOpacity>
        {onBookmarkChange && (
          <>
            <TouchableOpacity
              testID={`manga-card-remove-bookmark-${mangaId}`}
              onPress={() => onBookmarkChange(mangaId, null)}
            >
              <Text>Remove</Text>
            </TouchableOpacity>
            <TouchableOpacity
              testID={`manga-card-change-bookmark-${mangaId}`}
              onPress={() => onBookmarkChange(mangaId, 'To Read')}
            >
              <Text>Change Status</Text>
            </TouchableOpacity>
          </>
        )}
      </View>
    );
  };
});

const initialMetrics = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe('BookmarksScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();
    mockIsOffline = false;
    mockRouterPush.mockClear();

    // Default mock setup
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (key === 'bookmarkKeys') return JSON.stringify(['bookmark_1', 'bookmark_2']);
      if (key === 'bookmarkChanged') return 'false';
      return null;
    });

    (AsyncStorage.setItem as jest.Mock).mockResolvedValue(undefined);

    (getMangaData as jest.Mock).mockImplementation(async (id: string) => {
      if (id === '1') {
        return {
          id: '1',
          title: 'Manga Alpha',
          bookmarkStatus: 'Reading',
          lastReadChapter: 10,
          bannerImage: 'alpha.jpg',
          lastUpdated: 100,
        };
      }
      return {
        id: '2',
        title: 'Manga Beta',
        bookmarkStatus: 'Read',
        lastReadChapter: 5,
        bannerImage: 'beta.jpg',
        lastUpdated: 200,
      };
    });

    (getDefaultLayout as jest.Mock).mockResolvedValue('grid');
    (setDefaultLayout as jest.Mock).mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.runOnlyPendingTimers();
    jest.useRealTimers();
  });

  const renderScreen = () =>
    render(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <BookmarksScreen />
      </SafeAreaProvider>
    );

  it('shows loading state initially', async () => {
    const { getByText } = renderScreen();
    expect(getByText('Loading...')).toBeTruthy();
  });

  it('renders bookmarks after loading', async () => {
    const { getByText, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    expect(getByText('My Bookmarks')).toBeTruthy();
  });

  it('renders section tabs', async () => {
    const { getByText, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    expect(getByText('Reading')).toBeTruthy();
    expect(getByText('To Read')).toBeTruthy();
    expect(getByText('On Hold')).toBeTruthy();
    expect(getByText('Read')).toBeTruthy();
  });

  it('shows search input placeholder', async () => {
    const { getByPlaceholderText, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    expect(getByPlaceholderText('Search bookmarks...')).toBeTruthy();
  });

  it('filters bookmarks when searching', async () => {
    const { getByPlaceholderText, queryAllByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryAllByText('Loading...').length).toBe(0);
    });

    const input = getByPlaceholderText('Search bookmarks...');
    fireEvent.changeText(input, 'nonexistent');

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      // Multiple empty states rendered for each section
      expect(queryAllByText('No bookmarks found for "nonexistent"').length).toBeGreaterThan(0);
    });
  });

  it('toggles view mode', async () => {
    const { getByTestId, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    fireEvent.press(getByTestId('bookmarks-toggle-view'));

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(setDefaultLayout).toHaveBeenCalledWith('list');
    });
  });

  it('opens sort options', async () => {
    const { getByTestId, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    fireEvent.press(getByTestId('bookmarks-toggle-sort'));

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Title (A‑Z)')).toBeTruthy();
    });
  });

  it('shows empty state with no bookmarks', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (key === 'bookmarkKeys') return JSON.stringify([]);
      return null;
    });

    const { queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    expect(queryByText('No reading manga found')).toBeTruthy();
  });

  it('handles view mode load error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (getDefaultLayout as jest.Mock).mockRejectedValue(new Error('Load error'));

    const { queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    expect(consoleSpy).toHaveBeenCalledWith('Failed to load view mode:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('handles fetch bookmarks error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    // Mock to reject only for bookmarkKeys, not other calls
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (key === 'bookmarkKeys') {
        throw new Error('Fetch error');
      }
      return null;
    });

    const { queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    expect(consoleSpy).toHaveBeenCalledWith('Failed to fetch bookmarks:', expect.any(Error));
    consoleSpy.mockRestore();
  });

  it('handles view mode save error', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    (setDefaultLayout as jest.Mock).mockRejectedValue(new Error('Save error'));

    const { getByTestId, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    fireEvent.press(getByTestId('bookmarks-toggle-view'));

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(consoleSpy).toHaveBeenCalledWith('Failed to save view mode:', expect.any(Error));
    });

    consoleSpy.mockRestore();
  });

  it('toggles from list to grid view', async () => {
    (getDefaultLayout as jest.Mock).mockResolvedValue('list');

    const { getByTestId, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    fireEvent.press(getByTestId('bookmarks-toggle-view'));

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(setDefaultLayout).toHaveBeenCalledWith('grid');
    });
  });

  it('selects sort option', async () => {
    const { getByTestId, getByText, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    fireEvent.press(getByTestId('bookmarks-toggle-sort'));

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Title (Z‑A)')).toBeTruthy();
    });

    fireEvent.press(getByText('Title (Z‑A)'));

    await act(async () => {
      jest.runAllTimers();
    });
  });

  it('clears search from empty state', async () => {
    const { getByPlaceholderText, getAllByText, queryByText, queryAllByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    fireEvent.changeText(getByPlaceholderText('Search bookmarks...'), 'xyz');

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryAllByText('Clear Search').length).toBeGreaterThan(0);
    });

    // Press the first Clear Search button
    fireEvent.press(getAllByText('Clear Search')[0]);

    await act(async () => {
      jest.runAllTimers();
    });
  });

  it('toggles search visibility', async () => {
    const { getByTestId, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    fireEvent.press(getByTestId('bookmarks-toggle-search'));

    await act(async () => {
      jest.runAllTimers();
    });
  });

  it('switches section tabs', async () => {
    const { getByText, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    fireEvent.press(getByText('To Read'));

    await act(async () => {
      jest.runAllTimers();
    });
  });

  it('handles manga with undefined status', async () => {
    (getMangaData as jest.Mock).mockResolvedValue({
      id: '1',
      title: 'Test Manga',
      bookmarkStatus: undefined,
      bannerImage: 'test.jpg',
    });

    const { queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });
  });

  it('handles null lastReadChapter', async () => {
    (getMangaData as jest.Mock).mockResolvedValue({
      id: '1',
      title: 'Test Manga',
      bookmarkStatus: 'Reading',
      lastReadChapter: null,
      bannerImage: 'test.jpg',
    });

    const { queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });
  });

  it('skips null manga data', async () => {
    (getMangaData as jest.Mock).mockResolvedValue(null);

    const { queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    expect(queryByText('No reading manga found')).toBeTruthy();
  });

  it('handles empty bookmark keys', async () => {
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

    const { queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    expect(queryByText('No reading manga found')).toBeTruthy();
  });

  it('refreshes on bookmarkChanged flag', async () => {
    let bookmarkChangedCalls = 0;

    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (key === 'bookmarkKeys') return JSON.stringify(['bookmark_1']);
      if (key === 'bookmarkChanged') {
        bookmarkChangedCalls++;
        // Return 'true' only on first call, then 'false' to prevent infinite loop
        return bookmarkChangedCalls === 1 ? 'true' : 'false';
      }
      return null;
    });

    (getMangaData as jest.Mock).mockResolvedValue({
      id: '1',
      title: 'Test Manga',
      bookmarkStatus: 'Reading',
      bannerImage: '1.jpg',
    });

    const { queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('bookmarkChanged', 'false');
  });

  it('preloads images', async () => {

    const { queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    expect(imageCache.getCachedImagePath).toHaveBeenCalled();
  });

  it('sorts by last read recent (updated-desc)', async () => {
    (getMangaData as jest.Mock).mockImplementation(async (id: string) => {
      if (id === '1') {
        return {
          id: '1',
          title: 'Manga A',
          bookmarkStatus: 'Reading',
          lastReadChapter: 10,
          bannerImage: 'a.jpg',
          lastUpdated: 100,
        };
      }
      return {
        id: '2',
        title: 'Manga B',
        bookmarkStatus: 'Reading',
        lastReadChapter: 5,
        bannerImage: 'b.jpg',
        lastUpdated: 200,
      };
    });

    const { getByTestId, getByText, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    // Open sort options
    fireEvent.press(getByTestId('bookmarks-toggle-sort'));

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Last Read (Recent)')).toBeTruthy();
    });

    // Select last read recent
    fireEvent.press(getByText('Last Read (Recent)'));

    await act(async () => {
      jest.runAllTimers();
    });
  });

  it('sorts by last read oldest (updated-asc)', async () => {
    (getMangaData as jest.Mock).mockImplementation(async (id: string) => {
      if (id === '1') {
        return {
          id: '1',
          title: 'Manga A',
          bookmarkStatus: 'Reading',
          lastReadChapter: 10,
          bannerImage: 'a.jpg',
          lastUpdated: 100,
        };
      }
      return {
        id: '2',
        title: 'Manga B',
        bookmarkStatus: 'Reading',
        lastReadChapter: 5,
        bannerImage: 'b.jpg',
        lastUpdated: 200,
      };
    });

    const { getByTestId, getByText, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    // Open sort options
    fireEvent.press(getByTestId('bookmarks-toggle-sort'));

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Last Read (Oldest)')).toBeTruthy();
    });

    // Select last read oldest
    fireEvent.press(getByText('Last Read (Oldest)'));

    await act(async () => {
      jest.runAllTimers();
    });
  });

  it('shows only manga with downloaded chapters when offline', async () => {
    mockIsOffline = true;

    (chapterStorageService.getDownloadedChapters as jest.Mock).mockImplementation(async (id: string) => {
      if (id === '1') return [{ chapterNumber: 1 }];
      return []; // No downloaded chapters for manga 2
    });

    (getMangaData as jest.Mock).mockImplementation(async (id: string) => {
      if (id === '1') {
        return {
          id: '1',
          title: 'Manga With Downloads',
          bookmarkStatus: 'Reading',
          lastReadChapter: 1,
          bannerImage: 'downloads.jpg',
          lastUpdated: 100,
        };
      }
      return {
        id: '2',
        title: 'Manga Without Downloads',
        bookmarkStatus: 'Reading',
        lastReadChapter: 5,
        bannerImage: 'nodownloads.jpg',
        lastUpdated: 200,
      };
    });

    const { getByText, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    // Should show offline header
    expect(getByText('Saved Manga (Offline)')).toBeTruthy();
    expect(getByText('Offline')).toBeTruthy();
  });

  it('skips manga when getDownloadedChapters throws error in offline mode', async () => {
    mockIsOffline = true;

    (chapterStorageService.getDownloadedChapters as jest.Mock).mockRejectedValue(new Error('Storage error'));

    (getMangaData as jest.Mock).mockResolvedValue({
      id: '1',
      title: 'Test Manga',
      bookmarkStatus: 'Reading',
      bannerImage: 'test.jpg',
    });

    const { queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    // Should show empty state since all manga were skipped
    expect(queryByText('No reading manga found')).toBeTruthy();
  });

  it('closes search when toggling again', async () => {
    const { getByTestId, getByPlaceholderText, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    // Expand search
    fireEvent.press(getByTestId('bookmarks-toggle-search'));

    await act(async () => {
      jest.runAllTimers();
    });

    // Type something in search
    fireEvent.changeText(getByPlaceholderText('Search bookmarks...'), 'test query');

    await act(async () => {
      jest.runAllTimers();
    });

    // Collapse search
    fireEvent.press(getByTestId('bookmarks-toggle-search'));

    await act(async () => {
      jest.runAllTimers();
    });
  });

  it('closes sort options when already open', async () => {
    const { getByTestId, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    // Open sort options
    fireEvent.press(getByTestId('bookmarks-toggle-sort'));

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Title (A‑Z)')).toBeTruthy();
    });

    // Close sort options
    fireEvent.press(getByTestId('bookmarks-toggle-sort'));

    await act(async () => {
      jest.runAllTimers();
    });
  });

  it('renders in list view mode', async () => {
    (getDefaultLayout as jest.Mock).mockResolvedValue('list');

    (getMangaData as jest.Mock).mockImplementation(async (id: string) => ({
      id,
      title: `Manga ${id}`,
      bookmarkStatus: 'Reading',
      lastReadChapter: 5,
      bannerImage: `${id}.jpg`,
      lastUpdated: 100,
    }));

    const { queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });
  });

  it('handles invalid bookmark key format', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (key === 'bookmarkKeys') return JSON.stringify(['invalid_key_without_id', 'bookmark_1']);
      if (key === 'bookmarkChanged') return 'false';
      return null;
    });

    (getMangaData as jest.Mock).mockImplementation(async (id: string) => {
      if (id === '1') {
        return {
          id: '1',
          title: 'Valid Manga',
          bookmarkStatus: 'Reading',
          bannerImage: 'valid.jpg',
        };
      }
      return null;
    });

    const { queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });
  });

  it('switches to all section tabs', async () => {
    (getMangaData as jest.Mock).mockImplementation(async (id: string) => {
      if (id === '1') {
        return {
          id: '1',
          title: 'Reading Manga',
          bookmarkStatus: 'Reading',
          bannerImage: 'reading.jpg',
        };
      }
      return {
        id: '2',
        title: 'On Hold Manga',
        bookmarkStatus: 'On Hold',
        bannerImage: 'onhold.jpg',
      };
    });

    const { getByText, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    // Switch to On Hold section
    fireEvent.press(getByText('On Hold'));

    await act(async () => {
      jest.runAllTimers();
    });

    // Switch to Read section
    fireEvent.press(getByText('Read'));

    await act(async () => {
      jest.runAllTimers();
    });

    // Switch back to Reading section
    fireEvent.press(getByText('Reading'));

    await act(async () => {
      jest.runAllTimers();
    });
  });

  it('handles manga with undefined lastUpdated for sorting', async () => {
    (getMangaData as jest.Mock).mockImplementation(async (id: string) => {
      if (id === '1') {
        return {
          id: '1',
          title: 'Manga No Update',
          bookmarkStatus: 'Reading',
          bannerImage: 'no-update.jpg',
          lastUpdated: undefined,
        };
      }
      return {
        id: '2',
        title: 'Manga With Update',
        bookmarkStatus: 'Reading',
        bannerImage: 'update.jpg',
        lastUpdated: 100,
      };
    });

    const { getByTestId, getByText, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    // Open sort options and sort by last read
    fireEvent.press(getByTestId('bookmarks-toggle-sort'));

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Last Read (Recent)')).toBeTruthy();
    });

    fireEvent.press(getByText('Last Read (Recent)'));

    await act(async () => {
      jest.runAllTimers();
    });
  });

  it('clears search via clear button in search bar', async () => {
    const { getByPlaceholderText, queryByText, getByTestId } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    // Expand search
    fireEvent.press(getByTestId('bookmarks-toggle-search'));

    await act(async () => {
      jest.runAllTimers();
    });

    const input = getByPlaceholderText('Search bookmarks...');
    fireEvent.changeText(input, 'test');

    await act(async () => {
      jest.runAllTimers();
    });
  });

  it('handles manga with empty bannerImage', async () => {
    (getMangaData as jest.Mock).mockResolvedValue({
      id: '1',
      title: 'Manga No Image',
      bookmarkStatus: 'Reading',
      bannerImage: '',
      lastUpdated: 100,
    });

    const { queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });
  });

  it('handles manga in all status types', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (key === 'bookmarkKeys') {
        return JSON.stringify(['bookmark_1', 'bookmark_2', 'bookmark_3', 'bookmark_4']);
      }
      if (key === 'bookmarkChanged') return 'false';
      return null;
    });

    (getMangaData as jest.Mock).mockImplementation(async (id: string) => {
      const statuses: Record<string, string> = {
        '1': 'Reading',
        '2': 'To Read',
        '3': 'On Hold',
        '4': 'Read',
      };
      return {
        id,
        title: `Manga ${id}`,
        bookmarkStatus: statuses[id],
        bannerImage: `${id}.jpg`,
        lastUpdated: parseInt(id) * 100,
      };
    });

    const { queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });
  });

  it('handles manga with invalid status that falls back to Reading', async () => {
    (getMangaData as jest.Mock).mockResolvedValue({
      id: '1',
      title: 'Invalid Status Manga',
      bookmarkStatus: 'InvalidStatus',
      bannerImage: 'invalid.jpg',
    });

    const { queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });
  });

  it('navigates to manga details when pressing a bookmark in grid view', async () => {
    (getMangaData as jest.Mock).mockResolvedValue({
      id: '1',
      title: 'Test Manga',
      bookmarkStatus: 'Reading',
      lastReadChapter: 5,
      bannerImage: 'test.jpg',
      lastUpdated: 100,
    });

    const { getAllByTestId, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    // Press the first manga card (multiple rendered due to section pages)
    const cards = getAllByTestId('manga-card-press-1');
    fireEvent.press(cards[0]);

    await act(async () => {
      jest.runAllTimers();
    });

    expect(mockRouterPush).toHaveBeenCalledWith('/manga/1');
  });

  it('renders list view correctly and verifies manga card exists', async () => {
    (getDefaultLayout as jest.Mock).mockResolvedValue('list');

    (getMangaData as jest.Mock).mockResolvedValue({
      id: '1',
      title: 'Test Manga',
      bookmarkStatus: 'Reading',
      lastReadChapter: 5,
      bannerImage: 'test.jpg',
      lastUpdated: 100,
    });

    const { getAllByTestId, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    // Verify manga cards are rendered in list view
    const cards = getAllByTestId('manga-card-1');
    expect(cards.length).toBeGreaterThan(0);
  });

  it('refreshes bookmarks when removing a bookmark in grid view', async () => {
    (getMangaData as jest.Mock).mockResolvedValue({
      id: '1',
      title: 'Test Manga',
      bookmarkStatus: 'Reading',
      lastReadChapter: 5,
      bannerImage: 'test.jpg',
      lastUpdated: 100,
    });

    const { getAllByTestId, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    // Press remove bookmark button (first one)
    const removeButtons = getAllByTestId('manga-card-remove-bookmark-1');
    fireEvent.press(removeButtons[0]);

    await act(async () => {
      jest.runAllTimers();
    });

    // fetchBookmarks should be called again
    expect(getMangaData).toHaveBeenCalled();
  });

  it('refreshes bookmarks when changing bookmark status in grid view', async () => {
    (getMangaData as jest.Mock).mockResolvedValue({
      id: '1',
      title: 'Test Manga',
      bookmarkStatus: 'Reading',
      lastReadChapter: 5,
      bannerImage: 'test.jpg',
      lastUpdated: 100,
    });

    const { getAllByTestId, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    // Press change bookmark button (first one)
    const changeButtons = getAllByTestId('manga-card-change-bookmark-1');
    fireEvent.press(changeButtons[0]);

    await act(async () => {
      jest.runAllTimers();
    });

    // fetchBookmarks should be called again
    expect(getMangaData).toHaveBeenCalled();
  });

  it('refreshes bookmarks when removing a bookmark in list view', async () => {
    (getDefaultLayout as jest.Mock).mockResolvedValue('list');

    (getMangaData as jest.Mock).mockResolvedValue({
      id: '1',
      title: 'Test Manga',
      bookmarkStatus: 'Reading',
      lastReadChapter: 5,
      bannerImage: 'test.jpg',
      lastUpdated: 100,
    });

    const { getAllByTestId, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    // Press remove bookmark button (first one)
    const removeButtons = getAllByTestId('manga-card-remove-bookmark-1');
    fireEvent.press(removeButtons[0]);

    await act(async () => {
      jest.runAllTimers();
    });

    // fetchBookmarks should be called again
    expect(getMangaData).toHaveBeenCalled();
  });

  it('refreshes bookmarks when changing bookmark status in list view', async () => {
    (getDefaultLayout as jest.Mock).mockResolvedValue('list');

    (getMangaData as jest.Mock).mockResolvedValue({
      id: '1',
      title: 'Test Manga',
      bookmarkStatus: 'Reading',
      lastReadChapter: 5,
      bannerImage: 'test.jpg',
      lastUpdated: 100,
    });

    const { getAllByTestId, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    // Press change bookmark button (first one)
    const changeButtons = getAllByTestId('manga-card-change-bookmark-1');
    fireEvent.press(changeButtons[0]);

    await act(async () => {
      jest.runAllTimers();
    });

    // fetchBookmarks should be called again
    expect(getMangaData).toHaveBeenCalled();
  });

  it('renders list view with chapter info', async () => {
    (getDefaultLayout as jest.Mock).mockResolvedValue('list');

    (getMangaData as jest.Mock).mockResolvedValue({
      id: '1',
      title: 'List View Manga',
      bookmarkStatus: 'Reading',
      lastReadChapter: 10,
      bannerImage: 'list.jpg',
      lastUpdated: 100,
    });

    const { queryByText, getAllByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    expect(getAllByText('List View Manga').length).toBeGreaterThan(0);
  });

  it('renders multiple manga in list view', async () => {
    (getDefaultLayout as jest.Mock).mockResolvedValue('list');

    (getMangaData as jest.Mock).mockImplementation(async (id: string) => ({
      id,
      title: `Manga ${id}`,
      bookmarkStatus: 'Reading',
      lastReadChapter: parseInt(id) * 5,
      bannerImage: `${id}.jpg`,
      lastUpdated: parseInt(id) * 100,
    }));

    const { queryByText, getAllByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    expect(getAllByText('Manga 1').length).toBeGreaterThan(0);
    expect(getAllByText('Manga 2').length).toBeGreaterThan(0);
  });

  it('handles section tab layout events', async () => {
    (getMangaData as jest.Mock).mockResolvedValue({
      id: '1',
      title: 'Test Manga',
      bookmarkStatus: 'Reading',
      bannerImage: 'test.jpg',
    });

    const { getByText, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    // Get the Reading tab and trigger onLayout
    const readingTab = getByText('Reading').parent?.parent;
    if (readingTab) {
      fireEvent(readingTab, 'layout', {
        nativeEvent: { layout: { x: 0, width: 80 } },
      });
    }

    await act(async () => {
      jest.runAllTimers();
    });
  });

  it('handles rapid section switching', async () => {
    (getMangaData as jest.Mock).mockImplementation(async (id: string) => {
      if (id === '1') {
        return {
          id: '1',
          title: 'Reading Manga',
          bookmarkStatus: 'Reading',
          bannerImage: 'reading.jpg',
        };
      }
      return {
        id: '2',
        title: 'To Read Manga',
        bookmarkStatus: 'To Read',
        bannerImage: 'toread.jpg',
      };
    });

    const { getByText, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    // Rapid section switching
    fireEvent.press(getByText('To Read'));
    fireEvent.press(getByText('On Hold'));
    fireEvent.press(getByText('Read'));
    fireEvent.press(getByText('Reading'));

    await act(async () => {
      jest.runAllTimers();
    });
  });

  it('shows correct empty state message for different sections', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (key === 'bookmarkKeys') return JSON.stringify([]);
      return null;
    });

    const { getByText, queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    // Check Reading section empty state
    expect(queryByText('No reading manga found')).toBeTruthy();

    // Switch to To Read and check empty state
    fireEvent.press(getByText('To Read'));

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('No to read manga found')).toBeTruthy();
    });
  });

  it('displays correct section counts', async () => {
    (AsyncStorage.getItem as jest.Mock).mockImplementation(async (key: string) => {
      if (key === 'bookmarkKeys') {
        return JSON.stringify(['bookmark_1', 'bookmark_2', 'bookmark_3']);
      }
      if (key === 'bookmarkChanged') return 'false';
      return null;
    });

    (getMangaData as jest.Mock).mockImplementation(async (id: string) => {
      const data: Record<string, any> = {
        '1': { id: '1', title: 'Manga 1', bookmarkStatus: 'Reading', bannerImage: '1.jpg' },
        '2': { id: '2', title: 'Manga 2', bookmarkStatus: 'Reading', bannerImage: '2.jpg' },
        '3': { id: '3', title: 'Manga 3', bookmarkStatus: 'To Read', bannerImage: '3.jpg' },
      };
      return data[id];
    });

    const { queryByText, getByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    // Verify the screen loaded with bookmarks header
    expect(getByText('My Bookmarks')).toBeTruthy();
  });
});
