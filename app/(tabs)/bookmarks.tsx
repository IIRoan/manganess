import React, {
  useCallback,
  useState,
  useEffect,
  useRef,
  useMemo,
} from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  TextInput,
  Platform,
  Dimensions,
  ListRenderItemInfo,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getMangaData } from '@/services/bookmarkService';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@/constants/ThemeContext';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import MangaCard from '@/components/MangaCard';
import {
  useSafeAreaInsets,
  SafeAreaView,
} from 'react-native-safe-area-context';
import { useOffline } from '@/contexts/OfflineContext';
import { chapterStorageService } from '@/services/chapterStorageService';
import { BookmarkItem, BookmarkStatus } from '@/types';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withTiming,
  Easing,
  runOnJS,
  useDerivedValue,
  FadeInDown,
} from 'react-native-reanimated';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import { imageCache } from '@/services/CacheImages';
import { getDefaultLayout, setDefaultLayout } from '@/services/settingsService';

// Constants
const SECTIONS: BookmarkStatus[] = ['Reading', 'To Read', 'On Hold', 'Read'];
const SORT_OPTIONS = [
  { id: 'title-asc', label: 'Title (A‑Z)', icon: 'text' },
  { id: 'title-desc', label: 'Title (Z‑A)', icon: 'text' },
  { id: 'updated-desc', label: 'Last Read (Recent)', icon: 'time' },
  { id: 'updated-asc', label: 'Last Read (Oldest)', icon: 'time' },
];
const { width: SCREEN_WIDTH } = Dimensions.get('window');
// Removed VIEW_MODE_STORAGE_KEY as we use universal settings now

// Types
type ViewMode = 'grid' | 'list';

// Animated Components
const AnimatedTouchableOpacity =
  Animated.createAnimatedComponent(TouchableOpacity);
const AnimatedView = Animated.createAnimatedComponent(View);

// Helper component for preloading images
const ImagePreloader = ({ urls }: { urls: string[] }) => {
  useEffect(() => {
    urls.forEach((url) => {
      if (url) imageCache.getCachedImagePath(url, 'bookmark');
    });
  }, [urls]);
  return null;
};

