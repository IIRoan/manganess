import React from 'react';
import { render, fireEvent, waitFor } from '@testing-library/react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import HomeScreen from '../index';
import { offlineCacheService } from '@/services/offlineCacheService';
import { getRecentlyReadManga } from '@/services/readChapterService';
import {
  parseMostViewedManga,
  parseNewReleases,
} from '@/services/mangaFireService';
import axios from 'axios';

// Mock router
const mockRouterNavigate = jest.fn();

jest.mock('expo-router', () => ({
  useRouter: () => ({ navigate: mockRouterNavigate }),
}));

jest.mock('@react-navigation/native', () => ({
  useFocusEffect: jest.fn((cb) => {
    cb();
  }),
}));

jest.mock('@/hooks/useTheme', () => ({
  useTheme: () => ({
    actualTheme: 'light',
    accentColor: '#007AFF',
  }),
}));

jest.mock('@/services/offlineCacheService', () => ({
  offlineCacheService: {
    getCachedHomeData: jest.fn(),
    cacheHomeData: jest.fn(),
  },
}));

jest.mock('@/services/readChapterService', () => ({
  getRecentlyReadManga: jest.fn(),
}));

jest.mock('@/services/mangaFireService', () => ({
  parseMostViewedManga: jest.fn(() => []),
  parseNewReleases: jest.fn(() => []),
}));

// Create stable mock functions for Cloudflare detection
const mockCheckForCloudflare = jest.fn(() => false);
const mockResetCloudflareDetection = jest.fn();

jest.mock('@/hooks/useCloudflareDetection', () => ({
  useCloudflareDetection: () => ({
    checkForCloudflare: mockCheckForCloudflare,
    resetCloudflareDetection: mockResetCloudflareDetection,
  }),
}));

// Mock offline hook
let mockIsOffline = false;
jest.mock('@/hooks/useOffline', () => ({
  useOffline: () => ({ isOffline: mockIsOffline }),
}));

// Mock useCachedData hook
const mockGetCachedHomeData = jest.fn();
const mockCacheHomeData = jest.fn();
jest.mock('@/hooks/useCachedData', () => ({
  useCachedData: () => ({
    getCachedHomeData: mockGetCachedHomeData,
    cacheHomeData: mockCacheHomeData,
    cacheMangaDetails: jest.fn(),
    getCachedMangaDetails: jest.fn(() => null),
    cacheSearchResults: jest.fn(),
    getCachedSearchResults: jest.fn(() => null),
    updateMangaBookmarkStatus: jest.fn(),
    removeMangaFromCache: jest.fn(),
    getBookmarkedMangaDetails: jest.fn(() => []),
    clearAllCache: jest.fn(),
    getCacheStats: jest.fn(() => ({
      mangaCount: 0,
      bookmarkedCount: 0,
      searchQueriesCount: 0,
      hasHomeData: false,
    })),
    cleanExpiredEntries: jest.fn(),
  }),
}));

jest.mock('axios');
const mockedAxios = axios as jest.Mocked<typeof axios>;

jest.mock('@expo/vector-icons', () => ({
  Ionicons: 'Ionicons',
  MaterialCommunityIcons: 'MaterialCommunityIcons',
}));

jest.mock('expo-image', () => ({
  Image: 'Image',
}));

jest.mock('expo-linear-gradient', () => ({
  LinearGradient: 'LinearGradient',
}));

jest.mock('@shopify/flash-list', () => ({
  FlashList: 'FlashList',
}));

jest.mock('react-native-reanimated', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { View, ScrollView } = require('react-native');
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Reanimated = require('react-native-reanimated/mock');

  Reanimated.default.ScrollView = ScrollView;
  Reanimated.default.View = View;

  return Reanimated;
});

jest.mock('@/components/MangaCard', () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { TouchableOpacity, Text, View } = require('react-native');
  return function MockMangaCard({ title, onPress, mangaId }: any) {
    return (
      <View testID={`manga-card-${mangaId}`}>
        <TouchableOpacity
          testID={`manga-card-press-${mangaId}`}
          onPress={onPress}
        >
          <Text>{title}</Text>
        </TouchableOpacity>
      </View>
    );
  };
});

jest.mock('@/components/SkeletonLoading', () => ({
  RecentlyReadSkeleton: 'RecentlyReadSkeleton',
  TrendingSkeleton: 'TrendingSkeleton',
  NewReleasesSkeleton: 'NewReleasesSkeleton',
  FeaturedMangaSkeleton: 'FeaturedMangaSkeleton',
}));

jest.mock('@/components/PageTransition', () => ({
  PageTransition: ({ children }: any) => children,
}));

jest.mock('@/components/ParallaxLayout', () => ({
  useParallaxScroll: () => ({
    scrollY: { value: 0 },
    scrollHandler: jest.fn(),
  }),
  ParallaxImage: 'ParallaxImage',
}));

jest.mock('@/utils/logger', () => ({
  logger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
  }),
}));

const initialMetrics = {
  frame: { x: 0, y: 0, width: 320, height: 640 },
  insets: { top: 0, left: 0, right: 0, bottom: 0 },
};

