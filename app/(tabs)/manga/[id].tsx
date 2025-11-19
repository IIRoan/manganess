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
  Image,
  useColorScheme,
  Animated,
  type NativeSyntheticEvent,
  type NativeScrollEvent,
} from 'react-native';
import { BlurView } from 'expo-blur';
import Svg, { Circle } from 'react-native-svg';
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
import getStyles from './[id].styles';
import { logger } from '@/utils/logger';
import { useMangaImageCache } from '@/services/CacheImages';
import { isDebugEnabled } from '@/constants/env';
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

/* Type Definitions */
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
  const log = logger();
  const imgStartRef = useRef<number | null>(null);
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
      onError={(error) =>
        logger().error('UI', 'Error loading banner image', { error })
      }
      onLoadStart={() => {
        if (isDebugEnabled()) {
          imgStartRef.current =
            (globalThis as any).performance?.now?.() ?? Date.now();
          log.debug('UI', 'Banner image load start', { mangaId });
        }
      }}
      onLoadEnd={() => {
        if (isDebugEnabled()) {
          const s =
            imgStartRef.current ??
            (globalThis as any).performance?.now?.() ??
            Date.now();
          const d =
            ((globalThis as any).performance?.now?.() ?? Date.now()) - s;
          log.info('UI', 'Banner image load complete', {
            mangaId,
            durationMs: Math.round(d),
          });
        }
      }}
    />
  );
};

