import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  Animated,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import MangaCard from '@/components/MangaCard';
import { Colors } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import {
  searchManga,
  type MangaItem,
  CloudflareDetectedError,
} from '@/services/mangaFireService';
import { getLastReadChapter } from '@/services/readChapterService';
import { useDebounce } from '@/hooks/useDebounce';
import { useCloudflareDetection } from '@/hooks/useCloudflareDetection';

/* Type Definitions */
interface LastReadChapters {
  [key: string]: string | null;
}

export default function MangaSearchScreen() {
  // Theme and layout settings
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const { width, height } = useWindowDimensions();
  const styles = getStyles(colors, width, height);

  // Router and Input Ref
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  // State variables
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [searchResults, setSearchResults] = useState<MangaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [, /* error */ setError] = useState<string | null>(null);
  const [lastReadChapters, setLastReadChapters] = useState<LastReadChapters>(
    {}
  );

  // Focus input field on screen focus
  useFocusEffect(
    useCallback(() => {
      if (searchQuery === '') {
        inputRef.current?.focus();
      }
    }, [searchQuery])
  );

  const { checkForCloudflare } = useCloudflareDetection();
  // Search function to handle input
  useEffect(() => {
    const performSearch = async () => {
      if (debouncedSearchQuery.length > 2) {
        setIsLoading(true);
        setError(null);

        try {
          const results = await searchManga(debouncedSearchQuery);
          setSearchResults(results);
        } catch (err: any) {
          if (err instanceof CloudflareDetectedError) {
            // Navigate to Cloudflare verification and return early
            checkForCloudflare(err.html, '/mangasearch');
            return;
          }
          setError('Failed to fetch manga. Please try again.');
          console.error(err);
        } finally {
          setIsLoading(false);
        }
      } else if (debouncedSearchQuery.length === 0) {
        setSearchResults([]);
      }
    };

    performSearch();
  }, [debouncedSearchQuery, checkForCloudflare]);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    inputRef.current?.focus();
  }, []);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  // Handle manga item press
  const handleMangaPress = useCallback(
    (item: MangaItem) => {
      router.navigate({
        pathname: '/manga/[id]',
        params: { id: item.id, title: item.title, bannerImage: item.banner },
      });
    },
    [router]
  );

  // Fetch last read chapters
  useEffect(() => {
    const fetchLastReadChapters = async () => {
      const chapters: LastReadChapters = {};
      for (const item of searchResults) {
        chapters[item.id] = await getLastReadChapter(item.id);
      }
      setLastReadChapters(chapters);
    };

    if (searchResults.length > 0) {
      fetchLastReadChapters();
    }
  }, [searchResults]);

  // Render function for MangaCard component
  const renderMangaCard = useCallback(
    ({ item }: { item: MangaItem }) => (
      <View style={styles.cardWrapper}>
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
        <View style={styles.titleContainer}>
          <Text style={styles.mangaTitle} numberOfLines={2}>
            {item.title}
          </Text>
        </View>
      </View>
    ),
    [handleMangaPress, lastReadChapters, styles]
  );

  // Key extractor for FlatList
  const keyExtractor = useCallback((item: MangaItem) => item.id, []);

  const EmptyState = useCallback(
    () => (
      <View style={styles.emptyStateContainer}>
        <View style={styles.emptyStateIcon}>
          <Ionicons name="book-outline" size={48} color={colors.primary} />
        </View>
        <Text style={styles.emptyStateTitle}>Discover New Stories</Text>
        <Text style={styles.emptyStateText}>
          Search for manga, manhwa, and more
        </Text>
      </View>
    ),
    [styles, colors.primary]
  );

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Search',
          headerTintColor: colors.text,
          headerShown: false,
        }}
      />
      <View style={styles.headerWrapper}>
        <View style={{ height: 32, backgroundColor: colors.card }} />
        <View style={styles.searchContainer}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.searchInputContainer}>
            <Ionicons
              name="search"
              size={20}
              color={colors.tabIconDefault}
              style={styles.searchIcon}
            />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Search manga or manhwa..."
              placeholderTextColor={colors.tabIconDefault}
              value={searchQuery}
              onChangeText={(query) => setSearchQuery(query)}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={clearSearch}
                style={styles.clearButton}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={20}
                  color={colors.tabIconDefault}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <View style={styles.contentContainer}>
        {isLoading ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={colors.primary} />
          </View>
        ) : (
          <Animated.FlatList
            data={searchResults}
            renderItem={renderMangaCard}
            keyExtractor={keyExtractor}
            numColumns={2}
            contentContainerStyle={styles.gridContainer}
            columnWrapperStyle={styles.columnWrapper}
            onScroll={Animated.event(
              [{ nativeEvent: { contentOffset: { y: scrollY } } }],
              { useNativeDriver: true }
            )}
            ListEmptyComponent={EmptyState}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// Styles with responsiveness adjustments
const getStyles = (
  colors: typeof Colors.light,
  width: number,
  height: number
) => {
  const isLandscape = width > height;
  const cardWidth = isLandscape ? (width - 60) / 4 : (width - 48) / 2;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    headerWrapper: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      backgroundColor: colors.card,
    },
    contentContainer: {
      flex: 1,
      marginTop: 46,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      gap: 12,
      backgroundColor: colors.card,
    },
    backButton: {
      padding: 8,
    },
    searchInputContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 12,
      paddingHorizontal: 16,
      height: 44,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      paddingVertical: 8,
    },
    clearButton: {
      padding: 8,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    gridContainer: {
      padding: 16,
      paddingBottom: 150,
    },
    columnWrapper: {
      justifyContent: 'space-between',
    },
    cardWrapper: {
      width: cardWidth,
      marginBottom: 16,
    },
    card: {
      width: '100%',
      aspectRatio: 3 / 4,
    },
    titleContainer: {
      marginTop: 8,
    },
    mangaTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: 'bold',
      textAlign: 'center',
    },
    emptyStateContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      marginTop: height * 0.2,
    },
    emptyStateIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.primary + '20',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyStateTitle: {
      fontSize: 24,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    emptyStateText: {
      fontSize: 16,
      color: colors.tabIconDefault,
      textAlign: 'center',
      maxWidth: 250,
    },
  });
};