export default function BookmarksScreen() {
  // Offline context
  const { isOffline } = useOffline();

  // State
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [sectionData, setSectionData] = useState<
    Record<BookmarkStatus, BookmarkItem[]>
  >({
    Reading: [],
    'On Hold': [],
    'To Read': [],
    Read: [],
  });
  const [isLoading, setIsLoading] = useState(true);
  const [isViewModeLoading, setIsViewModeLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<BookmarkStatus>('Reading');
  const [searchQuery, setSearchQuery] = useState('');
  const [sortOption, setSortOption] = useState(
    SORT_OPTIONS[0]?.id || 'title-asc'
  );
  const [viewMode, setViewMode] = useState<ViewMode>('grid');
  const [showSortOptions, setShowSortOptions] = useState(false);
  const [allImageUrls, setAllImageUrls] = useState<string[]>([]);

  // Animation values
  const translateX = useSharedValue(0);
  const sortOptionsHeight = useSharedValue(0);
  const isAnimating = useSharedValue(false);
  const startX = useSharedValue(0);
  const pageIndex = useSharedValue(0);

  // Refs
  const router = useRouter();
  const listRefs = useRef<
    Record<BookmarkStatus, FlatList<BookmarkItem> | null>
  >({
    Reading: null,
    'On Hold': null,
    'To Read': null,
    Read: null,
  });
  const sectionScrollRef = useRef<ScrollView>(null);
  const searchInputRef = useRef<TextInput>(null);

  // Theme
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();

  // Load view mode preference
  useFocusEffect(
    useCallback(() => {
      const loadViewMode = async () => {
        try {
          const saved = await getDefaultLayout();
          setViewMode(saved);
        } catch (e) {
          console.error('Failed to load view mode:', e);
        } finally {
          setIsViewModeLoading(false);
        }
      };

      loadViewMode();
    }, [])
  );

  // Process bookmarks: filter, sort and group by section
  const processBookmarks = useCallback(
    (items: BookmarkItem[], query: string, sort: string) => {
      const sections: Record<BookmarkStatus, BookmarkItem[]> = {
        Reading: [],
        'On Hold': [],
        'To Read': [],
        Read: [],
      };

      let filtered = items;
      if (query.trim()) {
        const q = query.toLowerCase();
        filtered = items.filter((it) => it.title.toLowerCase().includes(q));
      }

      const sortFn = (arr: BookmarkItem[]) => {
        const a = [...arr];
        switch (sort) {
          case 'title-asc':
            a.sort((x, y) => x.title.localeCompare(y.title));
            break;
          case 'title-desc':
            a.sort((x, y) => y.title.localeCompare(x.title));
            break;
          case 'updated-desc':
            a.sort((x, y) => (y.lastUpdated ?? 0) - (x.lastUpdated ?? 0));
            break;
          case 'updated-asc':
            a.sort((x, y) => (x.lastUpdated ?? 0) - (y.lastUpdated ?? 0));
            break;
        }
        return a;
      };

      filtered.forEach((it) => {
        const status = it.status as BookmarkStatus;
        if (status && sections[status]) {
          sections[status].push(it);
        }
      });

      for (const k in sections) {
        sections[k as BookmarkStatus] = sortFn(sections[k as BookmarkStatus]);
      }

      setSectionData(sections);
      setAllImageUrls(filtered.map((it) => it.imageUrl).filter(Boolean));
    },
    []
  );

  // Fetch bookmarks from storage
  const fetchBookmarks = useCallback(async () => {
    setIsLoading(true);
    try {
      const raw = await AsyncStorage.getItem('bookmarkKeys');
      const keys = raw ? JSON.parse(raw) : [];
      const arr = await Promise.all(
        keys.map(async (key: string) => {
          const id = key.split('_')[1];
          if (!id) return null;
          const d = await getMangaData(id);
          if (!d) return null;

          // If offline, only show manga that have downloaded chapters
          if (isOffline) {
            try {
              const downloadedChapters =
                await chapterStorageService.getDownloadedChapters(id);
              if (downloadedChapters.length === 0) {
                return null; // Skip manga with no downloaded chapters when offline
              }
            } catch {
              return null; // Skip if we can't check downloaded chapters
            }
          }

          return {
            id: d.id,
            title: d.title,
            status: (d.bookmarkStatus as BookmarkStatus) || 'Reading',
            lastReadChapter: d.lastReadChapter
              ? `Chapter ${d.lastReadChapter}`
              : 'Not started',
            imageUrl: d.bannerImage || '',
            lastUpdated: d.lastUpdated ?? 0,
          } as BookmarkItem;
        })
      );
      setBookmarks(arr.filter((x): x is BookmarkItem => x != null));
    } catch (e) {
      console.error('Failed to fetch bookmarks:', e);
    } finally {
      setIsLoading(false);
    }
  }, [isOffline]);

  // Refresh bookmarks when offline status changes
  React.useEffect(() => {
    fetchBookmarks();
  }, [isOffline, fetchBookmarks]);

  // Process bookmarks when data, search or sort changes
  useEffect(() => {
    processBookmarks(bookmarks, searchQuery, sortOption);
  }, [bookmarks, searchQuery, sortOption, processBookmarks]);

  // Refresh bookmarks when screen comes into focus and changes detected
  useFocusEffect(
    useCallback(() => {
      const checkForChanges = async () => {
        const changed = await AsyncStorage.getItem('bookmarkChanged');
        if (changed === 'true') {
          await fetchBookmarks();
          await AsyncStorage.setItem('bookmarkChanged', 'false');
        }
      };

      checkForChanges();
    }, [fetchBookmarks])
  );

  // Animated styles
  const contentAnim = useAnimatedStyle(() => ({
    transform: [{ translateX: translateX.value }],
  }));

  const sortOptsAnim = useAnimatedStyle(() => ({
    height: sortOptionsHeight.value,
    overflow: 'hidden',
  }));

  // Event Handlers
  const handleBookmarkPress = useCallback(
    (id: string) => {
      router.push(`/manga/${id}`);
    },
    [router]
  );

  const handleClearSearch = useCallback(() => {
    setSearchQuery('');
  }, []);

  const toggleSortOptions = useCallback(() => {
    if (showSortOptions) {
      sortOptionsHeight.value = withTiming(0, { duration: 200 }, () =>
        runOnJS(setShowSortOptions)(false)
      );
    } else {
      setShowSortOptions(true);
      const height = SORT_OPTIONS.length * 40 + 10;
      sortOptionsHeight.value = withTiming(height, { duration: 200 });
    }
  }, [showSortOptions, sortOptionsHeight]);

  const selectSort = useCallback(
    (opt: string) => {
      setSortOption(opt);
      sortOptionsHeight.value = withTiming(0, { duration: 200 }, () =>
        runOnJS(setShowSortOptions)(false)
      );
    },
    [sortOptionsHeight]
  );

  const toggleView = useCallback(async () => {
    const newMode: ViewMode = viewMode === 'grid' ? 'list' : 'grid';
    setViewMode(newMode);
    try {
      await setDefaultLayout(newMode);
    } catch (e) {
      console.error('Failed to save view mode:', e);
    }
  }, [viewMode]);

  const updateAfterIndexChange = useCallback((index: number) => {
    const section = SECTIONS[index] as BookmarkStatus;
    setActiveSection(section);
    if (sectionScrollRef.current) {
      const visibleTabs = Math.min(SECTIONS.length, 4);
      const tabWidth = SCREEN_WIDTH / visibleTabs;
      const scrollX = Math.max(
        0,
        index * tabWidth - tabWidth * (visibleTabs / 2 - 0.5)
      );
      sectionScrollRef.current.scrollTo({ x: scrollX, animated: true });
    }
    const ref = listRefs.current[section];
    ref?.scrollToOffset({ offset: 0, animated: false });
  }, []);

  useDerivedValue(() => {
    const idx = Math.max(
      0,
      Math.min(SECTIONS.length - 1, Math.round(pageIndex.value))
    );
    runOnJS(updateAfterIndexChange)(idx);
  });

  const goToIndex = useCallback(
    (index: number) => {
      if (index < 0 || index >= SECTIONS.length) return;
      if (isAnimating.value) return;
      isAnimating.value = true;
      translateX.value = withTiming(
        -index * SCREEN_WIDTH,
        { duration: 250, easing: Easing.out(Easing.cubic) },
        () => {
          pageIndex.value = index;
          isAnimating.value = false;
        }
      );
    },
    [isAnimating, pageIndex, translateX]
  );

  const changeSection = useCallback(
    (section: BookmarkStatus) => {
      const idx = SECTIONS.indexOf(section);
      if (idx === -1) return;
      goToIndex(idx);
    },
    [goToIndex]
  );

  // Pan gesture for swipe between sections
  const pan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-10, 10])
        .onBegin(() => {
          startX.value = translateX.value;
        })
        .onUpdate((e) => {
          if (isAnimating.value) return;
          const min = -(SECTIONS.length - 1) * SCREEN_WIDTH;
          const max = 0;
          const next = startX.value + e.translationX;
          translateX.value = Math.max(min, Math.min(max, next));
        })
        .onEnd((e) => {
          if (isAnimating.value) return;
          const progress = -translateX.value / SCREEN_WIDTH;
          let target = Math.round(progress);
          if (Math.abs(e.velocityX) > 600) {
            target =
              e.velocityX < 0 ? Math.ceil(progress) : Math.floor(progress);
          }
          target = Math.max(0, Math.min(SECTIONS.length - 1, target));
          isAnimating.value = true;
          translateX.value = withTiming(
            -target * SCREEN_WIDTH,
            { duration: 250, easing: Easing.out(Easing.cubic) },
            () => {
              pageIndex.value = target;
              isAnimating.value = false;
            }
          );
        }),
    [isAnimating, pageIndex, startX, translateX]
  );

  // Render bookmark item (grid or list view)
  const renderBookmarkItem = useCallback(
    (info: ListRenderItemInfo<BookmarkItem>) => {
      const item = info.item;

      if (viewMode === 'grid') {
        return (
          <Animated.View
            entering={FadeInDown.delay(info.index * 30).springify()}
            style={styles.bookmarkCardWrapper}
          >
            <MangaCard
              title={item.title}
              imageUrl={item.imageUrl}
              onPress={() => handleBookmarkPress(item.id)}
              lastReadChapter={item.lastReadChapter}
              context="bookmark"
              mangaId={item.id}
              onBookmarkChange={(_mangaId, newStatus) => {
                if (newStatus === null) {
                  fetchBookmarks();
                } else {
                  fetchBookmarks();
                }
              }}
            />
          </Animated.View>
        );
      }

      return (
        <Animated.View entering={FadeInDown.delay(info.index * 30).springify()}>
          <TouchableOpacity
            style={styles.listItem}
            onPress={() => handleBookmarkPress(item.id)}
            activeOpacity={0.7}
          >
            <View style={styles.listItemImageContainer}>
              <MangaCard
                title=""
                imageUrl={item.imageUrl}
                onPress={() => {}}
                lastReadChapter={null}
                style={styles.listItemImage}
                context="bookmark"
                mangaId={item.id}
                onBookmarkChange={(_mangaId, newStatus) => {
                  if (newStatus === null) {
                    fetchBookmarks();
                  } else {
                    fetchBookmarks();
                  }
                }}
              />
            </View>
            <View style={styles.listItemContent}>
              <Text style={styles.listItemTitle} numberOfLines={2}>
                {item.title}
              </Text>
              <Text style={styles.listItemChapter}>{item.lastReadChapter}</Text>
            </View>
            <Ionicons
              name="chevron-forward"
              size={24}
              color={colors.tabIconDefault}
            />
          </TouchableOpacity>
        </Animated.View>
      );
    },
    [
      viewMode,
      handleBookmarkPress,
      styles,
      colors.tabIconDefault,
      fetchBookmarks,
    ]
  );

  // Render section button
  const renderSectionButton = useCallback(
    (title: BookmarkStatus) => {
      let icon: keyof typeof Ionicons.glyphMap = 'book';
      switch (title) {
        case 'To Read':
          icon = 'book-outline';
          break;
        case 'Reading':
          icon = 'book';
          break;
        case 'On Hold':
          icon = 'pause-circle-outline';
          break;
        case 'Read':
          icon = 'checkmark-circle-outline';
          break;
      }

      const count = sectionData[title]?.length ?? 0;
      const isActive = title === activeSection;

      return (
        <AnimatedTouchableOpacity
          key={title}
          style={[styles.sectionButton, isActive && styles.activeSectionButton]}
          onPress={() => changeSection(title)}
          activeOpacity={0.7}
        >
          <Ionicons
            name={icon}
            size={18}
            color={isActive ? colors.card : colors.text}
            style={styles.sectionButtonIcon}
          />
          <Text
            style={[
              styles.sectionButtonText,
              isActive && styles.activeSectionButtonText,
            ]}
          >
            {title}
          </Text>
          <View
            style={[styles.sectionCount, isActive && styles.activeSectionCount]}
          >
            <Text
              style={[
                styles.sectionCountText,
                isActive && styles.activeSectionCountText,
              ]}
            >
              {count}
            </Text>
          </View>
        </AnimatedTouchableOpacity>
      );
    },
    [activeSection, sectionData, changeSection, styles, colors]
  );

  // Loading state
  if (isLoading || isViewModeLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaView style={styles.container}>
        <ImagePreloader urls={allImageUrls} />

        {/* Header */}
        <View style={styles.header}>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>
              {isOffline ? 'Saved Manga (Offline)' : 'My Bookmarks'}
            </Text>
            {isOffline && (
              <View style={styles.offlineIndicator}>
                <Ionicons
                  name="cloud-offline"
                  size={16}
                  color={colors.primary}
                />
                <Text style={[styles.offlineText, { color: colors.primary }]}>
                  Offline
                </Text>
              </View>
            )}
          </View>
          <View style={styles.headerButtons}>
            <TouchableOpacity
              testID="bookmarks-toggle-sort"
              style={styles.headerButton}
              onPress={toggleSortOptions}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Toggle sort options"
            >
              <Ionicons name="options-outline" size={22} color={colors.text} />
            </TouchableOpacity>
            <TouchableOpacity
              testID="bookmarks-toggle-view"
              style={styles.headerButton}
              onPress={toggleView}
              activeOpacity={0.7}
              accessibilityRole="button"
              accessibilityLabel="Toggle view mode"
            >
              <Ionicons
                name={viewMode === 'grid' ? 'list-outline' : 'grid-outline'}
                size={22}
                color={colors.text}
              />
            </TouchableOpacity>
          </View>
        </View>

        {/* Search */}
        <View style={styles.searchContainer}>
          <View style={styles.searchInputContainer}>
            <Ionicons
              name="search"
              size={20}
              color={colors.tabIconDefault}
              style={styles.searchIcon}
            />
            <TextInput
              ref={searchInputRef}
              style={styles.searchInput}
              placeholder="Search bookmarks..."
              placeholderTextColor={colors.tabIconDefault}
              value={searchQuery}
              onChangeText={setSearchQuery}
            />
            {searchQuery ? (
              <TouchableOpacity
                onPress={handleClearSearch}
                style={styles.clearButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="close-circle"
                  size={20}
                  color={colors.tabIconDefault}
                />
              </TouchableOpacity>
            ) : null}
          </View>
        </View>

        {/* Sort Options */}
        <Animated.View
          style={[styles.sortOptionsContainerWrapper, sortOptsAnim]}
        >
          {showSortOptions && (
            <View style={styles.sortOptionsContainer}>
              {SORT_OPTIONS.map((opt) => (
                <TouchableOpacity
                  key={opt.id}
                  style={[
                    styles.sortOption,
                    sortOption === opt.id && styles.activeSortOption,
                  ]}
                  onPress={() => selectSort(opt.id)}
                  activeOpacity={0.7}
                >
                  <Ionicons
                    name={opt.icon as keyof typeof Ionicons.glyphMap}
                    size={18}
                    color={sortOption === opt.id ? colors.primary : colors.text}
                    style={styles.sortOptionIcon}
                  />
                  <Text
                    style={[
                      styles.sortOptionText,
                      sortOption === opt.id && styles.activeSortOptionText,
                    ]}
                  >
                    {opt.label}
                  </Text>
                  {sortOption === opt.id && (
                    <Ionicons
                      name="checkmark"
                      size={18}
                      color={colors.primary}
                    />
                  )}
                </TouchableOpacity>
              ))}
            </View>
          )}
        </Animated.View>

        {/* Section Tabs */}
        <View style={styles.sectionButtonsContainer}>
          <ScrollView
            ref={sectionScrollRef}
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.sectionButtonsScroll}
          >
            {SECTIONS.map(renderSectionButton)}
          </ScrollView>
        </View>

        {/* Count */}
        <Text style={styles.resultCount}>
          {sectionData[activeSection]?.length || 0}{' '}
          {(sectionData[activeSection]?.length || 0) > 1 ? 'mangas' : 'manga'}
        </Text>

        {/* Content Area with Gesture Detector */}
        <GestureDetector gesture={pan}>
          <View style={styles.contentWrapper}>
            <AnimatedView style={[styles.contentContainer, contentAnim]}>
              {SECTIONS.map((sec) => (
                <View key={sec} style={styles.page}>
                  {(sectionData[sec]?.length || 0) === 0 ? (
                    <View style={styles.emptyStateContainer}>
                      <Ionicons
                        name="bookmark-outline"
                        size={64}
                        color={colors.tabIconDefault}
                      />
                      <Text style={styles.emptyStateText}>
                        {searchQuery
                          ? `No bookmarks found for "${searchQuery}"`
                          : `No ${sec.toLowerCase()} manga found`}
                      </Text>
                      {searchQuery ? (
                        <TouchableOpacity
                          style={styles.clearSearchButton}
                          onPress={handleClearSearch}
                        >
                          <Text style={styles.clearSearchButtonText}>
                            Clear Search
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                    </View>
                  ) : (
                    <Animated.FlatList
                      ref={(r: any) => {
                        listRefs.current[sec] = r;
                      }}
                      data={sectionData[sec]}
                      renderItem={renderBookmarkItem}
                      keyExtractor={(item: BookmarkItem) => item.id}
                      numColumns={viewMode === 'grid' ? 2 : 1}
                      key={`${sec}-${viewMode}`}
                      extraData={[viewMode]}
                      columnWrapperStyle={
                        viewMode === 'grid' ? styles.columnWrapper : undefined
                      }
                      contentContainerStyle={styles.listContentContainer}
                      showsVerticalScrollIndicator={false}
                      removeClippedSubviews
                      initialNumToRender={10}
                      maxToRenderPerBatch={10}
                      windowSize={11}
                      keyboardShouldPersistTaps="always"
                      keyboardDismissMode="on-drag"
                    />
                  )}
                </View>
              ))}
            </AnimatedView>
          </View>
        </GestureDetector>
      </SafeAreaView>
    </GestureHandlerRootView>
  );
}

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingBottom: 10,
    },
    headerTitle: {
      fontSize: 26,
      fontWeight: 'bold',
      color: colors.text,
    },
    headerButtons: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerButton: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.card,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: 10,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 1.5,
      elevation: 2,
    },
    searchContainer: {
      paddingHorizontal: 20,
      marginVertical: 6,
    },
    searchInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 8,
      paddingHorizontal: 10,
      height: 36,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 1.5,
      elevation: 2,
    },
    searchIcon: {
      marginRight: 5,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      paddingVertical: Platform.OS === 'ios' ? 5 : 3,
    },
    clearButton: {
      padding: 3,
      marginLeft: 3,
    },
    sortOptionsContainerWrapper: {
      marginHorizontal: 20,
      borderRadius: 10,
      marginBottom: 8,
      overflow: 'hidden',
      backgroundColor: colors.card,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 1.5,
      elevation: 2,
    },
    sortOptionsContainer: {
      borderRadius: 10,
      paddingVertical: 5,
    },
    sortOption: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 9,
      paddingHorizontal: 15,
      height: 40,
    },
    activeSortOption: {
      backgroundColor: colors.primary + '20',
    },
    sortOptionIcon: {
      marginRight: 12,
    },
    sortOptionText: {
      fontSize: 14,
      color: colors.text,
      flex: 1,
    },
    activeSortOptionText: {
      color: colors.primary,
      fontWeight: '600',
    },
    sectionButtonsContainer: {
      marginBottom: 8,
      paddingBottom: 5,
    },
    sectionButtonsScroll: {
      paddingHorizontal: 15,
      alignItems: 'center',
    },
    sectionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 7,
      paddingHorizontal: 14,
      borderRadius: 18,
      backgroundColor: colors.card,
      marginHorizontal: 4,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.08,
      shadowRadius: 1,
      elevation: 1.5,
    },
    activeSectionButton: {
      backgroundColor: colors.primary,
      elevation: 3,
    },
    sectionButtonIcon: {
      marginRight: 5,
    },
    sectionButtonText: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
    },
    activeSectionButtonText: {
      color: colors.card,
    },
    sectionCount: {
      backgroundColor: colors.background + '99',
      minWidth: 20,
      height: 20,
      borderRadius: 10,
      justifyContent: 'center',
      alignItems: 'center',
      marginLeft: 6,
      paddingHorizontal: 5,
      borderWidth: 1,
      borderColor: colors.border,
    },
    activeSectionCount: {
      backgroundColor: colors.card + 'CC',
      borderColor: colors.primary + '50',
    },
    sectionCountText: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.text,
    },
    activeSectionCountText: {
      color: colors.primary,
    },
    contentWrapper: {
      flex: 1,
      overflow: 'hidden',
    },
    contentContainer: {
      flex: 1,
      backgroundColor: colors.background,
      width: SCREEN_WIDTH * SECTIONS.length,
      flexDirection: 'row',
    },
    resultCount: {
      paddingHorizontal: 20,
      paddingBottom: 8,
      fontSize: 13,
      color: colors.tabIconDefault,
    },
    listContentContainer: {
      paddingHorizontal: 15,
      paddingBottom: 80,
    },
    columnWrapper: {
      justifyContent: 'space-between',
    },
    page: {
      width: SCREEN_WIDTH,
    },
    bookmarkCardWrapper: {
      width: '48%',
      marginBottom: 15,
    },
    listItem: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: 10,
      marginBottom: 10,
      padding: 10,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 1.5,
      elevation: 2,
    },
    listItemImageContainer: {
      width: 65,
      height: 90,
      borderRadius: 6,
      overflow: 'hidden',
      backgroundColor: colors.border,
    },
    listItemImage: {
      width: '100%',
      height: '100%',
      borderRadius: 0,
    },
    listItemContent: {
      flex: 1,
      marginLeft: 12,
      marginRight: 8,
      justifyContent: 'center',
    },
    listItemTitle: {
      fontSize: 15,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 4,
    },
    listItemChapter: {
      fontSize: 13,
      color: colors.tabIconDefault,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: colors.background,
    },
    loadingText: {
      marginTop: 16,
      fontSize: 16,
      color: colors.text,
    },
    emptyStateContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 30,
      marginTop: -50,
    },
    emptyStateText: {
      fontSize: 17,
      textAlign: 'center',
      marginTop: 20,
      marginBottom: 25,
      color: colors.tabIconDefault,
      lineHeight: 24,
    },
    clearSearchButton: {
      backgroundColor: colors.primary,
      paddingVertical: 10,
      paddingHorizontal: 25,
      borderRadius: 20,
    },
    clearSearchButtonText: {
      color: colors.card,
      fontWeight: '600',
      fontSize: 15,
    },
    headerTitleContainer: {
      flex: 1,
    },
    offlineIndicator: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
      marginTop: 4,
    },
    offlineText: {
      fontSize: 12,
      fontWeight: '600',
    },
  });
