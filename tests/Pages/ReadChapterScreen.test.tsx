import React from 'react';
import { render, fireEvent, waitFor, act } from '@testing-library/react-native';
import ReadChapterScreen from '@/app/(tabs)/manga/[id]/chapter/[chapterNumber]';
import {
  useLocalSearchParams,
  useRouter,
  useFocusEffect,
} from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  getChapterUrl,
  markChapterAsRead,
  getInjectedJavaScript,
  fetchMangaDetails,
} from '@/services/mangaFireService';
import { useTheme } from '@/constants/ThemeContext';
import { BackHandler } from 'react-native';
import { useColorScheme } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

// Mock dependencies
jest.mock('expo-router', () => ({
  useLocalSearchParams: jest.fn(),
  useRouter: jest.fn(),
  useFocusEffect: jest.fn((callback) => callback()),
}));

jest.mock('react-native/Libraries/Settings/Settings', () => ({
  get: jest.fn(),
  set: jest.fn(),
}));

jest.mock('react-native-webview', () => {
  const { View } = require('react-native');
  return {
    WebView: jest.fn().mockImplementation(({ testID, ...props }) => (
      <View testID={testID || 'webview'} {...props} />
    )),
  };
});

jest.mock('@/services/mangaFireService', () => ({
  getChapterUrl: jest.fn(),
  markChapterAsRead: jest.fn(),
  getInjectedJavaScript: jest.fn(),
  fetchMangaDetails: jest.fn(),
}));

jest.mock('react-native/Libraries/Utilities/BackHandler', () => ({
  addEventListener: jest.fn().mockReturnValue({ remove: jest.fn() }),
}));

jest.mock('@react-native-async-storage/async-storage', () => ({
  getItem: jest.fn(),
  setItem: jest.fn(),
}));

jest.mock('@/constants/ThemeContext', () => ({
  useTheme: jest.fn(),
}));

jest.mock('react-native', () => {
  const actualReactNative = jest.requireActual('react-native');
  return {
    ...actualReactNative,
    useColorScheme: jest.fn(),
  };
});

jest.mock('react-native-safe-area-context', () => ({
  useSafeAreaInsets: jest.fn(),
}));

