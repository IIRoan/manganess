import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import BookmarksScreen from '../bookmarks';
import { getMangaData } from '@/services/bookmarkService';
import { getDefaultLayout, setDefaultLayout } from '@/services/settingsService';

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
  useRouter: () => ({ push: jest.fn() }),
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

jest.mock('@/contexts/OfflineContext', () => ({
  useOffline: () => ({ isOffline: false }),
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
}));

jest.mock('@/components/MangaCard', () => 'MangaCard');

const initialMetrics = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe('BookmarksScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

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
    const { imageCache } = require('@/services/CacheImages');

    const { queryByText } = renderScreen();

    await act(async () => {
      jest.runAllTimers();
    });

    await waitFor(() => {
      expect(queryByText('Loading...')).toBeNull();
    });

    expect(imageCache.getCachedImagePath).toHaveBeenCalled();
  });
});
