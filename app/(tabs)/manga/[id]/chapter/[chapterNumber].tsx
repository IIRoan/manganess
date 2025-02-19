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
  PanResponder,
  Dimensions,
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
import { StatusBar as ExpoStatusBar } from 'expo-status-bar';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import {
  getChapterUrl,
  markChapterAsRead,
  getInjectedJavaScript,
  fetchMangaDetails,
  MangaDetails,
} from '@/services/mangaFireService';
import { useTheme } from '@/constants/ThemeContext';
import { Colors, ColorScheme } from '@/constants/Colors';
import CustomWebView from '@/components/CustomWebView';
import getStyles from './[chapterNumber].styles';
import SwipeBackIndicator from '@/components/SwipeBackIndicator';

const { width, height } = Dimensions.get('window');

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
  const [isBottomSheetOpen, setIsBottomSheetOpen] = useState(false);
  const [isSwipingBack, setIsSwipingBack] = useState(false);

  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const bottomSheetRef = useRef<BottomSheet>(null);
  const controlsTimeout = useRef<NodeJS.Timeout>();
  const swipeProgress = useRef(new Animated.Value(0)).current;

  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme =
    theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const styles = getStyles(colorScheme);
  const insets = useSafeAreaInsets();

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
    if (controlsTimeout.current) {
      clearTimeout(controlsTimeout.current);
    }
    Animated.timing(controlsOpacity, {
      toValue: 0,
      duration: 200,
      useNativeDriver: true,
    }).start(() => setIsControlsVisible(false));
  }, [controlsOpacity]);

  const handleBottomSheetChange = useCallback(
    (index: number) => {
      setIsBottomSheetOpen(index >= 0);
      index >= 0 ? hideControls() : showControls();
    },
    [hideControls, showControls]
  );

  const toggleControls = useCallback(() => {
    if (isBottomSheetOpen) return;
    isControlsVisible ? hideControls() : showControls();
  }, [isControlsVisible, hideControls, showControls, isBottomSheetOpen]);

  const markChapterAsReadWithFallback = useCallback(async () => {
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
  }, [id, chapterNumber]);

  const fetchDetails = useCallback(async () => {
    try {
      const details = await fetchMangaDetails(id);
      setMangaDetails(details);
    } catch (error) {
      console.error('Error fetching manga details:', error);
    }
  }, [id]);

  useEffect(() => {
    markChapterAsReadWithFallback();
  }, [markChapterAsReadWithFallback]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

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

  const handleNavigationStateChange = useCallback(
    async (navState: WebViewNavigation) => {
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
    },
    [chapterUrl, id, mangaTitle, router]
  );

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
    const newChapter = mangaDetails.chapters[currentChapterIndex + chapterOffset];
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

  const closeBottomSheet = () => {
    bottomSheetRef.current?.close();
  };

  const swipeThreshold = 50;
  const swipeRegionWidth = 50;

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: (evt, gestureState) => {
        const { locationX } = evt.nativeEvent;
        return locationX <= swipeRegionWidth;
      },
      onMoveShouldSetPanResponder: (evt, gestureState) => {
        const { locationX } = evt.nativeEvent;
        return locationX <= swipeRegionWidth;
      },
      onPanResponderGrant: () => {
        setIsSwipingBack(true);
        swipeProgress.setValue(0);
      },
      onPanResponderMove: (evt, gestureState) => {
        const progress = Math.min(gestureState.dx / swipeThreshold, 1);
        swipeProgress.setValue(progress);
      },
      onPanResponderRelease: (evt, gestureState) => {
        setIsSwipingBack(false);
        if (gestureState.dx > swipeThreshold) {
          Animated.timing(swipeProgress, {
            toValue: 1,
            duration: 200,
            useNativeDriver: false,
          }).start(() => {
            handleBackPress();
          });
        } else {
          Animated.timing(swipeProgress, {
            toValue: 0,
            duration: 200,
            useNativeDriver: false,
          }).start();
        }
      },
      onPanResponderTerminate: () => {
        setIsSwipingBack(false);
        Animated.timing(swipeProgress, {
          toValue: 0,
          duration: 200,
          useNativeDriver: false,
        }).start();
      },
    })
  ).current;

  const statusBarBackgroundColor = isControlsVisible ? 'transparent' : Colors[colorScheme].card;

  return (
    <View style={styles.container} {...panResponder.panHandlers}>
    <ExpoStatusBar
      style={colorScheme === 'dark' ? 'light' : 'dark'}
      backgroundColor={statusBarBackgroundColor}
      translucent={true} 
      hidden={!isControlsVisible}
    />

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
              decelerationRate={Platform.OS === 'ios' ? 'normal' : 0.90}
              nestedScrollEnabled={true}
              overScrollMode="never" 
            />
          </View>
          {isSwipingBack && <SwipeBackIndicator swipeProgress={swipeProgress} />}

          <Animated.View
            style={[
              styles.controlsWrapper,
              {
                opacity: controlsOpacity,
                transform: [
                  {
                    translateY: controlsOpacity.interpolate({
                      inputRange: [0, 1],
                      outputRange: [-20, 0],
                    }),
                  },
                ],
              },
            ]}
            pointerEvents={isControlsVisible ? 'auto' : 'none'}
          >
            <View style={[styles.controls, { paddingTop: insets.top }]}>
              <View style={styles.controlsContent}>
                <View style={styles.leftControls}>
                  <TouchableOpacity
                    onPress={handleBackPress}
                    style={styles.backButton}
                  >
                    <Ionicons
                      name="arrow-back"
                      size={20}
                      color={Colors[colorScheme].text}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={() => {
                      bottomSheetRef.current?.expand();
                      handleBottomSheetChange(1);
                    }}
                    style={styles.titleContainer}
                  >
                    <View style={styles.chapterRow}>
                      <Text style={styles.chapterText}>
                        Chapter {chapterNumber}
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
                    disabled={!hasPreviousChapter}
                    style={[
                      styles.navigationButton,
                      styles.navigationButtonLeft,
                      !hasPreviousChapter && styles.disabledButton,
                    ]}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={22}
                      color={Colors[colorScheme].text}
                    />
                  </TouchableOpacity>

                  <TouchableOpacity
                    onPress={handleNextChapter}
                    disabled={!hasNextChapter}
                    style={[
                      styles.navigationButton,
                      styles.navigationButtonRight,
                      !hasNextChapter && styles.disabledButton,
                    ]}
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
              <TouchableOpacity
                style={styles.closeButton}
                onPress={closeBottomSheet}
              >
                <Text style={styles.closeButtonText}>Close</Text>
              </TouchableOpacity>
            </View>
          </BottomSheet>
        </>
      )}
    </View>
  );
}