describe('ReadChapterScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('renders loading indicator while loading', () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      id: '123',
      chapterNumber: '1',
    });
    (useTheme as jest.Mock).mockReturnValue({ theme: 'light' });
    (useColorScheme as jest.Mock).mockReturnValue('light');
    (useSafeAreaInsets as jest.Mock).mockReturnValue({ top: 0 });

    const { getByTestId } = render(<ReadChapterScreen />);

    expect(getByTestId('loading-indicator')).toBeTruthy();
  });

  it('renders WebView after loading', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      id: '123',
      chapterNumber: '1',
    });
    (useRouter as jest.Mock).mockReturnValue({ navigate: jest.fn() });
    (useTheme as jest.Mock).mockReturnValue({ theme: 'light' });
    (useColorScheme as jest.Mock).mockReturnValue('light');
    (useSafeAreaInsets as jest.Mock).mockReturnValue({ top: 0 });
    (getChapterUrl as jest.Mock).mockReturnValue(
      'https://example.com/read/123/en/chapter-1'
    );
    (getInjectedJavaScript as jest.Mock).mockReturnValue('');
    (fetchMangaDetails as jest.Mock).mockResolvedValue({ title: 'Sample Manga' });
    (markChapterAsRead as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValue('Sample Manga');

    const { getByTestId, queryByTestId } = render(<ReadChapterScreen />);

    const webView = getByTestId('chapter-webview');

    // Simulate onLoadEnd to fire handleLoadEnd function
    await act(async () => {
      if (webView.props.onLoadEnd) {
        webView.props.onLoadEnd();
      }
    });

    await waitFor(() => {
      expect(queryByTestId('loading-indicator')).toBeNull();
    });

    expect(getByTestId('chapter-webview')).toBeTruthy();
  });

  it('displays error message when loading fails', async () => {
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      id: '123',
      chapterNumber: '1',
    });
    (useRouter as jest.Mock).mockReturnValue({ navigate: jest.fn() });
    (useTheme as jest.Mock).mockReturnValue({ theme: 'light' });
    (useColorScheme as jest.Mock).mockReturnValue('light');
    (useSafeAreaInsets as jest.Mock).mockReturnValue({ top: 0 });
    (getChapterUrl as jest.Mock).mockReturnValue(
      'https://example.com/read/123/en/chapter-1'
    );
    (getInjectedJavaScript as jest.Mock).mockReturnValue('');
    (fetchMangaDetails as jest.Mock).mockRejectedValue(
      new Error('Failed to fetch manga details')
    );
    (markChapterAsRead as jest.Mock).mockResolvedValue(undefined);
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);

    const { getByTestId, getByText } = render(<ReadChapterScreen />);

    const webView = getByTestId('chapter-webview');

    act(() => {
      if (webView.props.onError) {
        webView.props.onError({} as any);
      }
    });

    await waitFor(() => {
      expect(
        getByText('Failed to load chapter. Please try again.')
      ).toBeTruthy();
    });
  });

  it('navigates back when back button is pressed', () => {
    const mockNavigate = jest.fn();
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      id: '123',
      chapterNumber: '1',
    });
    (useRouter as jest.Mock).mockReturnValue({ navigate: mockNavigate });
    (useTheme as jest.Mock).mockReturnValue({ theme: 'light' });
    (useColorScheme as jest.Mock).mockReturnValue('light');
    (useSafeAreaInsets as jest.Mock).mockReturnValue({ top: 0 });
    (getChapterUrl as jest.Mock).mockReturnValue(
      'https://example.com/read/123/en/chapter-1'
    );
    (getInjectedJavaScript as jest.Mock).mockReturnValue('');

    const { getByTestId } = render(<ReadChapterScreen />);

    const backButton = getByTestId('back-button');
    fireEvent.press(backButton);

    expect(mockNavigate).toHaveBeenCalledWith('/manga/123');
  });

  it('handles navigation state change and navigates to new chapter', async () => {
    const mockReplace = jest.fn();
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      id: '123',
      chapterNumber: '1',
    });
    (useRouter as jest.Mock).mockReturnValue({ replace: mockReplace });
    (useTheme as jest.Mock).mockReturnValue({ theme: 'light' });
    (useColorScheme as jest.Mock).mockReturnValue('light');
    (useSafeAreaInsets as jest.Mock).mockReturnValue({ top: 0 });
    (getChapterUrl as jest.Mock).mockReturnValue(
      'https://example.com/read/123/en/chapter-1'
    );
    (getInjectedJavaScript as jest.Mock).mockReturnValue('');
    (AsyncStorage.getItem as jest.Mock).mockResolvedValueOnce(null);
    (fetchMangaDetails as jest.Mock).mockResolvedValue({ title: 'Sample Manga' });
    (markChapterAsRead as jest.Mock).mockResolvedValue(undefined);

    const { getByTestId } = render(<ReadChapterScreen />);

    // Wait for mangaTitle to be set
    await waitFor(() => {
      expect(fetchMangaDetails).toHaveBeenCalled();
    });

    const webView = getByTestId('chapter-webview');
    const onNavigationStateChange = webView.props.onNavigationStateChange;

    const navState = { url: 'https://example.com/read/123/en/chapter-2' };

    if (onNavigationStateChange) {
      await act(async () => {
        await onNavigationStateChange(navState);
      });

      expect(markChapterAsRead).toHaveBeenCalledWith(
        '123',
        '2',
        'Sample Manga'
      );
      expect(mockReplace).toHaveBeenCalledWith('/manga/123/chapter/2');
    }
  });

  it('handles hardware back press and navigates back', () => {
    const mockNavigate = jest.fn();
    const mockRemove = jest.fn();
    (useLocalSearchParams as jest.Mock).mockReturnValue({
      id: '123',
      chapterNumber: '1',
    });
    (useRouter as jest.Mock).mockReturnValue({ navigate: mockNavigate });
    (useTheme as jest.Mock).mockReturnValue({ theme: 'light' });
    (useColorScheme as jest.Mock).mockReturnValue('light');
    (useSafeAreaInsets as jest.Mock).mockReturnValue({ top: 0 });
    (BackHandler.addEventListener as jest.Mock).mockReturnValue({
      remove: mockRemove,
    });

    render(<ReadChapterScreen />);

    const backHandlerCallback = (
      BackHandler.addEventListener as jest.Mock
    ).mock.calls[0][1];

    const shouldPreventDefault = backHandlerCallback();

    expect(shouldPreventDefault).toBe(true);
    expect(mockNavigate).toHaveBeenCalledWith(`/manga/123`);
  });
});
