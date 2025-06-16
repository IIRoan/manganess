import { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  Text,
  ActivityIndicator,
  TouchableOpacity,
  Image,
  useColorScheme,
  Animated,
  type ViewToken,
} from "react-native";
import type Swipeable from "react-native-gesture-handler/Swipeable";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useTheme } from "@/constants/ThemeContext";
import { Colors, type ColorScheme } from "@/constants/Colors";
import ExpandableText from "@/components/ExpandableText";
import AlertComponent from "@/components/Alert";
import SwipeableChapterItem from "@/components/SwipeChapterItem";
import BottomPopup from "@/components/BottomPopup";
import { FlashList } from "@shopify/flash-list";
import { fetchMangaDetails } from "@/services/mangaFireService";
import {
  fetchBookmarkStatus,
  saveBookmark,
  removeBookmark,
  getBookmarkPopupConfig,
  getChapterLongPressAlertConfig,
} from "@/services/bookmarkService";
import { useNavigationHistory } from "@/hooks/useNavigationHistory";
import EnhancedBackButton from "@/components/EnhancedBackButton";
import { GenreTag } from "@/components/GanreTag";
import {
  getLastReadChapter,
  getReadChapters,
  markChapterAsUnread,
} from "@/services/readChapterService";
import { useFocusEffect } from "@react-navigation/native";
import LastReadChapterBar from "@/components/LastReadChapterBar";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useHapticFeedback } from "@/utils/haptics";
import getStyles from "./[id].styles";
import { useMangaImageCache } from "@/services/CacheImages";
import type {
  AlertConfig,
  Option,
  MangaDetails,
  BookmarkStatus,
} from "@/types";

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
}> = ({ mangaId, bannerUrl, style }) => {
  const cachedBannerPath = useMangaImageCache(mangaId, bannerUrl);
  
  return (
    <Image
      source={{ uri: cachedBannerPath }}
      style={style}
      onError={(error) =>
        console.error("Error loading banner image:", error)
      }
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

  // State for the general alert (e.g., marking chapters as unread)
  const [isAlertVisible, setIsAlertVisible] = useState(false);
  const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);

  // State for the bookmark bottom popup
  const [isBookmarkPopupVisible, setIsBookmarkPopupVisible] = useState(false);
  const [bookmarkPopupConfig, setBookmarkPopupConfig] =
    useState<BookmarkPopupConfig>({
      title: "",
      options: [],
    });

  // Handle sending user back up/down
  const [showScrollToTopButton, setShowScrollToTopButton] = useState(false);
  const [showScrollToBottomButton, setShowScrollToBottomButton] =
    useState(false);
  const flashListRef = useRef<FlashList<any>>(null);

  // Animated value for the scroll button opacities
  const scrollButtonOpacity = useRef(new Animated.Value(0)).current;
  const scrollBottomButtonOpacity = useRef(new Animated.Value(0)).current;

  // Theming Settings
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme =
    theme === "system" ? systemColorScheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);

  // Back button
  const { handleBackPress } = useNavigationHistory();

  // Haptic feedback
  const haptics = useHapticFeedback();

  // Last chapter
  const [lastReadChapter, setLastReadChapter] = useState<string | null>(null);

  const fetchMangaDetailsData = async () => {
    try {
      const details = await fetchMangaDetails(id as string);
      setMangaDetails(details);
    } catch (err) {
      console.error(err);
      throw new Error("Failed to load manga details");
    }
  };

  const fetchBookmarkStatusData = async () => {
    try {
      const status = await fetchBookmarkStatus(id as string);
      setBookmarkStatus(status);
    } catch (err) {
      console.error(err);
      throw new Error("Failed to load bookmark status");
    }
  };

  const fetchReadChapters = useCallback(async () => {
    try {
      const chapters = await getReadChapters(id as string);
      setReadChapters(chapters);
    } catch (error) {
      console.error("Error fetching read chapters:", error);
      throw new Error("Failed to load read chapters");
    }
  }, [id]);

  const fetchLastReadChapter = useCallback(async () => {
    try {
      const lastChapter = await getLastReadChapter(id as string);
      setLastReadChapter(lastChapter);
    } catch (err) {
      console.error("Error fetching last read chapter:", err);
      throw new Error("Failed to load last read chapter");
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      const fetchData = async () => {
        if (typeof id === "string") {
          setIsLoading(true);
          setError(null);
          try {
            await Promise.all([
              fetchMangaDetailsData(),
              fetchReadChapters(),
              fetchBookmarkStatusData(),
              fetchLastReadChapter(),
            ]);
          } catch (error) {
            console.error("Error fetching data:", error);
            setError("Failed to load manga details. Please try again.");
          } finally {
            setIsLoading(false);
          }
        }
      };

      fetchData();

      return () => {};
    }, [id, fetchReadChapters, fetchLastReadChapter])
  );

  const handleBookmark = () => {
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
  };

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
          setLastReadChapter("Not started");
        }

        // Close any open swipeables
        if (currentlyOpenSwipeable) {
          currentlyOpenSwipeable.close();
          setCurrentlyOpenSwipeable(null);
        }
      } catch (error) {
        console.error("Error marking chapter as unread:", error);
      }
    },
    [id, readChapters, currentlyOpenSwipeable]
  );

  const handleSaveBookmark = async (status: BookmarkStatus) => {
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
      console.error("Error saving bookmark:", error);
    }
  };

  const handleRemoveBookmark = async () => {
    try {
      await removeBookmark(
        id as string,
        setBookmarkStatus,
        setIsBookmarkPopupVisible
      );
    } catch (error) {
      console.error("Error removing bookmark:", error);
    }
  };

  const handleChapterPress = (chapterNumber: string | number) => {
    haptics.onSelection();
    router.navigate(`/manga/${id}/chapter/${chapterNumber}`);
  };

  const handleLastReadChapterPress = () => {
    if (!lastReadChapter || lastReadChapter === "Not started") {
      if (
        mangaDetails &&
        mangaDetails.chapters &&
        mangaDetails.chapters.length > 0
      ) {
        const firstChapter =
          mangaDetails.chapters[mangaDetails.chapters.length - 1];
        handleChapterPress(firstChapter.number);
      }
    } else {
      const chapterNumber = lastReadChapter.replace("Chapter ", "");
      handleChapterPress(chapterNumber);
    }
  };

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

  // Checks for showing the scroll buttons
  const viewabilityConfig = {
    itemVisiblePercentThreshold: 50,
  };

  const onViewableItemsChanged = useCallback(
    ({ viewableItems }: { viewableItems: ViewToken[] }) => {
      const totalChapters = mangaDetails?.chapters?.length ?? 0;
      if (viewableItems && viewableItems.length > 0 && totalChapters > 0) {
        const firstVisibleItem = viewableItems[0];
        const lastVisibleItem = viewableItems[viewableItems.length - 1];
        const firstVisibleIndex = firstVisibleItem.index ?? 0;
        const lastVisibleIndex = lastVisibleItem.index ?? totalChapters - 1;

        setShowScrollToTopButton(firstVisibleIndex >= 10);

        const showBottom =
          lastVisibleIndex < totalChapters - 5 && totalChapters > 15;
        setShowScrollToBottomButton(showBottom);
      } else {
        setShowScrollToTopButton(false);
        setShowScrollToBottomButton(false);
      }
    },
    [mangaDetails?.chapters?.length]
  );

  // Use useEffect to animate the opacity of the scroll to top button
  useEffect(() => {
    Animated.timing(scrollButtonOpacity, {
      toValue: showScrollToTopButton ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [showScrollToTopButton, scrollButtonOpacity]);

  // Use useEffect to animate the opacity of the scroll to bottom button
  useEffect(() => {
    Animated.timing(scrollBottomButtonOpacity, {
      toValue: showScrollToBottomButton ? 1 : 0,
      duration: 300,
      useNativeDriver: true,
    }).start();
  }, [showScrollToBottomButton, scrollBottomButtonOpacity]);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator
          testID="loading-indicator"
          size="large"
          color={colors.primary}
        />
      </View>
    );
  }

  if (error) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>{error}</Text>
      </View>
    );
  }

  if (!mangaDetails) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorText}>No manga details found.</Text>
      </View>
    );
  }

  const readingProgress = calculateReadingProgress();
  const remainingReadingTime = estimateRemainingReadingTime();

  return (
    <View style={styles.container}>
      {/* Alert component is used to display alerts */}
      {alertConfig && (
        <AlertComponent
          visible={isAlertVisible}
          onClose={() => setIsAlertVisible(false)}
          type={alertConfig.type as "bookmarks" | "confirm"}
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
        <FlashList
          ref={flashListRef}
          estimatedItemSize={70}
          removeClippedSubviews={true}
          maxToRenderPerBatch={15}
          updateCellsBatchingPeriod={50}
          drawDistance={100}
          ListHeaderComponent={() => (
            <>
              <View style={styles.headerContainer}>
                <MangaBannerImage 
                  mangaId={id as string}
                  bannerUrl={mangaDetails.bannerImage}
                  style={styles.bannerImage}
                />
                <View style={styles.overlay} />
                <View style={styles.headerContent}>
                  <View style={styles.headerButtons}>
                    <EnhancedBackButton
                      size={30}
                      color="#FFFFFF"
                      style={styles.headerButton}
                    />
                    <TouchableOpacity
                      testID="bookmark-button"
                      onPress={handleBookmark}
                      style={styles.headerButton}
                      accessibilityRole="button"
                      accessibilityLabel={bookmarkStatus ? "Remove bookmark" : "Add bookmark"}
                      accessibilityHint={`Currently ${bookmarkStatus || "not bookmarked"}. Tap to ${bookmarkStatus ? "remove" : "add"} bookmark.`}
                    >
                      <Ionicons
                        name={bookmarkStatus ? "bookmark" : "bookmark-outline"}
                        size={30}
                        color={colors.primary}
                        accessibilityElementsHidden={true}
                      />
                    </TouchableOpacity>
                  </View>
                  <Text
                    style={styles.title}
                    numberOfLines={2}
                    ellipsizeMode="tail"
                    accessibilityRole="header"
                    accessibilityLevel={1}
                  >
                    {mangaDetails.title}
                  </Text>
                  {mangaDetails.alternativeTitle && (
                    <ExpandableText
                      text={mangaDetails.alternativeTitle}
                      initialLines={1}
                      style={styles.alternativeTitle}
                      stateKey={`alt-title-${id}`}
                    />
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
                      <Text style={styles.progressTitle}>
                        Reading Progress{" "}
                      </Text>
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
                        />{" "}
                        {readChapters.length}/{mangaDetails.chapters.length}{" "}
                        chapters read
                      </Text>
                      <Text style={styles.progressStat}>
                        <Ionicons
                          name="time-outline"
                          size={14}
                          color={colors.text}
                        />{" "}
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
                        {(mangaDetails.author || []).join(", ")}
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
              </View>
            </>
          )}
          data={mangaDetails.chapters}
          extraData={[readChapters, lastReadChapter]}
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
              />
            );
          }}
          ListFooterComponent={<View style={{ height: 120 }} />}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
        />

        {/* Scroll to Bottom Button */}
        <Animated.View
          style={[
            styles.scrollToBottomButton,
            {
              opacity: scrollBottomButtonOpacity,
              bottom: insets.bottom + 100 + 60,
            },
          ]}
          pointerEvents={showScrollToBottomButton ? "auto" : "none"}
        >
          <TouchableOpacity
            onPress={() => {
              flashListRef.current?.scrollToEnd({ animated: true });
            }}
            style={styles.scrollToBottomButtonTouchable}
            accessibilityRole="button"
            accessibilityLabel="Scroll to bottom"
            accessibilityHint="Scroll to the last chapter"
          >
            <Ionicons 
              name="arrow-down" 
              size={20} 
              color="white"
              accessibilityElementsHidden={true}
            />
          </TouchableOpacity>
        </Animated.View>

        {/* Scroll to Top Button */}
        <Animated.View
          style={[
            styles.scrollToTopButton,
            {
              opacity: scrollButtonOpacity,
              bottom: insets.bottom + 100,
            },
          ]}
          pointerEvents={showScrollToTopButton ? "auto" : "none"}
        >
          <TouchableOpacity
            onPress={() => {
              flashListRef.current?.scrollToOffset({
                offset: 0,
                animated: true,
              });
            }}
            style={styles.scrollToTopButtonTouchable}
            accessibilityRole="button"
            accessibilityLabel="Scroll to top"
            accessibilityHint="Scroll to the manga details"
          >
            <Ionicons 
              name="arrow-up" 
              size={20} 
              color="white"
              accessibilityElementsHidden={true}
            />
          </TouchableOpacity>
        </Animated.View>
      </View>
    </View>
  );
}