describe('HomeScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsOffline = false;
    mockRouterNavigate.mockClear();
    mockCheckForCloudflare.mockClear();
    mockResetCloudflareDetection.mockClear();
    mockGetCachedHomeData.mockReturnValue(null);
    mockCacheHomeData.mockResolvedValue(undefined);

    (offlineCacheService.getCachedHomeData as jest.Mock).mockResolvedValue(
      null
    );
    (offlineCacheService.cacheHomeData as jest.Mock).mockResolvedValue(
      undefined
    );
    (getRecentlyReadManga as jest.Mock).mockResolvedValue([]);
    mockedAxios.get.mockResolvedValue({ data: '<html></html>' });
  });

  const renderScreen = () =>
    render(
      <SafeAreaProvider initialMetrics={initialMetrics}>
        <HomeScreen />
      </SafeAreaProvider>
    );

  it('shows loading skeleton initially', async () => {
    const { UNSAFE_queryByType } = renderScreen();

    // Should show skeleton loading components
    expect(UNSAFE_queryByType('FeaturedMangaSkeleton' as any)).toBeTruthy();
  });

  it('renders sections after loading', async () => {
    (offlineCacheService.getCachedHomeData as jest.Mock).mockResolvedValue({
      mostViewed: [
        { id: '1', title: 'Test Manga', imageUrl: 'test.jpg', rank: 1 },
      ],
      newReleases: [{ id: '2', title: 'New Manga', imageUrl: 'new.jpg' }],
      featuredManga: { id: '1', title: 'Test Manga', imageUrl: 'test.jpg' },
    });

    const { getByText, queryByText } = renderScreen();

    await waitFor(() => {
      expect(queryByText('Continue Reading')).toBeTruthy();
    });

    expect(getByText('Trending Now')).toBeTruthy();
    expect(getByText('New Releases')).toBeTruthy();
  });

  it('shows offline mode UI when offline', async () => {
    mockIsOffline = true;

    const { getByText, queryByText } = renderScreen();

    await waitFor(() => {
      expect(queryByText("You're Offline")).toBeTruthy();
    });

    expect(
      getByText('Connect to internet or view your saved manga')
    ).toBeTruthy();
    expect(getByText('View Saved Manga')).toBeTruthy();
  });

  it('navigates to bookmarks when View Saved Manga is pressed in offline mode', async () => {
    mockIsOffline = true;

    const { getByText, queryByText } = renderScreen();

    await waitFor(() => {
      expect(queryByText('View Saved Manga')).toBeTruthy();
    });

    fireEvent.press(getByText('View Saved Manga'));

    expect(mockRouterNavigate).toHaveBeenCalledWith('/bookmarks');
  });

  it('shows error state on fetch failure', async () => {
    mockedAxios.get.mockRejectedValue(new Error('Network error'));
    (offlineCacheService.getCachedHomeData as jest.Mock).mockResolvedValue(
      null
    );

    const { queryByText } = renderScreen();

    await waitFor(
      () => {
        expect(
          queryByText(
            'An error occurred while fetching manga data. Please try again.'
          )
        ).toBeTruthy();
      },
      { timeout: 3000 }
    );

    await waitFor(() => {
      expect(queryByText('Retry')).toBeTruthy();
    });
  });

  it('retries fetch when retry button is pressed', async () => {
    mockedAxios.get.mockRejectedValueOnce(new Error('Network error'));
    (offlineCacheService.getCachedHomeData as jest.Mock).mockResolvedValue(
      null
    );

    const { queryByText } = renderScreen();

    await waitFor(
      () => {
        expect(queryByText('Retry')).toBeTruthy();
      },
      { timeout: 3000 }
    );

    const retryButton = queryByText('Retry');
    if (retryButton) {
      mockedAxios.get.mockResolvedValueOnce({ data: '<html></html>' });
      fireEvent.press(retryButton);

      await waitFor(() => {
        expect(mockedAxios.get).toHaveBeenCalledTimes(2);
      });
    }
  });

  it('shows empty state for recently read section', async () => {
    (offlineCacheService.getCachedHomeData as jest.Mock).mockResolvedValue({
      mostViewed: [{ id: '1', title: 'Test', imageUrl: 'test.jpg' }],
      newReleases: [],
      featuredManga: { id: '1', title: 'Test', imageUrl: 'test.jpg' },
    });
    (getRecentlyReadManga as jest.Mock).mockResolvedValue([]);

    const { queryByText } = renderScreen();

    await waitFor(
      () => {
        expect(
          queryByText("Manga you're reading will appear here")
        ).toBeTruthy();
      },
      { timeout: 3000 }
    );

    await waitFor(() => {
      expect(queryByText('Browse Manga')).toBeTruthy();
    });
  });

  it('navigates to search when Browse Manga is pressed', async () => {
    (offlineCacheService.getCachedHomeData as jest.Mock).mockResolvedValue({
      mostViewed: [{ id: '1', title: 'Test', imageUrl: 'test.jpg' }],
      newReleases: [],
      featuredManga: { id: '1', title: 'Test', imageUrl: 'test.jpg' },
    });
    (getRecentlyReadManga as jest.Mock).mockResolvedValue([]);

    const { queryByText } = renderScreen();

    await waitFor(
      () => {
        expect(queryByText('Browse Manga')).toBeTruthy();
      },
      { timeout: 3000 }
    );

    const browseButton = queryByText('Browse Manga');
    if (browseButton) {
      fireEvent.press(browseButton);
      expect(mockRouterNavigate).toHaveBeenCalledWith('/mangasearch');
    }
  });

  it('renders browse genres card', async () => {
    (offlineCacheService.getCachedHomeData as jest.Mock).mockResolvedValue({
      mostViewed: [{ id: '1', title: 'Test', imageUrl: 'test.jpg' }],
      newReleases: [],
      featuredManga: { id: '1', title: 'Test', imageUrl: 'test.jpg' },
    });

    const { getByText, queryByText } = renderScreen();

    await waitFor(() => {
      expect(queryByText('Explore by Genre')).toBeTruthy();
    });

    expect(
      getByText('Discover manga by your favorite categories')
    ).toBeTruthy();
  });

  it('navigates to genres when browse genres card is pressed', async () => {
    (offlineCacheService.getCachedHomeData as jest.Mock).mockResolvedValue({
      mostViewed: [{ id: '1', title: 'Test', imageUrl: 'test.jpg' }],
      newReleases: [],
      featuredManga: { id: '1', title: 'Test', imageUrl: 'test.jpg' },
    });

    const { getByText, queryByText } = renderScreen();

    await waitFor(() => {
      expect(queryByText('Explore by Genre')).toBeTruthy();
    });

    fireEvent.press(getByText('Explore by Genre'));

    expect(mockRouterNavigate).toHaveBeenCalledWith('/genres');
  });

  it('loads and displays cached data on mount', async () => {
    const cachedData = {
      mostViewed: [
        { id: '1', title: 'Cached Manga', imageUrl: 'cached.jpg', rank: 1 },
      ],
      newReleases: [{ id: '2', title: 'Cached New', imageUrl: 'new.jpg' }],
      featuredManga: { id: '1', title: 'Cached Manga', imageUrl: 'cached.jpg' },
      cachedAt: Date.now(),
    };

    mockGetCachedHomeData.mockReturnValue(cachedData);

    renderScreen();

    await waitFor(() => {
      expect(mockGetCachedHomeData).toHaveBeenCalled();
    });
  });

  it('renders recently read manga when available', async () => {
    (offlineCacheService.getCachedHomeData as jest.Mock).mockResolvedValue({
      mostViewed: [{ id: '1', title: 'Test', imageUrl: 'test.jpg' }],
      newReleases: [],
      featuredManga: { id: '1', title: 'Test', imageUrl: 'test.jpg' },
    });

    (getRecentlyReadManga as jest.Mock).mockResolvedValue([
      {
        id: 'recent-1',
        title: 'Recent Manga',
        bannerImage: 'recent.jpg',
        lastReadChapter: 5,
      },
    ]);

    const { queryByText } = renderScreen();

    await waitFor(() => {
      expect(queryByText('Continue Reading')).toBeTruthy();
    });
  });

  it('shows offline error message when offline and no cache', async () => {
    mockIsOffline = true;
    (offlineCacheService.getCachedHomeData as jest.Mock).mockResolvedValue(
      null
    );

    const { queryByText } = renderScreen();

    await waitFor(() => {
      expect(queryByText("You're Offline")).toBeTruthy();
    });
  });

  it('handles getMangaData error gracefully', async () => {
    (getRecentlyReadManga as jest.Mock).mockRejectedValue(
      new Error('Fetch error')
    );

    const { queryByText } = renderScreen();

    // Should not crash - wait a bit for async operations
    await waitFor(
      () => {
        expect(queryByText('Loading...')).toBeNull();
      },
      { timeout: 2000 }
    );
  });

  it('renders section titles with icons', async () => {
    (offlineCacheService.getCachedHomeData as jest.Mock).mockResolvedValue({
      mostViewed: [{ id: '1', title: 'Test', imageUrl: 'test.jpg' }],
      newReleases: [],
      featuredManga: { id: '1', title: 'Test', imageUrl: 'test.jpg' },
    });

    const { queryByText } = renderScreen();

    await waitFor(() => {
      expect(queryByText('Continue Reading')).toBeTruthy();
      expect(queryByText('Trending Now')).toBeTruthy();
      expect(queryByText('Browse Genres')).toBeTruthy();
      expect(queryByText('New Releases')).toBeTruthy();
    });
  });

  it('caches fresh data after successful fetch', async () => {
    (parseMostViewedManga as jest.Mock).mockReturnValue([
      { id: '1', title: 'Fresh', imageUrl: 'fresh.jpg' },
    ]);
    (parseNewReleases as jest.Mock).mockReturnValue([
      { id: '2', title: 'Fresh New', imageUrl: 'new.jpg' },
    ]);

    mockedAxios.get.mockResolvedValue({ data: '<html>valid</html>' });

    renderScreen();

    await waitFor(() => {
      expect(mockCacheHomeData).toHaveBeenCalled();
    });
  });
});
