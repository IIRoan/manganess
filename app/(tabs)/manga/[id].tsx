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
  withTiming,
  FadeIn,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/hooks/useTheme';
import { Colors, type ColorScheme } from '@/constants/Colors';
import ExpandableText from '@/components/ExpandableText';
import AlertComponent from '@/components/Alert';
import SwipeableChapterItem from '@/components/SwipeChapterItem';
import type { SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import BottomPopup from '@/components/BottomPopup';

import { FlashList } from '@shopify/flash-list';
import type { FlashListRef } from '@shopify/flash-list';
import { fetchMangaDetails } from '@/services/mangaFireService';
import { fetchMappedTitleChaptersPage } from '@/services/mangaFireApi';
import {
  appendUniqueChapters,
  getReportedChapterCount,
  loadRemainingChapterPages,
  pickOldestChapter,
  resolveCachedChapterPagination,
  resolveOldestChapter,
} from '@/utils/chapterListPagination';
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
  getMangaData,
  setMangaData,
} from '@/services/bookmarkService';
import BackButton from '@/components/BackButton';
import { GenreTag } from '@/components/GanreTag';
import {
  getLastReadChapter,
  getReadChapters,
  markChapterAsUnread,
} from '@/services/readChapterService';
import { chapterStorageService } from '@/services/chapterStorageService';
import { useFocusEffect } from 'expo-router/react-navigation';
import LastReadChapterBar from '@/components/LastReadChapterBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHapticFeedback } from '@/utils/haptics';
import { useToast } from '@/hooks/useToast';
import getStyles from './[id].styles';
import { logger } from '@/utils/logger';
import { useMangaImageCache } from '@/services/CacheImages';
import { useOffline } from '@/hooks/useOffline';
import { offlineCacheService } from '@/services/offlineCacheService';
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
import BatchDownloadBar from '@/components/BatchDownloadBar';
import { downloadManagerService } from '@/services/downloadManager';
import { downloadStatusService } from '@/services/downloadStatusService';
import { DownloadStatus } from '@/types/download';
import { useParallaxScroll } from '@/components/ParallaxLayout';
import {
  hydrateMangaFromLocal,
} from '@/utils/mangaOptimisticLoad';
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

