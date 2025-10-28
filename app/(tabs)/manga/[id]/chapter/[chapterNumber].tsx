import React, { useState, useCallback, useEffect, useRef } from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  BackHandler,
  Platform,
  useColorScheme,
  Animated,
  StatusBar,
  Modal,
  TouchableWithoutFeedback,
  ScrollView,
  Image,
  Dimensions,
  GestureResponderEvent,
  FlatList,
} from 'react-native';
import * as Reanimated from 'react-native-reanimated';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { useNavigationHistory } from '@/hooks/useNavigationHistory';

import { WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetScrollView } from '@gorhom/bottom-sheet';

import { getMangaData } from '@/services/bookmarkService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  getChapterUrl,
  markChapterAsRead,
  getInjectedJavaScript,
  fetchMangaDetails,
  MangaDetails,
} from '@/services/mangaFireService';
import { chapterStorageService } from '@/services/chapterStorageService';
import { ChapterImage } from '@/types/download';
import { useTheme } from '@/constants/ThemeContext';
import { Colors, ColorScheme } from '@/constants/Colors';
import CustomWebView from '@/components/CustomWebView';
import {
  ChapterGuideOverlay,
  hasSeenChapterGuide,
} from '@/components/ChapterGuideOverlay';
import getStyles from './[chapterNumber].styles';
import { logger } from '@/utils/logger';
import { isDebugEnabled } from '@/constants/env';

