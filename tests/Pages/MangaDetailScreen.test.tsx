import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import MangaDetailScreen from '@/app/(tabs)/manga/[id]';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  fetchMangaDetails,
  getChapterUrl,
  MangaDetails,
} from '@/services/mangaFireService';
import {
  fetchBookmarkStatus,
  saveBookmark,
  removeBookmark,
} from '@/services/bookmarkService';
import { getLastReadChapter } from '@/services/readChapterService';
import { useTheme } from '@/constants/ThemeContext';
import { useNavigationHistory } from '@/hooks/useNavigationHistory';
import { NavigationContainer } from '@react-navigation/native';

// Mock dependencies
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: jest.fn(),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
  removeItem: jest.fn(),
}));

jest.mock('@/services/mangaFireService', () => ({
  fetchMangaDetails: jest.fn(),
  getChapterUrl: jest.fn(),
  markChapterAsRead: jest.fn(),
}));

jest.mock('@/services/bookmarkService', () => ({
  fetchBookmarkStatus: jest.fn(),
  saveBookmark: jest.fn(),
  removeBookmark: jest.fn(),
}));

jest.mock('@/services/readChapterService', () => ({
  getLastReadChapter: jest.fn(),
}));

jest.mock('@/constants/ThemeContext', () => ({
  useTheme: jest.fn().mockReturnValue({ theme: 'light' }),
}));

jest.mock('@/hooks/useNavigationHistory', () => ({
  useNavigationHistory: jest.fn().mockReturnValue({ handleBackPress: jest.fn() }),
}));

// Mocking react-navigation's useFocusEffect
jest.mock('@react-navigation/native', () => {
  const React = require('react');
  const actualNav = jest.requireActual('@react-navigation/native');
  return {
    ...actualNav,
    useNavigation: jest.fn(() => ({
      navigate: jest.fn(),
      goBack: jest.fn(),
    })),
    useFocusEffect: (callback: () => void | (() => void)) => {
      React.useEffect(() => {
        const cleanup = callback();
        if (typeof cleanup === 'function') {
          return cleanup;
        }
      }, []);
    },
  };
});

// Mock react-native-safe-area-context
jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: () => ({ top: 0, left: 0, right: 0, bottom: 0 }),
}));

// Mock FlashList to use FlatList
jest.mock('@shopify/flash-list', () => {
  const React = require('react');
  const { FlatList } = require('react-native');
  const MockFlashList = React.forwardRef((props, ref) => {
    return <FlatList {...props} ref={ref} />;
  });

  return {
    FlashList: MockFlashList,
  };
});

// Global mangaDetails object
const mangaDetails: MangaDetails = {
  title: 'Test Manga',
  alternativeTitle: 'Alternative Test Manga',
  status: 'Ongoing',
  description: 'This is a test description.',
  author: ['Author 1', 'Author 2'],
  published: '2020',
  genres: ['Action', 'Adventure'],
  rating: '8.5',
  reviewCount: '100',
  bannerImage: 'http://example.com/image.jpg',
  chapters: [
    { number: '1', title: 'Chapter 1', date: '2020-01-01', url: '/chapter/1' },
    { number: '2', title: 'Chapter 2', date: '2020-02-01', url: '/chapter/2' },
  ],
};

const TestWrapper = ({ children }: { children: React.ReactNode }) => (
  <NavigationContainer>{children}</NavigationContainer>
);

