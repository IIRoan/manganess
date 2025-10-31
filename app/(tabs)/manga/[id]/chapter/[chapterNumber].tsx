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
  Modal,
  TouchableWithoutFeedback,
  Image,
  Dimensions,
  GestureResponderEvent,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { FlashList, type FlashListRef } from '@shopify/flash-list';
import * as Reanimated from 'react-native-reanimated';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useNavigationHistory } from '@/hooks/useNavigationHistory';

import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';

import { getMangaData } from '@/services/bookmarkService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getChapterUrl,
  markChapterAsRead,
  fetchMangaDetails,
  MangaDetails,
  normalizeChapterNumber,
} from '@/services/mangaFireService';
import { chapterStorageService } from '@/services/chapterStorageService';
import { temporaryImageCacheService } from '@/services/temporaryImageCacheService';
import { ChapterImage, ImageDownloadStatus } from '@/types/download';
import { useTheme } from '@/constants/ThemeContext';
import { Colors, ColorScheme } from '@/constants/Colors';
import {
  ChapterGuideOverlay,
  hasSeenChapterGuide,
} from '@/components/ChapterGuideOverlay';
import HiddenChapterWebView from '@/components/HiddenChapterWebView';
import getStyles from './[chapterNumber].styles';
import { isDebugEnabled } from '@/constants/env';

// Minimum touch target size (in dp)
const MIN_TOUCHABLE_SIZE = 48;
const DEFAULT_MANHWA_PLACEHOLDER_HEIGHT =
  Dimensions.get('window').height * 0.75;

// Helper function to ensure touchable size
const ensureMinimumSize = (size: number) => {
  return Math.max(size, MIN_TOUCHABLE_SIZE);
};

