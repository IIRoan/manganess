import { fireEvent, render, waitFor } from '@testing-library/react-native';

import MangaCard from '@/components/MangaCard';
import {
  getMangaData,
  saveBookmark,
  removeBookmark,
} from '@/services/bookmarkService';
import type { MangaData } from '@/types/manga';

const mockAddBookmark = jest.fn();
const mockRemoveBookmarkFromList = jest.fn();
let mockBookmarks: MangaData[] = [];

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: jest.fn() }),
}));

jest.mock('expo-image', () => ({ Image: 'Image' }));

jest.mock('@expo/vector-icons', () => ({ Ionicons: 'Ionicons' }));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({ theme: 'light', systemTheme: 'light' }),
}));

jest.mock('@/hooks/useOffline', () => ({
  useOffline: () => ({ isOffline: false }),
}));

jest.mock('@/hooks/useBookmarks', () => ({
  useBookmarks: () => ({
    bookmarks: mockBookmarks,
    addBookmark: mockAddBookmark,
    removeBookmark: mockRemoveBookmarkFromList,
    refreshBookmarks: jest.fn(),
  }),
}));

jest.mock('@/hooks/useToast', () => ({
  useToast: () => ({ showToast: jest.fn() }),
}));

jest.mock('@/utils/haptics', () => ({
  useHapticFeedback: () => ({
    onPress: jest.fn(),
    onLongPress: jest.fn(),
  }),
}));

jest.mock('@/services/CacheImages', () => ({
  useImageCache: () => null,
  useMangaImageCache: () => null,
}));

jest.mock('@/utils/mangaOpenNavigation', () => ({
  navigateToMangaDetails: jest.fn(),
  prefetchMangaOpen: jest.fn(),
}));

jest.mock('@/services/bookmarkService', () => {
  const actual = jest.requireActual('@/services/bookmarkService');
  return {
    ...actual,
    getMangaData: jest.fn(),
    saveBookmark: jest.fn(),
    removeBookmark: jest.fn(),
  };
});

jest.mock('@/components/BottomPopup', () => {
  const { View, Pressable, Text } = require('react-native');
  function MockBottomPopup({
    visible,
    options,
  }: {
    visible: boolean;
    options: { text: string; onPress: () => void }[];
  }) {
    if (!visible) {
      return null;
    }

    return (
      <View testID="bookmark-popup">
        {options.map((option) => (
          <Pressable
            key={option.text}
            testID={`bookmark-option-${option.text}`}
            onPress={option.onPress}
          >
            <Text>{option.text}</Text>
          </Pressable>
        ))}
      </View>
    );
  }
  MockBottomPopup.displayName = 'MockBottomPopup';
  return MockBottomPopup;
});

const mockGetMangaData = getMangaData as jest.MockedFunction<
  typeof getMangaData
>;
const mockSaveBookmark = saveBookmark as jest.MockedFunction<
  typeof saveBookmark
>;
const mockRemoveBookmark = removeBookmark as jest.MockedFunction<
  typeof removeBookmark
>;

function renderCard() {
  return render(
    <MangaCard
      title="One Piece"
      imageUrl="cover.jpg"
      mangaId="abc12"
      onPress={jest.fn()}
      lastReadChapter={null}
    />
  );
}

describe('MangaCard bookmark atom sync', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockBookmarks = [];
    mockGetMangaData.mockResolvedValue(null);
    mockSaveBookmark.mockResolvedValue(undefined);
    mockRemoveBookmark.mockResolvedValue(undefined);
    mockAddBookmark.mockImplementation(async (manga: MangaData) => {
      mockBookmarks = [manga];
    });
    mockRemoveBookmarkFromList.mockImplementation(async () => {
      mockBookmarks = [];
    });
  });

  it('keeps a newly saved bookmark in the atom so remounted cards still show it', async () => {
    const firstRender = renderCard();

    fireEvent(firstRender.getByTestId('manga-card'), 'longPress');
    await waitFor(() => firstRender.getByTestId('bookmark-option-Reading'));
    fireEvent.press(firstRender.getByTestId('bookmark-option-Reading'));

    await waitFor(() => {
      expect(mockSaveBookmark).toHaveBeenCalledTimes(1);
      expect(mockAddBookmark).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'abc12',
          bookmarkStatus: 'Reading',
        })
      );
    });

    firstRender.unmount();

    const remounted = renderCard();
    expect(remounted.getByTestId('manga-card-bookmark-indicator')).toBeTruthy();
  });

  it('removes the bookmark from the atom so remounted cards do not show a stale badge', async () => {
    const existingBookmark: MangaData = {
      id: 'abc12',
      title: 'One Piece',
      bannerImage: 'cover.jpg',
      bookmarkStatus: 'Reading',
      readChapters: [],
      lastUpdated: Date.now(),
    };
    mockBookmarks = [existingBookmark];
    mockGetMangaData.mockResolvedValue(existingBookmark);

    const firstRender = renderCard();
    expect(
      firstRender.getByTestId('manga-card-bookmark-indicator')
    ).toBeTruthy();

    fireEvent(firstRender.getByTestId('manga-card'), 'longPress');
    await waitFor(() => firstRender.getByTestId('bookmark-option-Unbookmark'));
    fireEvent.press(firstRender.getByTestId('bookmark-option-Unbookmark'));

    await waitFor(() => {
      expect(mockRemoveBookmark).toHaveBeenCalledTimes(1);
      expect(mockRemoveBookmarkFromList).toHaveBeenCalledWith('abc12');
    });

    firstRender.unmount();

    const remounted = renderCard();
    expect(remounted.queryByTestId('manga-card-bookmark-indicator')).toBeNull();
  });
});