// Minimum touch target size (in dp)
const MIN_TOUCHABLE_SIZE = 48;

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
  }: {
    image: ChapterImage;
    onPress: (event: GestureResponderEvent) => void;
    colorScheme: ColorScheme;
  }) => {
    const [imageHeight, setImageHeight] = useState<number>(400); // Default height
    const [isImageLoaded, setIsImageLoaded] = useState(false);

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
      }
    }, [image.localPath]);

    return (
      <TouchableWithoutFeedback onPress={onPress}>
        <View style={getStyles(colorScheme).manhwaImageContainer}>
          <Image
            source={{ uri: image.localPath }}
            style={[
              getStyles(colorScheme).manhwaImage,
              {
                height: imageHeight,
                width: Dimensions.get('window').width,
              },
            ]}
            resizeMode="contain"
            onError={(error) => {
              console.error(`Failed to load image ${image.pageNumber}:`, error);
              setIsImageLoaded(true); // Stop loading state on error
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

  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const bottomSheetRef = useRef<BottomSheet>(null);
  const controlsTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mangaFlatListRef = useRef<FlatList>(null);
  const downloadedImagesRef = useRef<ChapterImage[] | null>(null);

  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme =
    theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const styles = getStyles(colorScheme);
  const insets = useSafeAreaInsets();

  const chapterUrl = getChapterUrl(id, chapterNumber);
  const webLoadStartRef = useRef<number>(
    (globalThis as any).performance?.now?.() ?? Date.now()
  );
  const log = logger();
  const supportsWorklets =
    typeof (Reanimated as any).useWorkletCallback === 'function';
  const currentChapterIndex = mangaDetails?.chapters?.findIndex(
    (chapter) => chapter.number === chapterNumber
  );
  const hasNextChapter =
    currentChapterIndex !== undefined &&
    currentChapterIndex > 0 &&
    mangaDetails?.chapters?.[currentChapterIndex - 1];
  const hasPreviousChapter =
    currentChapterIndex !== undefined &&
    currentChapterIndex < (mangaDetails?.chapters?.length ?? 0) - 1 &&
    mangaDetails?.chapters?.[currentChapterIndex + 1];

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
      await markChapterAsRead(id, chapterNumber, title);
      setMangaTitle(title);
    } catch (error) {
      console.error('Error marking chapter as read:', error);
    }
  }, [id, chapterNumber]);

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

        // Detect content type
        if (images && images.length > 0) {
          try {
            const type = await detectContentType(images);
            setContentType(type);

            if (isDebugEnabled()) {
              console.log(
                `📱 Using downloaded chapter ${chapterNumber} with ${images.length} images (${type} style)`
              );
            }
          } catch (error) {
            console.error('Error detecting content type:', error);
            // Fallback to manga mode
            setContentType('manga');
          }
        }

        // For downloaded chapters, we can set loading to false immediately
        setIsLoading(false);
      }
    } catch (error) {
      console.error('Error fetching manga details:', error);
    }
  }, [id, chapterNumber]);

  useEffect(() => {
    markChapterAsReadWithFallback();
  }, [markChapterAsReadWithFallback]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  // Handle programmatic page changes for manga mode
  useEffect(() => {
    if (
      contentType === 'manga' &&
      mangaFlatListRef.current &&
      downloadedImages
    ) {
      mangaFlatListRef.current.scrollToIndex({
        index: currentPage,
        animated: true,
      });
    }
  }, [currentPage, contentType, downloadedImages]);

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

  const handleLoadEnd = () => {
    setIsLoading(false);
    if (isDebugEnabled()) {
      const dur =
        ((globalThis as any).performance?.now?.() ?? Date.now()) -
        (webLoadStartRef.current ??
          (globalThis as any).performance?.now?.() ??
          Date.now());
      log.info('UI', 'ChapterWebView load complete', {
        id,
        chapterNumber,
        durationMs: Math.round(dur),
      });
    }
  };
  const handleBackPress = () => navigateBack();
  const handleError = () => {
    setError('Failed to load chapter. Please try again.');
    setIsLoading(false);
  };

  const handleNavigationStateChange = useCallback(
    async (navState: WebViewNavigation) => {
      if (navState.url !== chapterUrl) {
        const newChapterMatch = navState.url.match(/\/chapter-(\d+)/);
        if (newChapterMatch) {
          const newChapterNumber = newChapterMatch[1];
          if (mangaTitle && id && newChapterNumber) {
            await markChapterAsRead(id, newChapterNumber, mangaTitle);
          }
          router.replace(`/manga/${id}/chapter/${newChapterNumber}`);
        }
      }
    },
    [chapterUrl, id, mangaTitle, router]
  );

  const handleChapterPress = (chapterNum: string) => {
    closeChapterList();
    router.navigate(`/manga/${id}/chapter/${chapterNum}`);
  };

  const renderChapterList = () => {
    if (!mangaDetails?.chapters) return null;
    return mangaDetails.chapters.map((chapter) => (
      <TouchableOpacity
        key={chapter.number}
        style={[
          styles.chapterItem,
          chapter.number === chapterNumber && styles.currentChapter,
        ]}
        onPress={() => handleChapterPress(chapter.number)}
      >
        <View style={styles.chapterItemLeft}>
          <Text style={styles.chapterNumber}>Chapter {chapter.number}</Text>
          <Text style={styles.chapterDate}>{chapter.date || 'No date'}</Text>
        </View>
        {chapter.number === chapterNumber ? (
          <View style={styles.readIndicator} />
        ) : (
          <View style={styles.unreadIndicator} />
        )}
      </TouchableOpacity>
    ));
  };

  const navigateChapter = (chapterOffset: number) => {
    if (!mangaDetails?.chapters || currentChapterIndex === undefined) return;
    const newChapter =
      mangaDetails.chapters[currentChapterIndex + chapterOffset];
    if (newChapter) {
      router.navigate(`/manga/${id}/chapter/${newChapter.number}`);
    }
  };

  const handleNextChapter = () => navigateChapter(-1);
  const handlePreviousChapter = () => navigateChapter(1);

  const handleWebViewMessage = (event: any) => {
    if (event.nativeEvent.data === 'toggleControls') {
      toggleControls();
    }
  };

  const handleDismissGuide = () => {
    setShowGuide(false);
    // Ensure controls are visible after dismissing the guide
    showControls();
  };

  const injectedJS = `
  ${getInjectedJavaScript(Colors[colorScheme].card)}
  (function() {
    var tapThreshold = 60;
    var windowWidth = window.innerWidth || document.documentElement.clientWidth || document.body.clientWidth;
    var windowHeight = window.innerHeight || document.documentElement.clientHeight || document.body.clientHeight;
    var topControlThreshold = windowHeight * 0.4; // 40% of the screen height

    document.addEventListener('click', function(e) {
      var tapX = e.clientX || e.pageX;
      var tapY = e.clientY || e.pageY;
      var isRightEdgeTap = tapX > windowWidth - tapThreshold;
      var isLeftEdgeTap = tapX < tapThreshold;
      var isTopControlArea = tapY < topControlThreshold;

      // Check if the click target is a navigation element (e.g., a link or button)
      var isNavigationElement = e.target.tagName === 'A' || e.target.tagName === 'BUTTON';

      if (isTopControlArea) {
        window.ReactNativeWebView.postMessage('toggleControls');
      } else if (!isLeftEdgeTap && !isNavigationElement && isRightEdgeTap) {
        //Right edge tap on bottom 60% - No action needed here anymore
      } else if (!isLeftEdgeTap && !isNavigationElement && !isRightEdgeTap) {
        window.ReactNativeWebView.postMessage('toggleControls');
      }
    });
  })();
`;

  const enhancedBackButtonSize = ensureMinimumSize(40);
  const enhancedNavigationButtonSize = ensureMinimumSize(44);

  // Detect content type based on image dimensions
  const detectContentType = useCallback((images: ChapterImage[]) => {
    if (!images || images.length === 0) return 'manga';

    // Sample first few images to determine content type
    const sampleSize = Math.min(3, images.length);
    let tallImageCount = 0;

    return new Promise<'manhwa' | 'manga'>((resolve) => {
      let loadedCount = 0;

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
  }, []);

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
        });
      }

      // Different behavior for manga vs manhwa
      if (contentType === 'manga') {
        // Manga mode: left/right edges navigate pages
        if (isTopControlArea) {
          toggleControls();
        } else if (isLeftEdgeTap && currentPage > 0) {
          // Previous page (left edge)
          const newPage = currentPage - 1;
          setCurrentPage(newPage);
          // Scroll to previous page - this will be handled by FlatList ref if needed
        } else if (
          isRightEdgeTap &&
          downloadedImagesRef.current &&
          currentPage < downloadedImagesRef.current.length - 1
        ) {
          // Next page (right edge)
          const newPage = currentPage + 1;
          setCurrentPage(newPage);
          // Scroll to next page - this will be handled by FlatList ref if needed
        } else if (!isLeftEdgeTap && !isRightEdgeTap) {
          // Center area toggles controls
          toggleControls();
        }
      } else {
        // Manhwa mode: original behavior (no edge navigation)
        if (isTopControlArea) {
          toggleControls();
        } else if (!isLeftEdgeTap && !isRightEdgeTap) {
          toggleControls();
        }
      }
    },
    [toggleControls, contentType, currentPage]
  );

  // Manhwa-style continuous scrolling renderer
  const renderManhwaChapter = () => {
    const sortedImages = downloadedImages!.sort(
      (a, b) => a.pageNumber - b.pageNumber
    );

    return (
      <ScrollView
        style={styles.webView}
        contentContainerStyle={styles.manhwaImagesContainer}
        showsVerticalScrollIndicator={false}
        decelerationRate="normal"
      >
        {sortedImages.map((image) => (
          <ManhwaImage
            key={`page-${image.pageNumber}`}
            image={image}
            onPress={handleDownloadedChapterTouch}
            colorScheme={colorScheme}
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
        <View style={styles.mangaPageContainer}>
          <Image
            source={{ uri: item.localPath }}
            style={styles.mangaImage}
            resizeMode="contain"
            onError={(error) => {
              console.error(`Failed to load image ${item.pageNumber}:`, error);
            }}
            onLoad={(event) => {
              if (isDebugEnabled()) {
                const { width, height } = event.nativeEvent.source;
                console.log(
                  `Manga Image ${item.pageNumber}: ${width}x${height}`
                );
              }
            }}
          />
        </View>
      </TouchableWithoutFeedback>
    );

    return (
      <FlatList
        ref={mangaFlatListRef}
        data={sortedImages}
        renderItem={renderPage}
        keyExtractor={(item) => `page-${item.pageNumber}`}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        decelerationRate="fast"
        onMomentumScrollEnd={(event) => {
          const page = Math.round(
            event.nativeEvent.contentOffset.x / Dimensions.get('window').width
          );
          setCurrentPage(page);
        }}
        getItemLayout={(_, index) => ({
          length: Dimensions.get('window').width,
          offset: Dimensions.get('window').width * index,
          index,
        })}
        style={styles.webView}
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

    if (!contentType) {
      // Still detecting content type, show loading
      return (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors[colorScheme].primary} />
          <Text style={styles.loadingText}>Analyzing content...</Text>
        </View>
      );
    }

    return contentType === 'manhwa'
      ? renderManhwaChapter()
      : renderMangaChapter();
  };

  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator
            testID="loading-indicator"
            size="large"
            color={Colors[colorScheme].primary}
          />
        </View>
      )}
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <>
          <View style={styles.webViewContainer}>
            {isDownloaded && downloadedImages ? (
              renderDownloadedChapter()
            ) : (
              <CustomWebView
                source={{ uri: chapterUrl }}
                currentUrl={chapterUrl}
                style={styles.webView}
                onLoadEnd={handleLoadEnd}
                onError={handleError}
                testID="chapter-webview"
                injectedJavaScript={injectedJS}
                onNavigationStateChange={handleNavigationStateChange}
                onMessage={handleWebViewMessage}
                allowedHosts={['mangafire.to']}
                javaScriptEnabled={true}
                domStorageEnabled={true}
                decelerationRate={Platform.OS === 'ios' ? 'normal' : 0.9}
                nestedScrollEnabled={true}
              />
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
                        {isDownloaded &&
                          contentType === 'manga' &&
                          downloadedImages && (
                            <Text style={styles.pageIndicator}>
                              {' '}
                              • {currentPage + 1}/{downloadedImages.length}
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
                    Current: Chapter {chapterNumber}
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
                  Current: Chapter {chapterNumber}
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
    </View>
  );
}
