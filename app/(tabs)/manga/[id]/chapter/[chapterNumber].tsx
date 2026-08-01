import React, {
  useState,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useMemo,
} from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  BackHandler,
  useColorScheme,
  Animated,
  StatusBar,
  TouchableWithoutFeedback,
  Dimensions,
  GestureResponderEvent,
  FlatList,
  Modal,
  PanResponder,
  ViewToken,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useNavigationHistory } from '@/hooks/useNavigationHistory';
import {
  buildMangaImageSource,
  getMangaImageSize,
  MANGA_IMAGE_REQUEST_HEADERS,
} from '@/utils/mangaImageHeaders';

import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';

import { getMangaData } from '@/services/bookmarkService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  markChapterAsRead,
  fetchMangaDetails,
  normalizeChapterNumber,
  loadOnlineChapterImages,
} from '@/services/mangaFireService';
import {
  resolveHasNextChapter,
  resolveHasPreviousChapter,
} from '@/utils/chapterNavigation';
import { mergeMangaDetailsRefresh } from '@/utils/mangaDetailsMerge';
import {
  horizontalPageIndexFromOffset,
  horizontalScrollIndexForPage,
} from '@/utils/readerPageIndex';
import {
  computeManhwaScrollProgress,
  DEFAULT_MANHWA_PAGE_HEIGHT,
} from '@/utils/manhwaScrollProgress';
import type { MangaDetails as MangaDetailsType } from '@/types';
import { chapterStorageService } from '@/services/chapterStorageService';
import { offlineCacheService } from '@/services/offlineCacheService';
import { ChapterImage } from '@/types/download';
import { useTheme } from '@/hooks/useTheme';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useOffline } from '@/hooks/useOffline';
import {
  ChapterGuideOverlay,
  hasSeenChapterGuide,
} from '@/components/ChapterGuideOverlay';
import getStyles from './[chapterNumber].styles';
import { logger } from '@/utils/logger';
import {
  isVerticalOnlyContentType,
  normalizeContentTypeLabel,
  resolveEffectiveReaderLayout,
  resolveReaderContentProfile,
} from '@/utils/contentType';
import { isDebugEnabled } from '@/constants/env';
import {
  getReaderProfile,
  patchReaderProfile,
  getShowReaderSettingsButton,
} from '@/services/settingsService';
import type {
  ReadingMode,
  ReaderBackground,
  ReaderImageFit,
  ProgressBarPosition,
  ReaderContentProfile,
} from '@/types/settings';
import ReaderSettingsSheet from '@/components/ReaderSettingsSheet';
import ReaderRetryImage, {
  ReaderImageStatus,
  ReaderImageStatusHandler,
} from '@/components/ReaderRetryImage';
import {
  getChapterLoadErrorInfo,
  type ChapterLoadErrorInfo,
} from '@/utils/chapterLoadError';
import {
  hydrateMangaFromLocal,
} from '@/utils/mangaOptimisticLoad';

// Minimum touch target size (in dp)
const MIN_TOUCHABLE_SIZE = 48;

// Helper function to ensure touchable size
const ensureMinimumSize = (size: number) => {
  return Math.max(size, MIN_TOUCHABLE_SIZE);
};

/** Image sizing for a single page viewport. */
function computePageImageSize(
  naturalWidth: number,
  naturalHeight: number,
  fit: ReaderImageFit,
  screenWidth: number,
  screenHeight: number
): { width: number; height: number; contentFit: 'contain' | 'cover' } {
  const aspect = naturalWidth / Math.max(naturalHeight, 1);

  switch (fit) {
    case 'width': {
      const width = screenWidth;
      return { width, height: width / aspect, contentFit: 'contain' };
    }
    case 'height': {
      const height = screenHeight;
      return { width: height * aspect, height, contentFit: 'contain' };
    }
    case 'fill': {
      const scale = Math.max(
        screenWidth / naturalWidth,
        screenHeight / naturalHeight
      );
      return {
        width: naturalWidth * scale,
        height: naturalHeight * scale,
        contentFit: 'cover',
      };
    }
    case 'both':
    default: {
      const scale = Math.min(
        screenWidth / naturalWidth,
        screenHeight / naturalHeight
      );
      return {
        width: naturalWidth * scale,
        height: naturalHeight * scale,
        contentFit: 'contain',
      };
    }
  }
}

// Component for manhwa images with proper aspect ratio (moved outside to prevent re-creation)
const ManhwaImage = React.memo(
  ({
    image,
    pageIndex,
    onPress,
    colorScheme,
    isOnline,
    imageFit = 'width',
    onStatusChange,
    onHeightChange,
    retryToken,
    shouldLoad = true,
  }: {
    image: ChapterImage;
    pageIndex: number;
    onPress: (event: GestureResponderEvent) => void;
    colorScheme: ColorScheme;
    isOnline?: boolean;
    imageFit?: ReaderImageFit;
    onStatusChange?: ReaderImageStatusHandler;
    /** Reports laid-out height so scroll % does not depend on FlatList contentSize. */
    onHeightChange?: (pageIndex: number, height: number) => void;
    retryToken?: number;
    /** Sequential gate: false = wait for earlier pages, touch nothing. */
    shouldLoad?: boolean;
  }) => {
    const [imageSize, setImageSize] = useState({
      width: Dimensions.get('window').width,
      height: DEFAULT_MANHWA_PAGE_HEIGHT,
    });
    const [isImageLoaded, setIsImageLoaded] = useState(false);
    const [resolvedLocalUri, setResolvedLocalUri] = useState<string | null>(
      null
    );
    const imageUri = image.localPath || image.originalUrl;
    const imageSource = buildMangaImageSource(imageUri);
    // Once the manual download fallback kicks in, measure the local file —
    // the remote URL is exactly the one that fails to load.
    const measureUri = resolvedLocalUri || imageUri;

    const handleStatusChange = useCallback(
      (pageNumber: number, status: ReaderImageStatus, localUri?: string) => {
        setIsImageLoaded(status !== 'loading');
        if (localUri) {
          setResolvedLocalUri(localUri);
        }
        onStatusChange?.(pageNumber, status);
      },
      [onStatusChange]
    );

    useEffect(() => {
      onHeightChange?.(pageIndex, imageSize.height);
    }, [pageIndex, imageSize.height, onHeightChange]);

    useEffect(() => {
      if (!shouldLoad) return;
      setIsImageLoaded(false);
      if (measureUri) {
        const { width: screenWidth, height: screenHeight } =
          Dimensions.get('window');
        getMangaImageSize(
          measureUri,
          (width, height) => {
            // Vertical strip: width fit is the default; height/both shrink tall panels.
            if (imageFit === 'height') {
              const sized = computePageImageSize(
                width,
                height,
                'height',
                screenWidth,
                screenHeight
              );
              setImageSize({ width: sized.width, height: sized.height });
            } else if (imageFit === 'both') {
              const sized = computePageImageSize(
                width,
                height,
                'both',
                screenWidth,
                screenHeight
              );
              setImageSize({ width: sized.width, height: sized.height });
            } else if (imageFit === 'fill') {
              setImageSize({
                width: screenWidth,
                height: screenWidth * (height / width),
              });
            } else {
              // Fit width — continuous strip
              setImageSize({
                width: screenWidth,
                height: screenWidth * (height / width),
              });
            }
          },
          (error) => {
            logger().warn('UI', 'Error getting image size', { error });
            setImageSize({
              width: Dimensions.get('window').width,
              height: DEFAULT_MANHWA_PAGE_HEIGHT,
            });
          }
        );
      }
    }, [measureUri, imageFit, shouldLoad]);

    if (!shouldLoad) {
      // Waiting for earlier pages: hold layout space, fire no requests.
      return (
        <View
          style={[
            getStyles(colorScheme).manhwaImageContainer,
            {
              height: imageSize.height,
              alignItems: 'center',
              justifyContent: 'center',
            },
          ]}
        >
          <ActivityIndicator
            size="small"
            color={Colors[colorScheme].primary}
          />
        </View>
      );
    }

    return (
      <TouchableWithoutFeedback onPress={onPress}>
        <View
          style={[
            getStyles(colorScheme).manhwaImageContainer,
            imageFit === 'both' || imageFit === 'height'
              ? { alignItems: 'center' }
              : null,
          ]}
        >
          {imageSource && (
            <ReaderRetryImage
              source={imageSource}
              style={[
                getStyles(colorScheme).manhwaImage,
                {
                  height: imageSize.height,
                  width: imageSize.width,
                },
              ]}
              contentFit={imageFit === 'fill' ? 'cover' : 'contain'}
              cachePolicy={isOnline ? 'memory-disk' : 'disk'}
              pageNumber={image.pageNumber}
              fallbackHeight={imageSize.height}
              colors={Colors[colorScheme]}
              retryToken={retryToken}
              onStatusChange={handleStatusChange}
            />
          )}
          {!isImageLoaded && (
            <View style={getStyles(colorScheme).manhwaImageLoader}>
              <ActivityIndicator
                size="small"
                color={Colors[colorScheme].primary}
              />
            </View>
          )}
        </View>
      </TouchableWithoutFeedback>
    );
  }
);

ManhwaImage.displayName = 'ManhwaImage';

