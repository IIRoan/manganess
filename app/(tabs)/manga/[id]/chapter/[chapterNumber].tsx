import React, {
  useState,
  useCallback,
  useEffect,
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
  ScrollView,
  Dimensions,
  GestureResponderEvent,
  FlatList,
  Modal,
  PanResponder,
  Image as RNImage,
} from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useNavigationHistory } from '@/hooks/useNavigationHistory';

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
  resolveEffectiveReaderLayout,
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
    onPress,
    colorScheme,
    isOnline,
    imageFit = 'width',
  }: {
    image: ChapterImage;
    onPress: (event: GestureResponderEvent) => void;
    colorScheme: ColorScheme;
    isOnline?: boolean;
    imageFit?: ReaderImageFit;
  }) => {
    const [imageSize, setImageSize] = useState({
      width: Dimensions.get('window').width,
      height: 400,
    });
    const [isImageLoaded, setIsImageLoaded] = useState(false);
    const imageUri = image.localPath || image.originalUrl;

    useEffect(() => {
      if (imageUri) {
        const { width: screenWidth, height: screenHeight } =
          Dimensions.get('window');
        RNImage.getSize(
          imageUri,
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
            logger().error('UI', 'Error getting image size', { error });
            setImageSize({
              width: Dimensions.get('window').width,
              height: 400,
            });
          }
        );
      }
    }, [imageUri, imageFit]);

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
          <Image
            source={{ uri: imageUri }}
            style={[
              getStyles(colorScheme).manhwaImage,
              {
                height: imageSize.height,
                width: imageSize.width,
              },
            ]}
            contentFit={imageFit === 'fill' ? 'cover' : 'contain'}
            cachePolicy={isOnline ? 'memory-disk' : 'disk'}
            transition={200}
            onError={(error) => {
              logger().error('UI', 'Failed to load image', {
                pageNumber: image.pageNumber,
                error,
              });
              setIsImageLoaded(true);
            }}
            onLoad={() => {
              setIsImageLoaded(true);
            }}
          />
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
  }: {
    image: ChapterImage;
    isOnline?: boolean;
    imageFit: ReaderImageFit;
    canvasColor: string;
  }) => {
    const { width: screenWidth, height: screenHeight } =
      Dimensions.get('window');
    const [layout, setLayout] = useState({
      width: screenWidth,
      height: screenHeight,
      contentFit: 'contain' as 'contain' | 'cover',
    });
    const imageUri = image.localPath || image.originalUrl;

    useEffect(() => {
      if (!imageUri) return;
      RNImage.getSize(
        imageUri,
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
    }, [imageUri, imageFit, screenWidth, screenHeight]);

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
        <Image
          source={{ uri: imageUri }}
          style={{ width: layout.width, height: layout.height }}
          contentFit={layout.contentFit}
          cachePolicy={isOnline ? 'memory-disk' : 'disk'}
          transition={200}
          onError={(error) => {
            logger().error('UI', 'Failed to load image', {
              pageNumber: image.pageNumber,
              error,
            });
          }}
        />
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
  const [error, setError] = useState<string | null>(null);
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

  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const bottomSheetRef = useRef<BottomSheet>(null);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mangaFlatListRef = useRef<FlatList>(null);
  const manhwaScrollViewRef = useRef<ScrollView>(null);
  const downloadedImagesRef = useRef<ChapterImage[] | null>(null);

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
  // `auto` for manga falls back to aspect-ratio detection (manga=ltr).
  const isVerticalOnlyTitle = useMemo(
    () =>
      isVerticalOnlyContentType(mangaDetails?.type) || contentType === 'manhwa',
    [mangaDetails?.type, contentType]
  );

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

  const hasNextChapter =
    currentChapterIndex > 0 ||
    (currentChapterIndex < 0 &&
      Number.parseFloat(normalizedChapterParam || '') > 0);

  const hasPreviousChapter =
    (currentChapterIndex > -1 &&
      currentChapterIndex < (mangaDetails?.chapters?.length ?? 0) - 1 &&
      !!mangaDetails?.chapters?.[currentChapterIndex + 1]) ||
    (currentChapterIndex < 0 &&
      Number.parseFloat(normalizedChapterParam || '') > 1);

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

  const activeReaderProfile: ReaderContentProfile = isVerticalOnlyTitle
    ? 'manhwa'
    : 'manga';

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
    if (!images || images.length === 0) return Promise.resolve('manga' as const);

    const sampleSize = Math.min(3, images.length);
    let tallImageCount = 0;

    return new Promise<'manhwa' | 'manga'>((resolve) => {
      let loadedCount = 0;

      images.slice(0, sampleSize).forEach((image) => {
        const imageUri = image.localPath || image.originalUrl;
        RNImage.getSize(
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

  const prefetchChapterImages = useCallback((images: ChapterImage[]) => {
    images.slice(0, 5).forEach((image) => {
      const uri = image.originalUrl || image.localPath;
      if (uri?.startsWith('http')) {
        Image.prefetch(uri).catch(() => {});
      }
    });
  }, []);

  useEffect(() => {
    const loadToken = Symbol('chapter-load');
    let activeToken: symbol | null = loadToken;
    const isActive = () => activeToken === loadToken;

    const loadChapter = async () => {
      if (!id || !chapterNumber) {
        if (isActive()) {
          setError('Invalid chapter parameters');
          setIsLoadingImages(false);
        }
        return;
      }

      if (isActive()) {
        setIsLoadingImages(true);
        setError(null);
      }

      try {
        const mangaId = id as string;
        const requestedChapter = chapterNumber as string;
        const downloadedChapters =
          await chapterStorageService.getDownloadedChapters(mangaId);

        if (!isActive()) return;

        let matchedChapter: string | null = null;
        if (downloadedChapters.includes(requestedChapter)) {
          matchedChapter = requestedChapter;
        } else {
          const normalizedRequested = normalizeChapterNumber(requestedChapter);
          const matchingChapter = downloadedChapters.find(
            (ch) => normalizeChapterNumber(ch) === normalizedRequested
          );
          if (matchingChapter) {
            matchedChapter = matchingChapter;
          }
        }

        let images: ChapterImage[] | null = null;

        if (matchedChapter) {
          images = await chapterStorageService.getChapterImages(
            mangaId,
            matchedChapter
          );
        }

        if (!isActive()) return;

        if (images && images.length > 0) {
          setIsDownloaded(true);
          setIsOnlineChapter(false);
          setDownloadedImages(images);
          downloadedImagesRef.current = images;
          setCurrentPage(0);

          try {
            const detectedType = await detectContentType(images);
            if (isActive()) {
              setContentType(detectedType);
            }
          } catch (detectError) {
            logger().error('Service', 'Error detecting content type', {
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

          let resolvedTitle = mangaData?.title;
          if (!resolvedTitle) {
            const cachedDetails =
              await offlineCacheService.getCachedMangaDetails(mangaId);
            if (!isActive()) return;
            resolvedTitle = cachedDetails?.title;
          }

          if (!resolvedTitle) {
            resolvedTitle = isOffline
              ? 'Offline Chapter'
              : `Chapter ${chapterNumber}`;
          }

          if (isActive()) {
            setMangaTitle(resolvedTitle);
            setError(null);
          }
        } else if (!isOffline) {
          const cachedDetails =
            await offlineCacheService.getCachedMangaDetails(mangaId);
          if (!isActive()) return;

          const onlineImages = await loadOnlineChapterImages(
            mangaId,
            requestedChapter,
            cachedDetails?.chapters ?? mangaDetails?.chapters
          );

          if (!isActive()) return;

          setIsDownloaded(false);
          setIsOnlineChapter(true);
          setDownloadedImages(onlineImages);
          downloadedImagesRef.current = onlineImages;
          setCurrentPage(0);
          prefetchChapterImages(onlineImages);

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
            setError(null);
          }
        } else {
          if (isActive()) {
            setDownloadedImages(null);
            downloadedImagesRef.current = null;
            setContentType(null);
            setIsDownloaded(false);
            setIsOnlineChapter(false);
            setCurrentPage(0);
            setError(
              'This chapter is not downloaded. Please connect to internet or download it first.'
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
          setError('Failed to load chapter.');
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
    prefetchChapterImages,
  ]);

  const fetchDetails = useCallback(async () => {
    if (!id) {
      return;
    }

    const mangaId = id as string;

    try {
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

      setMangaDetails((previous) => {
        const preferCachedChapters =
          (previous?.chapters?.length ?? 0) > freshDetails.chapters.length;
        const mergedTotal = Math.max(
          previous?.totalChapters ?? 0,
          freshDetails.totalChapters ?? 0,
          preferCachedChapters
            ? previous?.chapters.length ?? 0
            : freshDetails.chapters.length
        );

        return {
          ...freshDetails,
          id: mangaId,
          chapters: preferCachedChapters
            ? previous!.chapters
            : freshDetails.chapters,
          ...(mergedTotal > 0 ? { totalChapters: mergedTotal } : {}),
        };
      });
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
  }, [id, isOffline]);

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
        index: currentPage,
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
        manhwaScrollViewRef.current?.scrollTo({ x: 0, y: 0, animated: false });
      } else {
        try {
          mangaFlatListRef.current?.scrollToIndex({
            index: 0,
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

  // Manhwa-style continuous scrolling renderer
  const renderManhwaChapter = () => {
    const sortedImages = downloadedImages!.sort(
      (a, b) => a.pageNumber - b.pageNumber
    );

    return (
      <ScrollView
        key={`${offlineChapterRenderKey}-vertical-${readerBackground}-${readerImageFit}`}
        ref={manhwaScrollViewRef}
        style={[styles.webView, { backgroundColor: readerCanvasColor }]}
        contentContainerStyle={[
          styles.manhwaImagesContainer,
          { backgroundColor: readerCanvasColor },
        ]}
        showsVerticalScrollIndicator={false}
        decelerationRate="normal"
        scrollEventThrottle={16}
        onScroll={(event) => {
          const { contentOffset, contentSize, layoutMeasurement } =
            event.nativeEvent;
          const maxScroll = contentSize.height - layoutMeasurement.height;
          const next =
            maxScroll <= 0
              ? 0
              : Math.min(1, Math.max(0, contentOffset.y / maxScroll));
          // Avoid re-rendering on every pixel — update at ~1% steps.
          if (
            Math.abs(next - lastReportedScrollProgressRef.current) >= 0.01 ||
            next === 0 ||
            next === 1
          ) {
            lastReportedScrollProgressRef.current = next;
            setScrollProgress(next);
          }
        }}
      >
        {sortedImages.map((image) => (
          <ManhwaImage
            key={`page-${image.pageNumber}`}
            image={image}
            onPress={handleDownloadedChapterTouch}
            colorScheme={colorScheme}
            isOnline={isOnlineChapter}
            imageFit={readerImageFit}
          />
        ))}
        <View style={styles.chapterEndSpacer} />
      </ScrollView>
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
          const page = Math.round(offset / pageWidth);
          setCurrentPage(page);
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

  return (
    <View style={[styles.container, { backgroundColor: readerCanvasColor }]}>
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <>
          <View
            style={[styles.webViewContainer, { backgroundColor: readerCanvasColor }]}
          >
            {isLoadingImages && !downloadedImages ? (
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
              <View style={styles.errorContainer}>
                <Text style={styles.errorText}>
                  {error || 'Chapter is not available.'}
                </Text>
              </View>
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
