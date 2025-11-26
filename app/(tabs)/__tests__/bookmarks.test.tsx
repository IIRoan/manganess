import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import BookmarksScreen from '../bookmarks';
import { getMangaData } from '@/services/bookmarkService';
import { getDefaultLayout, setDefaultLayout } from '@/services/settingsService';

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn((callback) => callback()),
}));

const mockUseTheme = jest.fn();

jest.mock('@/constants/ThemeContext', () => ({
  useTheme: () => mockUseTheme(),
}));

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({
    push: mockPush,
  }),
}));

jest.mock('@/services/bookmarkService', () => ({
  getMangaData: jest.fn(),
}));

jest.mock('@/services/settingsService', () => ({
  getDefaultLayout: jest.fn(),
  setDefaultLayout: jest.fn(),
}));

jest.mock('@/services/CacheImages', () => ({
  imageCache: {
    getCachedImagePath: jest.fn(),
  },
}));

jest.mock('@expo/vector-icons', () => ({
  Ionicons: ({ name }: { name: string }) => {
    const React = jest.requireActual('react');
    const { Text } = jest.requireActual('react-native');
    return React.createElement(Text, {}, name);
  },
}));

jest.mock('@/components/MangaCard', () => {
  const MockMangaCard = ({
    title,
    onPress,
  }: {
    title: string;
    onPress: () => void;
  }) => {
    const React = jest.requireActual('react');
    const { TouchableOpacity, Text } = jest.requireActual('react-native');
    return React.createElement(
      TouchableOpacity,
      { onPress, testID: `manga-card-${title}` },
      React.createElement(Text, {}, title)
    );
  };
  MockMangaCard.displayName = 'MockMangaCard';
  return MockMangaCard;
});

const initialMetrics = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

const renderBookmarks = () =>
  render(
    <SafeAreaProvider initialMetrics={initialMetrics}>
      <BookmarksScreen />
    </SafeAreaProvider>
  );

describe('BookmarksScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseTheme.mockReturnValue({ actualTheme: 'light' });

    const storage: Record<string, string | null> = {
      bookmarkKeys: JSON.stringify(['bookmark_1', 'bookmark_2']),
      bookmarkChanged: 'false',
      bookmarksViewMode: 'grid',
    };

    (AsyncStorage.getItem as jest.Mock).mockImplementation(
      async (key: string) => {
        return storage[key] ?? null;
      }
    );

    (AsyncStorage.setItem as jest.Mock).mockImplementation(
      async (key: string, value: string) => {
        storage[key] = value;
      }
    );

    (getMangaData as jest.Mock).mockImplementation(async (id: string) => {
      if (id === '1') {
        return {
          id: '1',
          title: 'Bookmark Alpha',
          bookmarkStatus: 'Reading',
          lastReadChapter: 12,
          bannerImage: 'alpha.jpg',
          lastUpdated: 10,
        };
      }
      return {
        id: '2',
        title: 'Bookmark Beta',
        bookmarkStatus: 'Read',
        lastReadChapter: 5,
        bannerImage: 'beta.jpg',
        lastUpdated: 20,
      };
    });

    (getDefaultLayout as jest.Mock).mockResolvedValue('grid');
  });

  it('renders fetched bookmarks and navigates to detail on tap', async () => {
    const { getByText, queryByText, getByTestId } = renderBookmarks();

    expect(getByText('Loading...')).toBeTruthy();

    await waitFor(() => expect(getMangaData).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(queryByText('Loading...')).toBeNull());

    expect(getByText('My Bookmarks')).toBeTruthy();
    expect(getByText('Bookmark Alpha')).toBeTruthy();
    expect(getByText('Bookmark Beta')).toBeTruthy();

    fireEvent.press(getByTestId('manga-card-Bookmark Alpha'));

    expect(mockPush).toHaveBeenCalledWith('/manga/1');
  });

  it('filters bookmarks based on the search query', async () => {
    const { getByPlaceholderText, queryByText } = renderBookmarks();

    await waitFor(() => expect(getMangaData).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(queryByText('Loading...')).toBeNull());

    const searchInput = getByPlaceholderText('Search bookmarks...');

    fireEvent.changeText(searchInput, 'beta');

    await waitFor(() => {
      expect(queryByText('Bookmark Alpha')).toBeNull();
      expect(queryByText('Bookmark Beta')).not.toBeNull();
    });
  });

  it('toggles view mode and persists preference', async () => {
    const { getByTestId, queryByText } = renderBookmarks();

    await waitFor(() => expect(getMangaData).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(queryByText('Loading...')).toBeNull());

    fireEvent.press(getByTestId('bookmarks-toggle-view'));

    await waitFor(() => expect(setDefaultLayout).toHaveBeenCalledWith('list'));
  });
});
