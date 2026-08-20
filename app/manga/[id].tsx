import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useLayoutEffect,
  useMemo,
} from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  useColorScheme,
} from 'react-native';
import { BlurView } from 'expo-blur';
import { Image } from 'expo-image';
import Svg, { Circle } from 'react-native-svg';
import { buildMangaImageSource } from '@/utils/mangaImageHeaders';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  useAnimatedProps,
  withTiming,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { useFocusEffect, useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { Colors, type ColorScheme } from '@/constants/Colors';
import ExpandableText from '@/components/ExpandableText';
import AlertComponent from '@/components/Alert';
import SwipeableChapterItem, {
  CHAPTER_ROW_HEIGHT,
} from '@/components/SwipeChapterItem';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import BottomPopup from '@/components/BottomPopup';

import { FlashList } from '@shopify/flash-list';
import type { FlashListRef } from '@shopify/flash-list';
import { fetchMangaDetails } from '@/services/mangaFireService';
import { fetchMappedTitleChaptersPage } from '@/services/mangaFireApi';
import {
  appendUniqueChapters,
  chapterListReachesSeriesStart,
  getReportedChapterCount,
  isChapterListCacheComplete,
  loadRemainingChapterPages,
  pickOldestChapter,
  resolveCachedChapterPagination,
  resolveFinishedChapterPagination,
  resolveOldestChapter,
} from '@/utils/chapterListPagination';
import { filterOutExtraChapters } from '@/utils/chapterListDedupe';
import { mergeMangaDetailsRefresh } from '@/utils/mangaDetailsMerge';
import {
  attemptLegacyMangaMigration,
  MIGRATION_MESSAGES,
  type MigrationProgress,
} from '@/services/mangaIdMigrationService';
import {
  fetchBookmarkStatus,
  saveBookmark,
  removeBookmark,
  getBookmarkPopupConfig,
  getChapterLongPressAlertConfig,
  syncMangaDataHeader,
  updateMangaData,
} from '@/services/bookmarkService';
import BackButton from '@/components/BackButton';
import { GenreTag } from '@/components/GanreTag';
import {
  getLastReadChapter,
  getReadChapters,
  markChapterAsUnread,
} from '@/services/readChapterService';
import { chapterStorageService } from '@/services/chapterStorageService';
import LastReadChapterBar from '@/components/LastReadChapterBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHapticFeedback } from '@/utils/haptics';
import { useToast } from '@/hooks/useToast';
import getStyles from './[id].styles';
import { logger } from '@/utils/logger';
import { useMarkInteractive } from '@/hooks/useMarkInteractive';
import { useMangaImageCache } from '@/services/CacheImages';
import { useOffline } from '@/hooks/useOffline';
import { offlineCacheService } from '@/services/offlineCacheService';
import { MANGA_HEADER_PERSIST_DEBOUNCE_MS } from '@/constants/mangaCache';
import type {
  AlertConfig,
  Option,
  MangaDetails,
  BookmarkStatus,
  Chapter,
} from '@/types';
import ChapterListSkeleton, {
  ChapterItemPlaceholder,
} from '@/components/ChapterListSkeleton';
import MangaDetailHeaderSkeleton, {
  MangaDetailMetaSkeleton,
} from '@/components/MangaDetailHeaderSkeleton';
import BatchDownloadBar from '@/components/BatchDownloadBar';
import { downloadManagerService } from '@/services/downloadManager';
import { downloadStatusService } from '@/services/downloadStatusService';
import { DownloadStatus } from '@/types/download';
import { useParallaxScroll } from '@/components/ParallaxLayout';
import {
  hasTrustedMangaRoutePreview,
  hydrateMangaDisplayFromLocal,
  hydrateMangaFromLocal,
  mangaRoutePreviewDetails,
} from '@/utils/mangaOptimisticLoad';
import { hasLoadedMangaHeader } from '@/utils/mangaHeader';
import { scheduleIdle } from '@/utils/scheduleIdle';
import {
  MANGA_DETAIL_LOAD_PHASES,
  consolidateBookmarkProgress,
  planMangaDetailLoad,
  shouldRunMigrationBeforeDisplay,
  shouldSkipBackgroundNetworkRefresh,
  measurePhase,
  type PhaseTiming,
} from '@/services/mangaDetailLoadService';
import {
  isRateLimitError,
  RATE_LIMIT_NO_CACHE_MESSAGE,
  RATE_LIMIT_USING_CACHE_MESSAGE,
} from '@/utils/httpErrors';
import { isDebugEnabled } from '@/constants/env';
import {
  getMangaOpenStartedAt,
  markMangaOpen,
  startMangaOpen,
} from '@/services/mangaOpenTrace';
import { loadMangaOpenHeader } from '@/utils/mangaOpenNavigation';

const AnimatedFlashList = Reanimated.createAnimatedComponent(FlashList) as any;
const AnimatedCircle = Reanimated.createAnimatedComponent(Circle);
const PROGRESS_RING_RADIUS = 20;
const PROGRESS_RING_CIRCUMFERENCE = 2 * Math.PI * PROGRESS_RING_RADIUS;

type BookmarkPopupConfig = {
  title: string;
  options: Option[];
};

// Component for manga banner image with caching validation
const MangaBannerImage: React.FC<{
  mangaId: string;
  bannerUrl: string;
  style: any;
  isOffline: boolean;
}> = ({ mangaId, bannerUrl, style, isOffline }) => {
  const cachedBannerPath = useMangaImageCache(mangaId, bannerUrl, {
    enabled: !isOffline,
  });

  const hasLocalAsset = React.useMemo(() => {
    if (typeof cachedBannerPath !== 'string') {
      return false;
    }
    return (
      cachedBannerPath.startsWith('file://') ||
      cachedBannerPath.startsWith('content://')
    );
  }, [cachedBannerPath]);

  const displayUri = cachedBannerPath || bannerUrl;

  if (!displayUri || (isOffline && !hasLocalAsset)) {
    return <View style={style} />;
  }

  return (
    <Image
      key={`${mangaId}-${bannerUrl}`}
      source={buildMangaImageSource(displayUri) ?? { uri: displayUri }}
      style={style}
      contentFit="cover"
      contentPosition="top"
      transition={500}
      cachePolicy="memory-disk"
    />
  );
};

export default function MangaDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Bookmark/chapters handling
  const { id, title, imageUrl, previewId } = useLocalSearchParams();
  const routePreview = useMemo(() => {
    if (
      typeof id !== 'string' ||
      !hasTrustedMangaRoutePreview(id, previewId, title, imageUrl)
    ) {
      return null;
    }
    return mangaRoutePreviewDetails(id, title, imageUrl);
  }, [id, previewId, title, imageUrl]);
  const [fetchedDetails, setFetchedDetails] = useState<MangaDetails | null>(
    routePreview
  );
  const hasInstantContentRef = useRef(routePreview != null);
  const loadGenerationRef = useRef(0);
  const hydratedStateRef = useRef({
    hasCachedChapters: false,
    hasMangaData: false,
  });
  const [settledChapterMangaId, setSettledChapterMangaId] = useState<
    string | null
  >(null);
  const hasSettledInitialChapters =
    typeof id === 'string' && settledChapterMangaId === id;
  const flushOpenedHeaderPersistRef = useRef<() => void>(() => {});
  const lastPersistedTotalRef = useRef<{ id: string; total: number } | null>(
    null
  );
  const isScreenMountedRef = useRef(true);

  useEffect(() => {
    isScreenMountedRef.current = true;
    return () => {
      isScreenMountedRef.current = false;
    };
  }, []);

  const applyMangaDetailsForId = useCallback(
    (targetId: string, details: Omit<MangaDetails, 'id'> & { id?: string }) => {
      if (typeof id !== 'string' || id !== targetId) {
        return;
      }

      setFetchedDetails((previous) =>
        mergeMangaDetailsRefresh(
          previous && previous.id === targetId ? previous : null,
          details,
          targetId
        )
      );

      // Keep stored total in sync so progress stays correct with partial chapter lists.
      const reportedTotal = details.totalChapters;
      if (typeof reportedTotal === 'number' && reportedTotal > 0) {
        const lastPersisted = lastPersistedTotalRef.current;
        if (
          lastPersisted?.id === targetId &&
          lastPersisted.total === reportedTotal
        ) {
          return;
        }
        lastPersistedTotalRef.current = { id: targetId, total: reportedTotal };
        void updateMangaData(targetId, (existing) => {
          if (!existing || existing.totalChapters === reportedTotal) {
            return existing;
          }
          return {
            ...existing,
            totalChapters: reportedTotal,
          };
        }).catch((error) => {
          logger().warn('Storage', 'Failed to persist total chapter count', {
            mangaId: targetId,
            error,
          });
        });
      }
    },
    [id]
  );

  // Show the card's title/cover on the first paint — don't wait for layout effects or storage. Stale fetchedDetails from a previous manga are ignored.
  const mangaDetails = useMemo(() => {
    if (typeof id !== 'string') {
      return null;
    }

    if (fetchedDetails?.id === id) {
      return fetchedDetails;
    }

    return routePreview;
  }, [id, fetchedDetails, routePreview]);

  if (routePreview) {
    hasInstantContentRef.current = true;
  }

  const [isLoading, setIsLoading] = useState(routePreview == null);

  useLayoutEffect(() => {
    if (typeof id !== 'string') {
      return;
    }

    if (getMangaOpenStartedAt(id) == null) {
      startMangaOpen(id, 'direct');
    }
    markMangaOpen('mount', id);
    if (routePreview?.title.trim() || fetchedDetails?.id === id) {
      markMangaOpen('visible', id);
    }

    flushOpenedHeaderPersistRef.current();
    lastPersistedTotalRef.current = null;
    loadGenerationRef.current += 1;
    setLastReadChapter(null);
    setBookmarkStatus(null);
    setError(null);
    setSettledChapterMangaId(null);
    isLoadingMoreChaptersRef.current = false;
    backgroundChapterLoadIdRef.current = null;
    chapterPaginationRef.current = {
      chapters: [],
      nextPage: 2,
      hasMore: false,
      lastPage: undefined,
    };
    hydratedStateRef.current = {
      hasCachedChapters: false,
      hasMangaData: false,
    };

    if (routePreview) {
      hasInstantContentRef.current = true;
      setIsLoading(false);
      return;
    }

    hasInstantContentRef.current = false;
    setIsLoading(true);
    // Only reset when the manga id changes — title/imageUrl param churn was restarting loads and re-crawling every /chapters page. eslint-disable-next-line react-hooks/exhaustive-deps -- routePreview/fetchedDetails would retrigger on param churn
  }, [id, previewId]);

  useEffect(() => {
    if (typeof id !== 'string') {
      return;
    }

    setReadChapters([]);
    setBookmarkStatus(null);
    setLastReadChapter(null);
    setError(null);
    setDownloadedChapters([]);
    setDownloadingChapters([]);
    setHasMoreChapters(false);
    setNextChapterPage(2);
    setLastChapterPage(undefined);
    setIsLoadingMoreChapters(false);
    setHideExtraChapters(false);
    hideExtraChaptersRef.current = false;
    setIsRefreshingChapters(false);
    setChapterRefreshProgress(null);
    setIsJumpingToBottom(false);
    setSettledChapterMangaId(null);

    if (routePreview) {
      setFetchedDetails((previous) =>
        previous?.id === id ? previous : routePreview
      );
      return;
    }

    setFetchedDetails(null);
  }, [id, previewId, routePreview]);

  const [error, setError] = useState<string | null>(null);
  const headerReady = hasLoadedMangaHeader(mangaDetails);
  const mangaOpenReady =
    Boolean(error) || (headerReady && hasSettledInitialChapters);
  const isPageInteractive =
    Boolean(error) || Boolean(mangaDetails?.title.trim());
  const mangaOpenStartedAt =
    typeof id === 'string' ? getMangaOpenStartedAt(id) : null;
  useMarkInteractive(isPageInteractive, {
    ...(mangaOpenStartedAt != null ? { startedAt: mangaOpenStartedAt } : {}),
  });

  useEffect(() => {
    if (typeof id !== 'string' || mangaDetails?.id !== id) {
      return;
    }
    if (mangaDetails.title.trim()) {
      markMangaOpen('visible', id);
    }
    if (headerReady) {
      markMangaOpen('header', id);
    }
    if (hasSettledInitialChapters || (mangaDetails.chapters?.length ?? 0) > 0) {
      markMangaOpen('chapters', id);
    }
    if (mangaOpenReady) {
      markMangaOpen('complete', id);
    }
  }, [
    id,
    mangaDetails,
    headerReady,
    hasSettledInitialChapters,
    mangaOpenReady,
  ]);
  const [readChapters, setReadChapters] = useState<string[]>([]);
  const [bookmarkStatus, setBookmarkStatus] = useState<string | null>(null);
  const bookmarkStatusRef = useRef<string | null>(null);
  useEffect(() => {
    bookmarkStatusRef.current = bookmarkStatus;
  }, [bookmarkStatus]);
  const [currentlyOpenSwipeable, setCurrentlyOpenSwipeable] =
    useState<SwipeableMethods | null>(null);
  const currentlyOpenSwipeableRef = useRef<SwipeableMethods | null>(null);
  const setCurrentlyOpenSwipeableStable = useCallback(
    (swipeable: SwipeableMethods | null) => {
      currentlyOpenSwipeableRef.current = swipeable;
      setCurrentlyOpenSwipeable(swipeable);
    },
    []
  );
  const getCurrentlyOpenSwipeable = useCallback(
    () => currentlyOpenSwipeableRef.current,
    []
  );
  const [downloadedChapters, setDownloadedChapters] = useState<string[]>([]);
  const [downloadingChapters, setDownloadingChapters] = useState<string[]>([]);
  const downloadedChaptersRef = useRef<string[]>([]);
  const [hasMoreChapters, setHasMoreChapters] = useState(false);
  const [nextChapterPage, setNextChapterPage] = useState(2);
  const [lastChapterPage, setLastChapterPage] = useState<number | undefined>(
    undefined
  );
  const [isLoadingMoreChapters, setIsLoadingMoreChapters] = useState(false);
  const [isJumpingToBottom, setIsJumpingToBottom] = useState(false);
  const isLoadingMoreChaptersRef = useRef(false);
  const backgroundChapterLoadIdRef = useRef<string | null>(null);
  const chapterPaginationRef = useRef({
    chapters: [] as Chapter[],
    nextPage: 2,
    hasMore: false,
    lastPage: undefined as number | undefined,
  });

  const applyCachedChapterPagination = useCallback(
    (details: {
      chapters?: Chapter[];
      totalChapters?: number;
      chapterPagination?: MangaDetails['chapterPagination'];
    }) => {
      const chapters = details.chapters;
      if (!chapters?.length) {
        return;
      }

      const cachedPagination = resolveCachedChapterPagination({
        chapters,
        ...(typeof details.totalChapters === 'number'
          ? { totalChapters: details.totalChapters }
          : {}),
        ...(details.chapterPagination
          ? { chapterPagination: details.chapterPagination }
          : {}),
      });
      setHasMoreChapters(cachedPagination.hasMore);
      setNextChapterPage(cachedPagination.nextPage);
      if (typeof cachedPagination.lastPage === 'number') {
        setLastChapterPage(cachedPagination.lastPage);
      }
      chapterPaginationRef.current = {
        ...chapterPaginationRef.current,
        chapters,
        nextPage: cachedPagination.nextPage,
        hasMore: cachedPagination.hasMore,
        ...(typeof cachedPagination.lastPage === 'number'
          ? { lastPage: cachedPagination.lastPage }
          : {}),
      };
    },
    []
  );

  // State for the general alert (e.g., marking chapters as unread)
  const [isAlertVisible, setIsAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);

  const [migrationProgress, setMigrationProgress] =
    useState<MigrationProgress | null>(null);
  const [manualMigration, setManualMigration] = useState<{
    legacyId: string;
    hintTitle?: string;
  } | null>(null);
  const [isManualMigrationAlertVisible, setIsManualMigrationAlertVisible] =
    useState(false);

  // State for the bookmark bottom popup
  const [isBookmarkPopupVisible, setIsBookmarkPopupVisible] = useState(false);
  const [bookmarkPopupConfig, setBookmarkPopupConfig] =
    useState<BookmarkPopupConfig>({
      title: '',
      options: [],
    });
  const [hideExtraChapters, setHideExtraChapters] = useState(false);
  const hideExtraChaptersRef = useRef(false);
  const [isRefreshingChapters, setIsRefreshingChapters] = useState(false);
  const [chapterRefreshProgress, setChapterRefreshProgress] = useState<{
    page: number;
    lastPage?: number;
    chapterCount: number;
  } | null>(null);

  useEffect(() => {
    hideExtraChaptersRef.current = hideExtraChapters;
  }, [hideExtraChapters]);

  const visibleChapters = useMemo(
    () =>
      filterOutExtraChapters(mangaDetails?.chapters ?? [], hideExtraChapters),
    [mangaDetails?.chapters, hideExtraChapters]
  );

  // Handle sending user back up/down
  const flashListRef = useRef<FlashListRef<Chapter> | null>(null);
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down'>('down');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(false);
  const [hasJumpedToLatestRead, setHasJumpedToLatestRead] = useState(false);
  const scrollProgressSV = useSharedValue(0);
  const scrollDirectionSV = useSharedValue(1);
  const lastScrollYSV = useSharedValue(0);
  const showScrollButtonSV = useSharedValue(0);
  const isNearBottomSV = useSharedValue(0);

  // Animated value for the scroll button opacity
  const scrollButtonOpacity = useSharedValue(0);

  // Theming Settings
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme =
    theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const styles = useMemo(() => getStyles(colors), [colors]);

  // Back button

  // Haptic feedback
  const haptics = useHapticFeedback();

  // Toast notifications — keep a stable ref so fetch effects don't restart every render
  const { showToast } = useToast();
  const showToastRef = useRef(showToast);
  useEffect(() => {
    showToastRef.current = showToast;
  }, [showToast]);

  // Last chapter
  const [lastReadChapter, setLastReadChapter] = useState<string | null>(null);

  // Offline state
  const { isOffline } = useOffline();
  const isOfflineRef = useRef(isOffline);
  isOfflineRef.current = isOffline;

  const refreshDownloadedChapters = useCallback(async () => {
    if (typeof id !== 'string') {
      return;
    }

    try {
      // Use the new download status service for consistent status
      const chapters = await downloadStatusService.getDownloadedChapters(
        id as string
      );
      setDownloadedChapters(chapters);
      downloadedChaptersRef.current = chapters;
      setDownloadingChapters((prev) =>
        prev.filter((chapter) => !chapters.includes(chapter))
      );
    } catch (refreshError) {
      logger().error('Storage', 'Error loading downloaded chapters', {
        error: refreshError,
      });
    }
  }, [id]);

  const refreshDownloadingChapters = useCallback(async () => {
    if (typeof id !== 'string') {
      return;
    }

    try {
      // Use the new download status service to get active download status
      const isDownloading = await downloadStatusService.isDownloadingChapters(
        id as string
      );

      if (!isDownloading) {
        setDownloadingChapters([]);
        return;
      }

      // Get specific downloading chapters
      const activeDownloads = await downloadManagerService.getActiveDownloads();
      const activeChapterNumbers = activeDownloads
        .filter(
          (download) =>
            download.mangaId === id &&
            [
              DownloadStatus.DOWNLOADING,
              DownloadStatus.QUEUED,
              DownloadStatus.PAUSED,
            ].includes(download.status)
        )
        .map((download) => download.chapterNumber);

      setDownloadingChapters((previous) => {
        const downloadedSet = new Set(downloadedChaptersRef.current);
        const carryOver = previous.filter(
          (chapter) => !downloadedSet.has(chapter)
        );
        const combined = new Set([...carryOver, ...activeChapterNumbers]);
        return Array.from(combined);
      });
    } catch (refreshError) {
      logger().error('Storage', 'Error loading active downloads', {
        error: refreshError,
      });
    }
  }, [id]);

  // Stable refs for the detail-load effect — avoid restarting 40+ chapter page fetches when callback identities change mid-request.
  const applyMangaDetailsForIdRef = useRef(applyMangaDetailsForId);
  const applyCachedChapterPaginationRef = useRef(applyCachedChapterPagination);
  const refreshDownloadedChaptersRef = useRef(refreshDownloadedChapters);
  const refreshDownloadingChaptersRef = useRef(refreshDownloadingChapters);
  const routerRef = useRef(router);
  const routeTitleRef = useRef(title);
  const routeImageUrlRef = useRef(imageUrl);

  applyMangaDetailsForIdRef.current = applyMangaDetailsForId;
  applyCachedChapterPaginationRef.current = applyCachedChapterPagination;
  refreshDownloadedChaptersRef.current = refreshDownloadedChapters;
  refreshDownloadingChaptersRef.current = refreshDownloadingChapters;
  routerRef.current = router;
  routeTitleRef.current = title;
  routeImageUrlRef.current = imageUrl;

  const persistTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingHeaderPersistRef = useRef<{
    mangaId: string;
    details: MangaDetails;
  } | null>(null);

  const flushOpenedHeaderPersist = useCallback(() => {
    if (persistTimerRef.current) {
      clearTimeout(persistTimerRef.current);
      persistTimerRef.current = null;
    }

    const pending = pendingHeaderPersistRef.current;
    pendingHeaderPersistRef.current = null;
    if (!pending || !hasLoadedMangaHeader(pending.details)) {
      return;
    }

    const { mangaId, details } = pending;
    const isBookmarked =
      bookmarkStatusRef.current == null
        ? undefined
        : Boolean(bookmarkStatusRef.current);
    const hasChapters = (details.chapters?.length ?? 0) > 0;
    const pagination = chapterPaginationRef.current;
    const detailsWithPagination = {
      ...details,
      ...(hasChapters
        ? {
            chapterPagination: {
              hasMore: pagination.hasMore,
              nextPage: pagination.nextPage,
              ...(typeof pagination.lastPage === 'number'
                ? { lastPage: pagination.lastPage }
                : {}),
            },
          }
        : {}),
    };

    // Persist chapter lists whenever we have them — long series like One Piece should not re-crawl ~40 API pages on every open.
    if (hasChapters) {
      void offlineCacheService.cacheMangaDetails(
        mangaId,
        detailsWithPagination,
        Boolean(isBookmarked)
      );
    } else {
      void offlineCacheService.cacheMangaHeader(mangaId, details, {
        ...(typeof isBookmarked === 'boolean' ? { isBookmarked } : {}),
        opened: true,
      });
    }

    if (isBookmarked || hydratedStateRef.current.hasMangaData) {
      void syncMangaDataHeader(mangaId, details);
    }
  }, []);
  flushOpenedHeaderPersistRef.current = flushOpenedHeaderPersist;

  const persistOpenedHeader = useCallback(
    (mangaId: string, details: Omit<MangaDetails, 'id'> & { id?: string }) => {
      const withId: MangaDetails = { ...details, id: details.id ?? mangaId };
      if (!hasLoadedMangaHeader(withId)) {
        return;
      }

      pendingHeaderPersistRef.current = { mangaId, details: withId };
      if (persistTimerRef.current) {
        clearTimeout(persistTimerRef.current);
      }
      persistTimerRef.current = setTimeout(() => {
        persistTimerRef.current = null;
        flushOpenedHeaderPersist();
      }, MANGA_HEADER_PERSIST_DEBOUNCE_MS);
    },
    [flushOpenedHeaderPersist]
  );
  const persistOpenedHeaderRef = useRef(persistOpenedHeader);
  persistOpenedHeaderRef.current = persistOpenedHeader;

  useEffect(() => {
    return () => {
      flushOpenedHeaderPersistRef.current();
    };
  }, []);

  useEffect(() => {
    downloadedChaptersRef.current = downloadedChapters;
  }, [downloadedChapters]);

  // Hydrate instantly from bookmark data / offline cache before network fetch
  useEffect(() => {
    if (typeof id !== 'string') {
      return;
    }

    const loadGeneration = loadGenerationRef.current;
    let cancelled = false;

    const hydrateFromLocal = async () => {
      if (!hasInstantContentRef.current) {
        setIsLoading(true);
      }

      try {
        const hydration = await hydrateMangaDisplayFromLocal(id);
        if (
          cancelled ||
          loadGeneration !== loadGenerationRef.current ||
          typeof id !== 'string'
        ) {
          return;
        }

        hydratedStateRef.current = {
          hasCachedChapters: hydration.hasCachedChapters,
          hasMangaData: hydratedStateRef.current.hasMangaData,
        };
        markMangaOpen('hydrated', id);
        if (hydration.details) {
          applyMangaDetailsForIdRef.current(id, hydration.details);
          hasInstantContentRef.current = true;
          setIsLoading(false);
          persistOpenedHeaderRef.current(id, hydration.details);
        }
      } catch (hydrationError) {
        logger().warn('Storage', 'Failed to hydrate manga from local cache', {
          error: hydrationError,
          mangaId: id,
        });
      }
    };

    const hydrateHeaderFromNetwork = async () => {
      // Card/search routes already contain enough metadata for first paint. The main load enriches that preview after chapter page 1 succeeds.
      if (isOfflineRef.current || routePreview) {
        return;
      }

      try {
        const details = await loadMangaOpenHeader(id);
        if (
          !details ||
          cancelled ||
          loadGeneration !== loadGenerationRef.current
        ) {
          return;
        }

        applyMangaDetailsForIdRef.current(id, details);
        hasInstantContentRef.current = true;
        setIsLoading(false);
        persistOpenedHeaderRef.current(id, details);
      } catch {
        // The main detail load owns error and rate-limit handling. This path is only an opportunistic first-paint race.
      }
    };

    void hydrateFromLocal();
    void hydrateHeaderFromNetwork();

    return () => {
      cancelled = true;
    };
  }, [id, routePreview]);

  const handleManualMigrationSearch = useCallback(() => {
    if (!manualMigration) {
      return;
    }

    const searchTitle =
      manualMigration.hintTitle || manualMigration.legacyId.replace(/-/g, ' ');
    const query = encodeURIComponent(searchTitle);
    const replacementId = encodeURIComponent(manualMigration.legacyId);
    const replacementTitle = encodeURIComponent(searchTitle);

    setIsManualMigrationAlertVisible(false);
    router.push(
      `/mangasearch?query=${query}&replacementSourceId=${replacementId}&replacementSourceTitle=${replacementTitle}`
    );
  }, [manualMigration, router]);

  useEffect(() => {
    let isMounted = true;
    const log = logger();
    const phaseTimings: PhaseTiming[] = [];
    const loadGeneration = loadGenerationRef.current;

    const shouldCancelFetch = () =>
      !isMounted || loadGeneration !== loadGenerationRef.current;

    const fetchDetailsForScreen = (mangaId: string) => {
      const hasRouteFallback = Boolean(
        routeTitleRef.current || routeImageUrlRef.current
      );

      return fetchMangaDetails(mangaId, {
        ...(hasRouteFallback
          ? {
              fallbackDetails: mangaRoutePreviewDetails(
                mangaId,
                routeTitleRef.current,
                routeImageUrlRef.current
              ),
            }
          : {}),
        // First page only — never crawl all 40+ chapter pages on open.
        maxChapterPages: 1,
        shouldCancel: shouldCancelFetch,
        onPartial: (partial) => {
          if (shouldCancelFetch()) {
            return;
          }
          applyMangaDetailsForIdRef.current(mangaId, partial);
          setIsLoading(false);
          persistOpenedHeaderRef.current(mangaId, partial);
          if ((partial.chapters?.length ?? 0) > 0) {
            setSettledChapterMangaId(mangaId);
          }
        },
        onChapterPagination: (meta) => {
          if (shouldCancelFetch()) {
            return;
          }
          // A page-1 refresh must not reopen a full crawl when we already have a complete cached chapter list.
          if (
            !isChapterListCacheComplete({
              chapters: chapterPaginationRef.current.chapters,
              chapterPagination: {
                hasMore: chapterPaginationRef.current.hasMore,
                nextPage: chapterPaginationRef.current.nextPage,
                ...(typeof chapterPaginationRef.current.lastPage === 'number'
                  ? { lastPage: chapterPaginationRef.current.lastPage }
                  : {}),
              },
            })
          ) {
            setHasMoreChapters(meta.hasMore);
            setNextChapterPage(meta.page + 1);
            if (typeof meta.lastPage === 'number') {
              setLastChapterPage(meta.lastPage);
            }
            chapterPaginationRef.current = {
              ...chapterPaginationRef.current,
              nextPage: meta.page + 1,
              hasMore: meta.hasMore,
              lastPage:
                typeof meta.lastPage === 'number'
                  ? meta.lastPage
                  : chapterPaginationRef.current.lastPage,
            };
          }
          if (typeof meta.total === 'number' && meta.total > 0) {
            const reportedTotal = meta.total;
            setFetchedDetails((current) => {
              if (!current || current.id !== mangaId) {
                return current;
              }
              if (current.totalChapters === reportedTotal) {
                return current;
              }
              return {
                ...current,
                totalChapters: reportedTotal,
              };
            });
          }
        },
      });
    };

    const handleMigrationResult = (
      migrationResult: Awaited<ReturnType<typeof attemptLegacyMangaMigration>>
    ) => {
      if (!isMounted) {
        return;
      }

      if (migrationResult.outcome === 'migrated') {
        setMigrationProgress(null);
        routerRef.current.replace(`/manga/${migrationResult.newId}`);
        return;
      }

      if (migrationResult.outcome === 'manual') {
        setMigrationProgress(null);
        setManualMigration({
          legacyId: migrationResult.legacyId,
          ...(migrationResult.hintTitle
            ? { hintTitle: migrationResult.hintTitle }
            : {}),
        });
        setIsManualMigrationAlertVisible(true);
        setIsLoading(false);
        return;
      }

      setMigrationProgress(null);
    };

    const refreshDetailsInBackground = async (): Promise<void> => {
      if (!isMounted || isOfflineRef.current || typeof id !== 'string') {
        return;
      }

      const mangaId = id as string;

      try {
        const cachedBeforeRefresh =
          await offlineCacheService.getCachedMangaDetails(mangaId);
        if (shouldSkipBackgroundNetworkRefresh(cachedBeforeRefresh?.cachedAt)) {
          return;
        }

        const freshDetails = await fetchDetailsForScreen(mangaId);
        if (shouldCancelFetch() || typeof id !== 'string') {
          return;
        }

        applyMangaDetailsForIdRef.current(mangaId, freshDetails);
        persistOpenedHeaderRef.current(mangaId, freshDetails);
        setSettledChapterMangaId(mangaId);
      } catch (backgroundError) {
        if (isRateLimitError(backgroundError)) {
          log.warn(
            'Service',
            'Background refresh rate limited — using cached data',
            {
              mangaId,
            }
          );
          return;
        }

        log.warn('Service', 'Failed to refresh manga details in background', {
          error: backgroundError,
          mangaId,
        });
      }
    };

    const fetchData = async () => {
      if (typeof id !== 'string') {
        return;
      }

      const mangaId = id as string;
      let hadInstantContent = hasInstantContentRef.current;
      const isOfflineNow = isOfflineRef.current;

      try {
        const hydration = await hydrateMangaFromLocal(mangaId);
        if (shouldCancelFetch()) {
          return;
        }

        hydratedStateRef.current = {
          hasCachedChapters: hydration.hasCachedChapters,
          hasMangaData: !!hydration.mangaData,
        };
        markMangaOpen('hydrated', mangaId);
        if (hydration.hasCachedChapters) {
          setSettledChapterMangaId(mangaId);
        }

        if (hydration.details) {
          applyMangaDetailsForIdRef.current(mangaId, hydration.details);
          applyCachedChapterPaginationRef.current(hydration.details);
          hadInstantContent = true;
          hasInstantContentRef.current = true;
          setIsLoading(false);
          persistOpenedHeaderRef.current(mangaId, hydration.details);
        }

        if (hydration.mangaData) {
          const progress = consolidateBookmarkProgress(hydration.mangaData);
          setReadChapters(progress.readChapters);
          setBookmarkStatus(progress.bookmarkStatus);
          if (progress.lastReadChapter) {
            setLastReadChapter(progress.lastReadChapter);
          }
          const savedHideExtras = Boolean(
            hydration.mangaData.hideExtraChapters
          );
          setHideExtraChapters(savedHideExtras);
          hideExtraChaptersRef.current = savedHideExtras;
        }
      } catch (hydrationError) {
        log.warn('Storage', 'Failed to hydrate manga before network fetch', {
          error: hydrationError,
          mangaId,
        });
      }

      const loadPlan = planMangaDetailLoad({
        mangaId: id,
        hasInstantContent: hadInstantContent,
        hasCachedChapters: hydratedStateRef.current.hasCachedChapters,
        isOffline: isOfflineNow,
        hasRouteParams: Boolean(
          routeTitleRef.current || routeImageUrlRef.current
        ),
      });

      if (!hadInstantContent) {
        setIsLoading(true);
      }
      setError(null);
      setManualMigration(null);
      setIsManualMigrationAlertVisible(false);

      const applyCachedFallback = async (): Promise<boolean> => {
        const cachedDetails =
          await offlineCacheService.getCachedMangaDetails(mangaId);
        if (!cachedDetails || shouldCancelFetch()) {
          return false;
        }

        applyMangaDetailsForIdRef.current(mangaId, cachedDetails);
        applyCachedChapterPaginationRef.current(cachedDetails);
        persistOpenedHeaderRef.current(mangaId, cachedDetails);
        if ((cachedDetails.chapters?.length ?? 0) > 0) {
          setSettledChapterMangaId(mangaId);
        }
        setIsLoading(false);
        return true;
      };

      try {
        if (!isOfflineNow) {
          if (shouldRunMigrationBeforeDisplay(id, hadInstantContent)) {
            const migrationStartedAt = Date.now();
            const migrationResult = await attemptLegacyMangaMigration(
              id as string,
              (progress) => {
                if (isMounted) {
                  setMigrationProgress(progress);
                }
              }
            );
            phaseTimings.push({
              phase: MANGA_DETAIL_LOAD_PHASES.LEGACY_MIGRATION,
              durationMs: Date.now() - migrationStartedAt,
            });

            if (!isMounted) {
              return;
            }

            handleMigrationResult(migrationResult);
            if (
              migrationResult.outcome === 'migrated' ||
              migrationResult.outcome === 'manual'
            ) {
              return;
            }
          } else {
            attemptLegacyMangaMigration(id as string, (progress) => {
              if (isMounted) {
                setMigrationProgress(progress);
              }
            })
              .then(handleMigrationResult)
              .catch((migrationError) => {
                log.warn('Service', 'Deferred legacy migration failed', {
                  error: migrationError,
                  mangaId: id,
                });
                if (isMounted) {
                  setMigrationProgress(null);
                }
              });
          }
        }

        if (isOfflineNow) {
          await measurePhase(
            MANGA_DETAIL_LOAD_PHASES.CACHE_LOOKUP,
            async () => {
              const cachedDetails =
                await offlineCacheService.getCachedMangaDetails(id as string);
              if (!cachedDetails) {
                throw new Error(
                  'No cached manga details available for offline viewing'
                );
              }

              const downloadedChapterList =
                await chapterStorageService.getDownloadedChapters(id as string);
              const filteredChapters =
                cachedDetails.chapters?.filter((chapter) =>
                  downloadedChapterList.includes(chapter.number)
                ) || [];

              if (!shouldCancelFetch()) {
                applyMangaDetailsForIdRef.current(mangaId, {
                  ...cachedDetails,
                  chapters: filteredChapters,
                });
                setSettledChapterMangaId(mangaId);
              }
            },
            phaseTimings
          );
        } else if (loadPlan.shouldBlockOnNetwork) {
          await measurePhase(
            MANGA_DETAIL_LOAD_PHASES.NETWORK_DETAILS,
            async () => {
              const details = await fetchDetailsForScreen(mangaId);
              if (!shouldCancelFetch()) {
                applyMangaDetailsForIdRef.current(mangaId, details);
                persistOpenedHeaderRef.current(mangaId, details);
                setSettledChapterMangaId(mangaId);
              }
            },
            phaseTimings
          );
        } else if (hadInstantContent) {
          setIsLoading(false);
          void measurePhase(
            MANGA_DETAIL_LOAD_PHASES.NETWORK_DETAILS,
            async () => {
              await refreshDetailsInBackground();
            },
            phaseTimings
          );
        } else {
          const cachedDetails = await offlineCacheService.getCachedMangaDetails(
            id as string
          );
          if (cachedDetails && !shouldCancelFetch()) {
            applyMangaDetailsForIdRef.current(mangaId, cachedDetails);
            applyCachedChapterPaginationRef.current(cachedDetails);
            persistOpenedHeaderRef.current(mangaId, cachedDetails);
            setIsLoading(false);
            if ((cachedDetails.chapters?.length ?? 0) > 0) {
              setSettledChapterMangaId(mangaId);
            }
            void refreshDetailsInBackground();
          } else {
            await measurePhase(
              MANGA_DETAIL_LOAD_PHASES.NETWORK_DETAILS,
              async () => {
                const details = await fetchDetailsForScreen(mangaId);
                if (!shouldCancelFetch()) {
                  applyMangaDetailsForIdRef.current(mangaId, details);
                  persistOpenedHeaderRef.current(mangaId, details);
                  setSettledChapterMangaId(mangaId);
                }
              },
              phaseTimings
            );
          }
        }

        if (!hydratedStateRef.current.hasMangaData) {
          await measurePhase(
            MANGA_DETAIL_LOAD_PHASES.READ_PROGRESS,
            async () => {
              const [chapters, status, lastChapter] = await Promise.all([
                getReadChapters(id as string),
                fetchBookmarkStatus(id as string),
                getLastReadChapter(id as string),
              ]);

              if (!isMounted) {
                return;
              }

              setReadChapters(chapters);
              setBookmarkStatus(status);
              setLastReadChapter(lastChapter);
            },
            phaseTimings
          );
        }

        if (isMounted) {
          refreshDownloadedChaptersRef.current().catch(() => {});
          refreshDownloadingChaptersRef.current().catch(() => {});
        }

        if (isDebugEnabled()) {
          log.info('UI', 'Manga detail load phase timings', {
            mangaId: id,
            phases: phaseTimings,
            plan: loadPlan.phases.filter((phase) => phase.blocking),
          });
        }
      } catch (error) {
        if (isRateLimitError(error)) {
          const recovered = hadInstantContent || (await applyCachedFallback());
          if (recovered) {
            log.warn('Service', 'Rate limited — showing cached manga details', {
              mangaId,
            });
            showToastRef.current({
              message: RATE_LIMIT_USING_CACHE_MESSAGE,
              type: 'warning',
            });
            return;
          }

          log.warn('Service', 'Rate limited with no local cache available', {
            error,
            mangaId,
          });
          if (isMounted) {
            setError(RATE_LIMIT_NO_CACHE_MESSAGE);
          }
          return;
        }

        log.error('Service', 'Failed to load manga details', {
          mangaId: id,
          error,
        });
        if (isMounted) {
          setError('Failed to load manga details. Please try again.');
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    fetchData();

    return () => {
      isMounted = false;
    };
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      let isCancelled = false;

      const syncDownloadState = () => {
        if (isCancelled) {
          return;
        }
        refreshDownloadedChapters().catch(() => {});
        refreshDownloadingChapters().catch(() => {});
      };

      const syncReadProgress = async () => {
        if (typeof id !== 'string' || isCancelled) {
          return;
        }
        try {
          const [chapters, lastChapter] = await Promise.all([
            getReadChapters(id),
            getLastReadChapter(id),
          ]);
          if (isCancelled) {
            return;
          }
          setReadChapters(chapters);
          setLastReadChapter(lastChapter);
        } catch (error) {
          logger().warn('Storage', 'Failed to refresh read progress on focus', {
            mangaId: id,
            error,
          });
        }
      };

      // Immediate sync on focus, then periodic sync while focused.
      syncDownloadState();
      void syncReadProgress();
      const intervalId = setInterval(syncDownloadState, 2000);

      return () => {
        isCancelled = true;
        clearInterval(intervalId);
      };
    }, [id, refreshDownloadedChapters, refreshDownloadingChapters])
  );

  const handleSaveBookmark = useCallback(
    async (status: BookmarkStatus) => {
      if (!mangaDetails) return;
      const previousStatus = bookmarkStatus;
      try {
        await saveBookmark(
          id as string,
          status,
          mangaDetails,
          readChapters,
          setBookmarkStatus,
          setIsBookmarkPopupVisible,
          setReadChapters
        );

        // Show success toast
        const statusIcons: Record<
          BookmarkStatus,
          | 'book-outline'
          | 'book'
          | 'pause-circle-outline'
          | 'checkmark-circle-outline'
        > = {
          'To Read': 'book-outline',
          Reading: 'book',
          'On Hold': 'pause-circle-outline',
          Read: 'checkmark-circle-outline',
        };
        const shortTitle =
          mangaDetails.title.length > 20
            ? mangaDetails.title.substring(0, 20) + '…'
            : mangaDetails.title;
        showToast({
          message: previousStatus
            ? `${shortTitle} → ${status}`
            : `${shortTitle} added to ${status}`,
          icon: statusIcons[status],
          type: 'success',
        });
      } catch (error) {
        console.error('Error saving bookmark:', error);
        showToast({
          message: 'Failed to update bookmark',
          type: 'error',
        });
      }
    },
    [id, mangaDetails, readChapters, bookmarkStatus, showToast]
  );

  const handleRemoveBookmark = useCallback(async () => {
    try {
      await removeBookmark(
        id as string,
        setBookmarkStatus,
        setIsBookmarkPopupVisible
      );

      // Show success toast
      const shortTitle = mangaDetails?.title
        ? mangaDetails.title.length > 20
          ? mangaDetails.title.substring(0, 20) + '…'
          : mangaDetails.title
        : 'Manga';
      showToast({
        message: `${shortTitle} removed from bookmarks`,
        icon: 'trash-outline',
        type: 'info',
      });
    } catch (error) {
      console.error('Error removing bookmark:', error);
      showToast({
        message: 'Failed to remove bookmark',
        type: 'error',
      });
    }
  }, [id, showToast, mangaDetails?.title]);

  const handleBookmark = useCallback(() => {
    if (!mangaDetails) return;

    haptics.onBookmark();

    const config = getBookmarkPopupConfig(
      bookmarkStatus,
      mangaDetails.title,
      handleSaveBookmark,
      handleRemoveBookmark
    );

    setBookmarkPopupConfig(config as BookmarkPopupConfig);
    setIsBookmarkPopupVisible(true);
  }, [
    mangaDetails,
    haptics,
    bookmarkStatus,
    handleSaveBookmark,
    handleRemoveBookmark,
  ]);

  const handleChapterLongPress = useCallback(
    (chapterNumber: string) => {
      haptics.onLongPress();

      const isRead = readChapters.includes(chapterNumber);
      const config = getChapterLongPressAlertConfig(
        isRead,
        chapterNumber,
        mangaDetails,
        id as string,
        readChapters,
        setReadChapters,
        // Success callback
        (markedCount: number, upToChapter: string) => {
          const shortTitle = mangaDetails?.title
            ? mangaDetails.title.length > 15
              ? mangaDetails.title.substring(0, 15) + '…'
              : mangaDetails.title
            : '';
          showToast({
            message:
              markedCount > 1
                ? `${shortTitle}: ${markedCount} chapters marked read`
                : `${shortTitle}: Up to Ch.${upToChapter} marked read`,
            icon: 'checkmark-done',
            type: 'success',
          });
        },
        // Error callback
        () => {
          showToast({
            message: 'Failed to mark chapters as read',
            type: 'error',
          });
        }
      );
      if (config) {
        setAlertConfig(config);
        setIsAlertVisible(true);
      }
    },
    [haptics, readChapters, mangaDetails, id, showToast]
  );

  const handleMarkAsUnread = useCallback(
    async (chapterNumber: string) => {
      try {
        const result = await markChapterAsUnread(
          id as string,
          chapterNumber,
          readChapters
        );

        // Update the read chapters state
        setReadChapters(result.updatedChapters);

        // Update the last read chapter display immediately
        if (result.newLastReadChapter) {
          setLastReadChapter(`Chapter ${result.newLastReadChapter}`);
        } else {
          setLastReadChapter('Not started');
        }

        // Close any open swipeables
        if (currentlyOpenSwipeable) {
          currentlyOpenSwipeable.close();
          setCurrentlyOpenSwipeable(null);
        }

        // Show success toast
        const shortTitle = mangaDetails?.title
          ? mangaDetails.title.length > 15
            ? mangaDetails.title.substring(0, 15) + '…'
            : mangaDetails.title
          : '';
        showToast({
          message: `${shortTitle}: Ch.${chapterNumber} marked unread`,
          icon: 'refresh',
          type: 'success',
        });
      } catch (error) {
        console.error('Error marking chapter as unread:', error);
        showToast({
          message: 'Failed to mark as unread',
          type: 'error',
        });
      }
    },
    [id, readChapters, currentlyOpenSwipeable, showToast, mangaDetails?.title]
  );

  const handleDeleteDownload = useCallback(
    async (chapterNumber: string) => {
      if (typeof id !== 'string') {
        return;
      }

      try {
        await chapterStorageService.deleteChapter(id as string, chapterNumber);
        setDownloadedChapters((prev) =>
          prev.filter((item) => item !== chapterNumber)
        );
        setDownloadingChapters((prev) =>
          prev.filter((item) => item !== chapterNumber)
        );

        await refreshDownloadedChapters();

        // Show success toast
        const shortTitle = mangaDetails?.title
          ? mangaDetails.title.length > 15
            ? mangaDetails.title.substring(0, 15) + '…'
            : mangaDetails.title
          : '';
        showToast({
          message: `${shortTitle}: Ch.${chapterNumber} download deleted`,
          icon: 'trash-outline',
          type: 'info',
        });
      } catch (deleteError) {
        console.error('Error deleting downloaded chapter:', deleteError);
        showToast({
          message: 'Failed to delete download',
          type: 'error',
        });
      }
    },
    [id, refreshDownloadedChapters, showToast, mangaDetails?.title]
  );

  const handleChapterPress = useCallback(
    (chapterNumber: string | number) => {
      if (typeof id !== 'string') {
        return;
      }

      const normalizedChapter =
        String(chapterNumber ?? '')
          .trim()
          .replace(/\s+/g, '') || String(chapterNumber);
      if (!normalizedChapter) {
        return;
      }

      haptics.onSelection();
      router.push(
        `/manga/${id}/chapter/${encodeURIComponent(normalizedChapter)}`
      );
    },
    [haptics, router, id]
  );

  useEffect(() => {
    chapterPaginationRef.current = {
      chapters: mangaDetails?.chapters ?? [],
      nextPage: nextChapterPage,
      hasMore: hasMoreChapters,
      lastPage: lastChapterPage,
    };
  }, [
    mangaDetails?.chapters,
    nextChapterPage,
    hasMoreChapters,
    lastChapterPage,
  ]);

  const loadMoreChapters = useCallback(async () => {
    if (
      typeof id !== 'string' ||
      !hasMoreChapters ||
      isLoadingMoreChaptersRef.current ||
      isOffline
    ) {
      return;
    }

    isLoadingMoreChaptersRef.current = true;
    setIsLoadingMoreChapters(true);

    try {
      const page = nextChapterPage;
      const result = await fetchMappedTitleChaptersPage(id, page);

      setFetchedDetails((current) => {
        if (!current || current.id !== id) {
          return current;
        }

        const merged = appendUniqueChapters(current.chapters, result.chapters);
        const reportedTotal =
          typeof result.total === 'number' && result.total > 0
            ? result.total
            : current.totalChapters;

        return {
          ...current,
          chapters: merged,
          totalChapters:
            typeof reportedTotal === 'number' && reportedTotal > 0
              ? Math.max(reportedTotal, merged.length)
              : merged.length,
        };
      });

      setHasMoreChapters(result.hasMore);
      setNextChapterPage(page + 1);
      if (typeof result.lastPage === 'number') {
        setLastChapterPage(result.lastPage);
      }
    } catch (error) {
      logger().warn('Service', 'Failed to load more chapters', {
        mangaId: id,
        page: nextChapterPage,
        error,
      });
    } finally {
      isLoadingMoreChaptersRef.current = false;
      setIsLoadingMoreChapters(false);
    }
  }, [id, hasMoreChapters, nextChapterPage, isOffline]);

  const handleHideExtraChaptersToggle = useCallback(async () => {
    if (typeof id !== 'string') {
      return;
    }

    const nextValue = !hideExtraChaptersRef.current;
    setHideExtraChapters(nextValue);
    hideExtraChaptersRef.current = nextValue;

    try {
      await updateMangaData(id, (existing) => {
        const base = existing ?? {
          id,
          title: mangaDetails?.title || id,
          bannerImage: mangaDetails?.bannerImage || '',
          bookmarkStatus: null,
          readChapters: [],
          lastUpdated: Date.now(),
        };
        return {
          ...base,
          hideExtraChapters: nextValue,
          lastUpdated: Date.now(),
        };
      });
    } catch (error) {
      logger().warn('Storage', 'Failed to persist hide-extra-chapters setting', {
        mangaId: id,
        hideExtraChapters: nextValue,
        error,
      });
    }

    showToast({
      type: 'success',
      message: nextValue
        ? 'Hiding extra chapters (3.1, 3.5, …)'
        : 'Showing all chapters',
    });
  }, [id, mangaDetails?.title, mangaDetails?.bannerImage, showToast]);

  const handleRefreshChapters = useCallback(async () => {
    if (
      typeof id !== 'string' ||
      isOffline ||
      isRefreshingChapters ||
      !isScreenMountedRef.current
    ) {
      return;
    }

    const mangaId = id;
    const previousNewest = chapterPaginationRef.current.chapters[0]?.number;
    const loadGeneration = loadGenerationRef.current;
    const previousPagination = {
      chapters: chapterPaginationRef.current.chapters,
      hasMore: chapterPaginationRef.current.hasMore,
      nextPage: chapterPaginationRef.current.nextPage,
      lastPage: chapterPaginationRef.current.lastPage,
    };

    const restorePreviousPagination = () => {
      setHasMoreChapters(previousPagination.hasMore);
      setNextChapterPage(previousPagination.nextPage);
      if (typeof previousPagination.lastPage === 'number') {
        setLastChapterPage(previousPagination.lastPage);
      }
      chapterPaginationRef.current = {
        ...chapterPaginationRef.current,
        chapters: previousPagination.chapters,
        hasMore: previousPagination.hasMore,
        nextPage: previousPagination.nextPage,
        lastPage: previousPagination.lastPage,
      };
      // Allow background crawl to resume if the list was still incomplete.
      backgroundChapterLoadIdRef.current = null;
    };

    // Block the background page-by-page crawl from racing this full refresh.
    backgroundChapterLoadIdRef.current = mangaId;
    setIsRefreshingChapters(true);
    setChapterRefreshProgress({ page: 0, chapterCount: 0 });
    setHasMoreChapters(false);

    try {
      let lastPageFromMeta: number | undefined;
      const freshDetails = await fetchMangaDetails(mangaId, {
        force: true,
        shouldCancel: () =>
          !isScreenMountedRef.current ||
          loadGeneration !== loadGenerationRef.current ||
          typeof id !== 'string' ||
          id !== mangaId,
        onPartial: (partial) => {
          if (
            !isScreenMountedRef.current ||
            loadGeneration !== loadGenerationRef.current ||
            typeof id !== 'string' ||
            id !== mangaId
          ) {
            return;
          }
          applyMangaDetailsForId(mangaId, partial);
          if ((partial.chapters?.length ?? 0) > 0) {
            setSettledChapterMangaId(mangaId);
          }
        },
        onChapterPagination: (meta) => {
          if (
            !isScreenMountedRef.current ||
            loadGeneration !== loadGenerationRef.current ||
            typeof id !== 'string' ||
            id !== mangaId
          ) {
            return;
          }
          if (typeof meta.lastPage === 'number') {
            lastPageFromMeta = meta.lastPage;
            setLastChapterPage(meta.lastPage);
          }
          setChapterRefreshProgress({
            page: meta.page,
            chapterCount: meta.chapterCount ?? 0,
            ...(typeof meta.lastPage === 'number'
              ? { lastPage: meta.lastPage }
              : typeof lastPageFromMeta === 'number'
                ? { lastPage: lastPageFromMeta }
                : {}),
          });
          if (typeof meta.total === 'number' && meta.total > 0) {
            const reportedTotal = meta.total;
            setFetchedDetails((current) => {
              if (!current || current.id !== mangaId) {
                return current;
              }
              if (current.totalChapters === reportedTotal) {
                return current;
              }
              return {
                ...current,
                totalChapters: reportedTotal,
              };
            });
          }
        },
      });

      if (
        !isScreenMountedRef.current ||
        loadGeneration !== loadGenerationRef.current ||
        typeof id !== 'string' ||
        id !== mangaId
      ) {
        restorePreviousPagination();
        return;
      }

      const chapters = freshDetails.chapters ?? [];
      const finishedPagination = resolveFinishedChapterPagination({
        chapters,
        apiHasMore: false,
        nextPage:
          typeof lastPageFromMeta === 'number'
            ? lastPageFromMeta + 1
            : typeof lastChapterPage === 'number'
              ? lastChapterPage + 1
              : 2,
        ...(typeof lastPageFromMeta === 'number'
          ? { lastPage: lastPageFromMeta }
          : typeof lastChapterPage === 'number'
            ? { lastPage: lastChapterPage }
            : {}),
      });

      // Full manual refresh replaces the chapter list with the network result.
      setFetchedDetails((previous) => {
        const headerMerged = mergeMangaDetailsRefresh(
          previous && previous.id === mangaId ? previous : null,
          freshDetails,
          mangaId
        );
        return {
          ...headerMerged,
          chapters,
          totalChapters: Math.max(
            headerMerged.totalChapters ?? 0,
            freshDetails.totalChapters ?? 0,
            chapters.length
          ),
        };
      });
      setHasMoreChapters(finishedPagination.hasMore);
      setNextChapterPage(finishedPagination.nextPage);
      if (typeof finishedPagination.lastPage === 'number') {
        setLastChapterPage(finishedPagination.lastPage);
      }
      chapterPaginationRef.current = {
        chapters,
        hasMore: finishedPagination.hasMore,
        nextPage: finishedPagination.nextPage,
        lastPage: finishedPagination.lastPage,
      };
      setSettledChapterMangaId(mangaId);

      void offlineCacheService.cacheMangaDetails(
        mangaId,
        {
          ...freshDetails,
          id: mangaId,
          chapters,
          totalChapters: Math.max(
            freshDetails.totalChapters ?? 0,
            chapters.length
          ),
          chapterPagination: {
            hasMore: finishedPagination.hasMore,
            nextPage: finishedPagination.nextPage,
            ...(typeof finishedPagination.lastPage === 'number'
              ? { lastPage: finishedPagination.lastPage }
              : {}),
          },
        },
        Boolean(bookmarkStatusRef.current)
      );

      const newest = chapters[0]?.number;
      const reachedStart = chapterListReachesSeriesStart(chapters);
      showToast({
        type: 'success',
        message: !reachedStart
          ? `Loaded ${chapters.length} chapters — older chapters may still be missing`
          : newest && previousNewest && newest !== previousNewest
            ? `Refreshed ${chapters.length} chapters — latest is ${newest}`
            : `Refreshed ${chapters.length} chapters`,
      });

      // Clear the pin so a future open/rehydrate can schedule work; hasMore already gates whether the idle crawl actually runs.
      backgroundChapterLoadIdRef.current = null;
    } catch (error) {
      restorePreviousPagination();

      if (isRateLimitError(error)) {
        showToast({
          type: 'error',
          message: RATE_LIMIT_USING_CACHE_MESSAGE,
        });
        return;
      }

      logger().warn('Service', 'Failed to manually refresh chapters', {
        mangaId,
        error,
      });
      if (isScreenMountedRef.current) {
        showToast({
          type: 'error',
          message: 'Could not refresh chapters',
        });
      }
    } finally {
      if (
        isScreenMountedRef.current &&
        loadGeneration === loadGenerationRef.current
      ) {
        setIsRefreshingChapters(false);
        setChapterRefreshProgress(null);
      }
    }
  }, [
    id,
    isOffline,
    isRefreshingChapters,
    applyMangaDetailsForId,
    lastChapterPage,
    showToast,
  ]);

  /** Load every remaining chapter page so end-of-list actions use the real first chapter. */
  const ensureAllChaptersLoaded = useCallback(async (): Promise<boolean> => {
    if (typeof id !== 'string' || isOffline || !isScreenMountedRef.current) {
      return !chapterPaginationRef.current.hasMore;
    }

    // Wait out an in-flight single-page load (common when FAB is pressed near list end).
    const waitStarted = Date.now();
    while (isLoadingMoreChaptersRef.current) {
      if (!isScreenMountedRef.current || Date.now() - waitStarted > 30000) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (!chapterPaginationRef.current.hasMore) {
      return true;
    }

    if (!isScreenMountedRef.current) {
      return false;
    }

    isLoadingMoreChaptersRef.current = true;
    setIsLoadingMoreChapters(true);
    const loadGeneration = loadGenerationRef.current;
    const shouldCancel = () =>
      !isScreenMountedRef.current ||
      loadGeneration !== loadGenerationRef.current;

    try {
      const mangaId = id;
      const result = await loadRemainingChapterPages({
        currentChapters: chapterPaginationRef.current.chapters,
        nextPage: chapterPaginationRef.current.nextPage,
        hasMore: chapterPaginationRef.current.hasMore,
        fetchPage: (page) => fetchMappedTitleChaptersPage(mangaId, page),
        shouldCancel,
        onPage: ({ chapters, nextPage, hasMore }) => {
          if (shouldCancel()) {
            return;
          }
          setFetchedDetails((current) => {
            if (!current || current.id !== mangaId) {
              return current;
            }
            return {
              ...current,
              chapters,
              totalChapters: Math.max(
                current.totalChapters ?? 0,
                chapters.length
              ),
            };
          });
          setNextChapterPage(nextPage);
          setHasMoreChapters(hasMore);
          chapterPaginationRef.current = {
            ...chapterPaginationRef.current,
            chapters,
            nextPage,
            hasMore,
          };
        },
      });

      if (shouldCancel()) {
        return false;
      }

      setFetchedDetails((current) => {
        if (!current || current.id !== mangaId) {
          return current;
        }
        return {
          ...current,
          chapters: result.chapters,
          totalChapters: Math.max(
            current.totalChapters ?? 0,
            result.chapters.length
          ),
        };
      });
      setNextChapterPage(result.nextPage);
      setHasMoreChapters(result.hasMore);
      chapterPaginationRef.current = {
        ...chapterPaginationRef.current,
        chapters: result.chapters,
        nextPage: result.nextPage,
        hasMore: result.hasMore,
      };

      if (!result.hasMore && result.chapters.length > 0) {
        const finishedPagination = resolveFinishedChapterPagination({
          chapters: result.chapters,
          apiHasMore: result.hasMore,
          nextPage: result.nextPage,
          ...(typeof chapterPaginationRef.current.lastPage === 'number'
            ? { lastPage: chapterPaginationRef.current.lastPage }
            : typeof lastChapterPage === 'number'
              ? { lastPage: lastChapterPage }
              : {}),
        });
        setHasMoreChapters(finishedPagination.hasMore);
        setNextChapterPage(finishedPagination.nextPage);
        if (typeof finishedPagination.lastPage === 'number') {
          setLastChapterPage(finishedPagination.lastPage);
        }
        chapterPaginationRef.current = {
          ...chapterPaginationRef.current,
          chapters: result.chapters,
          hasMore: finishedPagination.hasMore,
          nextPage: finishedPagination.nextPage,
          ...(typeof finishedPagination.lastPage === 'number'
            ? { lastPage: finishedPagination.lastPage }
            : {}),
        };

        setFetchedDetails((current) => {
          if (!current || current.id !== mangaId) {
            return current;
          }
          const nextDetails = {
            ...current,
            chapters: result.chapters,
            totalChapters: Math.max(
              current.totalChapters ?? 0,
              result.chapters.length
            ),
          };
          void offlineCacheService.cacheMangaDetails(
            mangaId,
            {
              ...nextDetails,
              chapterPagination: {
                hasMore: finishedPagination.hasMore,
                nextPage: finishedPagination.nextPage,
                ...(typeof finishedPagination.lastPage === 'number'
                  ? { lastPage: finishedPagination.lastPage }
                  : {}),
              },
            },
            Boolean(bookmarkStatusRef.current)
          );
          return nextDetails;
        });
      }

      return !result.hasMore;
    } catch (error) {
      logger().warn('Service', 'Failed to load all chapters', {
        mangaId: id,
        error,
      });
      return false;
    } finally {
      if (loadGeneration === loadGenerationRef.current) {
        isLoadingMoreChaptersRef.current = false;
        if (isScreenMountedRef.current) {
          setIsLoadingMoreChapters(false);
        }
      }
    }
  }, [id, isOffline, lastChapterPage]);

  // Page 1 is enough for first paint. Once it is visible, fill the remainder sequentially in the background so long series become complete without the user having to reach the temporary end of every 60-item page.
  useEffect(() => {
    if (
      typeof id !== 'string' ||
      !hasSettledInitialChapters ||
      !hasMoreChapters ||
      isOffline ||
      backgroundChapterLoadIdRef.current === id
    ) {
      return;
    }

    const mangaId = id;
    const loadGeneration = loadGenerationRef.current;
    backgroundChapterLoadIdRef.current = mangaId;
    return scheduleIdle(() => {
      void ensureAllChaptersLoaded().then((complete) => {
        if (
          !complete &&
          loadGeneration === loadGenerationRef.current &&
          backgroundChapterLoadIdRef.current === mangaId
        ) {
          // Keep the footer retry available after a transient page failure.
          backgroundChapterLoadIdRef.current = null;
        }
      });
    });
  }, [
    id,
    hasSettledInitialChapters,
    hasMoreChapters,
    isOffline,
    ensureAllChaptersLoaded,
  ]);

  const handleLastReadChapterPress = useCallback(async () => {
    if (!lastReadChapter || lastReadChapter === 'Not started') {
      if (!mangaDetails?.chapters?.length || typeof id !== 'string') {
        return;
      }

      try {
        let firstChapter = pickOldestChapter(mangaDetails.chapters);

        if (hasMoreChapters && !isOffline) {
          firstChapter = await resolveOldestChapter({
            loadedChapters: mangaDetails.chapters,
            hasMore: true,
            ...(typeof lastChapterPage === 'number'
              ? { lastPage: lastChapterPage }
              : {}),
            fetchPage: (page) => fetchMappedTitleChaptersPage(id, page),
          });
        }

        if (firstChapter) {
          handleChapterPress(firstChapter.number);
        }
      } catch (error) {
        logger().warn('Service', 'Failed to resolve first chapter', {
          mangaId: id,
          error,
        });
        const fallback = pickOldestChapter(mangaDetails.chapters);
        if (fallback) {
          handleChapterPress(fallback.number);
        }
      }
      return;
    }

    const chapterNumber = lastReadChapter.replace('Chapter ', '');
    handleChapterPress(chapterNumber);
  }, [
    lastReadChapter,
    mangaDetails,
    handleChapterPress,
    hasMoreChapters,
    lastChapterPage,
    id,
    isOffline,
  ]);

  // O(1) lookup set for read chapters — avoids O(n) includes() per item in the list
  const readChaptersSet = useMemo(() => new Set(readChapters), [readChapters]);
  const downloadedChaptersSet = useMemo(
    () => new Set(downloadedChapters),
    [downloadedChapters]
  );
  const downloadingChaptersSet = useMemo(
    () => new Set(downloadingChapters),
    [downloadingChapters]
  );

  const totalChapterCount = useMemo(() => {
    if (hideExtraChapters) {
      return visibleChapters.length > 0
        ? visibleChapters.length
        : getReportedChapterCount(mangaDetails);
    }
    return getReportedChapterCount(mangaDetails);
  }, [hideExtraChapters, visibleChapters.length, mangaDetails]);

  const readingProgress = useMemo(() => {
    if (!mangaDetails || totalChapterCount === 0) {
      return 0;
    }
    return Math.round((readChapters.length / totalChapterCount) * 100);
  }, [mangaDetails, readChapters.length, totalChapterCount]);

  const remainingReadingTime = useMemo(() => {
    if (!mangaDetails || totalChapterCount === 0) return 0;
    const averageTimePerChapter = 7;
    const unreadChapters = Math.max(totalChapterCount - readChapters.length, 0);
    return unreadChapters * averageTimePerChapter;
  }, [mangaDetails, readChapters.length, totalChapterCount]);

  const chapterListExtraData = useMemo(
    () => ({
      readChapters,
      lastReadChapter,
      downloadedChapters,
      downloadingChapters,
    }),
    [readChapters, lastReadChapter, downloadedChapters, downloadingChapters]
  );

  const chapterKeyExtractor = useCallback(
    (item: Chapter) => `chapter-${item.number}`,
    []
  );

  const { scrollHandler } = useParallaxScroll((event) => {
    'worklet';
    const offsetY = event.contentOffset.y;
    const maxScroll =
      event.contentSize.height - event.layoutMeasurement.height;
    const progress =
      maxScroll > 0 ? Math.min(Math.max(offsetY / maxScroll, 0), 1) : 0;
    scrollProgressSV.value = progress;

    if (Math.abs(offsetY - lastScrollYSV.value) > 5) {
      const nextDir = offsetY > lastScrollYSV.value ? 1 : 0;
      if (nextDir !== scrollDirectionSV.value) {
        scrollDirectionSV.value = nextDir;
        runOnJS(setScrollDirection)(nextDir === 1 ? 'down' : 'up');
      }
    }
    lastScrollYSV.value = offsetY;

    const show = offsetY > 100 ? 1 : 0;
    if (show !== showScrollButtonSV.value) {
      showScrollButtonSV.value = show;
      runOnJS(setShowScrollButton)(show === 1);
    }

    const nearBottom = progress >= 0.95 ? 1 : 0;
    if (nearBottom !== isNearBottomSV.value) {
      isNearBottomSV.value = nearBottom;
      runOnJS(setIsNearBottom)(nearBottom === 1);
    }
  });

  // Animate button opacity
  useEffect(() => {
    scrollButtonOpacity.value = withTiming(
      showScrollButton || isJumpingToBottom ? 1 : 0,
      {
        duration: 200,
      }
    );
  }, [showScrollButton, isJumpingToBottom, scrollButtonOpacity]);

  const scrollButtonStyle = useAnimatedStyle(() => {
    return {
      opacity: scrollButtonOpacity.value,
      transform: [
        {
          scale: interpolate(
            scrollButtonOpacity.value,
            [0, 1],
            [0.8, 1],
            Extrapolation.CLAMP
          ),
        },
      ],
    };
  });

  const progressRingProps = useAnimatedProps(() => ({
    strokeDashoffset:
      PROGRESS_RING_CIRCUMFERENCE * (1 - scrollProgressSV.value),
  }));

  const downArrowStyle = useAnimatedStyle(() => ({
    opacity:
      scrollDirectionSV.value === 1 && scrollProgressSV.value < 0.95 ? 1 : 0,
  }));

  const upArrowStyle = useAnimatedStyle(() => ({
    opacity:
      scrollDirectionSV.value === 1 && scrollProgressSV.value < 0.95 ? 0 : 1,
  }));

  const latestReadChapterIndex = useMemo(() => {
    const normalizedLastReadChapter = lastReadChapter
      ?.replace('Chapter ', '')
      .trim();
    const parsedLastReadChapter = normalizedLastReadChapter
      ? Number.parseFloat(normalizedLastReadChapter)
      : Number.NaN;

    if (!mangaDetails?.chapters?.length || !normalizedLastReadChapter) {
      return -1;
    }

    return mangaDetails.chapters.findIndex(
      (chapter) =>
        chapter.number === normalizedLastReadChapter ||
        (Number.isFinite(parsedLastReadChapter) &&
          Number.parseFloat(chapter.number) === parsedLastReadChapter)
    );
  }, [lastReadChapter, mangaDetails?.chapters]);

  const shouldUseDownAction =
    scrollDirection === 'down' && !isNearBottom;

  useEffect(() => {
    setHasJumpedToLatestRead(false);
  }, [id, lastReadChapter]);

  const handleSmartScrollPress = useCallback(() => {
    haptics.onSelection();

    const shouldScrollDown =
      scrollDirectionSV.value === 1 && scrollProgressSV.value < 0.95;

    if (!shouldScrollDown) {
      setHasJumpedToLatestRead(false);
      flashListRef.current?.scrollToOffset({
        offset: 0,
        animated: true,
      });
      return;
    }

    if (latestReadChapterIndex >= 0 && !hasJumpedToLatestRead) {
      setHasJumpedToLatestRead(true);
      flashListRef.current?.scrollToIndex({
        index: latestReadChapterIndex,
        animated: true,
        viewPosition: 0.5,
      });
      return;
    }

    const scrollToTrueBottom = async () => {
      const needsFullLoad =
        hasMoreChapters ||
        chapterPaginationRef.current.hasMore ||
        isLoadingMoreChaptersRef.current;

      if (needsFullLoad) {
        setIsJumpingToBottom(true);
        // Let the modal paint before starting the network crawl.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => resolve());
          });
        });
      }

      try {
        const fullyLoaded = await ensureAllChaptersLoaded();
        // Wait a frame so FlashList receives the expanded data before scrolling.
        await new Promise<void>((resolve) => {
          requestAnimationFrame(() => resolve());
        });
        flashListRef.current?.scrollToEnd({ animated: true });
        if (!fullyLoaded && chapterPaginationRef.current.hasMore) {
          showToast({
            message: 'Could not load all chapters yet',
            type: 'info',
          });
        }
      } finally {
        setIsJumpingToBottom(false);
      }
    };

    void scrollToTrueBottom();
  }, [
    haptics,
    scrollDirectionSV,
    scrollProgressSV,
    latestReadChapterIndex,
    hasJumpedToLatestRead,
    setHasJumpedToLatestRead,
    ensureAllChaptersLoaded,
    showToast,
    hasMoreChapters,
  ]);

  const renderChapterItem = useCallback(
    ({ item: chapter, index }: { item: Chapter; index: number }) => {
      if (!mangaDetails) return null;

      const isRead = readChaptersSet.has(chapter.number);
      const isLastItem = index === mangaDetails.chapters.length - 1;
      const isCurrentlyLastRead =
        lastReadChapter === `Chapter ${chapter.number}`;
      const isDownloaded = downloadedChaptersSet.has(chapter.number);
      const isDownloading = downloadingChaptersSet.has(chapter.number);

      return (
        <SwipeableChapterItem
          chapter={chapter}
          isRead={isRead}
          isLastItem={isLastItem}
          isCurrentlyLastRead={isCurrentlyLastRead}
          useParentDownloadState={true}
          isDownloaded={isDownloaded}
          isDownloading={isDownloading}
          onPress={() => handleChapterPress(chapter.number)}
          onLongPress={() => handleChapterLongPress(chapter.number)}
          onUnread={() => handleMarkAsUnread(chapter.number)}
          colors={colors}
          styles={styles}
          getCurrentlyOpenSwipeable={getCurrentlyOpenSwipeable}
          setCurrentlyOpenSwipeable={setCurrentlyOpenSwipeableStable}
          mangaId={id as string}
          mangaTitle={mangaDetails?.title}
          showDownloadButton={true}
          onDownloadStart={() => {
            setDownloadingChapters((prev) =>
              prev.includes(chapter.number) ? prev : [...prev, chapter.number]
            );
            refreshDownloadingChapters().catch(() => {});
          }}
          onDownloadComplete={() => {
            setDownloadedChapters((prev) =>
              prev.includes(chapter.number) ? prev : [...prev, chapter.number]
            );
            setDownloadingChapters((prev) =>
              prev.filter((item) => item !== chapter.number)
            );
            refreshDownloadedChapters().catch(() => {});
            refreshDownloadingChapters().catch(() => {});
          }}
          onDownloadError={() => {
            setDownloadingChapters((prev) =>
              prev.filter((item) => item !== chapter.number)
            );
            refreshDownloadingChapters().catch(() => {});
          }}
          onDeleteDownload={() => {
            handleDeleteDownload(chapter.number).catch(() => {});
          }}
        />
      );
    },
    [
      mangaDetails,
      readChaptersSet,
      downloadedChaptersSet,
      downloadingChaptersSet,
      lastReadChapter,
      handleChapterPress,
      handleChapterLongPress,
      handleMarkAsUnread,
      colors,
      styles,
      getCurrentlyOpenSwipeable,
      setCurrentlyOpenSwipeableStable,
      id,
      refreshDownloadingChapters,
      refreshDownloadedChapters,
      handleDeleteDownload,
    ]
  );

  const ListHeader = useMemo(
    () =>
      !mangaDetails ? null : (
        <>
          <View style={styles.headerContainer}>
            <MangaBannerImage
              mangaId={id as string}
              bannerUrl={mangaDetails.bannerImage}
              style={styles.bannerImage}
              isOffline={isOffline}
            />
            <View style={styles.overlay} />
            <View style={styles.headerContent}>
              <Text style={styles.title} numberOfLines={3} ellipsizeMode="tail">
                {mangaDetails.title}
              </Text>
              {mangaDetails.alternativeTitle ? (
                <Text
                  style={styles.alternativeTitle}
                  numberOfLines={2}
                  ellipsizeMode="tail"
                >
                  {mangaDetails.alternativeTitle}
                </Text>
              ) : null}
              {mangaDetails.status ? (
                <View style={styles.statusContainer}>
                  <Text
                    style={styles.statusText}
                    accessibilityLabel={`Publication status: ${mangaDetails.status}`}
                  >
                    {mangaDetails.status}
                  </Text>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.contentContainer}>
            <View style={styles.infoContainer}>
              {/* Reading Progress Bar */}
              <View style={styles.progressContainer}>
                <View style={styles.progressHeader}>
                  <Text style={styles.progressTitle}>Reading Progress </Text>
                  <Text style={styles.progressPercentage}>
                    {readingProgress}%
                  </Text>
                </View>
                <View style={styles.progressBarContainer}>
                  <View
                    style={[
                      styles.progressBar,
                      { width: `${readingProgress}%` },
                    ]}
                  />
                </View>
                <View style={styles.progressStats}>
                  <Text style={styles.progressStat}>
                    <Ionicons
                      name="book-outline"
                      size={14}
                      color={colors.text}
                    />{' '}
                    {readChapters.length}/{totalChapterCount} chapters read
                  </Text>
                  <Text style={styles.progressStat}>
                    <Ionicons
                      name="time-outline"
                      size={14}
                      color={colors.text}
                    />{' '}
                    ~{remainingReadingTime} min remaining
                  </Text>
                </View>
              </View>

              {hasLoadedMangaHeader(mangaDetails) ? (
                <>
                  <View style={styles.descriptionContainer}>
                    <Text style={styles.sectionTitle}>Description</Text>
                    <ExpandableText
                      text={mangaDetails.description}
                      initialLines={3}
                      style={styles.description}
                      stateKey={`description-${id}`}
                    />
                    <LastReadChapterBar
                      lastReadChapter={lastReadChapter}
                      onPress={handleLastReadChapterPress}
                      colors={colors}
                      readChapters={readChapters}
                    />
                  </View>
                  <View style={styles.detailsContainer}>
                    <Text style={styles.sectionTitle}>Details</Text>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Author</Text>
                      <Text style={styles.detailValue}>
                        {(mangaDetails.author || []).join(', ')}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Published</Text>
                      <Text style={styles.detailValue}>
                        {mangaDetails.published}
                      </Text>
                    </View>
                    <View style={styles.detailRow}>
                      <Text style={styles.detailLabel}>Rating</Text>
                      <View style={styles.ratingContainer}>
                        <Text style={styles.rating}>{mangaDetails.rating}</Text>
                        <Text style={styles.ratingText}>
                          /10 ({mangaDetails.reviewCount} reviews)
                        </Text>
                      </View>
                    </View>
                    <Text style={[styles.detailLabel, { marginTop: 10 }]}>
                      Genres
                    </Text>
                    <View style={styles.genresContainer}>
                      {(mangaDetails.genres || []).map((genre, index) => (
                        <GenreTag key={index} genre={genre} />
                      ))}
                    </View>
                  </View>
                </>
              ) : (
                <MangaDetailMetaSkeleton />
              )}
            </View>
          </View>
          <View style={styles.chaptersContainer}>
            <BatchDownloadBar
              mangaId={id as string}
              mangaTitle={mangaDetails.title}
              chapters={visibleChapters}
              downloadedChapters={downloadedChapters}
              onDownloadsChanged={refreshDownloadedChapters}
              buttonStyle={styles.chapterIconButton}
            >
              {({ button, progressBanner }) => (
                <>
                  <View style={styles.chaptersHeaderRow}>
                    <Text
                      style={[styles.sectionTitle, styles.chaptersSectionTitle]}
                    >
                      Chapters
                    </Text>
                    <View style={styles.chaptersHeaderActions}>
                      {button}
                      <TouchableOpacity
                        onPress={() => {
                          void handleRefreshChapters();
                        }}
                        disabled={isOffline || isRefreshingChapters}
                        style={[
                          styles.chapterIconButton,
                          (isOffline || isRefreshingChapters) &&
                            styles.chapterIconButtonDisabled,
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{
                          disabled: isOffline || isRefreshingChapters,
                          busy: isRefreshingChapters,
                        }}
                        accessibilityLabel="Refresh all chapters"
                      >
                        {isRefreshingChapters ? (
                          <ActivityIndicator
                            size="small"
                            color={colors.primary}
                          />
                        ) : (
                          <Ionicons
                            name="refresh-outline"
                            size={18}
                            color={colors.primary}
                          />
                        )}
                        {isRefreshingChapters &&
                        chapterRefreshProgress?.page ? (
                          <View style={styles.chapterIconButtonBadge}>
                            <Text style={styles.chapterIconButtonBadgeText}>
                              {chapterRefreshProgress.lastPage
                                ? `${chapterRefreshProgress.page}/${chapterRefreshProgress.lastPage}`
                                : String(chapterRefreshProgress.page)}
                            </Text>
                          </View>
                        ) : null}
                      </TouchableOpacity>
                      <TouchableOpacity
                        onPress={() => {
                          void handleHideExtraChaptersToggle();
                        }}
                        style={[
                          styles.chapterIconButton,
                          hideExtraChapters && styles.chapterIconButtonActive,
                        ]}
                        accessibilityRole="button"
                        accessibilityState={{ selected: hideExtraChapters }}
                        accessibilityLabel={
                          hideExtraChapters
                            ? 'Extra chapters hidden. Tap to show half chapters like 3.1 and 3.5'
                            : 'Showing all chapters. Tap to hide half chapters like 3.1 and 3.5'
                        }
                      >
                        <Ionicons
                          name={
                            hideExtraChapters
                              ? 'eye-off-outline'
                              : 'eye-outline'
                          }
                          size={18}
                          color={colors.primary}
                        />
                      </TouchableOpacity>
                    </View>
                  </View>
                  {progressBanner}
                  {isRefreshingChapters ? (
                    <View
                      style={styles.chapterRefreshProgress}
                      accessibilityRole="progressbar"
                      accessibilityLabel={
                        chapterRefreshProgress?.lastPage
                          ? `Refreshing chapters, page ${chapterRefreshProgress.page} of ${chapterRefreshProgress.lastPage}, ${chapterRefreshProgress.chapterCount} loaded`
                          : `Refreshing chapters, page ${chapterRefreshProgress?.page ?? 0}, ${chapterRefreshProgress?.chapterCount ?? 0} loaded`
                      }
                    >
                      <View style={styles.chapterRefreshProgressHeader}>
                        <Text style={styles.chapterRefreshProgressLabel}>
                          {chapterRefreshProgress?.page
                            ? chapterRefreshProgress.lastPage
                              ? `Refreshing page ${chapterRefreshProgress.page} of ${chapterRefreshProgress.lastPage}`
                              : `Refreshing page ${chapterRefreshProgress.page}`
                            : 'Starting full chapter refresh…'}
                        </Text>
                        {chapterRefreshProgress?.lastPage ? (
                          <Text style={styles.chapterRefreshProgressPercent}>
                            {Math.min(
                              100,
                              Math.round(
                                (chapterRefreshProgress.page /
                                  chapterRefreshProgress.lastPage) *
                                  100
                              )
                            )}
                            %
                          </Text>
                        ) : null}
                      </View>
                      <View style={styles.chapterRefreshProgressTrack}>
                        <View
                          style={[
                            styles.chapterRefreshProgressFill,
                            {
                              width: chapterRefreshProgress?.lastPage
                                ? `${Math.min(
                                    100,
                                    Math.round(
                                      (chapterRefreshProgress.page /
                                        chapterRefreshProgress.lastPage) *
                                        100
                                    )
                                  )}%`
                                : '12%',
                            },
                          ]}
                        />
                      </View>
                      <Text style={styles.chapterRefreshProgressHint}>
                        {chapterRefreshProgress?.chapterCount
                          ? `${chapterRefreshProgress.chapterCount} chapters loaded so far`
                          : 'Fetching every chapter page…'}
                      </Text>
                    </View>
                  ) : null}
                </>
              )}
            </BatchDownloadBar>
          </View>
        </>
      ),
    [
      id,
      mangaDetails,
      readChapters,
      lastReadChapter,
      readingProgress,
      remainingReadingTime,
      totalChapterCount,
      downloadedChapters,
      refreshDownloadedChapters,
      colors,
      styles,
      handleLastReadChapterPress,
      isOffline,
      hideExtraChapters,
      handleHideExtraChaptersToggle,
      isRefreshingChapters,
      chapterRefreshProgress,
      handleRefreshChapters,
      visibleChapters,
    ]
  );

  if (migrationProgress) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <View style={styles.migrationStatusContainer}>
          <Text style={styles.migrationStatusTitle}>
            {migrationProgress.title}
          </Text>
          <Text style={styles.migrationStatusMessage}>
            {migrationProgress.message}
          </Text>
        </View>
      </View>
    );
  }

  if (isLoading && !mangaDetails) {
    return (
      <View style={styles.container}>
        <View style={[styles.fixedHeader, { paddingTop: insets.top + 10 }]}>
          <BackButton
            variant="enhanced"
            size={30}
            color="#FFFFFF"
            style={styles.headerButton}
            showHistoryOnLongPress={true}
          />
        </View>
        <MangaDetailHeaderSkeleton />
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {manualMigration ? (
        <AlertComponent
          visible={isManualMigrationAlertVisible}
          onClose={() => setIsManualMigrationAlertVisible(false)}
          type="confirm"
          title={MIGRATION_MESSAGES.manual.title}
          message={MIGRATION_MESSAGES.manual.message}
          options={[
            {
              text: 'Search manually',
              onPress: handleManualMigrationSearch,
            },
            {
              text: 'Go back',
              onPress: () => router.back(),
            },
          ]}
        />
      ) : null}
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : !mangaDetails ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>No manga details found.</Text>
        </View>
      ) : (
        <>
          {/* Alert component is used to display alerts */}
          {alertConfig && (
            <AlertComponent
              visible={isAlertVisible}
              onClose={() => setIsAlertVisible(false)}
              type={alertConfig.type as 'bookmarks' | 'confirm'}
              title={alertConfig.title}
              message={alertConfig.message}
              options={alertConfig.options}
            />
          )}

          {/* BottomPopup component for bookmarks */}
          <BottomPopup
            visible={isBookmarkPopupVisible}
            title={bookmarkPopupConfig.title}
            onClose={() => setIsBookmarkPopupVisible(false)}
            options={bookmarkPopupConfig.options}
          />

          <View style={{ flex: 1 }}>
            <View style={[styles.fixedHeader, { paddingTop: insets.top + 10 }]}>
              <BackButton
                variant="enhanced"
                size={30}
                color="#FFFFFF"
                style={styles.headerButton}
                showHistoryOnLongPress={true}
              />
              <TouchableOpacity
                testID="bookmark-button"
                onPress={handleBookmark}
                style={styles.headerButton}
                accessibilityRole="button"
                accessibilityLabel={
                  bookmarkStatus ? 'Remove bookmark' : 'Add bookmark'
                }
                accessibilityHint={`Currently ${bookmarkStatus || 'not bookmarked'}. Tap to ${bookmarkStatus ? 'remove' : 'add'} bookmark.`}
              >
                <Ionicons
                  name={bookmarkStatus ? 'bookmark' : 'bookmark-outline'}
                  size={30}
                  color={colors.primary}
                  accessibilityElementsHidden={true}
                />
              </TouchableOpacity>
            </View>
            <View style={{ flex: 1, backgroundColor: colors.card }}>
              <AnimatedFlashList
                ref={flashListRef}
                estimatedItemSize={CHAPTER_ROW_HEIGHT}
                overrideItemLayout={(layout: { size?: number }) => {
                  layout.size = CHAPTER_ROW_HEIGHT;
                }}
                getItemType={() => 'chapter'}
                ListHeaderComponent={ListHeader}
                data={visibleChapters}
                extraData={chapterListExtraData}
                keyExtractor={chapterKeyExtractor}
                renderItem={
                  visibleChapters.length === 0
                    ? () => <ChapterItemPlaceholder colors={colors} />
                    : renderChapterItem
                }
                ListEmptyComponent={<ChapterListSkeleton count={15} />}
                ListFooterComponent={
                  <View
                    style={{
                      height: 120,
                      backgroundColor: colors.card,
                      alignItems: 'center',
                      justifyContent: 'flex-start',
                      paddingTop: 12,
                    }}
                  >
                    {isLoadingMoreChapters ? (
                      <ActivityIndicator size="small" color={colors.primary} />
                    ) : hasMoreChapters && !isOffline ? (
                      <TouchableOpacity
                        onPress={loadMoreChapters}
                        accessibilityRole="button"
                        accessibilityLabel="Load more chapters"
                        style={{
                          paddingHorizontal: 18,
                          paddingVertical: 10,
                          borderRadius: 20,
                          backgroundColor: colors.primary,
                        }}
                      >
                        <Text style={{ color: colors.card, fontWeight: '600' }}>
                          Load more chapters
                        </Text>
                      </TouchableOpacity>
                    ) : null}
                  </View>
                }
                onEndReached={loadMoreChapters}
                onEndReachedThreshold={0.6}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                bounces={false}
                overScrollMode="never"
                maintainVisibleContentPosition={{ disabled: true }}
              />
            </View>

            {/* Smart Scroll FAB */}
            <Reanimated.View
              style={[
                styles.smartScrollButton,
                {
                  bottom: insets.bottom + 90,
                },
                scrollButtonStyle,
              ]}
              pointerEvents={
                showScrollButton || isJumpingToBottom ? 'auto' : 'none'
              }
            >
              <TouchableOpacity
                onPress={handleSmartScrollPress}
                disabled={isJumpingToBottom}
                style={styles.smartScrollButtonTouchable}
                accessibilityRole="button"
                accessibilityState={{ busy: isJumpingToBottom }}
                accessibilityLabel={
                  isJumpingToBottom
                    ? 'Loading chapters'
                    : shouldUseDownAction
                      ? latestReadChapterIndex >= 0
                        ? hasJumpedToLatestRead
                          ? 'Scroll to bottom'
                          : 'Scroll to latest read chapter'
                        : 'Scroll to bottom'
                      : 'Scroll to top'
                }
              >
                <BlurView
                  intensity={80}
                  tint={colorScheme === 'dark' ? 'dark' : 'light'}
                  style={styles.blurContainer}
                >
                  {isJumpingToBottom ? (
                    <ActivityIndicator size="small" color={colors.primary} />
                  ) : (
                    <>
                      {/* Progress Ring */}
                      <View style={styles.progressRingContainer}>
                        <Svg width={44} height={44} viewBox="0 0 44 44">
                          <Circle
                            cx="22"
                            cy="22"
                            r={PROGRESS_RING_RADIUS}
                            stroke={colors.text}
                            strokeWidth="3"
                            strokeOpacity={0.1}
                            fill="transparent"
                          />
                          <AnimatedCircle
                            cx="22"
                            cy="22"
                            r={PROGRESS_RING_RADIUS}
                            stroke={colors.primary}
                            strokeWidth="3"
                            fill="transparent"
                            strokeDasharray={PROGRESS_RING_CIRCUMFERENCE}
                            strokeLinecap="round"
                            rotation="-90"
                            origin="22, 22"
                            animatedProps={progressRingProps}
                          />
                        </Svg>
                      </View>

                      <Reanimated.View
                        style={[styles.fabIconLayer, downArrowStyle]}
                        pointerEvents="none"
                      >
                        <Ionicons
                          name="arrow-down"
                          size={20}
                          color={colors.text}
                          style={styles.fabIcon}
                        />
                      </Reanimated.View>
                      <Reanimated.View
                        style={[styles.fabIconLayer, upArrowStyle]}
                        pointerEvents="none"
                      >
                        <Ionicons
                          name="arrow-up"
                          size={20}
                          color={colors.text}
                          style={styles.fabIcon}
                        />
                      </Reanimated.View>
                    </>
                  )}
                </BlurView>
              </TouchableOpacity>
            </Reanimated.View>
          </View>
        </>
      )}
    </View>
  );
}