/** Single-page manga image with fit modes. */
const MangaPageImage = React.memo(
  ({
    image,
    isOnline,
    imageFit,
    canvasColor,
    colorScheme,
    onStatusChange,
    retryToken,
  }: {
    image: ChapterImage;
    isOnline?: boolean;
    imageFit: ReaderImageFit;
    canvasColor: string;
    colorScheme: ColorScheme;
    onStatusChange?: ReaderImageStatusHandler;
    retryToken?: number;
  }) => {
    const { width: screenWidth, height: screenHeight } =
      Dimensions.get('window');
    const [layout, setLayout] = useState({
      width: screenWidth,
      height: screenHeight,
      contentFit: 'contain' as 'contain' | 'cover',
    });
    const [resolvedLocalUri, setResolvedLocalUri] = useState<string | null>(
      null
    );
    const imageUri = image.localPath || image.originalUrl;
    const imageSource = buildMangaImageSource(imageUri);
    const measureUri = resolvedLocalUri || imageUri;

    const handleStatusChange = useCallback(
      (pageNumber: number, status: ReaderImageStatus, localUri?: string) => {
        if (localUri) {
          setResolvedLocalUri(localUri);
        }
        onStatusChange?.(pageNumber, status);
      },
      [onStatusChange]
    );

    useEffect(() => {
      if (!measureUri) return;
      getMangaImageSize(
        measureUri,
        (width, height) => {
          setLayout(
            computePageImageSize(
              width,
              height,
              imageFit,
              screenWidth,
              screenHeight
            )
          );
        },
        () => {
          setLayout({
            width: screenWidth,
            height: screenHeight,
            contentFit: imageFit === 'fill' ? 'cover' : 'contain',
          });
        }
      );
    }, [measureUri, imageFit, screenWidth, screenHeight]);

    return (
      <View
        style={[
          {
            width: screenWidth,
            height: screenHeight,
            justifyContent: 'center',
            alignItems: 'center',
            overflow: 'hidden',
            backgroundColor: canvasColor,
          },
        ]}
      >
        {imageSource && (
          <ReaderRetryImage
            source={imageSource}
            style={{ width: layout.width, height: layout.height }}
            contentFit={layout.contentFit}
            cachePolicy={isOnline ? 'memory-disk' : 'disk'}
            pageNumber={image.pageNumber}
            fallbackHeight={layout.height}
            colors={Colors[colorScheme]}
            retryToken={retryToken}
            onStatusChange={handleStatusChange}
          />
        )}
      </View>
    );
  }
);

MangaPageImage.displayName = 'MangaPageImage';

