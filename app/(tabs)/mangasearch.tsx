import React, {
  useState,
  useCallback,
  useRef,
  useEffect,
  useMemo,
} from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Text,
  TouchableOpacity,
  SafeAreaView,
  Dimensions,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import {
  Stack,
  useLocalSearchParams,
  useRouter,
  useFocusEffect,
} from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import AlertComponent from '@/components/Alert';
import MangaCard from '@/components/MangaCard';
import SearchSkeleton from '@/components/SearchSkeleton';
import { Colors } from '@/constants/Colors';
import { useTheme } from '@/hooks/useTheme';
import {
  type MangaItem,
  searchManga,
} from '@/services/mangaFireService';
import { getLastReadChapter } from '@/services/readChapterService';
import {
  getSearchHistory,
  addSearchHistoryItem,
  removeSearchHistoryItem,
  clearSearchHistory,
  type SearchHistoryItem,
} from '@/services/searchHistoryService';
import { useDebounce } from '@/hooks/useDebounce';
import { logger } from '@/utils/logger';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useOffline } from '@/hooks/useOffline';
import { offlineCacheService } from '@/services/offlineCacheService';
import { replaceBookmark } from '@/services/bookmarkService';
import { getDefaultLayout } from '@/services/settingsService';
import { hapticFeedback } from '@/utils/haptics';
import { useToast } from '@/hooks/useToast';

/* Type Definitions */
interface LastReadChapters {
  [key: string]: string | null;
}

// Get initial dimensions once to avoid keyboard-triggered re-renders
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

