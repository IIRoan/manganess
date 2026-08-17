import { fireEvent, render } from '@testing-library/react-native';

import MangaCard from '@/components/MangaCard';
import {
  navigateToMangaDetails,
  prefetchMangaOpen,
} from '@/utils/mangaOpenNavigation';

const mockPush = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ push: mockPush }),
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
    bookmarks: [],
    addBookmark: jest.fn(),
    removeBookmark: jest.fn(),
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

jest.mock('@/services/bookmarkService', () => ({
  getBookmarkPopupConfig: () => ({ title: '', options: [] }),
  getMangaData: jest.fn(),
  saveBookmark: jest.fn(),
  removeBookmark: jest.fn(),
}));

jest.mock('@/utils/mangaOpenNavigation', () => ({
  navigateToMangaDetails: jest.fn(),
  prefetchMangaOpen: jest.fn(),
}));

jest.mock('@/components/BottomPopup', () => 'BottomPopup');

describe('MangaCard navigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('prefetches on press-in and delegates one press to its owner', () => {
    const onPress = jest.fn();
    const { getByTestId } = render(
      <MangaCard
        title="One Piece"
        imageUrl="cover.jpg"
        mangaId="abc12"
        onPress={onPress}
        lastReadChapter={null}
      />
    );

    const card = getByTestId('manga-card');
    fireEvent(card, 'pressIn');
    fireEvent(card, 'press');

    expect(prefetchMangaOpen).toHaveBeenCalledTimes(1);
    expect(prefetchMangaOpen).toHaveBeenCalledWith('abc12');
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(navigateToMangaDetails).not.toHaveBeenCalled();
  });

  it('owns navigation when no press callback is supplied', () => {
    const { getByTestId } = render(
      <MangaCard
        title="One Piece"
        imageUrl="cover.jpg"
        mangaId="abc12"
        onPress={undefined as unknown as () => void}
        lastReadChapter={null}
      />
    );

    fireEvent(getByTestId('manga-card'), 'press');

    expect(navigateToMangaDetails).toHaveBeenCalledTimes(1);
    expect(navigateToMangaDetails).toHaveBeenCalledWith(
      { push: mockPush },
      { id: 'abc12', title: 'One Piece', imageUrl: 'cover.jpg' },
      'card'
    );
  });
});