export default function ReadChapterScreen() {
  const { id, chapterNumber } = useLocalSearchParams<{
    id: string;
    chapterNumber: string;
  }>();
  const router = useRouter();
  const { handleBackPress: navigateBack } = useNavigationHistory();
  const { isOffline } = useOffline();

  const [isLoadingImages, setIsLoadingImages] = useState(true);
  const [loadError, setLoadError] = useState<ChapterLoadErrorInfo | null>(
    null
  );
  const [mangaTitle, setMangaTitle] = useState<string | null>(null);
  const [mangaDetails, setMangaDetails] = useState<MangaDetailsType | null>(
    null
  );
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [guideStep, setGuideStep] = useState(1);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [isOnlineChapter, setIsOnlineChapter] = useState(false);
  const [downloadedImages, setDownloadedImages] = useState<
    ChapterImage[] | null
  >(null);
  const [contentType, setContentType] = useState<'manhwa' | 'manga' | null>(
    null
  );
  const [readingMode, setReadingMode] = useState<ReadingMode>('auto');
  const [readerBackground, setReaderBackground] =
    useState<ReaderBackground>('default');
  const [readerImageFit, setReaderImageFit] =
    useState<ReaderImageFit>('both');
  const [progressBarPosition, setProgressBarPosition] =
    useState<ProgressBarPosition>('none');
  const [readerDimPercent, setReaderDimPercent] = useState(0);
  const [keepHeaderVisible, setKeepHeaderVisible] = useState(false);
  const [showReaderSettingsButton, setShowReaderSettingsButton] =
    useState(true);
  const [isReaderSettingsVisible, setIsReaderSettingsVisible] = useState(false);
  const [currentPage, setCurrentPage] = useState(0);
  /** 0–1 scroll progress for vertical (manhwa) reading. */
  const [scrollProgress, setScrollProgress] = useState(0);
  const lastReportedScrollProgressRef = useRef(0);
  /** Measured row heights by FlatList index — used for stable scroll %. */
  const pageHeightsRef = useRef<Map<number, number>>(new Map());
  const manhwaScrollMetricsRef = useRef({
    offsetY: 0,
    viewportHeight: Dimensions.get('window').height,
  });
  const manhwaPageCountRef = useRef(0);
  const [failedPageCount, setFailedPageCount] = useState(0);
  const [isFailedBannerDismissed, setIsFailedBannerDismissed] = useState(false);
  const [retryAllToken, setRetryAllToken] = useState(0);
  const [loadRetryToken, setLoadRetryToken] = useState(0);
  /**
   * Sequential loading gate (vertical mode): page N+1 only starts loading
   * once page N is on screen, so a failed page never becomes an invisible gap.
   */
  const [allowedPage, setAllowedPage] = useState(1);

  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const bottomSheetRef = useRef<BottomSheet>(null);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mangaFlatListRef = useRef<FlatList>(null);
  const manhwaListRef = useRef<FlatList<ChapterImage>>(null);
  const downloadedImagesRef = useRef<ChapterImage[] | null>(null);
  const failedPagesRef = useRef<Set<number>>(new Set());
  const loadedPagesRef = useRef<Set<number>>(new Set());
  /** In-flight gate prefetches — survives FlatList row unmount/clipping. */
  const gatePrefetchInflightRef = useRef<Set<number>>(new Set());
  /** Bumped on chapter change so late prefetches cannot advance a new gate. */
  const gatePrefetchGenerationRef = useRef(0);
  /** Highest page number such that every page up to it has loaded. */
  const gateBoundaryRef = useRef(0);

  const navigationTimestampRef = useRef<number>(0);
  const lastNavigatedChapterRef = useRef<string>('');
  const chapterListSwipeTranslateY = useRef(new Animated.Value(0)).current;
  const chapterListOverlayOpacity = useRef(new Animated.Value(1)).current;

  const chapterListHeaderPanRef = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: (_, { dy }) => Math.abs(dy) > 10,
      onPanResponderMove: (_, { dy }) => {
        if (dy > 0) {
          chapterListSwipeTranslateY.setValue(dy);
          const opacity = Math.max(0, 1 - dy / 300);
          chapterListOverlayOpacity.setValue(opacity);
        }
      },
      onPanResponderRelease: (_, { dy, vy }) => {
        if (dy > 50 || vy > 0.5) {
          Animated.timing(chapterListSwipeTranslateY, {
            toValue: Dimensions.get('window').height,
            duration: 200,
            useNativeDriver: true,
          }).start(() => closeChapterList());
          Animated.timing(chapterListOverlayOpacity, {
            toValue: 0,
            duration: 200,
            useNativeDriver: true,
          }).start();
        } else {
          Animated.spring(chapterListSwipeTranslateY, {
            toValue: 0,
            useNativeDriver: true,
          }).start();
          Animated.spring(chapterListOverlayOpacity, {
            toValue: 1,
            useNativeDriver: true,
          }).start();
        }
      },
    })
  ).current;

  const { theme, accentColor } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme =
    theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const styles = getStyles(colorScheme);
  const insets = useSafeAreaInsets();

  const normalizedChapterParam = useMemo(
    () => normalizeChapterNumber(chapterNumber),
    [chapterNumber]
  );

  // Resolve the effective reader layout from the reading mode setting.
  // Manhwa / manhua / webtoon titles are always vertical — LTR/RTL never apply.
  // `auto` for unknown types falls back to aspect-ratio detection.
  // Tall manga pages must NOT steal the manhwa profile or hide LTR/RTL.
  const activeReaderProfile: ReaderContentProfile = useMemo(
    () =>
      resolveReaderContentProfile({
        titleType: mangaDetails?.type ?? null,
        detectedType: contentType,
      }),
    [mangaDetails?.type, contentType]
  );
  const isVerticalOnlyTitle = activeReaderProfile === 'manhwa';

  const effectiveLayout = useMemo<'vertical' | 'ltr' | 'rtl' | null>(
    () =>
      resolveEffectiveReaderLayout({
        readingMode,
        titleType: mangaDetails?.type ?? null,
        detectedType: contentType,
      }),
    [readingMode, mangaDetails?.type, contentType]
  );
  const isHorizontalLayout =
    effectiveLayout === 'ltr' || effectiveLayout === 'rtl';
  const isInvertedLayout = effectiveLayout === 'rtl';

  const supportsWorklets =
    typeof (Animated as any).useWorkletCallback === 'function';
  const currentChapterIndex = useMemo(() => {
    if (!mangaDetails?.chapters) {
      return -1;
    }

    return mangaDetails.chapters.findIndex(
      (chapter) =>
        normalizeChapterNumber(chapter.number) === normalizedChapterParam
    );
  }, [mangaDetails?.chapters, normalizedChapterParam]);

  const offlineChapterRenderKey = useMemo(() => {
    const chapterId = normalizedChapterParam || chapterNumber || 'unknown';
    return `offline-chapter-${id || 'unknown'}-${chapterId}`;
  }, [id, normalizedChapterParam, chapterNumber]);

  const hasNextChapter = resolveHasNextChapter({
    currentChapterIndex,
    chapterNumber: normalizedChapterParam || String(chapterNumber ?? ''),
    ...(mangaDetails?.chapters
      ? { chapters: mangaDetails.chapters }
      : {}),
    ...(typeof mangaDetails?.totalChapters === 'number'
      ? { totalChapters: mangaDetails.totalChapters }
      : {}),
  });

  const hasPreviousChapter = resolveHasPreviousChapter({
    currentChapterIndex,
    chapterNumber: normalizedChapterParam || String(chapterNumber ?? ''),
    ...(mangaDetails?.chapters
      ? { chapters: mangaDetails.chapters }
      : {}),
    ...(typeof mangaDetails?.totalChapters === 'number'
      ? { totalChapters: mangaDetails.totalChapters }
      : {}),
  });

  // Status bar management
  useFocusEffect(
    useCallback(() => {
      // Configure status bar when screen is focused
      StatusBar.setBarStyle(
        colorScheme === 'dark' ? 'light-content' : 'dark-content'
      );
      StatusBar.setTranslucent(true);
      StatusBar.setBackgroundColor('transparent');

      // Reset status bar when leaving this screen
      return () => {
        StatusBar.setHidden(false);
        StatusBar.setBarStyle(
          colorScheme === 'dark' ? 'light-content' : 'dark-content'
        );
        StatusBar.setTranslucent(true);
        StatusBar.setBackgroundColor('transparent');
      };
    }, [colorScheme])
  );

  // Update status bar based on controls visibility
  useEffect(() => {
    if (keepHeaderVisible || (showGuide && guideStep === 1)) {
      StatusBar.setHidden(false);
    } else {
      StatusBar.setHidden(!isControlsVisible);
    }
  }, [isControlsVisible, showGuide, guideStep, keepHeaderVisible]);

  const readerCanvasColor = useMemo(() => {
    switch (readerBackground) {
      case 'black':
        return '#000000';
      case 'white':
        return '#FFFFFF';
      case 'gray':
        return colorScheme === 'dark' ? '#2C2C2E' : '#8E8E93';
      default:
        return Colors[colorScheme].background;
    }
  }, [readerBackground, colorScheme]);

  const applyReaderProfile = useCallback(
    (profile: {
      readingMode: ReadingMode;
      readerBackground: ReaderBackground;
      readerImageFit: ReaderImageFit;
      progressBarPosition: ProgressBarPosition;
      readerDimPercent: number;
      keepHeaderVisible: boolean;
    }) => {
      setReadingMode(profile.readingMode);
      setReaderBackground(profile.readerBackground);
      setReaderImageFit(profile.readerImageFit);
      setProgressBarPosition(profile.progressBarPosition);
      setReaderDimPercent(profile.readerDimPercent);
      setKeepHeaderVisible(profile.keepHeaderVisible);
    },
    []
  );

  // Load reader settings for the active content type (manga vs manhwa).
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      (async () => {
        try {
          const [profile, showSettingsButton] = await Promise.all([
            getReaderProfile(activeReaderProfile),
            getShowReaderSettingsButton(),
          ]);
          if (!cancelled) {
            applyReaderProfile(profile);
            setShowReaderSettingsButton(showSettingsButton);
            if (!showSettingsButton) {
              setIsReaderSettingsVisible(false);
            }
          }
        } catch (error) {
          logger().error('Service', 'Error loading reader settings', { error });
        }
      })();
      return () => {
        cancelled = true;
      };
    }, [activeReaderProfile, applyReaderProfile])
  );

  // When content type resolves after open, swap to that profile's saved prefs.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const profile = await getReaderProfile(activeReaderProfile);
        if (!cancelled) {
          applyReaderProfile(profile);
        }
      } catch (error) {
        logger().error('Service', 'Error switching reader profile', {
          error,
          profile: activeReaderProfile,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [activeReaderProfile, applyReaderProfile]);

  const handleReadingModeChange = useCallback(
    async (mode: ReadingMode) => {
      // Manhwa never uses page modes — ignore LTR/RTL selections.
      if (isVerticalOnlyTitle && (mode === 'ltr' || mode === 'rtl')) {
        return;
      }
      setReadingMode(mode);
      setCurrentPage(0);
      try {
        await patchReaderProfile(activeReaderProfile, { readingMode: mode });
      } catch (error) {
        logger().error('Service', 'Error saving reading mode', { error });
      }
    },
    [isVerticalOnlyTitle, activeReaderProfile]
  );

  const handleReaderBackgroundChange = useCallback(
    async (background: ReaderBackground) => {
      setReaderBackground(background);
      try {
        await patchReaderProfile(activeReaderProfile, {
          readerBackground: background,
        });
      } catch (error) {
        logger().error('Service', 'Error saving reader background', { error });
      }
    },
    [activeReaderProfile]
  );

  const handleReaderImageFitChange = useCallback(
    async (fit: ReaderImageFit) => {
      setReaderImageFit(fit);
      try {
        await patchReaderProfile(activeReaderProfile, { readerImageFit: fit });
      } catch (error) {
        logger().error('Service', 'Error saving reader image fit', { error });
      }
    },
    [activeReaderProfile]
  );

  const handleProgressBarPositionChange = useCallback(
    async (position: ProgressBarPosition) => {
      setProgressBarPosition(position);
      try {
        await patchReaderProfile(activeReaderProfile, {
          progressBarPosition: position,
        });
      } catch (error) {
        logger().error('Service', 'Error saving progress bar position', {
          error,
        });
      }
    },
    [activeReaderProfile]
  );

  const handleReaderDimPercentChange = useCallback(
    async (percent: number) => {
      setReaderDimPercent(percent);
      try {
        await patchReaderProfile(activeReaderProfile, {
          readerDimPercent: percent,
        });
      } catch (error) {
        logger().error('Service', 'Error saving reader dim percent', { error });
      }
    },
    [activeReaderProfile]
  );

  const handleKeepHeaderVisibleChange = useCallback(
    async (keep: boolean) => {
      setKeepHeaderVisible(keep);
      if (keep) {
        setIsControlsVisible(true);
        if (controlsTimeout.current) {
          clearTimeout(controlsTimeout.current);
        }
        controlsOpacity.setValue(1);
      }
      try {
        await patchReaderProfile(activeReaderProfile, {
          keepHeaderVisible: keep,
        });
      } catch (error) {
        logger().error('Service', 'Error saving sticky header setting', {
          error,
        });
      }
    },
    [activeReaderProfile, controlsOpacity]
  );

  // Keep header visible when sticky mode is enabled (including on load)
  useEffect(() => {
    if (!keepHeaderVisible) return;
    setIsControlsVisible(true);
    controlsOpacity.setValue(1);
    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
    }
  }, [keepHeaderVisible, controlsOpacity]);

  const openReaderSettings = useCallback(() => {
    if (!showReaderSettingsButton) return;
    setIsReaderSettingsVisible(true);
    setIsControlsVisible(true);
    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
    }
  }, [showReaderSettingsButton]);

  // Check if the user has seen the guide before
  useEffect(() => {
    const checkGuideStatus = async () => {
      const hasSeen = await hasSeenChapterGuide();
      setShowGuide(!hasSeen);
      if (!hasSeen) {
        // Ensure controls are visible when guide is active
        setIsControlsVisible(true);
      }
    };
    checkGuideStatus();
  }, []);

  // Handle guide step changes
  const handleGuideStepChange = useCallback((step: number) => {
    setGuideStep(step);
    // For step 1, ensure controls are visible to demonstrate them
    if (step === 1) {
      setIsControlsVisible(true);
      // Clear any existing timeout
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
      }
    }
  }, []);

  const startControlsTimer = useCallback(() => {
    // Don't auto-hide controls during guide or sticky-header mode
    if (keepHeaderVisible || (showGuide && guideStep === 1)) return;

    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
    }
    controlsTimeout.current = setTimeout(() => {
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setIsControlsVisible(false));
    }, 3000);
  }, [controlsOpacity, showGuide, guideStep, keepHeaderVisible]);

  const hideNavControls = useCallback(() => {
    if (keepHeaderVisible) return;
    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
    }
    Animated.timing(controlsOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setIsControlsVisible(false));
  }, [controlsOpacity, keepHeaderVisible]);

  const showNavControls = useCallback(() => {
    setIsControlsVisible(true);
    Animated.timing(controlsOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    startControlsTimer();
  }, [controlsOpacity, startControlsTimer]);

  const showControls = useCallback(() => {
    if (isBottomSheetOpen) return;

    setIsControlsVisible(true);
    Animated.timing(controlsOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    startControlsTimer();
  }, [controlsOpacity, startControlsTimer, isBottomSheetOpen]);

  const hideControls = useCallback(() => {
    // Don't hide controls during the first step of the guide or sticky header
    if (keepHeaderVisible || (showGuide && guideStep === 1)) return;

    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
    }
    Animated.timing(controlsOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setIsControlsVisible(false));
  }, [controlsOpacity, showGuide, guideStep, keepHeaderVisible]);

  const handleBottomSheetChange = useCallback(
    (index: number) => {
      setIsBottomSheetOpen(index >= 0);
      if (index >= 0) {
        hideControls();
      } else {
        showControls();
      }
    },
    [hideControls, showControls]
  );

  const openChapterList = useCallback(() => {
    if (supportsWorklets) {
      bottomSheetRef.current?.expand();
      handleBottomSheetChange(1);
    } else {
      chapterListSwipeTranslateY.setValue(0);
      chapterListOverlayOpacity.setValue(1);
      setIsBottomSheetOpen(true);
      hideControls();
    }
  }, [
    supportsWorklets,
    hideControls,
    handleBottomSheetChange,
    chapterListSwipeTranslateY,
    chapterListOverlayOpacity,
  ]);

  const closeChapterList = useCallback(() => {
    if (supportsWorklets) {
      bottomSheetRef.current?.close();
      handleBottomSheetChange(-1);
    } else {
      setIsBottomSheetOpen(false);
      showControls();
    }
  }, [supportsWorklets, showControls, handleBottomSheetChange]);

  const toggleControls = useCallback(() => {
    // Don't toggle controls during the first step of the guide
    if (isBottomSheetOpen || (showGuide && guideStep === 1)) return;

    if (isControlsVisible) {
      hideControls();
    } else {
      showControls();
    }
  }, [
    isControlsVisible,
    hideControls,
    showControls,
    isBottomSheetOpen,
    showGuide,
    guideStep,
  ]);

  const markChapterAsReadWithFallback = useCallback(async () => {
    if (!id) {
      return;
    }

    const mangaId = id as string;
    const chapterToMark = normalizedChapterParam || chapterNumber;
    if (!chapterToMark) {
      return;
    }

    try {
      // Local title only — never hit the chapters API just to mark as read.
      const mangaData = await getMangaData(mangaId);
      let resolvedTitle = mangaData?.title;

      if (!resolvedTitle || resolvedTitle === 'Chapter') {
        const cachedDetails =
          await offlineCacheService.getCachedMangaDetails(mangaId);
        if (cachedDetails?.title) {
          resolvedTitle = cachedDetails.title;
        }
      }

      const titleToUse = resolvedTitle || 'Chapter';

      await markChapterAsRead(mangaId, chapterToMark, titleToUse);

      setMangaTitle((current) => current ?? titleToUse);
    } catch (error) {
      logger().error('Service', 'Error marking chapter as read', { error });
    }
  }, [id, chapterNumber, normalizedChapterParam]);

  // Hydrate manga metadata instantly from bookmark/cache before network
  useEffect(() => {
    if (!id) {
      return;
    }

    let cancelled = false;

    const hydrateMetadata = async () => {
      try {
        const hydration = await hydrateMangaFromLocal(id as string);
        if (cancelled) {
          return;
        }

        if (hydration.details) {
          setMangaDetails(hydration.details);
          setMangaTitle(hydration.details.title);
        }
      } catch (hydrationError) {
        logger().warn('Storage', 'Failed to hydrate chapter reader metadata', {
          error: hydrationError,
          mangaId: id,
        });
      }
    };

    hydrateMetadata();

    return () => {
      cancelled = true;
    };
  }, [id]);

  // Prefer provider title type over waiting on image aspect detection.
  useEffect(() => {
    if (isVerticalOnlyContentType(mangaDetails?.type)) {
      setContentType('manhwa');
    }
  }, [mangaDetails?.type]);

  // Detect content type based on image dimensions
  const detectContentType = useCallback((images: ChapterImage[]) => {
    // Title metadata already established this as a vertical-only format.
    if (isVerticalOnlyContentType(mangaDetails?.type)) {
      return Promise.resolve('manhwa' as const);
    }
    // Explicit manga titles keep page modes; tall pages are normal for manga.
    if (normalizeContentTypeLabel(mangaDetails?.type) === 'manga') {
      return Promise.resolve('manga' as const);
    }
    if (!images || images.length === 0) return Promise.resolve('manga' as const);

    const sampleSize = Math.min(3, images.length);
    let tallImageCount = 0;

    return new Promise<'manhwa' | 'manga'>((resolve) => {
      let loadedCount = 0;

      images.slice(0, sampleSize).forEach((image) => {
        const imageUri = image.localPath || image.originalUrl;
        getMangaImageSize(
          imageUri || '',
          (width, height) => {
            const aspectRatio = height / width;
            if (aspectRatio > 1.5) {
              tallImageCount++;
            }

            loadedCount++;
            if (loadedCount === sampleSize) {
              const isManhwa = tallImageCount >= sampleSize / 2;
              resolve(isManhwa ? 'manhwa' : 'manga');
            }
          },
          (error) => {
            logger().error(
              'UI',
              'Error getting image size for content detection',
              { error }
            );
            loadedCount++;
            if (loadedCount === sampleSize) {
              resolve('manga');
            }
          }
        );
      });
    });
  }, [mangaDetails?.type]);

  const prefetchImagesFrom = useCallback(
    (images: ChapterImage[], startIndex: number, count = 3) => {
      images.slice(startIndex, startIndex + count).forEach((image) => {
        const uri = image.originalUrl || image.localPath;
        if (uri?.startsWith('http')) {
          Image.prefetch(uri, {
            headers: MANGA_IMAGE_REQUEST_HEADERS,
          }).catch(() => {});
        }
      });
    },
    []
  );

  // Prefetch a few pages ahead of the first viewable item (paced, not bursted).
  // Never prefetch past the sequential gate — a blocked page must not be
  // bypassed, and hammering a failing URL just makes the CDN angrier.
  const handleManhwaViewableItemsChanged = useRef(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const firstIndex =
        viewableItems.find((item) => item.index != null)?.index ?? 0;
      const images = downloadedImagesRef.current;
      if (!images) return;
      const maxPage = gateBoundaryRef.current + 1;
      const ahead = images.filter(
        (image) =>
          image.pageNumber > firstIndex + 1 && image.pageNumber <= maxPage
      );
      if (ahead.length > 0) {
        prefetchImagesFrom(ahead, 0);
      }
    }
  ).current;

  const manhwaViewabilityConfig = useRef({
    itemVisiblePercentThreshold: 10,
  }).current;

  const reportManhwaScrollProgress = useCallback((next: number) => {
    if (
      Math.abs(next - lastReportedScrollProgressRef.current) >= 0.01 ||
      next === 0 ||
      next === 1
    ) {
      lastReportedScrollProgressRef.current = next;
      setScrollProgress(next);
    }
  }, []);

  const recomputeManhwaScrollProgress = useCallback(() => {
    const { offsetY, viewportHeight } = manhwaScrollMetricsRef.current;
    const pageCount = manhwaPageCountRef.current;
    if (pageCount <= 0) {
      return;
    }
    // Must match chapterEndSpacer (screen height), not FlatList viewport height.
    const footerHeight = Dimensions.get('window').height * 0.1;
    reportManhwaScrollProgress(
      computeManhwaScrollProgress({
        offsetY,
        viewportHeight,
        pageCount,
        heights: pageHeightsRef.current,
        footerHeight,
      })
    );
  }, [reportManhwaScrollProgress]);

  const handleManhwaPageHeightChange = useCallback(
    (pageIndex: number, height: number) => {
      const prev = pageHeightsRef.current.get(pageIndex);
      if (prev === height) {
        return;
      }
      pageHeightsRef.current.set(pageIndex, height);
      recomputeManhwaScrollProgress();
    },
    [recomputeManhwaScrollProgress]
  );

  const handlePageStatusChange = useCallback(
    (pageNumber: number, status: ReaderImageStatus) => {
      const failed = failedPagesRef.current;
      if (status === 'failed') {
        if (!failed.has(pageNumber)) {
          failed.add(pageNumber);
          setFailedPageCount(failed.size);
          setIsFailedBannerDismissed(false);
        }
        return;
      }

      if (status !== 'loaded') {
        return;
      }

      if (failed.has(pageNumber)) {
        failed.delete(pageNumber);
        setFailedPageCount(failed.size);
      }

      gatePrefetchInflightRef.current.delete(pageNumber);

      // Advance the sequential gate past every contiguously loaded page.
      loadedPagesRef.current.add(pageNumber);
      let boundary = gateBoundaryRef.current;
      while (loadedPagesRef.current.has(boundary + 1)) {
        boundary += 1;
      }
      if (boundary !== gateBoundaryRef.current) {
        gateBoundaryRef.current = boundary;
        setAllowedPage((prev) => {
          const next = boundary + 1;
          return prev === next ? prev : next;
        });
      }
    },
    []
  );

  // Keep the sequential gate moving even when FlatList clips/unmounts a row
  // before ReaderRetryImage can report `loaded`.
  useEffect(() => {
    if (!downloadedImages || contentType !== 'manhwa') {
      return;
    }

    const generation = gatePrefetchGenerationRef.current;
    const maxPrefetchAttempts = 3;
    const retryTimeoutIds: ReturnType<typeof setTimeout>[] = [];
    let cancelled = false;
    // Mutable id so effect cleanup can clearTimeout the latest retry timer.
    let retryTimeoutId: ReturnType<typeof setTimeout> | undefined;

    const imagesByPage = new Map(
      downloadedImages.map((image) => [image.pageNumber, image])
    );

    // Advance over contiguous local / already-loaded pages in ONE pass.
    // Calling setAllowedPage per page (via handlePageStatusChange) re-enters
    // this effect synchronously and hits "Maximum update depth exceeded".
    let boundary = gateBoundaryRef.current;
    for (;;) {
      const nextPage = boundary + 1;
      const image = imagesByPage.get(nextPage);
      if (!image) {
        break;
      }
      if (loadedPagesRef.current.has(nextPage)) {
        boundary = nextPage;
        continue;
      }
      const uri = image.localPath || image.originalUrl;
      if (uri && !uri.startsWith('http')) {
        loadedPagesRef.current.add(nextPage);
        gatePrefetchInflightRef.current.delete(nextPage);
        boundary = nextPage;
        continue;
      }
      break;
    }
    if (boundary !== gateBoundaryRef.current) {
      gateBoundaryRef.current = boundary;
      setAllowedPage((prev) => {
        const next = boundary + 1;
        return prev === next ? prev : next;
      });
    }

    const prefetchForGate = (pageNumber: number, uri: string, attempt: number) => {
      Image.prefetch(uri, {
        headers: MANGA_IMAGE_REQUEST_HEADERS,
      })
        .then(() => {
          if (cancelled || generation !== gatePrefetchGenerationRef.current) {
            return;
          }
          handlePageStatusChange(pageNumber, 'loaded');
        })
        .catch(() => {
          if (cancelled || generation !== gatePrefetchGenerationRef.current) {
            return;
          }
          if (attempt + 1 < maxPrefetchAttempts) {
            retryTimeoutId = setTimeout(() => {
              if (cancelled || generation !== gatePrefetchGenerationRef.current) {
                return;
              }
              prefetchForGate(pageNumber, uri, attempt + 1);
            }, 750 * (attempt + 1));
            retryTimeoutIds.push(retryTimeoutId);
            return;
          }
          // Allow a later retry from a remounted row or effect re-run.
          gatePrefetchInflightRef.current.delete(pageNumber);
        });
    };

    const prefetchLimit = Math.max(allowedPage, boundary + 1);
    for (const image of downloadedImages) {
      if (image.pageNumber > prefetchLimit) {
        continue;
      }
      if (loadedPagesRef.current.has(image.pageNumber)) {
        continue;
      }
      if (gatePrefetchInflightRef.current.has(image.pageNumber)) {
        continue;
      }

      const uri = image.localPath || image.originalUrl;
      if (!uri || !uri.startsWith('http')) {
        continue;
      }

      gatePrefetchInflightRef.current.add(image.pageNumber);
      prefetchForGate(image.pageNumber, uri, 0);
    }

    return () => {
      cancelled = true;
      if (retryTimeoutId !== undefined) {
        clearTimeout(retryTimeoutId);
      }
      for (const timeoutId of retryTimeoutIds) {
        clearTimeout(timeoutId);
      }
    };
  }, [allowedPage, downloadedImages, contentType, handlePageStatusChange]);

  const handleRetryFailedPages = useCallback(() => {
    failedPagesRef.current.clear();
    setFailedPageCount(0);
    setIsFailedBannerDismissed(false);
    setRetryAllToken((token) => token + 1);
  }, []);

  // Clear previous chapter before paint so navigation never flashes stale pages.
  useLayoutEffect(() => {
    setIsLoadingImages(true);
    setLoadError(null);
    setDownloadedImages(null);
    downloadedImagesRef.current = null;
    failedPagesRef.current.clear();
    loadedPagesRef.current.clear();
    gatePrefetchInflightRef.current.clear();
    gatePrefetchGenerationRef.current += 1;
    gateBoundaryRef.current = 0;
    setAllowedPage(1);
    setFailedPageCount(0);
    setIsFailedBannerDismissed(false);
    setIsDownloaded(false);
    setIsOnlineChapter(false);
    setContentType(null);
    setCurrentPage(0);
    setScrollProgress(0);
    lastReportedScrollProgressRef.current = 0;
    pageHeightsRef.current.clear();
    manhwaScrollMetricsRef.current = {
      offsetY: 0,
      viewportHeight: Dimensions.get('window').height,
    };
    manhwaPageCountRef.current = 0;
  }, [id, chapterNumber]);

  useEffect(() => {
    const loadToken = Symbol('chapter-load');
    let activeToken: symbol | null = loadToken;
    const isActive = () => activeToken === loadToken;

    const loadChapter = async () => {
      if (!id || !chapterNumber) {
        if (isActive()) {
          setLoadError({
            title: 'Invalid chapter',
            message: 'Missing manga or chapter information.',
            canRetry: false,
          });
          setIsLoadingImages(false);
        }
        return;
      }

      // Keep the spinner up for the whole attempt (including stale-ID
      // re-resolve). Only the error screen appears if this attempt fails.
      if (isActive()) {
        setIsLoadingImages(true);
        setLoadError(null);
      }

      try {
        const mangaId = id as string;
        const requestedChapter = chapterNumber as string;

        // Fast path: load this chapter's local pages directly.
        // Avoid scanning every downloaded chapter (that made opens multi-second).
        let images =
          (await chapterStorageService.getChapterImages(
            mangaId,
            requestedChapter
          )) ?? null;

        if (!images || images.length === 0) {
          const downloadedChapters =
            await chapterStorageService.getDownloadedChapters(mangaId);
          if (!isActive()) return;

          const normalizedRequested = normalizeChapterNumber(requestedChapter);
          const matchingChapter = downloadedChapters.find(
            (ch) =>
              ch === requestedChapter ||
              normalizeChapterNumber(ch) === normalizedRequested
          );
          if (matchingChapter) {
            images = await chapterStorageService.getChapterImages(
              mangaId,
              matchingChapter
            );
          }
        }

        if (!isActive()) return;

        if (images && images.length > 0) {
          setIsDownloaded(true);
          setIsOnlineChapter(false);
          setDownloadedImages(images);
          downloadedImagesRef.current = images;
          const firstPage = Math.min(...images.map((i) => i.pageNumber));
          gateBoundaryRef.current = firstPage - 1;
          setAllowedPage(firstPage);
          setCurrentPage(0);

          // Prefer title metadata — never block the spinner on Image.getSize.
          if (isVerticalOnlyContentType(mangaDetails?.type)) {
            setContentType('manhwa');
          } else if (normalizeContentTypeLabel(mangaDetails?.type) === 'manga') {
            setContentType('manga');
          } else {
            // Show pages immediately; refine type in the background if needed.
            setContentType('manga');
            void detectContentType(images)
              .then((detectedType) => {
                if (isActive()) {
                  setContentType(detectedType);
                }
              })
              .catch((detectError) => {
                logger().error('Service', 'Error detecting content type', {
                  error: detectError,
                });
              });
          }

          // Title resolution is AsyncStorage-heavy — don't gate the reader on it.
          if (mangaDetails?.title) {
            setMangaTitle(mangaDetails.title);
          } else {
            setMangaTitle(`Chapter ${chapterNumber}`);
          }
          setLoadError(null);

          void (async () => {
            try {
              const mangaData = await getMangaData(mangaId);
              if (!isActive()) return;

              let resolvedTitle = mangaData?.title ?? mangaDetails?.title;
              if (!resolvedTitle) {
                const cachedDetails =
                  await offlineCacheService.getCachedMangaDetails(mangaId);
                if (!isActive()) return;
                resolvedTitle = cachedDetails?.title;
              }

              if (resolvedTitle && isActive()) {
                setMangaTitle(resolvedTitle);
              }
            } catch {
              // Keep the interim title already shown.
            }
          })();
        } else if (!isOffline) {
          const cachedDetails =
            await offlineCacheService.getCachedMangaDetails(mangaId);
          if (!isActive()) return;

          // Prefer live/merged chapter metadata so stale offline IDs don't win.
          const onlineImages = await loadOnlineChapterImages(
            mangaId,
            requestedChapter,
            mangaDetails?.chapters ?? cachedDetails?.chapters
          );

          if (!isActive()) return;

          setIsDownloaded(false);
          setIsOnlineChapter(true);
          setDownloadedImages(onlineImages);
          downloadedImagesRef.current = onlineImages;
          const firstPage = Math.min(...onlineImages.map((i) => i.pageNumber));
          gateBoundaryRef.current = firstPage - 1;
          setAllowedPage(firstPage);
          setCurrentPage(0);

          try {
            const detectedType = await detectContentType(onlineImages);
            if (isActive()) {
              setContentType(detectedType);
            }
          } catch (detectError) {
            logger().error('Service', 'Error detecting online content type', {
              error: detectError,
            });
            if (isActive()) {
              setContentType(
                isVerticalOnlyContentType(mangaDetails?.type)
                  ? 'manhwa'
                  : 'manga'
              );
            }
          }

          const mangaData = await getMangaData(mangaId);
          if (!isActive()) return;

          let resolvedTitle =
            mangaData?.title ?? cachedDetails?.title ?? mangaDetails?.title;
          if (!resolvedTitle) {
            resolvedTitle = `Chapter ${chapterNumber}`;
          }

          if (isActive()) {
            setMangaTitle(resolvedTitle);
            setLoadError(null);
          }
        } else {
          if (isActive()) {
            setDownloadedImages(null);
            downloadedImagesRef.current = null;
            setContentType(null);
            setIsDownloaded(false);
            setIsOnlineChapter(false);
            setCurrentPage(0);
            setLoadError(
              getChapterLoadErrorInfo(null, {
                chapterNumber: String(chapterNumber),
                isOffline: true,
              })
            );
          }
        }
      } catch (error) {
        if (isActive()) {
          logger().error('UI', 'Error loading chapter content', {
            error,
            mangaId: id,
            chapterNumber,
          });
          setLoadError(
            getChapterLoadErrorInfo(error, {
              chapterNumber: String(chapterNumber),
            })
          );
        }
      } finally {
        if (isActive()) {
          setIsLoadingImages(false);
        }
      }
    };

    loadChapter();

    return () => {
      activeToken = null;
    };
  }, [
    id,
    chapterNumber,
    isOffline,
    detectContentType,
    mangaDetails?.chapters,
    prefetchImagesFrom,
    loadRetryToken,
  ]);

  const fetchDetails = useCallback(async () => {
    if (!id) {
      return;
    }

    const mangaId = id as string;
    const requestedChapter =
      typeof chapterNumber === 'string' ? chapterNumber : undefined;

    try {
      // Prefer local chapter files + cached details — avoid MangaFire API spam
      // when the reader already has a downloaded chapter on disk.
      if (requestedChapter) {
        // Show cached details immediately — don't wait on download-disk checks
        // (AsyncStorage/file IO were stacking into multi-second opens).
        // Online readers still fall through to refresh below.
        const cachedDetails =
          await offlineCacheService.getCachedMangaDetails(mangaId);
        if (cachedDetails) {
          setMangaDetails(cachedDetails);
          setMangaTitle((current) => current ?? cachedDetails.title);
        }

        const alreadyDownloaded =
          await chapterStorageService.isChapterDownloaded(
            mangaId,
            requestedChapter
          );
        if (alreadyDownloaded) {
          if (!cachedDetails) {
            const [mangaData, downloadedChapters] = await Promise.all([
              getMangaData(mangaId),
              chapterStorageService.getDownloadedChapters(mangaId),
            ]);
            if (mangaData || downloadedChapters.length > 0) {
              const fallbackDetails: MangaDetailsType = {
                id: mangaId,
                title: mangaData?.title || 'Downloaded Chapter',
                alternativeTitle: mangaData?.title || '',
                status: '',
                description: '',
                author: [],
                published: '',
                genres: [],
                rating: '',
                reviewCount: '',
                bannerImage: mangaData?.bannerImage || '',
                chapters: downloadedChapters.map((chapter) => ({
                  number: chapter,
                  title: `Chapter ${chapter}`,
                  date: '',
                  url: '',
                })),
                ...(mangaData?.totalChapters != null
                  ? { totalChapters: mangaData.totalChapters }
                  : {}),
              };
              setMangaDetails(fallbackDetails);
              setMangaTitle((current) => current ?? fallbackDetails.title);
            }
          }
          return;
        }
      }

      if (isOffline) {
        const cachedDetails =
          await offlineCacheService.getCachedMangaDetails(mangaId);

        if (cachedDetails) {
          setMangaDetails(cachedDetails);
          setMangaTitle((current) => current ?? cachedDetails.title);
          return;
        }

        const [mangaData, downloadedChapters] = await Promise.all([
          getMangaData(mangaId),
          chapterStorageService.getDownloadedChapters(mangaId),
        ]);

        if (mangaData || downloadedChapters.length > 0) {
          const fallbackDetails: MangaDetailsType = {
            id: mangaId,
            title: mangaData?.title || 'Offline Chapter',
            alternativeTitle: mangaData?.title || '',
            status: '',
            description: '',
            author: [],
            published: '',
            genres: [],
            rating: '',
            reviewCount: '',
            bannerImage: mangaData?.bannerImage || '',
            chapters: downloadedChapters.map((chapter) => ({
              number: chapter,
              title: `Chapter ${chapter}`,
              date: '',
              url: '',
            })),
            ...(mangaData?.totalChapters != null
              ? { totalChapters: mangaData.totalChapters }
              : {}),
          };

          setMangaDetails(fallbackDetails);
          setMangaTitle((current) => current ?? fallbackDetails.title);
        }

        return;
      }

      const cachedDetails =
        await offlineCacheService.getCachedMangaDetails(mangaId);

      if (cachedDetails) {
        setMangaDetails(cachedDetails);
        setMangaTitle((current) => current ?? cachedDetails.title);
      }

      // Reader only needs metadata + a small chapter window for the sheet/nav.
      // Never crawl every chapter page on open (that was 9+ requests for long series).
      const freshDetails = await fetchMangaDetails(mangaId, {
        maxChapterPages: 1,
      });

      setMangaDetails((previous) =>
        mergeMangaDetailsRefresh(previous, freshDetails, mangaId)
      );
      setMangaTitle((current) => current ?? freshDetails.title);

      // Do not write a page-1 preview over a fuller offline cache.
      const cachedCount = cachedDetails?.chapters?.length ?? 0;
      if (cachedCount <= freshDetails.chapters.length) {
        try {
          const mangaData = await getMangaData(mangaId);
          const isBookmarked = !!mangaData?.bookmarkStatus;
          await offlineCacheService.cacheMangaDetails(
            mangaId,
            {
              ...freshDetails,
              id: mangaId,
              ...(freshDetails.totalChapters != null || cachedDetails?.totalChapters != null
                ? {
                    totalChapters: Math.max(
                      freshDetails.totalChapters ?? 0,
                      cachedDetails?.totalChapters ?? 0
                    ),
                  }
                : {}),
            },
            isBookmarked
          );
        } catch (cacheError) {
          logger().warn('Storage', 'Failed to cache manga details', {
            error: cacheError,
            mangaId,
          });
        }
      }
    } catch (error) {
      logger().error('Service', 'Error fetching manga details', { error });

      const cachedDetails =
        await offlineCacheService.getCachedMangaDetails(mangaId);
      if (cachedDetails) {
        setMangaDetails(cachedDetails);
        setMangaTitle((current) => current ?? cachedDetails.title);
      }
    }
  }, [id, chapterNumber, isOffline]);

  useEffect(() => {
    markChapterAsReadWithFallback();
  }, [markChapterAsReadWithFallback]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  // Handle programmatic page changes for page-by-page (manga) modes
  useEffect(() => {
    if (isHorizontalLayout && mangaFlatListRef.current && downloadedImages) {
      mangaFlatListRef.current.scrollToIndex({
        index: horizontalScrollIndexForPage({
          pageIndex: currentPage,
          pageCount: downloadedImages.length,
        }),
        animated: true,
      });
    }
  }, [currentPage, isHorizontalLayout, downloadedImages]);

  // Always reset reader position when a new chapter loads offline
  useEffect(() => {
    if (!downloadedImages?.length || !effectiveLayout) {
      return;
    }

    setCurrentPage(0);
    setScrollProgress(0);
    lastReportedScrollProgressRef.current = 0;

    const scrollToTop = () => {
      if (effectiveLayout === 'vertical') {
        manhwaListRef.current?.scrollToOffset({ offset: 0, animated: false });
      } else {
        try {
          mangaFlatListRef.current?.scrollToIndex({
            index: horizontalScrollIndexForPage({
              pageIndex: 0,
              pageCount: downloadedImages.length,
            }),
            animated: false,
          });
        } catch (error) {
          logger().warn('UI', 'Failed to reset manga reader position', {
            error,
          });
          mangaFlatListRef.current?.scrollToOffset({
            offset: 0,
            animated: false,
          });
        }
      }
    };

    const frameId = requestAnimationFrame(scrollToTop);
    const timeoutId = setTimeout(scrollToTop, 200);

    return () => {
      cancelAnimationFrame(frameId);
      clearTimeout(timeoutId);
    };
  }, [downloadedImages, effectiveLayout, normalizedChapterParam]);

  // Reset title when manga changes to ensure proper update
  useEffect(() => {
    setMangaTitle(null);
  }, [id]);

  // Initialize navigation tracking when chapter changes
  useEffect(() => {
    navigationTimestampRef.current = Date.now();
    lastNavigatedChapterRef.current = normalizedChapterParam;
  }, [normalizedChapterParam]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        navigateBack();
        return true;
      };
      const backHandler = BackHandler.addEventListener(
        'hardwareBackPress',
        onBackPress
      );
      return () => backHandler.remove();
    }, [navigateBack])
  );

  const handleBackPress = () => navigateBack();

  const navigateToChapter = useCallback(
    (targetChapter: string) => {
      if (!id || !targetChapter) {
        return;
      }

      navigationTimestampRef.current = Date.now();
      lastNavigatedChapterRef.current = targetChapter;
      router.push(
        `/manga/${id}/chapter/${encodeURIComponent(targetChapter)}`
      );
    },
    [id, router]
  );

  const handleChapterPress = (chapterNum: string) => {
    const targetChapter = normalizeChapterNumber(chapterNum);
    if (!targetChapter) {
      return;
    }
    closeChapterList();
    navigateToChapter(targetChapter);
  };

  const navigateChapter = (chapterOffset: number) => {
    if (mangaDetails?.chapters && currentChapterIndex >= 0) {
      const newChapter =
        mangaDetails.chapters[currentChapterIndex + chapterOffset];
      if (newChapter?.number) {
        const targetChapter = normalizeChapterNumber(newChapter.number);
        if (!targetChapter) {
          return;
        }
        navigateToChapter(targetChapter);
        return;
      }
    }

    // Partial chapter lists (page-1 only) often omit the chapter being read.
    // Fall back to sequential numbering: -1 offset = next/newer, +1 = previous/older.
    const current = Number.parseFloat(
      normalizedChapterParam || String(chapterNumber)
    );
    if (!Number.isFinite(current)) {
      return;
    }
    const targetValue = current + (chapterOffset < 0 ? 1 : -1);
    if (targetValue <= 0) {
      return;
    }
    const targetChapter = normalizeChapterNumber(String(targetValue));
    if (targetChapter) {
      navigateToChapter(targetChapter);
    }
  };

  const handleNextChapter = () => navigateChapter(-1);
  const handlePreviousChapter = () => navigateChapter(1);

  const handleDismissGuide = () => {
    setShowGuide(false);
    // Ensure controls are visible after dismissing the guide
    showControls();
  };

  const enhancedBackButtonSize = ensureMinimumSize(40);
  const enhancedNavigationButtonSize = ensureMinimumSize(44);

  // Touch handler for downloaded chapters (replicates WebView behavior)
  const handleDownloadedChapterTouch = useCallback(
    (event: GestureResponderEvent) => {
      // For onPress, we need to use pageX/pageY instead of locationX/locationY
      const { pageX, pageY } = event.nativeEvent;
      const { width: windowWidth, height: windowHeight } =
        Dimensions.get('window');

      const tapThreshold = 60;
      const topControlThreshold = windowHeight * 0.4; // 40% of screen height

      const isRightEdgeTap = pageX > windowWidth - tapThreshold;
      const isLeftEdgeTap = pageX < tapThreshold;
      const isTopControlArea = pageY < topControlThreshold;

      if (isDebugEnabled()) {
        logger().debug('UI', 'Downloaded chapter touch', {
          x: pageX,
          y: pageY,
          windowHeight,
          topThreshold: topControlThreshold,
          isTopArea: isTopControlArea,
          isLeftEdge: isLeftEdgeTap,
          isRightEdge: isRightEdgeTap,
          effectiveLayout,
        });
      }

      // Horizontal page modes: edge taps turn pages (direction depends on LTR/RTL)
      if (isHorizontalLayout) {
        const goPrevious = () => {
          if (currentPage > 0) {
            setCurrentPage(currentPage - 1);
          }
        };
        const goNext = () => {
          if (
            downloadedImagesRef.current &&
            currentPage < downloadedImagesRef.current.length - 1
          ) {
            setCurrentPage(currentPage + 1);
          }
        };

        if (isTopControlArea) {
          toggleControls();
        } else if (isLeftEdgeTap) {
          // LTR: left = previous; RTL: left = next
          if (isInvertedLayout) {
            goNext();
          } else {
            goPrevious();
          }
        } else if (isRightEdgeTap) {
          // LTR: right = next; RTL: right = previous
          if (isInvertedLayout) {
            goPrevious();
          } else {
            goNext();
          }
        } else {
          // Center area toggles controls
          toggleControls();
        }
      } else {
        // Vertical mode: original behavior (no edge navigation)
        if (isTopControlArea) {
          toggleControls();
        } else if (!isLeftEdgeTap && !isRightEdgeTap) {
          toggleControls();
        }
      }
    },
    [
      toggleControls,
      isHorizontalLayout,
      isInvertedLayout,
      effectiveLayout,
      currentPage,
    ]
  );

  // Manhwa-style continuous scrolling renderer.
  // Windowed FlatList: only a viewport plus a small buffer mounts at once,
  // which keeps concurrent CDN image requests low (rate-limit prevention).
  const renderManhwaChapter = () => {
    const sortedImages = downloadedImages!.sort(
      (a, b) => a.pageNumber - b.pageNumber
    );
    manhwaPageCountRef.current = sortedImages.length;

    return (
      <FlatList
        key={`${offlineChapterRenderKey}-vertical-${readerBackground}-${readerImageFit}`}
        ref={manhwaListRef}
        data={sortedImages}
        renderItem={({ item, index }) => (
          <ManhwaImage
            image={item}
            pageIndex={index}
            onPress={handleDownloadedChapterTouch}
            colorScheme={colorScheme}
            isOnline={isOnlineChapter}
            imageFit={readerImageFit}
            onStatusChange={handlePageStatusChange}
            onHeightChange={handleManhwaPageHeightChange}
            retryToken={retryAllToken}
            shouldLoad={item.pageNumber <= allowedPage}
          />
        )}
        keyExtractor={(item) => `page-${item.pageNumber}`}
        extraData={allowedPage}
        style={[styles.webView, { backgroundColor: readerCanvasColor }]}
        contentContainerStyle={[
          styles.manhwaImagesContainer,
          { backgroundColor: readerCanvasColor },
        ]}
        showsVerticalScrollIndicator={false}
        decelerationRate="normal"
        scrollEventThrottle={16}
        initialNumToRender={3}
        maxToRenderPerBatch={4}
        windowSize={5}
        removeClippedSubviews
        onViewableItemsChanged={handleManhwaViewableItemsChanged}
        viewabilityConfig={manhwaViewabilityConfig}
        ListFooterComponent={<View style={styles.chapterEndSpacer} />}
        onScroll={(event) => {
          const { contentOffset, layoutMeasurement } = event.nativeEvent;
          manhwaScrollMetricsRef.current = {
            offsetY: contentOffset.y,
            viewportHeight: layoutMeasurement.height,
          };
          recomputeManhwaScrollProgress();
        }}
      />
    );
  };

  // Manga-style page-by-page renderer
  const renderMangaChapter = () => {
    const sortedImages = downloadedImages!.sort(
      (a, b) => a.pageNumber - b.pageNumber
    );

    const renderPage = ({ item }: { item: ChapterImage; index: number }) => (
      <TouchableWithoutFeedback onPress={handleDownloadedChapterTouch}>
        <View
          style={[
            styles.mangaPageContainer,
            { backgroundColor: readerCanvasColor },
          ]}
        >
          <MangaPageImage
            image={item}
            isOnline={isOnlineChapter}
            imageFit={readerImageFit}
            canvasColor={readerCanvasColor}
            colorScheme={colorScheme}
            onStatusChange={handlePageStatusChange}
            retryToken={retryAllToken}
          />
        </View>
      </TouchableWithoutFeedback>
    );

    return (
      <FlatList
        key={`${offlineChapterRenderKey}-${effectiveLayout ?? 'ltr'}-${readerBackground}-${readerImageFit}`}
        ref={mangaFlatListRef}
        data={sortedImages}
        renderItem={renderPage}
        extraData={`${readerCanvasColor}-${readerImageFit}`}
        keyExtractor={(item) => `page-${item.pageNumber}`}
        horizontal
        inverted={isInvertedLayout}
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        onMomentumScrollEnd={(event) => {
          const pageWidth = Dimensions.get('window').width;
          const offset = event.nativeEvent.contentOffset.x;
          setCurrentPage(
            horizontalPageIndexFromOffset({
              offsetX: offset,
              pageWidth,
              pageCount: sortedImages.length,
            })
          );
        }}
        getItemLayout={(_, index) => ({
          length: Dimensions.get('window').width,
          offset: Dimensions.get('window').width * index,
          index,
        })}
        style={[styles.webView, { backgroundColor: readerCanvasColor }]}
      />
    );
  };

  // Local image viewer for downloaded chapters
  const renderDownloadedChapter = () => {
    if (!downloadedImages || downloadedImages.length === 0) {
      return (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>Downloaded chapter has no images</Text>
        </View>
      );
    }

    if (!effectiveLayout) {
      // Still detecting content type (auto mode only), show loading
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors[colorScheme].primary} />
          <Text style={styles.loadingText}>Analyzing content...</Text>
        </View>
      );
    }

    return effectiveLayout === 'vertical'
      ? renderManhwaChapter()
      : renderMangaChapter();
  };

  const renderChapterLoadError = (info: ChapterLoadErrorInfo) => (
    <View
      style={[
        styles.errorContainer,
        { paddingTop: insets.top + 24, paddingBottom: insets.bottom + 24 },
      ]}
      accessibilityRole="alert"
    >
      <View style={styles.errorIconWrap}>
        <Ionicons
          name="alert-circle-outline"
          size={48}
          color={Colors[colorScheme].error}
        />
      </View>
      <Text style={styles.errorTitle}>{info.title}</Text>
      <Text style={styles.errorMessage}>{info.message}</Text>
      <View style={styles.errorActions}>
        <TouchableOpacity
          style={styles.chapterBackButton}
          onPress={handleBackPress}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons
            name="arrow-back"
            size={18}
            color={Colors[colorScheme].text}
          />
          <Text style={styles.chapterBackButtonText}>Go back</Text>
        </TouchableOpacity>
        {info.canRetry ? (
          <TouchableOpacity
            style={styles.chapterRetryButton}
            onPress={() => setLoadRetryToken((token) => token + 1)}
            accessibilityRole="button"
            accessibilityLabel="Retry loading chapter"
          >
            <Text style={styles.chapterRetryButtonText}>Retry</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    </View>
  );

  return (
    <View style={[styles.container, { backgroundColor: readerCanvasColor }]}>
      {loadError && !isLoadingImages ? (
        renderChapterLoadError(loadError)
      ) : (
        <>
          <View
            style={[styles.webViewContainer, { backgroundColor: readerCanvasColor }]}
          >
            {isLoadingImages ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator
                  testID="loading-indicator"
                  size="large"
                  color={Colors[colorScheme].primary}
                />
              </View>
            ) : (isDownloaded || isOnlineChapter) && downloadedImages ? (
              renderDownloadedChapter()
            ) : (
              renderChapterLoadError({
                title: 'Chapter isn’t available',
                message:
                  'This chapter could not be opened. Go back and try another chapter, or retry.',
                canRetry: true,
              })
            )}
          </View>

          {/* Always render controls but control visibility with opacity and pointerEvents */}
          <Animated.View
            style={[
              styles.controlsWrapper,
              {
                opacity: controlsOpacity,
                zIndex: 150, // Higher z-index for controls
              },
            ]}
            pointerEvents={isControlsVisible ? 'auto' : 'none'}
          >
            <View
              style={[
                styles.controls,
                {
                  paddingTop: insets.top,
                  backgroundColor: Colors[colorScheme].card + 'E6',
                },
              ]}
            >
              <View style={styles.controlsContent}>
                <View style={styles.leftControls}>
                  <TouchableOpacity
                    onPress={handleBackPress}
                    style={[
                      styles.backButton,
                      {
                        width: enhancedBackButtonSize,
                        height: enhancedBackButtonSize,
                        alignItems: 'center',
                        justifyContent: 'center',
                      },
                    ]}
                    hitSlop={{
                      top: 20,
                      bottom: 20,
                      left: 20,
                      right: 20,
                    }}
                  >
                    <Ionicons
                      name="arrow-back"
                      size={20}
                      color={Colors[colorScheme].text}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      // Don't open chapter list during first step of the guide
                      if (!showGuide || guideStep > 1) {
                        openChapterList();
                      }
                    }}
                    style={styles.titleContainer}
                  >
                    <View style={styles.chapterRow}>
                      <Text style={styles.chapterText}>
                        Chapter {chapterNumber}
                        {progressBarPosition !== 'none' &&
                          downloadedImages &&
                          downloadedImages.length > 0 && (
                            <Text style={styles.pageIndicator}>
                              {isHorizontalLayout
                                ? ` • ${currentPage + 1}/${downloadedImages.length}`
                                : ` • ${Math.round(scrollProgress * 100)}%`}
                            </Text>
                          )}
                      </Text>
                      <Ionicons
                        name="menu"
                        size={16}
                        color={Colors[colorScheme].text + '66'}
                        style={styles.menuIcon}
                      />
                    </View>
                    <Text style={styles.titleText} numberOfLines={1}>
                      {mangaTitle || 'Loading...'}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.rightControls}>
                  {showReaderSettingsButton && (
                    <TouchableOpacity
                      onPress={openReaderSettings}
                      style={[
                        styles.navigationButton,
                        {
                          width: enhancedNavigationButtonSize,
                          height: enhancedNavigationButtonSize,
                          alignItems: 'center',
                          justifyContent: 'center',
                        },
                      ]}
                      hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                      accessibilityRole="button"
                      accessibilityLabel="Open reader settings"
                    >
                      <Ionicons
                        name="settings-outline"
                        size={20}
                        color={Colors[colorScheme].text}
                      />
                    </TouchableOpacity>
                  )}

                  <TouchableOpacity
                    onPress={handlePreviousChapter}
                    disabled={
                      !hasPreviousChapter || (showGuide && guideStep === 1)
                    }
                    style={[
                      styles.navigationButton,
                      styles.navigationButtonLeft,
                      (!hasPreviousChapter || (showGuide && guideStep === 1)) &&
                        styles.disabledButton,
                      {
                        width: enhancedNavigationButtonSize,
                        height: enhancedNavigationButtonSize,
                        alignItems: 'center',
                        justifyContent: 'center',
                      },
                    ]}
                    hitSlop={{
                      top: 10,
                      bottom: 10,
                      left: 10,
                      right: 10,
                    }}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={22}
                      color={Colors[colorScheme].text}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleNextChapter}
                    disabled={!hasNextChapter || (showGuide && guideStep === 1)}
                    style={[
                      styles.navigationButton,
                      styles.navigationButtonRight,
                      (!hasNextChapter || (showGuide && guideStep === 1)) &&
                        styles.disabledButton,
                      {
                        width: enhancedNavigationButtonSize,
                        height: enhancedNavigationButtonSize,
                        alignItems: 'center',
                        justifyContent: 'center',
                      },
                    ]}
                    hitSlop={{
                      top: 10,
                      bottom: 10,
                      left: 10,
                      right: 10,
                    }}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={22}
                      color={Colors[colorScheme].text}
                    />
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          </Animated.View>

          {/* Progress bar (page % for manga, scroll % for manhwa) */}
          {progressBarPosition !== 'none' &&
            downloadedImages &&
            downloadedImages.length > 0 &&
            effectiveLayout && (
              <View
                pointerEvents="none"
                style={[
                  styles.readerProgressTrack,
                  progressBarPosition === 'top'
                    ? {
                        top:
                          insets.top +
                          (keepHeaderVisible || isControlsVisible ? 56 : 0),
                      }
                    : { bottom: Math.max(insets.bottom, 0) },
                ]}
              >
                <View
                  style={[
                    styles.readerProgressFill,
                    {
                      width: `${
                        (isHorizontalLayout
                          ? (currentPage + 1) / downloadedImages.length
                          : scrollProgress) * 100
                      }%`,
                      backgroundColor:
                        accentColor || Colors[colorScheme].primary,
                    },
                  ]}
                />
              </View>
            )}

          {/* Failed pages banner */}
          {failedPageCount > 0 && !isFailedBannerDismissed && (
            <View
              style={[
                styles.failedPagesBanner,
                { bottom: Math.max(insets.bottom, 0) + 16 },
              ]}
            >
              <Text style={styles.failedPagesBannerText}>
                {failedPageCount} {failedPageCount === 1 ? 'page' : 'pages'}{' '}
                failed to load
              </Text>
              <TouchableOpacity
                onPress={handleRetryFailedPages}
                style={styles.failedPagesRetryButton}
                accessibilityRole="button"
                accessibilityLabel="Retry failed pages"
              >
                <Text style={styles.failedPagesRetryText}>Retry</Text>
              </TouchableOpacity>
              <TouchableOpacity
                onPress={() => setIsFailedBannerDismissed(true)}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                accessibilityRole="button"
                accessibilityLabel="Dismiss failed pages notice"
              >
                <Ionicons
                  name="close"
                  size={18}
                  color={Colors[colorScheme].text}
                />
              </TouchableOpacity>
            </View>
          )}

          {/* Dim overlay */}
          {readerDimPercent > 0 && (
            <View
              pointerEvents="none"
              style={[
                styles.readerDimOverlay,
                { backgroundColor: `rgba(0,0,0,${readerDimPercent / 100})` },
              ]}
            />
          )}

          {/* Chapter Guide Overlay */}
          <ChapterGuideOverlay
            visible={showGuide}
            onDismiss={handleDismissGuide}
            colors={Colors[colorScheme]}
            onStepChange={handleGuideStepChange}
            hideControls={hideNavControls}
            showControls={showNavControls}
          />

          <ReaderSettingsSheet
            visible={isReaderSettingsVisible && showReaderSettingsButton}
            onClose={() => {
              setIsReaderSettingsVisible(false);
              if (!keepHeaderVisible) {
                showControls();
              }
            }}
            colorScheme={colorScheme === 'dark' ? 'dark' : 'light'}
            accentColor={accentColor}
            readingMode={readingMode}
            verticalOnly={isVerticalOnlyTitle}
            readerBackground={readerBackground}
            readerImageFit={readerImageFit}
            progressBarPosition={progressBarPosition}
            readerDimPercent={readerDimPercent}
            keepHeaderVisible={keepHeaderVisible}
            onReadingModeChange={handleReadingModeChange}
            onReaderBackgroundChange={handleReaderBackgroundChange}
            onReaderImageFitChange={handleReaderImageFitChange}
            onProgressBarPositionChange={handleProgressBarPositionChange}
            onReaderDimPercentChange={handleReaderDimPercentChange}
            onKeepHeaderVisibleChange={handleKeepHeaderVisibleChange}
          />

          {supportsWorklets ? (
            <BottomSheet
              ref={bottomSheetRef}
              snapPoints={['60%', '80%']}
              index={-1}
              enablePanDownToClose
              onChange={handleBottomSheetChange}
              backgroundStyle={styles.bottomSheetBackground}
              handleIndicatorStyle={styles.bottomSheetIndicator}
            >
              <View style={styles.bottomSheetContainer}>
                <BottomSheetScrollView
                  contentContainerStyle={styles.bottomSheetContent}
                >
                  <Text style={styles.bottomSheetTitle}>{mangaTitle}</Text>
                  <Text style={styles.currentChapterTitle}>
                    Current: Chapter {chapterNumber}
                  </Text>
                  {mangaDetails?.chapters?.map((chapter) => {
                    const normalizedChapterId = normalizeChapterNumber(
                      chapter.number
                    );
                    const isCurrentChapter =
                      normalizedChapterId === normalizedChapterParam;
                    return (
                      <TouchableOpacity
                        key={`${normalizedChapterId || chapter.number}-${chapter.url}`}
                        style={[
                          styles.chapterItem,
                          isCurrentChapter && styles.currentChapter,
                        ]}
                        onPress={() => handleChapterPress(chapter.number)}
                      >
                        <View style={styles.chapterItemLeft}>
                          <Text style={styles.chapterNumber}>
                            Chapter {chapter.number}
                          </Text>
                          <Text style={styles.chapterDate}>
                            {chapter.date || 'No date'}
                          </Text>
                        </View>
                        {isCurrentChapter ? (
                          <View style={styles.readIndicator} />
                        ) : (
                          <View style={styles.unreadIndicator} />
                        )}
                      </TouchableOpacity>
                    );
                  })}
                </BottomSheetScrollView>
              </View>
            </BottomSheet>
          ) : (
            !supportsWorklets &&
            isBottomSheetOpen && (
              <Modal
                visible={isBottomSheetOpen}
                transparent
                animationType="slide"
                onRequestClose={closeChapterList}
              >
                <Animated.View
                  style={[
                    styles.chapterListModalOverlay,
                    { opacity: chapterListOverlayOpacity },
                  ]}
                  pointerEvents="none"
                />
                <TouchableWithoutFeedback onPress={closeChapterList}>
                  <View style={styles.chapterListModalTouchLayer} />
                </TouchableWithoutFeedback>
                <Animated.View
                  style={[
                    styles.chapterListContainer,
                    {
                      transform: [{ translateY: chapterListSwipeTranslateY }],
                    },
                  ]}
                >
                  <View
                    style={styles.chapterListHeader}
                    {...chapterListHeaderPanRef.panHandlers}
                  >
                    <View style={styles.chapterListHandle} />
                    <Text style={styles.chapterListTitle}>{mangaTitle}</Text>
                    <Text style={styles.chapterListCurrent}>
                      Current: Chapter {chapterNumber}
                    </Text>
                  </View>
                  <FlatList
                    data={mangaDetails?.chapters || []}
                    scrollEnabled={true}
                    nestedScrollEnabled={true}
                    showsVerticalScrollIndicator={true}
                    contentContainerStyle={styles.chapterListContent}
                    keyExtractor={(chapter) =>
                      `${normalizeChapterNumber(chapter.number) || chapter.number}-${chapter.url}`
                    }
                    renderItem={({ item: chapter }) => {
                      const normalizedChapterId = normalizeChapterNumber(
                        chapter.number
                      );
                      const isCurrentChapter =
                        normalizedChapterId === normalizedChapterParam;
                      return (
                        <TouchableOpacity
                          style={[
                            styles.chapterListItemButton,
                            isCurrentChapter && styles.chapterListItemCurrent,
                          ]}
                          onPress={() => handleChapterPress(chapter.number)}
                        >
                          <View style={styles.chapterListItemContent}>
                            <Text style={styles.chapterListItemNumber}>
                              Chapter {chapter.number}
                            </Text>
                            <Text style={styles.chapterListItemDate}>
                              {chapter.date || 'No date'}
                            </Text>
                          </View>
                          {isCurrentChapter ? (
                            <View style={styles.chapterListItemIndicator} />
                          ) : (
                            <View style={styles.chapterListItemUnread} />
                          )}
                        </TouchableOpacity>
                      );
                    }}
                  />
                  <TouchableOpacity
                    style={styles.chapterListCloseButton}
                    onPress={closeChapterList}
                  >
                    <Text style={styles.chapterListCloseButtonText}>Close</Text>
                  </TouchableOpacity>
                </Animated.View>
              </Modal>
            )
          )}
        </>
      )}
    </View>
  );
}
