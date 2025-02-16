import React, {
  useState,
  useCallback,
  useEffect,
  useRef,
} from 'react';
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  BackHandler,
  Platform,
  useColorScheme,
  Animated,
} from 'react-native';
import {
  useLocalSearchParams,
  useRouter,
  useFocusEffect,
} from 'expo-router';
import { WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet from '@gorhom/bottom-sheet';
import { BottomSheetScrollView } from '@gorhom/bottom-sheet';
import { BlurView } from 'expo-blur';
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';

import {
  getChapterUrl,
  markChapterAsRead,
  getInjectedJavaScript,
  fetchMangaDetails,
  MangaDetails,
} from '@/services/mangaFireService';
import { useTheme } from '@/constants/ThemeContext';
import { Colors, ColorScheme } from '@/constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import CustomWebView from '@/components/CustomWebView';
import getStyles from './[chapterNumber].styles';

const HEADER_HEIGHT = 44;
const AnimatedBlurView = Animated.createAnimatedComponent(BlurView);

export default function ReadChapterScreen() {
  const { id, chapterNumber } = useLocalSearchParams<{
    id: string;
    chapterNumber: string;
  }>();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mangaTitle, setMangaTitle] = useState<string | null>(null);
  const [mangaDetails, setMangaDetails] = useState<MangaDetails | null>(null);
  const [isControlsVisible, setIsControlsVisible] = useState(true);
  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const bottomSheetRef = useRef<BottomSheet>(null);
  const snapPoints = ['60%', '90%'];
  const controlsTimeout = useRef<NodeJS.Timeout>();

  const [imagesLoaded, setImagesLoaded] = useState(0);
  const [totalImages, setTotalImages] = useState(0);
  const [shouldLoadEnd, setShouldLoadEnd] = useState(false);


  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme =
    theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const insets = useSafeAreaInsets();
  const mergedStyles = getStyles(colorScheme);

  const chapterUrl = getChapterUrl(id, chapterNumber);
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

  // Auto-hide the controls after 3 seconds
  const startControlsTimer = useCallback(() => {
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
  }, [controlsOpacity]);

  const showControls = useCallback(() => {
    setIsControlsVisible(true);
    Animated.timing(controlsOpacity, {
      toValue: 1,
      duration: 200,
      useNativeDriver: true,
    }).start();
    startControlsTimer();
  }, [controlsOpacity, startControlsTimer]);

  const toggleControls = useCallback(() => {
    if (isControlsVisible) {
      if (controlsTimeout.current) {
        clearTimeout(controlsTimeout.current);
      }
      Animated.timing(controlsOpacity, {
        toValue: 0,
        duration: 200,
        useNativeDriver: true,
      }).start(() => setIsControlsVisible(false));
    } else {
      showControls();
    }
  }, [isControlsVisible, controlsOpacity, showControls]);

  // Mark the chapter as read (using fallback if needed)
  useEffect(() => {
    const markChapterAsReadWithFallback = async () => {
      try {
        let title = await AsyncStorage.getItem(`title_${id}`);
        if (!title) {
          const details = await fetchMangaDetails(id);
          title = details.title;
        }
        await markChapterAsRead(id, chapterNumber, title);
        setMangaTitle(title);
      } catch (error) {
        console.error('Error marking chapter as read:', error);
      }
    };
    markChapterAsReadWithFallback();
  }, [id, chapterNumber]);

  // Fetch manga details
  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const details = await fetchMangaDetails(id);
        setMangaDetails(details);
      } catch (error) {
        console.error('Error fetching manga details:', error);
      }
    };
    fetchDetails();
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        router.navigate(`/manga/${id}`);
        return true;
      };
      const backHandler = BackHandler.addEventListener(
        'hardwareBackPress',
        onBackPress
      );
      return () => backHandler.remove();
    }, [id, router])
  );

  const handleLoadEnd = () => setIsLoading(false);
  const handleBackPress = () => router.navigate(`/manga/${id}`);
  const handleError = () => {
    setError('Failed to load chapter. Please try again.');
    setIsLoading(false);
  };

  const handleNavigationStateChange = async (
    navState: WebViewNavigation
  ) => {
    if (navState.url !== chapterUrl) {
      const newChapterMatch = navState.url.match(/\/chapter-(\d+)/);
      if (newChapterMatch) {
        const newChapterNumber = newChapterMatch[1];
        if (mangaTitle) {
          await markChapterAsRead(id, newChapterNumber, mangaTitle);
        }
        router.replace(`/manga/${id}/chapter/${newChapterNumber}`);
      }
    }
  };

  const handleChapterPress = (chapterNum: string) => {
    bottomSheetRef.current?.close();
    router.navigate(`/manga/${id}/chapter/${chapterNum}`);
  };

  const renderChapterList = () => {
    if (!mangaDetails?.chapters) return null;
    return mangaDetails.chapters.map((chapter) => (
      <TouchableOpacity
        key={chapter.number}
        style={[
          mergedStyles.chapterItem,
          chapter.number === chapterNumber && mergedStyles.currentChapter,
        ]}
        onPress={() => handleChapterPress(chapter.number)}
      >
        <Text style={mergedStyles.chapterText}>
          Chapter {chapter.number}
        </Text>
        {chapter.number === chapterNumber && (
          <Ionicons
            name="bookmark"
            size={20}
            color={Colors[colorScheme].primary}
          />
        )}
      </TouchableOpacity>
    ));
  };

  const handleNextChapter = () => {
    if (!hasNextChapter || !mangaDetails?.chapters) return;
    const nextChapter = mangaDetails.chapters[currentChapterIndex! - 1];
    router.navigate(`/manga/${id}/chapter/${nextChapter.number}`);
  };

  const handlePreviousChapter = () => {
    if (!hasPreviousChapter || !mangaDetails?.chapters) return;
    const prevChapter = mangaDetails.chapters[currentChapterIndex! + 1];
    router.navigate(`/manga/${id}/chapter/${prevChapter.number}`);
  };

  // Detect tap events from the injected JS inside the WebView.
  // A quick tap posts the "toggleControls" message.
  const handleWebViewMessage = (event: any) => {
    const message = event.nativeEvent.data;
    if (message === 'toggleControls') {
      toggleControls();
    }
  };

  /* 
    Merge our injected JavaScript with the original script from 
    getInjectedJavaScript. The embedded code listens for touch events 
    and posts a message only when there is a quick tap (minimal movement).
  */
  const injectedJS = `
    ${getInjectedJavaScript(Colors[colorScheme].card)}
    (function() {
      var tapped = false;
      var touchStartX = 0;
      var touchStartY = 0;
      var touchStartTime = 0;
      document.addEventListener('touchstart', function(e) {
        tapped = true;
        touchStartX = e.touches[0].clientX;
        touchStartY = e.touches[0].clientY;
        touchStartTime = new Date().getTime();
      });
      document.addEventListener('touchmove', function(e) {
        var dx = Math.abs(e.touches[0].clientX - touchStartX);
        var dy = Math.abs(e.touches[0].clientY - touchStartY);
        if (dx > 5 || dy > 5) {
          tapped = false;
        }
      });
      document.addEventListener('touchend', function(e) {
        var duration = new Date().getTime() - touchStartTime;
        if (tapped && duration < 200) {
          window.ReactNativeWebView.postMessage('toggleControls');
        }
      });
    })();
  `;

  return (
    <View style={mergedStyles.container}>
      <ExpoStatusBar
        style={colorScheme === 'dark' ? 'light' : 'dark'}
        backgroundColor="transparent"
        translucent
      />
      {isLoading && (
        <View style={mergedStyles.loadingContainer}>
          <ActivityIndicator
            testID="loading-indicator"
            size="large"
            color={Colors[colorScheme].primary}
          />
        </View>
      )}
      {error ? (
        <View style={mergedStyles.errorContainer}>
          <Text style={mergedStyles.errorText}>{error}</Text>
        </View>
      ) : (
        <>
          <View style={mergedStyles.webViewContainer}>
            <CustomWebView
              source={{ uri: chapterUrl }}
              currentUrl={chapterUrl}
              style={mergedStyles.webView}
              onLoadEnd={handleLoadEnd}
              onError={handleError}
              testID="chapter-webview"
              injectedJavaScript={injectedJS}
              onNavigationStateChange={handleNavigationStateChange}
              onMessage={handleWebViewMessage}
              allowedHosts={['mangafire.to']}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              decelerationRate={
                Platform.OS === 'ios' ? 'normal' : 0.98
              }
              nestedScrollEnabled={true}
            />
          </View>

          <AnimatedBlurView
            intensity={80}
            tint={colorScheme === 'dark' ? 'dark' : 'light'}
            style={[
              mergedStyles.controls,
              {
                opacity: controlsOpacity,
                height: HEADER_HEIGHT + insets.top,
                paddingTop: insets.top
              },
            ]}
            pointerEvents={isControlsVisible ? 'auto' : 'none'}
          >
            <View style={mergedStyles.controlsRow}>
              <View style={mergedStyles.leftControls}>
                <TouchableOpacity
                  testID="back-button"
                  style={mergedStyles.controlButton}
                  onPress={handleBackPress}
                >
                  <Ionicons
                    name="chevron-back"
                    size={24}
                    color={Colors[colorScheme].text}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={mergedStyles.titleButton}
                  onPress={() => bottomSheetRef.current?.expand()}
                >
                  <Text style={mergedStyles.titleText} numberOfLines={1}>
                    {mangaTitle || 'Loading...'}
                  </Text>
                  <Text style={mergedStyles.chapterText}>
                    Chapter {chapterNumber}
                  </Text>
                </TouchableOpacity>
              </View>
              <View style={mergedStyles.rightControls}>
                <TouchableOpacity
                  style={[
                    mergedStyles.controlButton,
                    !hasPreviousChapter && mergedStyles.disabledButton,
                  ]}
                  onPress={handlePreviousChapter}
                  disabled={!hasPreviousChapter}
                >
                  <Ionicons
                    name="chevron-back-outline"
                    size={24}
                    color={Colors[colorScheme].text}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={[
                    mergedStyles.controlButton,
                    !hasNextChapter && mergedStyles.disabledButton,
                  ]}
                  onPress={handleNextChapter}
                  disabled={!hasNextChapter}
                >
                  <Ionicons
                    name="chevron-forward-outline"
                    size={24}
                    color={Colors[colorScheme].text}
                  />
                </TouchableOpacity>
                <TouchableOpacity
                  style={mergedStyles.controlButton}
                  onPress={() => bottomSheetRef.current?.expand()}
                >
                  <Ionicons
                    name="list-outline"
                    size={24}
                    color={Colors[colorScheme].text}
                  />
                </TouchableOpacity>
              </View>
            </View>
          </AnimatedBlurView>

          <BottomSheet
            ref={bottomSheetRef}
            snapPoints={snapPoints}
            index={-1}
            enablePanDownToClose
            backgroundStyle={mergedStyles.bottomSheetBackground}
            handleIndicatorStyle={mergedStyles.bottomSheetIndicator}
          >
            <BottomSheetScrollView
              contentContainerStyle={mergedStyles.bottomSheetContent}
            >
              <Text style={mergedStyles.bottomSheetTitle}>
                {mangaTitle}
              </Text>
              <Text style={mergedStyles.currentChapterTitle}>
                Current: Chapter {chapterNumber}
              </Text>
              {renderChapterList()}
            </BottomSheetScrollView>
          </BottomSheet>
        </>
      )}
    </View>
  );
}