// Component for manhwa images with proper aspect ratio (moved outside to prevent re-creation)
const ManhwaImage = React.memo(
  ({
    image,
    onPress,
    colorScheme,
    onError,
  }: {
    image: ChapterImage;
    onPress: (event: GestureResponderEvent) => void;
    colorScheme: ColorScheme;
    onError: (pageNumber: number) => void;
  }) => {
    const [imageHeight, setImageHeight] = useState<number>(
      DEFAULT_MANHWA_PLACEHOLDER_HEIGHT
    );
    const [isImageLoaded, setIsImageLoaded] = useState(false);

    const isPlaceholder = !image.localPath;
    const styles = useMemo(() => getStyles(colorScheme), [colorScheme]);

    useEffect(() => {
      if (image.localPath) {
        const screenWidth = Dimensions.get('window').width;
        Image.getSize(
          image.localPath,
          (width, height) => {
            // Calculate height based on aspect ratio to fit screen width
            const aspectRatio = height / width;
            const calculatedHeight = screenWidth * aspectRatio;
            setImageHeight(calculatedHeight);
          },
          (error) => {
            console.error('Error getting image size:', error);
            setImageHeight(400); // Fallback height
          }
        );
      } else {
        setImageHeight(DEFAULT_MANHWA_PLACEHOLDER_HEIGHT);
        setIsImageLoaded(false);
      }
    }, [image.localPath]);

    return (
      <TouchableWithoutFeedback onPress={onPress}>
        <View style={styles.manhwaImageContainer}>
          {isPlaceholder ? (
            <View
              style={[
                styles.manhwaImage,
                styles.pagePlaceholder,
                {
                  height: imageHeight,
                  width: Dimensions.get('window').width,
                },
              ]}
            >
              <ActivityIndicator
                size="small"
                color={Colors[colorScheme].primary}
              />
            </View>
          ) : (
            <Image
              source={{ uri: image.localPath }}
              style={[
                styles.manhwaImage,
                {
                  height: imageHeight,
                  width: Dimensions.get('window').width,
                },
              ]}
              resizeMode="contain"
              onError={(error) => {
                console.error(
                  `Failed to load image ${image.pageNumber}:`,
                  error
                );
                setIsImageLoaded(false);
                onError(image.pageNumber);
              }}
              onLoad={(event) => {
                setIsImageLoaded(true);
                if (isDebugEnabled()) {
                  const { width, height } = event.nativeEvent.source;
                  console.log(
                    `Manhwa Image ${image.pageNumber}: ${width}x${height}, calculated height: ${imageHeight}`
                  );
                }
              }}
              onLoadStart={() => setIsImageLoaded(false)}
            />
          )}
          {!isPlaceholder && !isImageLoaded && (
            <View style={styles.manhwaImageLoader}>
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

export default function ReadChapterScreen() {
  const { id, chapterNumber } = useLocalSearchParams<{
    id: string;
    chapterNumber: string;
  }>();
  const router = useRouter();
  const { handleBackPress: navigateBack } = useNavigationHistory();

  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mangaTitle, setMangaTitle] = useState<string | null>(null);
  const [mangaDetails, setMangaDetails] = useState<MangaDetails | null>(null);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [showGuide, setShowGuide] = useState(false);
  const [guideStep, setGuideStep] = useState(1);
  const [isDownloaded, setIsDownloaded] = useState(false);
  const [downloadedImages, setDownloadedImages] = useState<
    ChapterImage[] | null
  >(null);
  const [contentType, setContentType] = useState<'manhwa' | 'manga' | null>(
    null
  );
  const [currentPage, setCurrentPage] = useState(0);
  const [isLoadingOnline, setIsLoadingOnline] = useState(false);
  const [showHiddenWebView, setShowHiddenWebView] = useState(false);
  const [interceptData, setInterceptData] = useState<{
    chapterId: string;
    vrfToken: string;
  } | null>(null);
  const [shouldAttemptOnlineLoad, setShouldAttemptOnlineLoad] = useState(false);
  const [isOnlineLoadInFlight, setIsOnlineLoadInFlight] = useState(false);
  const [totalImageCount, setTotalImageCount] = useState<number | null>(null);

  const sortedImages = useMemo(() => {
    if (!downloadedImages) {
      return [] as ChapterImage[];
    }

    return [...downloadedImages].sort((a, b) => a.pageNumber - b.pageNumber);
  }, [downloadedImages]);

  const totalImages = useMemo(() => {
    if (typeof totalImageCount === 'number') {
      return totalImageCount;
    }
    return downloadedImages?.length ?? 0;
  }, [totalImageCount, downloadedImages]);

  const totalPages = useMemo(() => {
    if (totalImages > 0) {
      return totalImages;
    }
    return sortedImages.length;
  }, [sortedImages.length, totalImages]);

  const displayPages = useMemo(() => {
    if (!totalPages) {
      return sortedImages;
    }

    const imagesByPage = new Map<number, ChapterImage>();
    for (const image of sortedImages) {
      imagesByPage.set(image.pageNumber, image);
    }

    const startPage = sortedImages.length
      ? Math.min(...sortedImages.map((img) => img.pageNumber))
      : 1;

    const pages: ChapterImage[] = [];

    for (let i = 0; i < totalPages; i += 1) {
      const pageNumber = startPage + i;
      const image = imagesByPage.get(pageNumber);

      if (image) {
        pages.push(image);
      } else {
        pages.push({
          pageNumber,
          originalUrl: '',
          downloadStatus: ImageDownloadStatus.PENDING,
        });
      }
    }

    return pages;
  }, [sortedImages, totalPages]);

  const completedImages = useMemo(() => {
    if (!downloadedImages) {
      return 0;
    }
    return downloadedImages.filter(
      (img) => img.downloadStatus === ImageDownloadStatus.COMPLETED
    ).length;
  }, [downloadedImages]);

  const failedImages = useMemo(() => {
    if (!downloadedImages) {
      return 0;
    }
    return downloadedImages.filter(
      (img) => img.downloadStatus === ImageDownloadStatus.FAILED
    ).length;
  }, [downloadedImages]);

  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const bottomSheetRef = useRef<BottomSheet>(null);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mangaListRef = useRef<FlashListRef<ChapterImage>>(null);
  const downloadedImagesRef = useRef<ChapterImage[] | null>(null);
  const currentPageRef = useRef(0);
  const navigationTimestampRef = useRef<number>(0);
  const lastNavigatedChapterRef = useRef<string>('');
  const retryingPagesRef = useRef<Set<number>>(new Set());
  const forceReloadRef = useRef(false);
  const interceptDataRef = useRef<{
    chapterId: string;
    vrfToken: string;
  } | null>(null);
  const isOnlineLoadInFlightRef = useRef(false);
  const onlineLoadChapterRef = useRef<string | null>(null);
  const activeLoadRequestIdRef = useRef<number | null>(null);
  const loadRequestSequenceRef = useRef(0);
  const latestLoadRequestRef = useRef(0);
  const activeChapterIdentifierRef = useRef('');

  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme =
    theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const styles = getStyles(colorScheme);
  const insets = useSafeAreaInsets();

  const normalizedChapterParam = useMemo(
    () => normalizeChapterNumber(chapterNumber),
    [chapterNumber]
  );

  const chapterIdentifier = normalizedChapterParam || chapterNumber || '';
  useEffect(() => {
    currentPageRef.current = 0;
    setCurrentPage(0);
  }, [chapterIdentifier]);

  useEffect(() => {
    setIsLoading(true);
    setIsLoadingOnline(false);
    setError(null);
    setDownloadedImages(null);
    downloadedImagesRef.current = null;
    setContentType(null);
    setIsDownloaded(false);
    setTotalImageCount(null);
    setShouldAttemptOnlineLoad(false);
    setShowHiddenWebView(false);
    setInterceptData(null);
    interceptDataRef.current = null;
    setIsOnlineLoadInFlight(false);
    isOnlineLoadInFlightRef.current = false;
    activeLoadRequestIdRef.current = null;
    onlineLoadChapterRef.current = null;
    retryingPagesRef.current.clear();
    forceReloadRef.current = false;
  }, [chapterIdentifier]);

  useEffect(() => {
    activeChapterIdentifierRef.current = chapterIdentifier;
  }, [chapterIdentifier]);

  const chapterUrl = getChapterUrl(id, chapterIdentifier);
  const supportsWorklets =
    typeof (Reanimated as any).useWorkletCallback === 'function';
  const currentChapterIndex = useMemo(() => {
    if (!mangaDetails?.chapters) {
      return -1;
    }

    return mangaDetails.chapters.findIndex(
      (chapter) =>
        normalizeChapterNumber(chapter.number) === normalizedChapterParam
    );
  }, [mangaDetails?.chapters, normalizedChapterParam]);

  const hasNextChapter =
    currentChapterIndex > 0 &&
    !!mangaDetails?.chapters?.[currentChapterIndex - 1];

  const hasPreviousChapter =
    currentChapterIndex > -1 &&
    currentChapterIndex < (mangaDetails?.chapters?.length ?? 0) - 1 &&
    !!mangaDetails?.chapters?.[currentChapterIndex + 1];

  const displayChapterNumber = useMemo(() => {
    if (
      currentChapterIndex >= 0 &&
      mangaDetails?.chapters &&
      mangaDetails.chapters[currentChapterIndex]
    ) {
      return mangaDetails.chapters[currentChapterIndex].number;
    }

    return chapterIdentifier;
  }, [chapterIdentifier, currentChapterIndex, mangaDetails?.chapters]);

  useEffect(() => {
    currentPageRef.current = currentPage;
  }, [currentPage]);

  useEffect(() => {
    downloadedImagesRef.current = sortedImages.length ? sortedImages : null;
  }, [sortedImages]);

  useEffect(() => {
    interceptDataRef.current = interceptData;
  }, [interceptData]);

  useEffect(() => {
    isOnlineLoadInFlightRef.current = isOnlineLoadInFlight;
  }, [isOnlineLoadInFlight]);

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
    if (showGuide && guideStep === 1) {
      // Always show status bar during first step of guide
      StatusBar.setHidden(false);
    } else {
      StatusBar.setHidden(!isControlsVisible);
    }
  }, [isControlsVisible, showGuide, guideStep]);

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
    // Don't auto-hide controls during guide
    if (showGuide && guideStep === 1) return;

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
  }, [controlsOpacity, showGuide, guideStep]);

  const hideNavControls = useCallback(() => {
    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
    }
    Animated.timing(controlsOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setIsControlsVisible(false));
  }, [controlsOpacity]);

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
    // Don't hide controls during the first step of the guide
    if (showGuide && guideStep === 1) return;

    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
    }
    Animated.timing(controlsOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setIsControlsVisible(false));
  }, [controlsOpacity, showGuide, guideStep]);

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
      setIsBottomSheetOpen(true);
      hideControls();
    }
  }, [supportsWorklets, hideControls, handleBottomSheetChange]);

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
    try {
      let mangaData = await getMangaData(id);
      let title;
      if (mangaData?.title) {
        title = mangaData.title;
      } else {
        const details = await fetchMangaDetails(id);
        title = details.title;
      }
      await markChapterAsRead(
        id,
        normalizedChapterParam || chapterNumber,
        title
      );
      setMangaTitle(title);
    } catch (error) {
      console.error('Error marking chapter as read:', error);
    }
  }, [id, chapterNumber, normalizedChapterParam]);

  const fetchDetails = useCallback(async () => {
    try {
      const details = await fetchMangaDetails(id);
      setMangaDetails(details);

      // Check if this chapter is downloaded
      const downloaded = await chapterStorageService.isChapterDownloaded(
        id,
        chapterNumber
      );
      setIsDownloaded(downloaded);

      if (downloaded) {
        // Load downloaded images
        const images = await chapterStorageService.getChapterImages(
          id,
          chapterNumber
        );
        setDownloadedImages(images);
        downloadedImagesRef.current = images;

        setTotalImageCount(images ? images.length : null);

        // For downloaded chapters, we can set loading to false immediately
        setIsLoading(false);
        setIsLoadingOnline(false);
        setShouldAttemptOnlineLoad(false);
        setShowHiddenWebView(false);
        setInterceptData(null);
        setIsOnlineLoadInFlight(false);
        isOnlineLoadInFlightRef.current = false;
        activeLoadRequestIdRef.current = null;
        onlineLoadChapterRef.current = null;
      } else {
        setError(null);
        setDownloadedImages(null);
        downloadedImagesRef.current = null;
        setContentType(null);
        setShouldAttemptOnlineLoad(true);
        setShowHiddenWebView(true);
        setInterceptData(null);
        setIsOnlineLoadInFlight(false);
        isOnlineLoadInFlightRef.current = false;
        activeLoadRequestIdRef.current = null;
        onlineLoadChapterRef.current = null;
        setIsLoading(true);
        setIsLoadingOnline(true);
        setCurrentPage(0);
        setTotalImageCount(null);
      }
    } catch (error) {
      console.error('Error fetching manga details:', error);
      setIsLoading(false);
      setIsLoadingOnline(false);
      setShowHiddenWebView(false);
      setShouldAttemptOnlineLoad(false);
      setTotalImageCount(null);
    }
  }, [id, chapterNumber]);

  useEffect(() => {
    markChapterAsReadWithFallback();
  }, [markChapterAsReadWithFallback]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const loadOnlineChapter = useCallback(
    async (
      intercept: { chapterId: string; vrfToken: string },
      forceRefresh = false
    ) => {
      const requestChapterIdentifier = chapterIdentifier;

      if (
        isOnlineLoadInFlightRef.current &&
        onlineLoadChapterRef.current === requestChapterIdentifier
      ) {
        return;
      }

      const requestId = loadRequestSequenceRef.current + 1;
      loadRequestSequenceRef.current = requestId;
      latestLoadRequestRef.current = requestId;
      activeLoadRequestIdRef.current = requestId;
      isOnlineLoadInFlightRef.current = true;
      onlineLoadChapterRef.current = requestChapterIdentifier;

      if (!forceRefresh) {
        setIsLoading(true);
      }

      setIsOnlineLoadInFlight(true);
      setIsLoadingOnline(true);
      setError(null);

      const isRequestActive = () =>
        activeChapterIdentifierRef.current === requestChapterIdentifier &&
        latestLoadRequestRef.current === requestId;

      try {
        const images = await temporaryImageCacheService.getOrFetchChapterImages(
          id,
          chapterNumber,
          chapterUrl,
          (partialImages, total) => {
            if (!isRequestActive()) {
              return;
            }

            const snapshot = [...partialImages];
            setDownloadedImages(snapshot);
            downloadedImagesRef.current = snapshot;
            if (!forceRefresh && snapshot.length > 0) {
              setIsLoading(false);
            }
            if (typeof total === 'number') {
              setTotalImageCount(total);
            }

            if (isDebugEnabled()) {
              console.log(
                `Downloaded ${snapshot.length}/${total} images for chapter ${chapterNumber} (${forceRefresh ? 'refresh' : 'initial'})`
              );
            }
          },
          {
            chapterId: intercept.chapterId,
            vrfToken: intercept.vrfToken,
          },
          forceRefresh
        );

        if (!isRequestActive()) {
          return;
        }

        setDownloadedImages(images);
        downloadedImagesRef.current = images;
        setIsLoading(false);
        setIsLoadingOnline(false);
        setShouldAttemptOnlineLoad(false);
        setTotalImageCount(images.length);
        setCurrentPage((prev) => {
          if (!forceRefresh) {
            currentPageRef.current = 0;
            return 0;
          }
          const clamped = Math.min(prev, Math.max(images.length - 1, 0));
          currentPageRef.current = clamped;
          return clamped;
        });
        retryingPagesRef.current.clear();
        forceReloadRef.current = false;
      } catch (error) {
        console.error('Error fetching temporary images:', error);

        if (!isRequestActive()) {
          return;
        }

        setError(
          forceRefresh
            ? 'Failed to refresh chapter images. Please try again.'
            : 'Failed to load chapter images. Please try again.'
        );
        setIsLoading(false);
        setIsLoadingOnline(false);
        setShouldAttemptOnlineLoad(false);
        if (!forceRefresh) {
          setTotalImageCount(null);
        }
        retryingPagesRef.current.clear();
        forceReloadRef.current = false;
      } finally {
        if (activeLoadRequestIdRef.current === requestId) {
          activeLoadRequestIdRef.current = null;
          setIsOnlineLoadInFlight(false);
          isOnlineLoadInFlightRef.current = false;
        }
        if (
          onlineLoadChapterRef.current === requestChapterIdentifier &&
          latestLoadRequestRef.current === requestId
        ) {
          onlineLoadChapterRef.current = null;
        }
      }
    },
    [chapterIdentifier, chapterNumber, chapterUrl, id]
  );

  useEffect(() => {
    if (
      !isDownloaded &&
      shouldAttemptOnlineLoad &&
      interceptData &&
      !isOnlineLoadInFlight
    ) {
      loadOnlineChapter(interceptData, forceReloadRef.current);
    }
  }, [
    interceptData,
    isDownloaded,
    isOnlineLoadInFlight,
    loadOnlineChapter,
    shouldAttemptOnlineLoad,
  ]);

  const handleWebViewIntercepted = useCallback(
    (chapterId: string, vrfToken: string) => {
      if (!shouldAttemptOnlineLoad && !forceReloadRef.current) {
        return;
      }
      setInterceptData({ chapterId, vrfToken });
      setShowHiddenWebView(false);
    },
    [shouldAttemptOnlineLoad]
  );

  const handleWebViewError = useCallback((message: string) => {
    console.error('Hidden WebView error:', message);
    setShowHiddenWebView(false);
    setError('Failed to prepare chapter images. Please try again.');
    setIsLoading(false);
    setIsLoadingOnline(false);
    setIsOnlineLoadInFlight(false);
    setShouldAttemptOnlineLoad(false);
    setTotalImageCount(null);
    isOnlineLoadInFlightRef.current = false;
    activeLoadRequestIdRef.current = null;
    onlineLoadChapterRef.current = null;
  }, []);

  const handleWebViewTimeout = useCallback(() => {
    console.warn('Hidden WebView timeout for chapter');
    setShowHiddenWebView(false);
    setError('Chapter page timed out. Please try again.');
    setIsLoading(false);
    setIsLoadingOnline(false);
    setIsOnlineLoadInFlight(false);
    setShouldAttemptOnlineLoad(false);
    setTotalImageCount(null);
    isOnlineLoadInFlightRef.current = false;
    activeLoadRequestIdRef.current = null;
    onlineLoadChapterRef.current = null;
  }, []);

  // Detect content type based on image dimensions
  const detectAndSetContentType = useCallback(
    async (images: ChapterImage[]) => {
      if (!images || images.length === 0) {
        setContentType('manga');
        return;
      }

      // Sample first few images to determine content type
      const sampleSize = Math.min(3, images.length);
      let tallImageCount = 0;
      let loadedCount = 0;

      return new Promise<'manhwa' | 'manga'>((resolve) => {
        images.slice(0, sampleSize).forEach((image) => {
          Image.getSize(
            image.localPath || '',
            (width, height) => {
              const aspectRatio = height / width;
              // If aspect ratio > 1.5, consider it a tall manhwa-style image
              if (aspectRatio > 1.5) {
                tallImageCount++;
              }

              loadedCount++;
              if (loadedCount === sampleSize) {
                // If majority of sampled images are tall, it's manhwa
                const isManhwa = tallImageCount >= sampleSize / 2;
                resolve(isManhwa ? 'manhwa' : 'manga');
              }
            },
            (error) => {
              console.error('Error getting image size:', error);
              loadedCount++;
              if (loadedCount === sampleSize) {
                // Default to manga if we can't determine
                resolve('manga');
              }
            }
          );
        });
      });
    },
    []
  );

  // Detect content type when images are loaded
  useEffect(() => {
    if (downloadedImages && downloadedImages.length > 0 && !contentType) {
      detectAndSetContentType(downloadedImages)
        .then((type: 'manhwa' | 'manga' | undefined) => {
          if (type) {
            setContentType(type);
          }
          if (isDebugEnabled()) {
            const mode = isDownloaded ? '📱 Downloaded' : '🌐 Online';
            console.log(
              `${mode} chapter ${chapterNumber} with ${downloadedImages.length} images (${type} style)`
            );
          }
        })
        .catch((error: any) => {
          console.error('Error detecting content type:', error);
          // Fallback to manga mode
          setContentType('manga');
        });
    }
  }, [
    downloadedImages,
    contentType,
    chapterNumber,
    isDownloaded,
    detectAndSetContentType,
  ]);

  // Handle programmatic page changes for manga mode
  useEffect(() => {
    if (contentType !== 'manga') {
      return;
    }

    if (totalPages <= 0) {
      return;
    }

    if (currentPage >= totalPages) {
      const clampedPage = Math.max(totalPages - 1, 0);
      currentPageRef.current = clampedPage;
      setCurrentPage(clampedPage);
    }
  }, [contentType, currentPage, totalPages]);

  useEffect(() => {
    if (contentType !== 'manga') {
      return;
    }

    if (totalPages <= 0) {
      return;
    }

    requestAnimationFrame(() => {
      if (mangaListRef.current) {
        mangaListRef.current.scrollToOffset({
          offset: currentPageRef.current * Dimensions.get('window').width,
          animated: false,
        });
      }
    });
  }, [chapterIdentifier, contentType, totalPages]);

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

  // Cleanup temporary cache when leaving chapter
  useEffect(() => {
    return () => {
      // Clear the temporary cache for this chapter when unmounting
      if (!isDownloaded && id && chapterNumber) {
        temporaryImageCacheService
          .clearChapterCache(id, chapterNumber)
          .catch((error: any) => {
            console.warn('Failed to clear temporary cache:', error);
          });
      }
    };
  }, [id, chapterNumber, isDownloaded]);

  const handleBackPress = () => navigateBack();

  const handleChapterPress = (chapterNum: string) => {
    const targetChapter = normalizeChapterNumber(chapterNum);
    if (!targetChapter) {
      return;
    }
    // Update navigation tracking for this intentional navigation
    navigationTimestampRef.current = Date.now();
    lastNavigatedChapterRef.current = targetChapter;
    closeChapterList();
    router.replace(`/manga/${id}/chapter/${targetChapter}`);
  };

  const renderChapterList = () => {
    if (!mangaDetails?.chapters) return null;
    return mangaDetails.chapters.map((chapter) => {
      const normalizedChapterId = normalizeChapterNumber(chapter.number);
      const isCurrentChapter = normalizedChapterId === normalizedChapterParam;

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
            <Text style={styles.chapterNumber}>Chapter {chapter.number}</Text>
            <Text style={styles.chapterDate}>{chapter.date || 'No date'}</Text>
          </View>
          {isCurrentChapter ? (
            <View style={styles.readIndicator} />
          ) : (
            <View style={styles.unreadIndicator} />
          )}
        </TouchableOpacity>
      );
    });
  };

  const navigateChapter = useCallback(
    (chapterOffset: number) => {
      if (!mangaDetails?.chapters || currentChapterIndex < 0) return;
      const newChapter =
        mangaDetails.chapters[currentChapterIndex + chapterOffset];
      if (newChapter?.number) {
        const targetChapter = normalizeChapterNumber(newChapter.number);
        if (!targetChapter) {
          return;
        }
        // Update navigation tracking for this intentional navigation
        navigationTimestampRef.current = Date.now();
        lastNavigatedChapterRef.current = targetChapter;
        router.replace(`/manga/${id}/chapter/${targetChapter}`);
      }
    },
    [currentChapterIndex, id, mangaDetails, router]
  );

  const handleNextChapter = useCallback(
    () => navigateChapter(-1),
    [navigateChapter]
  );
  const handlePreviousChapter = useCallback(
    () => navigateChapter(1),
    [navigateChapter]
  );

  const handleImageLoadError = useCallback(
    (pageNumber: number) => {
      console.warn(`Image load error on page ${pageNumber}, attempting reload`);

      if (isDownloaded) {
        chapterStorageService
          .getChapterImages(id, chapterNumber)
          .then((images) => {
            if (images) {
              setDownloadedImages(images);
              downloadedImagesRef.current = images;
              setTotalImageCount(images.length);
              console.log(
                `Successfully reloaded chapter images after error on page ${pageNumber}`
              );
            }
          })
          .catch((storageError) => {
            console.error(
              `Failed to reload downloaded chapter images for page ${pageNumber}:`,
              storageError
            );
          })
          .finally(() => {
            retryingPagesRef.current.delete(pageNumber);
          });
        return;
      }

      // For online chapters, trigger full reload
      if (retryingPagesRef.current.has(pageNumber)) {
        console.debug(
          `Already retrying page ${pageNumber}, skipping duplicate request`
        );
        return;
      }

      retryingPagesRef.current.add(pageNumber);
      setError(null);

      if (isOnlineLoadInFlightRef.current) {
        forceReloadRef.current = true;
        setShouldAttemptOnlineLoad(true);
        if (!interceptDataRef.current) {
          setShowHiddenWebView(true);
        }
        setIsLoadingOnline(true);
        return;
      }

      if (!interceptDataRef.current) {
        forceReloadRef.current = true;
        setShouldAttemptOnlineLoad(true);
        setShowHiddenWebView(true);
        setIsLoadingOnline(true);
        return;
      }

      setIsLoadingOnline(true);

      loadOnlineChapter(interceptDataRef.current, true)
        .catch((reloadError) => {
          console.error(
            `Failed to refresh chapter images after load error on page ${pageNumber}:`,
            reloadError
          );
        })
        .finally(() => {
          retryingPagesRef.current.delete(pageNumber);
        });
    },
    [chapterNumber, id, isDownloaded, loadOnlineChapter]
  );

  const handleDismissGuide = () => {
    setShowGuide(false);
    // Ensure controls are visible after dismissing the guide
    showControls();
  };

  const enhancedBackButtonSize = ensureMinimumSize(40);
  const enhancedNavigationButtonSize = ensureMinimumSize(44);
  const downloadedImageCount = downloadedImages?.length ?? 0;

  const progressLabel = useMemo(() => {
    if (!isDownloaded && totalPages > 0) {
      const base = isLoadingOnline
        ? `Downloading ${completedImages}/${totalPages} images`
        : `Loaded ${completedImages}/${totalPages} images`;
      const failedSuffix = failedImages > 0 ? ` • ${failedImages} failed` : '';
      return `${base}${failedSuffix}`;
    }
    return undefined;
  }, [
    completedImages,
    failedImages,
    isDownloaded,
    isLoadingOnline,
    totalPages,
  ]);

  const renderPlaceholder = useCallback(
    (
      message: string,
      options?: { subMessage?: string; showSpinner?: boolean }
    ) => {
      const { subMessage, showSpinner = true } = options ?? {};

      return (
        <View style={styles.listEmptyContainer}>
          {showSpinner ? (
            <ActivityIndicator
              testID="flashlist-loading-indicator"
              size="large"
              color={Colors[colorScheme].primary}
            />
          ) : (
            <Ionicons
              name="image-outline"
              size={32}
              color={Colors[colorScheme].text + '60'}
            />
          )}
          <Text style={styles.listEmptyPrimary}>{message}</Text>
          {subMessage ? (
            <Text style={styles.listEmptySecondary}>{subMessage}</Text>
          ) : null}
        </View>
      );
    },
    [colorScheme, styles]
  );

  const renderListEmptyComponent = useCallback(() => {
    if (!contentType && downloadedImageCount > 0) {
      return renderPlaceholder(
        'Loading your content...',
        progressLabel ? { subMessage: progressLabel } : undefined
      );
    }

    if (isLoadingOnline) {
      return renderPlaceholder(
        'Downloading chapter images...',
        progressLabel ? { subMessage: progressLabel } : undefined
      );
    }

    if (isLoading) {
      return renderPlaceholder(
        'Preparing chapter images...',
        progressLabel ? { subMessage: progressLabel } : undefined
      );
    }

    if (isDownloaded) {
      return renderPlaceholder('Downloaded chapter has no images', {
        subMessage: 'Try refreshing or re-downloading this chapter.',
        showSpinner: false,
      });
    }

    return renderPlaceholder('Chapter images are not available yet.', {
      ...(progressLabel ? { subMessage: progressLabel } : {}),
      showSpinner: false,
    });
  }, [
    contentType,
    downloadedImageCount,
    isDownloaded,
    isLoading,
    isLoadingOnline,
    progressLabel,
    renderPlaceholder,
  ]);

  const shouldShowProgressFooter = useMemo(
    () =>
      !isDownloaded &&
      totalPages > 0 &&
      (isLoadingOnline || completedImages < totalPages),
    [completedImages, isDownloaded, isLoadingOnline, totalPages]
  );

  const renderManhwaFooter = useMemo(
    () => (
      <View style={styles.listFooterWrapper}>
        {shouldShowProgressFooter ? (
          <View style={styles.listFooterContent}>
            <ActivityIndicator
              size="small"
              color={Colors[colorScheme].primary}
            />
            <Text style={styles.listFooterText}>
              {progressLabel ?? 'Loading chapter images...'}
            </Text>
          </View>
        ) : null}
        <View style={styles.chapterEndSpacer} />
      </View>
    ),
    [shouldShowProgressFooter, colorScheme, progressLabel, styles]
  );

  const renderMangaFooter = useMemo(() => {
    if (!shouldShowProgressFooter || !progressLabel) {
      return null;
    }

    return (
      <View style={styles.mangaFooter}>
        <ActivityIndicator size="small" color={Colors[colorScheme].primary} />
        <Text style={styles.listFooterText}>{progressLabel}</Text>
      </View>
    );
  }, [shouldShowProgressFooter, progressLabel, colorScheme, styles]);

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
        console.log('Downloaded chapter touch:', {
          x: pageX,
          y: pageY,
          windowHeight,
          topThreshold: topControlThreshold,
          isTopArea: isTopControlArea,
          isLeftEdge: isLeftEdgeTap,
          isRightEdge: isRightEdgeTap,
          contentType,
          currentPage: currentPageRef.current,
        });
      }

      // Different behavior for manga vs manhwa
      if (contentType === 'manga') {
        if (isTopControlArea) {
          toggleControls();
          return;
        }

        const totalPagesCount = totalPages;
        const current = currentPageRef.current;

        if (isLeftEdgeTap && current > 0) {
          const newPage = current - 1;
          currentPageRef.current = newPage;
          setCurrentPage(newPage);
          mangaListRef.current?.scrollToOffset({
            offset: newPage * windowWidth,
            animated: true,
          });
          return;
        }

        if (
          isRightEdgeTap &&
          totalPagesCount &&
          current < totalPagesCount - 1
        ) {
          const newPage = current + 1;
          currentPageRef.current = newPage;
          setCurrentPage(newPage);
          mangaListRef.current?.scrollToOffset({
            offset: newPage * windowWidth,
            animated: true,
          });
          return;
        }

        toggleControls();
        return;
      }

      // Manhwa mode: original behavior (no edge navigation)
      if (isTopControlArea) {
        toggleControls();
      } else if (!isLeftEdgeTap && !isRightEdgeTap) {
        toggleControls();
      }
    },
    [contentType, totalPages, toggleControls]
  );

  // Manhwa-style continuous scrolling renderer
  const renderManhwaChapter = () => (
    <FlashList
      key={`manhwa-${chapterIdentifier}`}
      data={displayPages}
      renderItem={({ item }) => (
        <ManhwaImage
          image={item}
          onPress={handleDownloadedChapterTouch}
          colorScheme={colorScheme}
          onError={handleImageLoadError}
        />
      )}
      keyExtractor={(item) => `page-${item.pageNumber}`}
      contentContainerStyle={styles.manhwaImagesContainer}
      showsVerticalScrollIndicator={false}
      ListEmptyComponent={renderListEmptyComponent}
      ListFooterComponent={renderManhwaFooter}
      scrollEventThrottle={16}
      style={styles.webView}
    />
  );

  const handleMangaMomentumEnd = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      const page = Math.round(
        event.nativeEvent.contentOffset.x / Dimensions.get('window').width
      );
      currentPageRef.current = page;
      setCurrentPage((prev) => (prev === page ? prev : page));
    },
    []
  );

  // Manga-style page-by-page renderer
  const renderMangaChapter = () => (
    <FlashList
      key={`manga-${chapterIdentifier}`}
      ref={mangaListRef}
      data={displayPages}
      renderItem={({ item }) => (
        <TouchableWithoutFeedback onPress={handleDownloadedChapterTouch}>
          <View style={styles.mangaPageContainer}>
            {item.localPath ? (
              <Image
                source={{ uri: item.localPath }}
                style={styles.mangaImage}
                resizeMode="contain"
                onError={(error) => {
                  console.error(
                    `Failed to load image ${item.pageNumber}:`,
                    error
                  );
                  handleImageLoadError(item.pageNumber);
                }}
                onLoad={(event) => {
                  if (isDebugEnabled()) {
                    const { width, height } = event.nativeEvent.source;
                    console.log(
                      `📖 Manga Page ${item.pageNumber}/${totalPages} [${id}/${chapterNumber}]: ${width}x${height}`
                    );
                  }
                }}
              />
            ) : (
              <View style={[styles.mangaImage, styles.pagePlaceholder]}>
                <ActivityIndicator
                  size="small"
                  color={Colors[colorScheme].primary}
                />
              </View>
            )}
          </View>
        </TouchableWithoutFeedback>
      )}
      keyExtractor={(item) => `page-${item.pageNumber}`}
      horizontal
      pagingEnabled
      showsHorizontalScrollIndicator={false}
      decelerationRate="fast"
      scrollEventThrottle={16}
      onMomentumScrollEnd={handleMangaMomentumEnd}
      ListEmptyComponent={renderListEmptyComponent}
      ListFooterComponent={renderMangaFooter}
      style={styles.webView}
    />
  );

  // Local image viewer for downloaded chapters
  const renderDownloadedChapter = () => {
    if (!contentType) {
      return renderPlaceholder(
        'Loading your content...',
        progressLabel ? { subMessage: progressLabel } : undefined
      );
    }

    if (contentType === 'manga') {
      return renderMangaChapter();
    }

    return renderManhwaChapter();
  };

  return (
    <View style={styles.container}>
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <>
          <View style={styles.webViewContainer}>
            {renderDownloadedChapter()}
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
                        Chapter {displayChapterNumber}
                        {contentType === 'manga' && totalPages > 0 && (
                          <Text style={styles.pageIndicator}>
                            {' '}
                            • {Math.min(currentPage + 1, totalPages)}/
                            {totalPages}
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
                    {!isDownloaded && (isLoadingOnline || totalPages > 0) && (
                      <Text
                        style={styles.downloadProgressText}
                        numberOfLines={1}
                      >
                        {totalPages > 0
                          ? isLoadingOnline
                            ? `Downloading ${completedImages}/${totalPages} images`
                            : `Loaded ${completedImages}/${totalPages} images`
                          : 'Preparing chapter images...'}
                        {totalPages > 0 && failedImages > 0
                          ? ` • ${failedImages} failed`
                          : ''}
                      </Text>
                    )}
                  </TouchableOpacity>
                </View>

                <View style={styles.rightControls}>
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

          {/* Chapter Guide Overlay */}
          <ChapterGuideOverlay
            visible={showGuide}
            onDismiss={handleDismissGuide}
            colors={Colors[colorScheme]}
            onStepChange={handleGuideStepChange}
            hideControls={hideNavControls}
            showControls={showNavControls}
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
                    Current: Chapter {displayChapterNumber}
                  </Text>
                  {renderChapterList()}
                </BottomSheetScrollView>
              </View>
            </BottomSheet>
          ) : (
            <Modal
              visible={isBottomSheetOpen}
              transparent
              animationType="slide"
              onRequestClose={closeChapterList}
            >
              <TouchableWithoutFeedback onPress={closeChapterList}>
                <View style={styles.modalOverlay} />
              </TouchableWithoutFeedback>
              <View style={styles.fallbackSheetContainer}>
                <View style={styles.fallbackSheetHandle} />
                <Text style={styles.bottomSheetTitle}>{mangaTitle}</Text>
                <Text style={styles.currentChapterTitle}>
                  Current: Chapter {displayChapterNumber}
                </Text>
                <View
                  style={[styles.bottomSheetContent, { paddingBottom: 24 }]}
                >
                  {renderChapterList()}
                </View>
              </View>
            </Modal>
          )}
        </>
      )}

      {showHiddenWebView && !isDownloaded && (
        <HiddenChapterWebView
          key={`${id}-${chapterIdentifier}`}
          chapterUrl={chapterUrl}
          onRequestIntercepted={handleWebViewIntercepted}
          onError={handleWebViewError}
          onTimeout={handleWebViewTimeout}
          timeout={30000}
        />
      )}
    </View>
  );
}