const AnimatedFlashList = Reanimated.createAnimatedComponent(FlashList) as any;

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
  const [fetchedDetails, setFetchedDetails] = useState<MangaDetails | null>(
    null
  );
  const [displayMangaId, setDisplayMangaId] = useState<string | null>(null);
  const hasInstantContentRef = useRef(false);
  const loadGenerationRef = useRef(0);
  const hydratedStateRef = useRef({
    hasCachedChapters: false,
    hasMangaData: false,
  });

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
      setDisplayMangaId(targetId);

      // Keep stored total in sync so progress stays correct with partial chapter lists.
      const reportedTotal = details.totalChapters;
      if (typeof reportedTotal === 'number' && reportedTotal > 0) {
        void (async () => {
          try {
            const existing = await getMangaData(targetId);
            if (!existing || existing.totalChapters === reportedTotal) {
              return;
            }
            await setMangaData({
              ...existing,
              totalChapters: reportedTotal,
            });
          } catch (error) {
            logger().warn('Storage', 'Failed to persist total chapter count', {
              mangaId: targetId,
              error,
            });
          }
        })();
      }
    },
    [id]
  );

  // Derived state to ensure we only show data confirmed for the current ID
  const mangaDetails = useMemo(() => {
    if (typeof id !== 'string' || displayMangaId !== id) {
      return null;
    }

    if (fetchedDetails && fetchedDetails.id === id) {
      return fetchedDetails;
    }

    return null;
  }, [id, displayMangaId, fetchedDetails]);

  useLayoutEffect(() => {
    if (typeof id !== 'string') {
      return;
    }

    loadGenerationRef.current += 1;
    setDisplayMangaId(null);
    setFetchedDetails(null);
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
    setIsJumpingToBottom(false);
    isLoadingMoreChaptersRef.current = false;
    chapterPaginationRef.current = {
      chapters: [],
      nextPage: 2,
      hasMore: false,
      lastPage: undefined,
    };
    hasInstantContentRef.current = false;
    hydratedStateRef.current = {
      hasCachedChapters: false,
      hasMangaData: false,
    };

    const hasTrustedRoutePreview =
      typeof previewId === 'string' &&
      previewId === id &&
      Boolean(title || imageUrl);

    if (hasTrustedRoutePreview) {
      setFetchedDetails({
        id,
        title: title as string,
        bannerImage: imageUrl as string,
        chapters: [],
        description: '',
        status: '',
        author: [],
        genres: [],
        published: '',
        rating: '',
        reviewCount: '',
        alternativeTitle: '',
      });
      setDisplayMangaId(id);
      setIsLoading(false);
      hasInstantContentRef.current = true;
      return;
    }

    setIsLoading(true);
    // Only reset when the manga id changes — title/imageUrl param churn was
    // restarting loads and re-crawling every /chapters page.
  }, [id, previewId]);

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
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
  const chapterPaginationRef = useRef({
    chapters: [] as Chapter[],
    nextPage: 2,
    hasMore: false,
    lastPage: undefined as number | undefined,
  });

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

  // Handle sending user back up/down
  const flashListRef = useRef<FlashListRef<Chapter> | null>(null);
  const lastScrollY = useRef(0);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [scrollDirection, setScrollDirection] = useState<'up' | 'down'>('down');
  const [showScrollButton, setShowScrollButton] = useState(false);
  const [hasJumpedToLatestRead, setHasJumpedToLatestRead] = useState(false);

  // Animated value for the scroll button opacity
  const scrollButtonOpacity = useSharedValue(0);

  // Theming Settings
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme =
    theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);

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

  // Stable refs for the detail-load effect — avoid restarting 40+ chapter page fetches
  // when callback identities change mid-request.
  const applyMangaDetailsForIdRef = useRef(applyMangaDetailsForId);
  const refreshDownloadedChaptersRef = useRef(refreshDownloadedChapters);
  const refreshDownloadingChaptersRef = useRef(refreshDownloadingChapters);
  const routerRef = useRef(router);
  const routeTitleRef = useRef(title);
  const routeImageUrlRef = useRef(imageUrl);

  applyMangaDetailsForIdRef.current = applyMangaDetailsForId;
  refreshDownloadedChaptersRef.current = refreshDownloadedChapters;
  refreshDownloadingChaptersRef.current = refreshDownloadingChapters;
  routerRef.current = router;
  routeTitleRef.current = title;
  routeImageUrlRef.current = imageUrl;

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
        const hydration = await hydrateMangaFromLocal(id);
        if (
          cancelled ||
          loadGeneration !== loadGenerationRef.current ||
          typeof id !== 'string'
        ) {
          return;
        }

        hydratedStateRef.current = {
          hasCachedChapters: hydration.hasCachedChapters,
          hasMangaData: !!hydration.mangaData,
        };

        if (hydration.details) {
          applyMangaDetailsForIdRef.current(id, hydration.details);
          hasInstantContentRef.current = true;
          setIsLoading(false);
        }

        const progress = consolidateBookmarkProgress(hydration.mangaData);
        setReadChapters(progress.readChapters);
        setBookmarkStatus(progress.bookmarkStatus);
        if (progress.lastReadChapter) {
          setLastReadChapter(progress.lastReadChapter);
        }
      } catch (hydrationError) {
        logger().warn('Storage', 'Failed to hydrate manga from local cache', {
          error: hydrationError,
          mangaId: id,
        });
      }
    };

    hydrateFromLocal();

    return () => {
      cancelled = true;
    };
  }, [id]);

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

      const fetchDetailsForScreen = (mangaId: string) =>
        fetchMangaDetails(mangaId, {
          // First page only — never crawl all 40+ chapter pages on open.
          maxChapterPages: 1,
          shouldCancel: shouldCancelFetch,
          onPartial: (partial) => {
            if (shouldCancelFetch()) {
              return;
            }
            applyMangaDetailsForIdRef.current(mangaId, partial);
            setIsLoading(false);
          },
          onChapterPagination: (meta) => {
            if (shouldCancelFetch()) {
              return;
            }
            setHasMoreChapters(meta.hasMore);
            setNextChapterPage(meta.page + 1);
            if (typeof meta.lastPage === 'number') {
              setLastChapterPage(meta.lastPage);
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
            chapterPaginationRef.current = {
              ...chapterPaginationRef.current,
              nextPage: meta.page + 1,
              hasMore: meta.hasMore,
              lastPage:
                typeof meta.lastPage === 'number'
                  ? meta.lastPage
                  : chapterPaginationRef.current.lastPage,
            };
          },
        });

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
          if (
            shouldSkipBackgroundNetworkRefresh(cachedBeforeRefresh?.cachedAt)
          ) {
            return;
          }

          const freshDetails = await fetchDetailsForScreen(mangaId);
          if (shouldCancelFetch() || typeof id !== 'string') {
            return;
          }

          applyMangaDetailsForIdRef.current(mangaId, freshDetails);
          // Intentionally skip offline cache here — this path only loads page 1.
        } catch (backgroundError) {
          if (isRateLimitError(backgroundError)) {
            log.warn('Service', 'Background refresh rate limited — using cached data', {
              mangaId,
            });
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

        if (!hadInstantContent) {
          try {
            const hydration = await hydrateMangaFromLocal(mangaId);
            if (shouldCancelFetch()) {
              return;
            }

            hydratedStateRef.current = {
              hasCachedChapters: hydration.hasCachedChapters,
              hasMangaData: !!hydration.mangaData,
            };

            if (hydration.details) {
              applyMangaDetailsForIdRef.current(mangaId, hydration.details);
              hadInstantContent = true;
              hasInstantContentRef.current = true;
              setIsLoading(false);

              const progress = consolidateBookmarkProgress(hydration.mangaData);
              setReadChapters(progress.readChapters);
              setBookmarkStatus(progress.bookmarkStatus);
              if (progress.lastReadChapter) {
                setLastReadChapter(progress.lastReadChapter);
              }
            }
          } catch (hydrationError) {
            log.warn('Storage', 'Failed to hydrate manga before network fetch', {
              error: hydrationError,
              mangaId,
            });
          }
        }

        const loadPlan = planMangaDetailLoad({
          mangaId: id,
          hasInstantContent: hadInstantContent,
          hasCachedChapters: hydratedStateRef.current.hasCachedChapters,
          isOffline: isOfflineNow,
          hasRouteParams: Boolean(routeTitleRef.current || routeImageUrlRef.current),
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
                  await chapterStorageService.getDownloadedChapters(
                    id as string
                  );
                const filteredChapters =
                  cachedDetails.chapters?.filter((chapter) =>
                    downloadedChapterList.includes(chapter.number)
                  ) || [];

                if (!shouldCancelFetch()) {
                  applyMangaDetailsForIdRef.current(mangaId, {
                    ...cachedDetails,
                    chapters: filteredChapters,
                  });
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
                }
                // Skip offline cache — page-1 preview must not replace a full chapter list.
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
            const cachedDetails =
              await offlineCacheService.getCachedMangaDetails(id as string);
            if (cachedDetails && !shouldCancelFetch()) {
              applyMangaDetailsForIdRef.current(mangaId, cachedDetails);
              setIsLoading(false);
              const cachedPagination = resolveCachedChapterPagination(
                cachedDetails
              );
              setHasMoreChapters(cachedPagination.hasMore);
              setNextChapterPage(cachedPagination.nextPage);
              if (typeof cachedPagination.lastPage === 'number') {
                setLastChapterPage(cachedPagination.lastPage);
              }
              void refreshDetailsInBackground();
            } else {
              await measurePhase(
                MANGA_DETAIL_LOAD_PHASES.NETWORK_DETAILS,
                async () => {
                  const details = await fetchDetailsForScreen(mangaId);
                  if (!shouldCancelFetch()) {
                    applyMangaDetailsForIdRef.current(mangaId, details);
                  }
                  // Skip offline cache for page-1 preview.
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
            const recovered =
              hadInstantContent || (await applyCachedFallback());
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

          log.error('Service', 'Error fetching data', { error });
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
        String(chapterNumber ?? '').trim().replace(/\s+/g, '') || String(chapterNumber);
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

  /** Load every remaining chapter page so end-of-list actions use the real first chapter. */
  const ensureAllChaptersLoaded = useCallback(async (): Promise<boolean> => {
    if (typeof id !== 'string' || isOffline) {
      return !chapterPaginationRef.current.hasMore;
    }

    // Wait out an in-flight single-page load (common when FAB is pressed near list end).
    const waitStarted = Date.now();
    while (isLoadingMoreChaptersRef.current) {
      if (Date.now() - waitStarted > 30000) {
        break;
      }
      await new Promise((resolve) => setTimeout(resolve, 50));
    }

    if (!chapterPaginationRef.current.hasMore) {
      return true;
    }

    isLoadingMoreChaptersRef.current = true;
    setIsLoadingMoreChapters(true);

    try {
      const mangaId = id;
      const result = await loadRemainingChapterPages({
        currentChapters: chapterPaginationRef.current.chapters,
        nextPage: chapterPaginationRef.current.nextPage,
        hasMore: chapterPaginationRef.current.hasMore,
        fetchPage: (page) => fetchMappedTitleChaptersPage(mangaId, page),
        onPage: ({ chapters, nextPage, hasMore }) => {
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

      return !result.hasMore;
    } catch (error) {
      logger().warn('Service', 'Failed to load all chapters', {
        mangaId: id,
        error,
      });
      return false;
    } finally {
      isLoadingMoreChaptersRef.current = false;
      setIsLoadingMoreChapters(false);
    }
  }, [id, isOffline]);

  const handleLastReadChapterPress = useCallback(async () => {
    if (!lastReadChapter || lastReadChapter === 'Not started') {
      if (
        !mangaDetails?.chapters?.length ||
        typeof id !== 'string'
      ) {
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

  const totalChapterCount = useMemo(
    () => getReportedChapterCount(mangaDetails),
    [mangaDetails]
  );

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

  const handleScrollJS = useCallback(
    (offsetY: number, contentHeight: number, layoutHeight: number) => {
      // Calculate progress
      const maxScroll = contentHeight - layoutHeight;
      const progress =
        maxScroll > 0 ? Math.min(Math.max(offsetY / maxScroll, 0), 1) : 0;
      setScrollProgress(progress);

      // Determine scroll direction
      const isScrollingDown = offsetY > lastScrollY.current;
      const isScrollingUp = offsetY < lastScrollY.current;

      if (Math.abs(offsetY - lastScrollY.current) > 5) {
        if (isScrollingDown) setScrollDirection('down');
        if (isScrollingUp) setScrollDirection('up');
      }

      lastScrollY.current = offsetY;

      // Show button if not at the very top
      const show = offsetY > 100;
      setShowScrollButton(show);
    },
    []
  );

  const { scrollHandler } = useParallaxScroll((event) => {
    'worklet';
    runOnJS(handleScrollJS)(
      event.contentOffset.y,
      event.contentSize.height,
      event.layoutMeasurement.height
    );
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
    scrollDirection === 'down' && scrollProgress < 0.95;

  useEffect(() => {
    setHasJumpedToLatestRead(false);
  }, [id, lastReadChapter]);

  const handleSmartScrollPress = useCallback(() => {
    haptics.onSelection();

    if (!shouldUseDownAction) {
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
    shouldUseDownAction,
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
              {mangaDetails.alternativeTitle && (
                <Text
                  style={styles.alternativeTitle}
                  numberOfLines={2}
                  ellipsizeMode="tail"
                >
                  {mangaDetails.alternativeTitle}
                </Text>
              )}
              <View style={styles.statusContainer}>
                <Text
                  style={styles.statusText}
                  accessibilityLabel={`Publication status: ${mangaDetails.status}`}
                >
                  {mangaDetails.status}
                </Text>
              </View>
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
                    {readChapters.length}/{totalChapterCount}{' '}
                    chapters read
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
            </View>
          </View>
          <View style={styles.chaptersContainer}>
            <Text style={styles.sectionTitle}>Chapters</Text>
            <BatchDownloadBar
              mangaId={id as string}
              mangaTitle={mangaDetails.title}
              chapters={mangaDetails.chapters}
              downloadedChapters={downloadedChapters}
              onDownloadsChanged={refreshDownloadedChapters}
            />
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
    ]
  );

  // If we have absolutely no data (no params, no cache, no fetch yet), show a minimal loader or nothing
  if ((isLoading && !mangaDetails) || migrationProgress) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        {migrationProgress ? (
          <View style={styles.migrationStatusContainer}>
            <Text style={styles.migrationStatusTitle}>
              {migrationProgress.title}
            </Text>
            <Text style={styles.migrationStatusMessage}>
              {migrationProgress.message}
            </Text>
          </View>
        ) : null}
      </View>
    );
  }

  return (
    <Reanimated.View
      key={typeof id === 'string' ? id : 'manga-detail'}
      entering={FadeIn.duration(300)}
      style={styles.container}
    >
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
            <View style={{ flex: 1 }}>
              {/* Skeleton background layer - visible through blank FlashList cells during fast scroll */}
              <View
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  bottom: 0,
                  backgroundColor: colors.card,
                }}
              >
                <ChapterListSkeleton count={20} />
              </View>

              <AnimatedFlashList
                key={typeof id === 'string' ? `chapters-${id}` : 'chapters'}
                ref={flashListRef}
                drawDistance={2000}
                estimatedItemSize={65}
                overrideItemLayout={(layout: any) => {
                  layout.size = 65;
                }}
                getItemType={() => 'chapter'}
                ListHeaderComponent={ListHeader}
                data={mangaDetails.chapters}
                extraData={[
                  readChapters,
                  lastReadChapter,
                  downloadedChapters,
                  downloadingChapters,
                ]}
                keyExtractor={(item: any, index: number) =>
                  `chapter-${item.number}-${index}`
                }
                renderItem={
                  mangaDetails.chapters.length === 0
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
                      <ActivityIndicator
                        size="small"
                        color={colors.primary}
                      />
                    ) : null}
                  </View>
                }
                onEndReached={loadMoreChapters}
                onEndReachedThreshold={0.6}
                onScroll={scrollHandler}
                scrollEventThrottle={16}
                bounces={false}
                overScrollMode="never"
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
                            r="20"
                            stroke={colors.text}
                            strokeWidth="3"
                            strokeOpacity={0.1}
                            fill="transparent"
                          />
                          <Circle
                            cx="22"
                            cy="22"
                            r="20"
                            stroke={colors.primary}
                            strokeWidth="3"
                            fill="transparent"
                            strokeDasharray={2 * Math.PI * 20}
                            strokeDashoffset={
                              2 * Math.PI * 20 * (1 - scrollProgress)
                            }
                            strokeLinecap="round"
                            rotation="-90"
                            origin="22, 22"
                          />
                        </Svg>
                      </View>

                      <Ionicons
                        name={
                          scrollDirection === 'down' && scrollProgress < 0.95
                            ? 'arrow-down'
                            : 'arrow-up'
                        }
                        size={20}
                        color={colors.text}
                        style={styles.fabIcon}
                      />
                    </>
                  )}
                </BlurView>
              </TouchableOpacity>
            </Reanimated.View>
          </View>
        </>
      )}
    </Reanimated.View>
  );
}
