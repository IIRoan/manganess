import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
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
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  FadeIn,
  interpolate,
  Extrapolation,
  runOnJS,
} from 'react-native-reanimated';
import type Swipeable from 'react-native-gesture-handler/Swipeable';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/constants/ThemeContext';
import { Colors, type ColorScheme } from '@/constants/Colors';
import ExpandableText from '@/components/ExpandableText';
import AlertComponent from '@/components/Alert';
import SwipeableChapterItem from '@/components/SwipeChapterItem';
import BottomPopup from '@/components/BottomPopup';

import { FlashList } from '@shopify/flash-list';
import type { FlashListRef } from '@shopify/flash-list';
import { fetchMangaDetails } from '@/services/mangaFireService';
import {
  fetchBookmarkStatus,
  saveBookmark,
  removeBookmark,
  getBookmarkPopupConfig,
  getChapterLongPressAlertConfig,
} from '@/services/bookmarkService';
import BackButton from '@/components/BackButton';
import { GenreTag } from '@/components/GanreTag';
import {
  getLastReadChapter,
  getReadChapters,
  markChapterAsUnread,
} from '@/services/readChapterService';
import { chapterStorageService } from '@/services/chapterStorageService';
import { useFocusEffect } from '@react-navigation/native';
import LastReadChapterBar from '@/components/LastReadChapterBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useHapticFeedback } from '@/utils/haptics';
import { useToast } from '@/contexts/ToastContext';
import getStyles from './[id].styles';
import { logger } from '@/utils/logger';
import { useMangaImageCache } from '@/services/CacheImages';
import { useOffline } from '@/contexts/OfflineContext';
import { offlineCacheService } from '@/services/offlineCacheService';
import type {
  AlertConfig,
  Option,
  MangaDetails,
  BookmarkStatus,
  Chapter,
} from '@/types';
import BatchDownloadBar from '@/components/BatchDownloadBar';
import { downloadManagerService } from '@/services/downloadManager';
import { downloadStatusService } from '@/services/downloadStatusService';
import { downloadEventEmitter } from '@/utils/downloadEventEmitter';
import { DownloadStatus } from '@/types/download';
import { useParallaxScroll } from '@/components/ParallaxLayout';

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
      source={{ uri: displayUri }}
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
  const { id, title, imageUrl } = useLocalSearchParams();
  const [fetchedDetails, setFetchedDetails] = useState<MangaDetails | null>(
    null
  );

  // Derived state to ensure we always show the correct data for the current ID
  const mangaDetails = useMemo(() => {
    // If we have fetched details and they match the current ID, use them
    if (fetchedDetails && fetchedDetails.id === id) {
      return fetchedDetails;
    }

    // Otherwise, fallback to params if available (Partial Load)
    if (title || imageUrl) {
      return {
        id: id as string,
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
      } as MangaDetails;
    }

    return null;
  }, [id, title, imageUrl, fetchedDetails]);

  const [isLoading, setIsLoading] = useState(!mangaDetails);
  const [error, setError] = useState<string | null>(null);
  const [readChapters, setReadChapters] = useState<string[]>([]);
  const [bookmarkStatus, setBookmarkStatus] = useState<string | null>(null);
  const [currentlyOpenSwipeable, setCurrentlyOpenSwipeable] =
    useState<Swipeable | null>(null);
  const [downloadedChapters, setDownloadedChapters] = useState<string[]>([]);
  const [downloadingChapters, setDownloadingChapters] = useState<string[]>([]);
  const downloadedChaptersRef = useRef<string[]>([]);

  // State for the general alert (e.g., marking chapters as unread)
  const [isAlertVisible, setIsAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);

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

  // Toast notifications
  const { showToast } = useToast();

  // Last chapter
  const [lastReadChapter, setLastReadChapter] = useState<string | null>(null);

  // Offline state
  const { isOffline } = useOffline();

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

  useEffect(() => {
    downloadedChaptersRef.current = downloadedChapters;
  }, [downloadedChapters]);

  useFocusEffect(
    useCallback(() => {
      let isMounted = true;
      const log = logger();
      const fetchData = async () => {
        if (typeof id === 'string') {
          setIsLoading(true);
          setError(null);
          try {
            await log.measureAsync(
              `UI:MangaDetail:initialLoad:${id as string}`,
              'UI',
              async () => {
                await Promise.all([
                  log.measureAsync(
                    `Service:fetchMangaDetails:${id as string}`,
                    'Service',
                    async () => {
                      // If offline, try to load cached manga details
                      if (isOffline) {
                        const cachedDetails =
                          await offlineCacheService.getCachedMangaDetails(
                            id as string
                          );
                        if (cachedDetails) {
                          // Filter chapters to only show downloaded ones when offline
                          const downloadedChapters =
                            await chapterStorageService.getDownloadedChapters(
                              id as string
                            );
                          const filteredChapters =
                            cachedDetails.chapters?.filter((chapter) =>
                              downloadedChapters.includes(chapter.number)
                            ) || [];

                          if (isMounted) {
                            setFetchedDetails({
                              ...cachedDetails,
                              id: id as string,
                              chapters: filteredChapters,
                            });
                          }
                          log.info(
                            'Service',
                            'Loaded cached manga details for offline mode',
                            {
                              mangaId: id,
                              availableChapters: filteredChapters.length,
                            }
                          );
                          return;
                        } else {
                          throw new Error(
                            'No cached manga details available for offline viewing'
                          );
                        }
                      }

                      // Try to get cached details first for faster loading
                      const cachedDetails =
                        await offlineCacheService.getCachedMangaDetails(
                          id as string
                        );
                      if (cachedDetails) {
                        if (isMounted) {
                          setFetchedDetails({
                            ...cachedDetails,
                            id: id as string,
                          });
                          // Show content immediately if we have cached data
                          setIsLoading(false);
                        }

                        log.info('Service', 'Loaded cached manga details', {
                          mangaId: id,
                        });

                        // Still fetch fresh data in background and update cache
                        try {
                          const freshDetails = await fetchMangaDetails(
                            id as string
                          );
                          if (isMounted) {
                            setFetchedDetails({
                              ...freshDetails,
                              id: id as string,
                            });
                          }
                          await offlineCacheService.cacheMangaDetails(
                            id as string,
                            { ...freshDetails, id: id as string },
                            cachedDetails.isBookmarked
                          );
                        } catch (backgroundError) {
                          log.warn(
                            'Service',
                            'Failed to fetch fresh manga details, using cached',
                            { error: backgroundError }
                          );
                        }
                      } else {
                        const details = await fetchMangaDetails(id as string);
                        if (isMounted) {
                          setFetchedDetails({ ...details, id: id as string });
                        }

                        // Cache the details for offline use
                        await offlineCacheService.cacheMangaDetails(
                          id as string,
                          { ...details, id: id as string }
                        );
                      }
                    }
                  ),
                  log.measureAsync(
                    `Storage:getReadChapters:${id as string}`,
                    'Storage',
                    async () => {
                      const chapters = await getReadChapters(id as string);
                      if (isMounted) {
                        setReadChapters(chapters);
                      }
                    }
                  ),
                  log.measureAsync(
                    `Service:fetchBookmarkStatus:${id as string}`,
                    'Service',
                    async () => {
                      const status = await fetchBookmarkStatus(id as string);
                      if (isMounted) {
                        setBookmarkStatus(status);
                      }
                    }
                  ),
                  log.measureAsync(
                    `Storage:getLastReadChapter:${id as string}`,
                    'Storage',
                    async () => {
                      const lastChapter = await getLastReadChapter(
                        id as string
                      );
                      if (isMounted) {
                        setLastReadChapter(lastChapter);
                      }
                    }
                  ),
                ]);
              }
            );
            if (isMounted) {
              await refreshDownloadedChapters();
              await refreshDownloadingChapters();
            }
          } catch (error) {
            logger().error('Service', 'Error fetching data', { error });
            if (isMounted) {
              setError('Failed to load manga details. Please try again.');
            }
          } finally {
            if (isMounted) {
              setIsLoading(false);
            }
          }
        }
      };

      fetchData();

      return () => {
        isMounted = false;
      };
    }, [id, refreshDownloadedChapters, refreshDownloadingChapters, isOffline])
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
        const statusIcons: Record<BookmarkStatus, 'book-outline' | 'book' | 'pause-circle-outline' | 'checkmark-circle-outline'> = {
          'To Read': 'book-outline',
          'Reading': 'book',
          'On Hold': 'pause-circle-outline',
          'Read': 'checkmark-circle-outline',
        };
        const shortTitle = mangaDetails.title.length > 20
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

        // Emit download deleted event
        downloadEventEmitter.emitDeleted(
          id as string,
          chapterNumber,
          `${id as string}_${chapterNumber}`
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
      haptics.onSelection();
      router.navigate(`/manga/${id}/chapter/${chapterNumber}`);
    },
    [haptics, router, id]
  );

  const handleLastReadChapterPress = useCallback(() => {
    if (!lastReadChapter || lastReadChapter === 'Not started') {
      if (
        mangaDetails &&
        mangaDetails.chapters &&
        mangaDetails.chapters.length > 0
      ) {
        const firstChapter =
          mangaDetails.chapters[mangaDetails.chapters.length - 1];
        if (firstChapter) {
          handleChapterPress(firstChapter.number);
        }
      }
    } else {
      const chapterNumber = lastReadChapter.replace('Chapter ', '');
      handleChapterPress(chapterNumber);
    }
  }, [lastReadChapter, mangaDetails, handleChapterPress]);

  const readingProgress = useMemo(() => {
    if (
      !mangaDetails ||
      !mangaDetails.chapters ||
      mangaDetails.chapters.length === 0
    ) {
      return 0;
    }
    return Math.round(
      (readChapters.length / mangaDetails.chapters.length) * 100
    );
  }, [mangaDetails, readChapters.length]);

  const remainingReadingTime = useMemo(() => {
    if (!mangaDetails || !mangaDetails.chapters) return 0;
    const averageTimePerChapter = 7;
    const unreadChapters = mangaDetails.chapters.length - readChapters.length;
    return unreadChapters * averageTimePerChapter;
  }, [mangaDetails, readChapters.length]);

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
    scrollButtonOpacity.value = withTiming(showScrollButton ? 1 : 0, {
      duration: 200,
    });
  }, [showScrollButton, scrollButtonOpacity]);

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

  const renderChapterItem = useCallback(
    ({ item: chapter, index }: { item: Chapter; index: number }) => {
      if (!mangaDetails) return null;

      const isRead = readChapters.includes(chapter.number);
      const isLastItem = index === mangaDetails.chapters.length - 1;
      const isCurrentlyLastRead =
        lastReadChapter === `Chapter ${chapter.number}`;

      return (
        <SwipeableChapterItem
          chapter={chapter}
          isRead={isRead}
          isLastItem={isLastItem}
          isCurrentlyLastRead={isCurrentlyLastRead}
          onPress={() => handleChapterPress(chapter.number)}
          onLongPress={() => handleChapterLongPress(chapter.number)}
          onUnread={() => handleMarkAsUnread(chapter.number)}
          colors={colors}
          styles={styles}
          currentlyOpenSwipeable={currentlyOpenSwipeable}
          setCurrentlyOpenSwipeable={setCurrentlyOpenSwipeable}
          mangaId={id as string}
          showDownloadButton={true}
          onDownloadStart={() => {
            setDownloadingChapters((prev) =>
              prev.includes(chapter.number) ? prev : [...prev, chapter.number]
            );
            refreshDownloadingChapters().catch(() => {});
          }}
          onDownloadComplete={() => {
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
      readChapters,
      lastReadChapter,
      handleChapterPress,
      handleChapterLongPress,
      handleMarkAsUnread,
      colors,
      styles,
      currentlyOpenSwipeable,
      setCurrentlyOpenSwipeable,
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
                    {readChapters.length}/{mangaDetails.chapters.length}{' '}
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
      downloadedChapters,
      refreshDownloadedChapters,
      colors,
      styles,
      handleLastReadChapterPress,
      isOffline,
    ]
  );

  // If we have absolutely no data (no params, no cache, no fetch yet), show a minimal loader or nothing
  if (isLoading && !mangaDetails) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  return (
    <Reanimated.View entering={FadeIn.duration(300)} style={styles.container}>
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
            <AnimatedFlashList
              ref={flashListRef}
              removeClippedSubviews={true}
              drawDistance={100}
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
              renderItem={renderChapterItem}
              ListFooterComponent={<View style={{ height: 120, backgroundColor: colors.card }} />}
              onScroll={scrollHandler}
              scrollEventThrottle={16}
              bounces={false}
              overScrollMode="never"
            />

            {/* Smart Scroll FAB */}
            <Reanimated.View
              style={[
                styles.smartScrollButton,
                {
                  bottom: insets.bottom + 90,
                },
                scrollButtonStyle,
              ]}
              pointerEvents={showScrollButton ? 'auto' : 'none'}
            >
              <TouchableOpacity
                onPress={() => {
                  haptics.onSelection();
                  if (scrollDirection === 'down' && scrollProgress < 0.95) {
                    flashListRef.current?.scrollToEnd({ animated: true });
                  } else {
                    flashListRef.current?.scrollToOffset({
                      offset: 0,
                      animated: true,
                    });
                  }
                }}
                style={styles.smartScrollButtonTouchable}
                accessibilityRole="button"
                accessibilityLabel={
                  scrollDirection === 'down'
                    ? 'Scroll to bottom'
                    : 'Scroll to top'
                }
              >
                <BlurView
                  intensity={80}
                  tint={colorScheme === 'dark' ? 'dark' : 'light'}
                  style={styles.blurContainer}
                >
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
                </BlurView>
              </TouchableOpacity>
            </Reanimated.View>
          </View>
        </>
      )}
    </Reanimated.View>
  );
}