export default function MangaSearchScreen() {
  // Theme and layout settings
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  // Use stable dimensions to prevent re-renders on keyboard open/close
  const styles = useMemo(
    () => getStyles(colors, SCREEN_WIDTH, SCREEN_HEIGHT),
    [colors]
  );
  const insets = useSafeAreaInsets();
  const { isOffline } = useOffline();
  const {
    query: initialQueryParam,
    replacementSourceId,
    replacementSourceTitle,
  } = useLocalSearchParams<{
    query?: string;
    replacementSourceId?: string;
    replacementSourceTitle?: string;
  }>();

  // Router and Input Ref
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const [isFocused, setIsFocused] = useState(false);

  // State variables
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 500);
  const [searchResults, setSearchResults] = useState<MangaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [, /* error */ setError] = useState<string | null>(null);
  const inFlightSeqRef = useRef(0);
  const [lastReadChapters, setLastReadChapters] = useState<LastReadChapters>(
    {}
  );
  const [tokenError, setTokenError] = useState(false);
  const currentQueryRef = useRef<string | null>(null);
  const [lastCompletedQuery, setLastCompletedQuery] = useState<string | null>(
    null
  );

  // Layout State
  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('list');

  // Search History State
  const [searchHistory, setSearchHistory] = useState<SearchHistoryItem[]>([]);
  const [showHistory, setShowHistory] = useState(true);
  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const hasLoadedHistoryRef = useRef(false);
  const [replacementCandidate, setReplacementCandidate] =
    useState<MangaItem | null>(null);
  const [isReplacementAlertVisible, setIsReplacementAlertVisible] =
    useState(false);
  const { showToast } = useToast();
  const normalizedReplacementSourceId =
    typeof replacementSourceId === 'string' ? replacementSourceId : '';
  const normalizedReplacementSourceTitle =
    typeof replacementSourceTitle === 'string' ? replacementSourceTitle : '';
  const isReplacementMode = normalizedReplacementSourceId.length > 0;

  // Load layout setting and search history on mount (not on focus to avoid re-animations)
  useEffect(() => {
    const loadInitialData = async () => {
      const [layout, history] = await Promise.all([
        getDefaultLayout(),
        getSearchHistory(),
      ]);
      setLayoutMode(layout);
      setSearchHistory(history);
      hasLoadedHistoryRef.current = true;
      // Small delay to ensure smooth transition
      setTimeout(() => setIsInitialLoad(false), 50);
    };
    loadInitialData();
  }, []);

  useEffect(() => {
    const initialQuery =
      typeof initialQueryParam === 'string' ? initialQueryParam.trim() : '';

    if (!initialQuery) {
      return;
    }

    setSearchQuery((current) =>
      current === initialQuery ? current : initialQuery
    );
    setShowHistory(false);
  }, [initialQueryParam]);

  // Refresh layout on focus (but not history to avoid re-animation)
  useFocusEffect(
    useCallback(() => {
      getDefaultLayout().then(setLayoutMode);
    }, [])
  );

  const loadSearchHistory = useCallback(async () => {
    const history = await getSearchHistory();
    setSearchHistory(history);
  }, []);

  // Focus input field on screen focus
  useFocusEffect(
    useCallback(() => {
      if (searchQuery === '') {
        inputRef.current?.focus();
      }
    }, [searchQuery])
  );

  // Search when the debounced query changes
  useEffect(() => {
    const q = debouncedSearchQuery.trim();

    if (q.length === 0) {
      setSearchResults([]);
      setIsLoading(false);
      setShowHistory(true);
      setLastCompletedQuery(null);
      currentQueryRef.current = null;
      return;
    }

    if (q.length <= 2) {
      return;
    }

    const seq = ++inFlightSeqRef.current;
    currentQueryRef.current = q;
    setIsLoading(true);
    setError(null);
    setTokenError(false);
    setShowHistory(false);

    if (isOffline) {
      setSearchResults([]);
      setError('You are offline. Connect to internet to search for manga.');
      setIsLoading(false);
      return;
    }

    (async () => {
      try {
        const items = await searchManga(q);
        if (inFlightSeqRef.current !== seq) return;
        setSearchResults(items);
        setLastCompletedQuery(q.toLowerCase());
        await addSearchHistoryItem(q);
        await loadSearchHistory();
        await offlineCacheService.cacheSearchResults(q, items);
      } catch (err) {
        if (inFlightSeqRef.current !== seq) return;
        setError('Failed to fetch manga. Please try again.');
        logger().error('Service', 'Failed to fetch manga', { error: err });
      } finally {
        if (inFlightSeqRef.current === seq) {
          setIsLoading(false);
        }
      }
    })();
  }, [debouncedSearchQuery, isOffline, loadSearchHistory]);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    setShowHistory(true);
    setLastCompletedQuery(null);
    currentQueryRef.current = null;
    inFlightSeqRef.current++;
    inputRef.current?.focus();
  }, []);

  // Handle manga item press
  const handleMangaPress = useCallback(
    (item: MangaItem) => {
      if (isReplacementMode) {
        setReplacementCandidate(item);
        setIsReplacementAlertVisible(true);
        return;
      }

      router.navigate({
        pathname: '/manga/[id]',
        params: { id: item.id, title: item.title, bannerImage: item.banner },
      });
    },
    [isReplacementMode, router]
  );

  const handleConfirmReplacement = useCallback(async () => {
    if (!replacementCandidate || !normalizedReplacementSourceId) {
      return;
    }

    try {
      await replaceBookmark(normalizedReplacementSourceId, {
        id: replacementCandidate.id,
        title: replacementCandidate.title,
        bannerImage: replacementCandidate.banner,
      });

      const shortSourceTitle =
        normalizedReplacementSourceTitle.length > 24
          ? normalizedReplacementSourceTitle.slice(0, 24) + '...'
          : normalizedReplacementSourceTitle;

      showToast({
        message: shortSourceTitle
          ? `${shortSourceTitle} replaced successfully`
          : 'Bookmark replaced successfully',
        icon: 'swap-horizontal',
        type: 'success',
      });

      router.navigate({
        pathname: '/manga/[id]',
        params: {
          id: replacementCandidate.id,
          title: replacementCandidate.title,
          bannerImage: replacementCandidate.banner,
        },
      });
    } catch (error) {
      logger().error('Storage', 'Failed to replace missing bookmark', {
        sourceId: normalizedReplacementSourceId,
        replacementId: replacementCandidate.id,
        error: error instanceof Error ? error.message : String(error),
      });
      showToast({
        message: 'Failed to replace bookmark',
        type: 'error',
      });
    } finally {
      setIsReplacementAlertVisible(false);
      setReplacementCandidate(null);
    }
  }, [
    normalizedReplacementSourceId,
    normalizedReplacementSourceTitle,
    replacementCandidate,
    router,
    showToast,
  ]);

  // Handle history item press
  const handleHistoryItemPress = useCallback((query: string) => {
    hapticFeedback.onSelection();
    setSearchQuery(query);
    setShowHistory(false);
  }, []);

  // Handle history item delete
  const handleHistoryItemDelete = useCallback(
    async (query: string) => {
      hapticFeedback.onPress();
      await removeSearchHistoryItem(query);
      await loadSearchHistory();
    },
    [loadSearchHistory]
  );

  // Handle clear all history
  const handleClearAllHistory = useCallback(async () => {
    hapticFeedback.onPress();
    await clearSearchHistory();
    setSearchHistory([]);
  }, []);

  // Fetch last read chapters without blocking the UI; parallelize and cancel on changes
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const ids = searchResults.map((it) => it.id);
      try {
        const results = await Promise.all(
          ids.map((id) => getLastReadChapter(id))
        );
        if (cancelled) return;
        const chapters: LastReadChapters = {};
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          if (!id) continue;
          chapters[id] = results[i] ?? null;
        }
        setLastReadChapters(chapters);
      } catch {
        // ignore errors here; UI can render without last-read badges
      }
    };

    if (searchResults.length > 0) {
      run();
    }

    return () => {
      cancelled = true;
    };
  }, [searchResults]);

  // Render function for MangaCard component
  const renderMangaCard = useCallback(
    ({ item, index }: { item: MangaItem; index: number }) => {
      if (layoutMode === 'list') {
        return (
          <Reanimated.View entering={FadeInDown.delay(index * 20).springify()}>
            <TouchableOpacity
              style={styles.resultItem}
              onPress={() => handleMangaPress(item)}
              activeOpacity={0.7}
            >
              <View style={styles.cardWrapperList}>
                <MangaCard
                  key={item.id}
                  title={item.title}
                  imageUrl={item.banner}
                  onPress={() => handleMangaPress(item)}
                  lastReadChapter={lastReadChapters[item.id] || null}
                  style={styles.card}
                  context="search"
                  mangaId={item.id}
                />
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <View style={styles.itemMetaContainer}>
                  {lastReadChapters[item.id] ? (
                    <View style={styles.lastReadBadge}>
                      <Ionicons name="book" size={12} color={colors.primary} />
                      <Text style={styles.lastReadText}>
                        Ch. {lastReadChapters[item.id]}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.actionBadge}>
                      <Text style={styles.actionText}>View Details</Text>
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={colors.tabIconDefault}
                      />
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          </Reanimated.View>
        );
      }

      // Grid view render
      return (
        <Reanimated.View
          entering={FadeInDown.delay(index * 20).springify()}
          style={styles.cardWrapperGrid}
        >
          <MangaCard
            key={item.id}
            title={item.title}
            imageUrl={item.banner}
            onPress={() => handleMangaPress(item)}
            lastReadChapter={lastReadChapters[item.id] || null}
            style={styles.card}
            context="search"
            mangaId={item.id}
          />
        </Reanimated.View>
      );
    },
    [handleMangaPress, lastReadChapters, styles, colors, layoutMode]
  );

  // Key extractor for FlatList
  const keyExtractor = useCallback((item: MangaItem) => item.id, []);

  // Render search history item - memoized to prevent re-renders
  const renderHistoryItem = useCallback(
    (item: SearchHistoryItem) => (
      <Pressable
        key={item.query}
        style={({ pressed }) => [
          styles.historyItem,
          pressed && { opacity: 0.7 },
        ]}
        onPress={() => handleHistoryItemPress(item.query)}
      >
        <View style={styles.historyItemContent}>
          <Ionicons
            name="time-outline"
            size={18}
            color={colors.tabIconDefault}
          />
          <Text style={styles.historyItemText} numberOfLines={1}>
            {item.query}
          </Text>
        </View>
        <TouchableOpacity
          onPress={() => handleHistoryItemDelete(item.query)}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          style={styles.historyDeleteButton}
        >
          <Ionicons name="close" size={18} color={colors.tabIconDefault} />
        </TouchableOpacity>
      </Pressable>
    ),
    [styles, colors, handleHistoryItemPress, handleHistoryItemDelete]
  );

  const EmptyState = useCallback(() => {
    // Show nothing during initial load to prevent flicker
    if (isInitialLoad) {
      return null;
    }

    // Show skeleton while loading search results
    if (isLoading) {
      return <SearchSkeleton layoutMode={layoutMode} count={6} />;
    }

    if (tokenError) {
      return (
        <View style={styles.emptyStateContainer}>
          <View
            style={[
              styles.emptyStateIcon,
              { backgroundColor: colors.error + '15' },
            ]}
          >
            <Ionicons
              name="cloud-offline-outline"
              size={48}
              color={colors.error}
            />
          </View>
          <Text style={styles.emptyStateTitle}>Connection Issue</Text>
          <Text style={styles.emptyStateText}>
            We couldn&apos;t connect to the search service.
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={async () => {
              const q = searchQuery.trim();
              if (q.length <= 2) {
                setTokenError(false);
                return;
              }

              setTokenError(false);
              setIsLoading(true);
              const seq = ++inFlightSeqRef.current;

              try {
                const items = await searchManga(q);
                if (inFlightSeqRef.current !== seq) return;
                setSearchResults(items);
                setLastCompletedQuery(q.toLowerCase());
              } catch (error) {
                if (inFlightSeqRef.current !== seq) return;
                setTokenError(true);
                logger().error('Service', 'Search retry failed', { error });
              } finally {
                if (inFlightSeqRef.current === seq) {
                  setIsLoading(false);
                }
              }
            }}
          >
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (isOffline) {
      return (
        <View style={styles.emptyStateContainer}>
          <View style={styles.emptyStateIcon}>
            <Ionicons
              name="cloud-offline-outline"
              size={48}
              color={colors.primary}
            />
          </View>
          <Text style={styles.emptyStateTitle}>Offline Mode</Text>
          <Text style={styles.emptyStateText}>
            You&apos;re currently offline. Check your bookmarks for downloaded
            content.
          </Text>
          <TouchableOpacity
            style={[styles.offlineButton, { backgroundColor: colors.primary }]}
            onPress={() => router.navigate('/bookmarks')}
          >
            <Ionicons name="bookmark" size={20} color="#FFFFFF" />
            <Text style={styles.offlineButtonText}>Go to Bookmarks</Text>
          </TouchableOpacity>
        </View>
      );
    }

    // No results found after search (only show if search actually completed for this query)
    const currentQueryNormalized = searchQuery.trim().toLowerCase();
    const searchCompleted = lastCompletedQuery === currentQueryNormalized;

    if (
      searchCompleted &&
      searchResults.length === 0 &&
      currentQueryNormalized.length > 2
    ) {
      return (
        <View style={styles.emptyStateContainer}>
          <View style={styles.emptyStateIcon}>
            <Ionicons
              name="search-outline"
              size={48}
              color={colors.tabIconDefault}
            />
          </View>
          <Text style={styles.emptyStateTitle}>No Results Found</Text>
          <Text style={styles.emptyStateText}>
            We couldn&apos;t find any manga matching &quot;{searchQuery.trim()}
            &quot;. Try a different title or check your spelling.
          </Text>
          <TouchableOpacity
            style={[styles.clearSearchButton, { borderColor: colors.primary }]}
            onPress={clearSearch}
          >
            <Text
              style={[styles.clearSearchButtonText, { color: colors.primary }]}
            >
              Clear Search
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    // Show search history
    if (searchHistory.length > 0 && showHistory) {
      return (
        <View>
          <View style={styles.historyHeader}>
            <Text style={styles.historyTitle}>Recent Searches</Text>
            <TouchableOpacity
              onPress={handleClearAllHistory}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <Text style={styles.clearAllText}>Clear All</Text>
            </TouchableOpacity>
          </View>
          <View style={styles.historyList}>
            {searchHistory.map(renderHistoryItem)}
          </View>
        </View>
      );
    }

    // Default empty state
    return (
      <View style={styles.emptyStateContainer}>
        <View style={styles.emptyStateIcon}>
          <Ionicons name="search-outline" size={48} color={colors.primary} />
        </View>
        <Text style={styles.emptyStateTitle}>Discover Manga</Text>
        <Text style={styles.emptyStateText}>
          Find your next favorite series by searching above
        </Text>
      </View>
    );
  }, [
    styles,
    colors.primary,
    colors.error,
    colors.tabIconDefault,
    tokenError,
    searchQuery,
    searchResults.length,
    lastCompletedQuery,
    isLoading,
    isInitialLoad,
    isOffline,
    router,
    layoutMode,
    searchHistory,
    showHistory,
    renderHistoryItem,
    handleClearAllHistory,
    clearSearch,
  ]);

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Search',
          headerTintColor: colors.text,
          headerShown: false,
        }}
      />
      <View style={[styles.headerWrapper, { paddingTop: insets.top }]}>
        <View style={styles.searchContainer}>
          <View
            style={[
              styles.searchInputContainer,
              isFocused && {
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.primary,
              },
            ]}
          >
            <Ionicons
              name="search"
              size={20}
              color={isFocused ? colors.primary : colors.tabIconDefault}
              style={styles.searchIcon}
            />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Search by title, author..."
              placeholderTextColor={colors.tabIconDefault}
              value={searchQuery}
              onChangeText={(query) => setSearchQuery(query)}
              returnKeyType="search"
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onSubmitEditing={() => {
                const q = searchQuery.trim();
                if (q.length > 2) {
                  setSearchQuery(q);
                }
              }}
            />
            {isLoading && (
              <ActivityIndicator
                size="small"
                color={colors.primary}
                style={styles.searchLoader}
              />
            )}
            {searchQuery.length > 0 && !isLoading && (
              <TouchableOpacity
                onPress={clearSearch}
                style={styles.clearButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="close-circle"
                  size={20}
                  color={colors.tabIconDefault}
                />
              </TouchableOpacity>
            )}
          </View>
          {isReplacementMode ? (
            <View style={styles.replacementBanner}>
              <Ionicons
                name="refresh-circle-outline"
                size={18}
                color={colors.primary}
              />
              <Text style={styles.replacementBannerText}>
                Replacing &quot;{normalizedReplacementSourceTitle}&quot;. Select
                the correct result to move its bookmark progress over.
              </Text>
            </View>
          ) : null}
        </View>
      </View>

      <View style={[styles.contentContainer, { marginTop: insets.top }]}>
        <Reanimated.FlatList
          data={searchResults}
          renderItem={renderMangaCard}
          keyExtractor={keyExtractor}
          key={layoutMode} // Forces remount when layout changes
          numColumns={layoutMode === 'grid' ? 2 : 1}
          contentContainerStyle={styles.gridContainer}
          columnWrapperStyle={
            layoutMode === 'grid' ? styles.columnWrapper : undefined
          }
          ListEmptyComponent={EmptyState}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
        />

      </View>

      <AlertComponent
        visible={isReplacementAlertVisible}
        title="Replace missing bookmark"
        onClose={() => {
          setIsReplacementAlertVisible(false);
          setReplacementCandidate(null);
        }}
        {...(replacementCandidate
          ? {
              message: `Replace "${normalizedReplacementSourceTitle}" with "${replacementCandidate.title}" and move the saved bookmark progress over?`,
            }
          : {})}
        options={[
          {
            text: 'Cancel',
            onPress: () => {
              setIsReplacementAlertVisible(false);
              setReplacementCandidate(null);
            },
          },
          {
            text: 'Replace Bookmark',
            icon: 'swap-horizontal',
            onPress: () => {
              handleConfirmReplacement().catch(console.error);
            },
          },
        ]}
        type="confirm"
      />
    </SafeAreaView>
  );
}

// Styles with responsiveness adjustments
const getStyles = (
  colors: typeof Colors.light,
  width: number,
  height: number
) => {
  const columnGap = 16;
  const containerPadding = 16;
  // Calculate grid card width: (Total width - 2*padding - gap) / 2
  const gridCardWidth = (width - containerPadding * 2 - columnGap) / 2;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerWrapper: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      backgroundColor: colors.background,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 4,
    },
    contentContainer: {
      flex: 1,
      paddingTop: 10,
    },
    searchContainer: {
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    searchInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 12,
      paddingHorizontal: 12,
      height: 44,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 17,
      color: colors.text,
      paddingVertical: 8,
      height: '100%',
    },
    clearButton: {
      padding: 4,
    },
    searchLoader: {
      marginRight: 4,
    },
    replacementBanner: {
      marginTop: 10,
      paddingHorizontal: 12,
      paddingVertical: 10,
      borderRadius: 12,
      backgroundColor: colors.primary + '12',
      borderWidth: 1,
      borderColor: colors.primary + '26',
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 8,
    },
    replacementBannerText: {
      flex: 1,
      fontSize: 13,
      lineHeight: 18,
      color: colors.text,
      fontWeight: '500',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    gridContainer: {
      paddingHorizontal: containerPadding,
      paddingTop: 16,
      paddingBottom: 100,
    },
    columnWrapper: {
      justifyContent: 'space-between',
      marginBottom: 16,
      gap: columnGap,
    },
    // List View Styling
    resultItem: {
      flexDirection: 'row',
      marginBottom: 12,
      height: 110,
      backgroundColor: colors.card,
      borderRadius: 12,
      overflow: 'hidden',
      shadowColor: colors.text,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    cardWrapperList: {
      width: 80,
      height: 110,
      overflow: 'hidden',
    },
    // Grid View Styling
    cardWrapperGrid: {
      width: gridCardWidth,
      marginBottom: 0,
    },
    card: {
      width: '100%',
    },
    itemInfo: {
      flex: 1,
      padding: 12,
      justifyContent: 'space-between',
    },
    itemTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      lineHeight: 22,
    },
    itemMetaContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    lastReadBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary + '15',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      alignSelf: 'flex-start',
    },
    lastReadText: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: '600',
      marginLeft: 4,
    },
    actionBadge: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    actionText: {
      fontSize: 13,
      color: colors.tabIconDefault,
      marginRight: 2,
    },
    emptyStateContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      marginTop: height * 0.15,
    },
    emptyStateIcon: {
      marginBottom: 16,
      opacity: 0.8,
    },
    emptyStateTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    emptyStateText: {
      fontSize: 16,
      color: colors.tabIconDefault,
      textAlign: 'center',
      lineHeight: 22,
      maxWidth: 300,
    },
    retryButton: {
      marginTop: 24,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.primary,
    },
    retryButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    offlineButton: {
      marginTop: 24,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
      backgroundColor: colors.primary,
      gap: 8,
    },
    offlineButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    clearSearchButton: {
      marginTop: 24,
      paddingHorizontal: 20,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1.5,
      backgroundColor: 'transparent',
    },
    clearSearchButtonText: {
      fontSize: 16,
      fontWeight: '600',
    },
    // Search History Styles
    historyHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 16,
      paddingTop: 8,
      paddingBottom: 12,
    },
    historyTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    clearAllText: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: '500',
    },
    historyList: {
      paddingHorizontal: 16,
    },
    historyItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 14,
      paddingHorizontal: 12,
      backgroundColor: colors.card,
      borderRadius: 10,
      marginBottom: 8,
    },
    historyItemContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      gap: 12,
    },
    historyItemText: {
      fontSize: 15,
      color: colors.text,
      flex: 1,
    },
    historyDeleteButton: {
      padding: 4,
    },
  });
};
