import React, { useState, useCallback, useEffect, useRef } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  BackHandler,
  Platform,
  useColorScheme,
  Animated,
} from "react-native";
import { useLocalSearchParams, useRouter, useFocusEffect } from "expo-router";
import { WebViewNavigation } from "react-native-webview";
import { Ionicons } from "@expo/vector-icons";
import BottomSheet from "@gorhom/bottom-sheet";
import { BottomSheetScrollView } from "@gorhom/bottom-sheet";
import { StatusBar as ExpoStatusBar } from "expo-status-bar";
import { getMangaData } from "@/services/bookmarkService";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import {
  getChapterUrl,
  markChapterAsRead,
  getInjectedJavaScript,
  fetchMangaDetails,
  MangaDetails,
} from "@/services/mangaFireService";
import { useTheme } from "@/constants/ThemeContext";
import { Colors, ColorScheme } from "@/constants/Colors";
import CustomWebView from "@/components/CustomWebView";
import {
  ChapterGuideOverlay,
  hasSeenChapterGuide,
} from "@/components/ChapterGuideOverlay";
import getStyles from "./[chapterNumber].styles";

// Minimum touch target size (in dp)
const MIN_TOUCHABLE_SIZE = 48;

// Helper function to ensure touchable size
const ensureMinimumSize = (size: number) => {
  return Math.max(size, MIN_TOUCHABLE_SIZE);
};

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
  const [showGuide, setShowGuide] = useState(false);
  const [guideStep, setGuideStep] = useState(1);

  const controlsOpacity = useRef(new Animated.Value(1)).current;
  const bottomSheetRef = useRef<BottomSheet>(null);
  const controlsTimeout = useRef<NodeJS.Timeout>();

  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme =
    theme === "system" ? systemColorScheme : (theme as ColorScheme);
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
      index >= 0 ? hideControls() : showControls();
    },
    [hideControls, showControls]
  );

  const toggleControls = useCallback(() => {
    // Don't toggle controls during the first step of the guide
    if (isBottomSheetOpen || (showGuide && guideStep === 1)) return;

    isControlsVisible ? hideControls() : showControls();
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
      console.error("Error marking chapter as read:", error);
    }
  }, [id, chapterNumber]);

  const fetchDetails = useCallback(async () => {
    try {
      const details = await fetchMangaDetails(id);
      setMangaDetails(details);
    } catch (error) {
      console.error("Error fetching manga details:", error);
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
        "hardwareBackPress",
        onBackPress
      );
      return () => backHandler.remove();
    }, [id, router])
  );

  const handleLoadEnd = () => setIsLoading(false);
  const handleBackPress = () => router.navigate(`/manga/${id}`);
  const handleError = () => {
    setError("Failed to load chapter. Please try again.");
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
          <Text style={styles.chapterDate}>{chapter.date || "No date"}</Text>
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
    if (event.nativeEvent.data === "toggleControls") {
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

  const closeBottomSheet = () => {
    bottomSheetRef.current?.close();
  };

  const statusBarBackgroundColor = isControlsVisible
    ? "transparent"
    : Colors[colorScheme].card;
  const enhancedBackButtonSize = ensureMinimumSize(40);
  const enhancedNavigationButtonSize = ensureMinimumSize(44);

  return (
    <View style={styles.container}>
      <ExpoStatusBar
        style={colorScheme === "dark" ? "light" : "dark"}
        backgroundColor={statusBarBackgroundColor}
        translucent={true}
        hidden={!isControlsVisible && !showGuide}
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
              allowedHosts={["mangafire.to"]}
              javaScriptEnabled={true}
              domStorageEnabled={true}
              decelerationRate={Platform.OS === "ios" ? "normal" : 0.9}
              nestedScrollEnabled={true}
            />
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
            pointerEvents={isControlsVisible ? "auto" : "none"}
          >
            <View
              style={[
                styles.controls,
                {
                  paddingTop: insets.top,
                  backgroundColor: Colors[colorScheme].card + "E6",
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
                        alignItems: "center",
                        justifyContent: "center",
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
                        bottomSheetRef.current?.expand();
                        handleBottomSheetChange(1);
                      }
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
                        color={Colors[colorScheme].text + "66"}
                        style={styles.menuIcon}
                      />
                    </View>
                    <Text style={styles.titleText} numberOfLines={1}>
                      {mangaTitle || "Loading..."}
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
                        alignItems: "center",
                        justifyContent: "center",
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
                        alignItems: "center",
                        justifyContent: "center",
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

          <BottomSheet
            ref={bottomSheetRef}
            snapPoints={["60%", "80%"]}
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