export default function MangaDetailScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();

  // Bookmark/chapters handling
  const { id } = useLocalSearchParams();
  const [mangaDetails, setMangaDetails] = useState<MangaDetails | null>(null);
  const [isLoading, setIsLoading] = useState(true);
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
  const scrollButtonOpacity = useRef(new Animated.Value(0)).current;

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

                          setMangaDetails({
                            ...cachedDetails,
                            id: id as string,
                            chapters: filteredChapters,
                          });
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
                        setMangaDetails({
                          ...cachedDetails,
                          id: id as string,
                        });
                        log.info('Service', 'Loaded cached manga details', {
                          mangaId: id,
                        });

                        // Still fetch fresh data in background and update cache
                        try {
                          const freshDetails = await fetchMangaDetails(
                            id as string
                          );
                          setMangaDetails({
                            ...freshDetails,
                            id: id as string,
                          });
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
                        setMangaDetails({ ...details, id: id as string });

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
                      setReadChapters(chapters);
                    }
                  ),
                  log.measureAsync(
                    `Service:fetchBookmarkStatus:${id as string}`,
                    'Service',
                    async () => {
                      const status = await fetchBookmarkStatus(id as string);
                      setBookmarkStatus(status);
                    }
                  ),
                  log.measureAsync(
                    `Storage:getLastReadChapter:${id as string}`,
                    'Storage',
                    async () => {
                      const lastChapter = await getLastReadChapter(
                        id as string
                      );
                      setLastReadChapter(lastChapter);
                    }
                  ),
                ]);
              }
            );
            await refreshDownloadedChapters();
            await refreshDownloadingChapters();
          } catch (error) {
            logger().error('Service', 'Error fetching data', { error });
            setError('Failed to load manga details. Please try again.');
          } finally {
            setIsLoading(false);
          }
        }
      };

      fetchData();

      return () => {};
    }, [id, refreshDownloadedChapters, refreshDownloadingChapters, isOffline])
  );

  const handleSaveBookmark = useCallback(
    async (status: BookmarkStatus) => {
      if (!mangaDetails) return;
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
      } catch (error) {
        console.error('Error saving bookmark:', error);
      }
    },
    [id, mangaDetails, readChapters]
  );

  const handleRemoveBookmark = useCallback(async () => {
    try {
      await removeBookmark(
        id as string,
        setBookmarkStatus,
        setIsBookmarkPopupVisible
      );
    } catch (error) {
      console.error('Error removing bookmark:', error);
    }
  }, [id]);

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

  const handleChapterLongPress = (chapterNumber: string) => {
    haptics.onLongPress();

    const isRead = readChapters.includes(chapterNumber);
    const config = getChapterLongPressAlertConfig(
      isRead,
      chapterNumber,
      mangaDetails,
      id as string,
      readChapters,
      setReadChapters
    );
    if (config) {
      setAlertConfig(config);
      setIsAlertVisible(true);
    }
  };

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
      } catch (error) {
        console.error('Error marking chapter as unread:', error);
      }
    },
    [id, readChapters, currentlyOpenSwipeable]
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
      } catch (deleteError) {
        console.error('Error deleting downloaded chapter:', deleteError);
      }
    },
    [id, refreshDownloadedChapters]
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

  const calculateReadingProgress = () => {
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
  };

  const estimateRemainingReadingTime = () => {
    if (!mangaDetails || !mangaDetails.chapters) return 0;
    const averageTimePerChapter = 7;
    const unreadChapters = mangaDetails.chapters.length - readChapters.length;
    return unreadChapters * averageTimePerChapter;
  };

  const handleScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const { contentOffset, contentSize, layoutMeasurement } = event.nativeEvent;
      const offsetY = contentOffset.y;
      const contentHeight = contentSize.height;
      const layoutHeight = layoutMeasurement.height;

      // Calculate progress
      const maxScroll = contentHeight - layoutHeight;
      const progress = maxScroll > 0 ? Math.min(Math.max(offsetY / maxScroll, 0), 1) : 0;
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

  // Animate button opacity
  useEffect(() => {
    Animated.timing(scrollButtonOpacity, {
      toValue: showScrollButton ? 1 : 0,
      duration: 200,
      useNativeDriver: true,
    }).start();
  }, [showScrollButton, scrollButtonOpacity]);

  const readingProgress = calculateReadingProgress();
  const remainingReadingTime = estimateRemainingReadingTime();
  

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
              <Text
                style={styles.title}
                numberOfLines={3}
                ellipsizeMode="tail"
              >
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
      bookmarkStatus,
      readChapters,
      lastReadChapter,
      readingProgress,
      remainingReadingTime,
      downloadedChapters,
      refreshDownloadedChapters,
      colors,
      styles,
      handleBookmark,
      handleLastReadChapterPress,
      isOffline,
    ]
  );

  return (
    <View style={styles.container}>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            testID="loading-indicator"
            size="large"
            color={colors.primary}
          />
        </View>
      ) : error ? (
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
            <FlashList<Chapter>
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
              keyExtractor={(item, index) => `chapter-${item.number}-${index}`}
              renderItem={({ item: chapter, index }) => {
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
                        prev.includes(chapter.number)
                          ? prev
                          : [...prev, chapter.number]
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
              }}
              ListFooterComponent={<View style={{ height: 120 }} />}
              onScroll={handleScroll}
              scrollEventThrottle={16}
            />

            {/* Smart Scroll FAB */}
            <Animated.View
              style={[
                styles.smartScrollButton,
                {
                  opacity: scrollButtonOpacity,
                  bottom: insets.bottom + 90,
                  transform: [
                    {
                      scale: scrollButtonOpacity.interpolate({
                        inputRange: [0, 1],
                        outputRange: [0.8, 1],
                      }),
                    },
                  ],
                },
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
                accessibilityLabel={scrollDirection === 'down' ? "Scroll to bottom" : "Scroll to top"}
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
                        strokeDashoffset={2 * Math.PI * 20 * (1 - scrollProgress)}
                        strokeLinecap="round"
                        rotation="-90"
                        origin="22, 22"
                      />
                    </Svg>
                  </View>
                  
                  <Ionicons
                    name={scrollDirection === 'down' && scrollProgress < 0.95 ? "arrow-down" : "arrow-up"}
                    size={20}
                    color={colors.text}
                    style={styles.fabIcon}
                  />
                </BlurView>
              </TouchableOpacity>
            </Animated.View>
          </View>
        </>
      )}
    </View>
  );
}