describe('MangaDetailScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading indicator while loading', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '123' });

    const { findByTestId } = render(
      <TestWrapper>
        <MangaDetailScreen />
      </TestWrapper>
    );

    expect(await findByTestId('loading-indicator')).toBeTruthy();
  });

  it('renders manga details after loading', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '123' });
    (fetchMangaDetails as jest.Mock).mockResolvedValue(mangaDetails);
    (fetchBookmarkStatus as jest.Mock).mockResolvedValue(null);
    (getLastReadChapter as jest.Mock).mockResolvedValue('Chapter 2');

    const { findByText, queryByTestId } = render(
      <TestWrapper>
        <MangaDetailScreen />
      </TestWrapper>
    );

    await waitFor(() => expect(queryByTestId('loading-indicator')).toBeNull());

    expect(await findByText('Test Manga')).toBeTruthy();
    expect(await findByText('Alternative Test Manga')).toBeTruthy();
    expect(await findByText('Description')).toBeTruthy();
    expect(await findByText('This is a test description.')).toBeTruthy();
    expect(await findByText('Chapters')).toBeTruthy();
    expect(await findByText('Chapter 1')).toBeTruthy();
  });

  it('navigates to chapter screen when chapter is pressed', async () => {
    const mockNavigate = jest.fn();
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '123' });
    (useRouter as jest.Mock).mockReturnValue({ navigate: mockNavigate });
    (fetchMangaDetails as jest.Mock).mockResolvedValue(mangaDetails);
    (getLastReadChapter as jest.Mock).mockResolvedValue('Chapter 1');
    (fetchBookmarkStatus as jest.Mock).mockResolvedValue(null);

    const { findAllByTestId } = render(
      <TestWrapper>
        <MangaDetailScreen />
      </TestWrapper>
    );

    await waitFor(() => expect(fetchMangaDetails).toHaveBeenCalled());

    const chapterItems = await findAllByTestId('chapter-item');
    expect(chapterItems.length).toBeGreaterThan(0);

    const firstChapterItem = chapterItems[0];
    fireEvent.press(firstChapterItem);

    expect(mockNavigate).toHaveBeenCalledWith('/manga/123/chapter/1');
  });

  it('shows bottom popup when bookmark button is pressed', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '123' });
    (fetchMangaDetails as jest.Mock).mockResolvedValue(mangaDetails);
    (getLastReadChapter as jest.Mock).mockResolvedValue('Chapter 1');
    (fetchBookmarkStatus as jest.Mock).mockResolvedValue(null);

    const { findByTestId } = render(
      <TestWrapper>
        <MangaDetailScreen />
      </TestWrapper>
    );

    await waitFor(() => expect(fetchMangaDetails).toHaveBeenCalled());

    const bookmarkButton = await findByTestId('bookmark-button');

    fireEvent.press(bookmarkButton);

    const bottomPopupTitle = await findByTestId('bottom-popup-title');
    expect(bottomPopupTitle).toBeTruthy();
    expect(bottomPopupTitle.props.children).toContain('Bookmark Test Manga');
  });

  it('marks chapter as unread when long pressed', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '123' });
    (fetchMangaDetails as jest.Mock).mockResolvedValue(mangaDetails);
    (getLastReadChapter as jest.Mock).mockResolvedValue('Chapter 1');
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue(JSON.stringify(['1']));
    (fetchBookmarkStatus as jest.Mock).mockResolvedValue(null);

    const { findByText, findAllByTestId } = render(
      <TestWrapper>
        <MangaDetailScreen />
      </TestWrapper>
    );

    await waitFor(() => expect(fetchMangaDetails).toHaveBeenCalled());

    const chapterItems = await findAllByTestId('chapter-item');
    const firstChapterItem = chapterItems[0];

    fireEvent(firstChapterItem, 'onLongPress');

    // Since the AlertComponent is being used, we need to find the alert title
    const alertTitle = await findByText('Mark as Unread');
    expect(alertTitle).toBeTruthy();

    const yesButton = await findByText('Yes');
    fireEvent.press(yesButton);

    expect(AsyncStorage.setItem).toHaveBeenCalledWith('manga_123_read_chapters', JSON.stringify([]));
  });

  it('saves bookmark when bookmark option is selected', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '123' });
    (fetchMangaDetails as jest.Mock).mockResolvedValue(mangaDetails);
    (getLastReadChapter as jest.Mock).mockResolvedValue('Chapter 1');
    (fetchBookmarkStatus as jest.Mock).mockResolvedValue(null);

    const mockSaveBookmark = jest.fn().mockResolvedValue(undefined);
    (saveBookmark as jest.Mock).mockImplementation(mockSaveBookmark);

    const { findByTestId, findByText } = render(
      <TestWrapper>
        <MangaDetailScreen />
      </TestWrapper>
    );

    await waitFor(() => expect(fetchMangaDetails).toHaveBeenCalled());

    const bookmarkButton = await findByTestId('bookmark-button');
    fireEvent.press(bookmarkButton);

    const toReadOption = await findByText('To Read');
    fireEvent.press(toReadOption);

    expect(mockSaveBookmark).toHaveBeenCalledWith(
      '123',
      'To Read',
      mangaDetails,
      expect.any(Array),
      expect.any(Function),
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('removes bookmark when unbookmark option is selected', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '123' });
    (fetchMangaDetails as jest.Mock).mockResolvedValue(mangaDetails);
    (getLastReadChapter as jest.Mock).mockResolvedValue('Chapter 1');
    (fetchBookmarkStatus as jest.Mock).mockResolvedValue('To Read');

    const mockRemoveBookmark = jest.fn().mockResolvedValue(undefined);
    (removeBookmark as jest.Mock).mockImplementation(mockRemoveBookmark);

    const { findByTestId, findByText } = render(
      <TestWrapper>
        <MangaDetailScreen />
      </TestWrapper>
    );

    await waitFor(() => expect(fetchMangaDetails).toHaveBeenCalled());

    const bookmarkButton = await findByTestId('bookmark-button');
    fireEvent.press(bookmarkButton);

    const unbookmarkOption = await findByText('Unbookmark');
    fireEvent.press(unbookmarkOption);

    expect(mockRemoveBookmark).toHaveBeenCalledWith(
      '123',
      expect.any(Function),
      expect.any(Function)
    );
  });

  it('handles last read chapter navigation', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '123' });
    (useRouter as jest.Mock).mockReturnValue({ navigate: jest.fn() });
    const mockNavigate = useRouter().navigate as jest.Mock;
    (fetchMangaDetails as jest.Mock).mockResolvedValue(mangaDetails);
    (getLastReadChapter as jest.Mock).mockResolvedValue('Chapter 1');
    (fetchBookmarkStatus as jest.Mock).mockResolvedValue(null);

    const { findByText } = render(
      <TestWrapper>
        <MangaDetailScreen />
      </TestWrapper>
    );

    await waitFor(() => expect(fetchMangaDetails).toHaveBeenCalled());

    const lastReadButton = await findByText('Continue from Chapter 1');
    fireEvent.press(lastReadButton);

    expect(mockNavigate).toHaveBeenCalledWith('/manga/123/chapter/1');
  });

  it('handles empty last read chapter correctly', async () => {
    const mangaDetailsWithChapters: MangaDetails = {
      ...mangaDetails,
      chapters: [
        { number: '2', title: 'Chapter 2', date: '2021-01-01', url: '/chapter/2' },
        { number: '1', title: 'Chapter 1', date: '2020-01-01', url: '/chapter/1' },
      ],
    };

    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '123' });
    (useRouter as jest.Mock).mockReturnValue({ navigate: jest.fn() });
    const mockNavigate = useRouter().navigate as jest.Mock;
    (fetchMangaDetails as jest.Mock).mockResolvedValue(mangaDetailsWithChapters);
    (getLastReadChapter as jest.Mock).mockResolvedValue(null);
    (fetchBookmarkStatus as jest.Mock).mockResolvedValue(null);

    const { findByText } = render(
      <TestWrapper>
        <MangaDetailScreen />
      </TestWrapper>
    );

    await waitFor(() => expect(fetchMangaDetails).toHaveBeenCalled());

    const startReadingButton = await findByText('Start reading');
    fireEvent.press(startReadingButton);

    // Should navigate to the first chapter (number 1)
    expect(mockNavigate).toHaveBeenCalledWith('/manga/123/chapter/1');
  });

  it('handles back press', async () => {
    const mockHandleBackPress = jest.fn();
    (useNavigationHistory as jest.Mock).mockReturnValue({ handleBackPress: mockHandleBackPress });
    (useLocalSearchParams as jest.Mock).mockReturnValue({ id: '123' });
    (fetchMangaDetails as jest.Mock).mockResolvedValue(mangaDetails);
    (getLastReadChapter as jest.Mock).mockResolvedValue('Chapter 1');
    (fetchBookmarkStatus as jest.Mock).mockResolvedValue(null);

    const { findByTestId } = render(
      <TestWrapper>
        <MangaDetailScreen />
      </TestWrapper>
    );

    await waitFor(() => expect(fetchMangaDetails).toHaveBeenCalled());

    const backButton = await findByTestId('back-button');
    fireEvent.press(backButton);

    expect(mockHandleBackPress).toHaveBeenCalled();
  });
});
