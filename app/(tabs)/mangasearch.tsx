import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  Keyboard,
  ActivityIndicator,
  useWindowDimensions,
  Platform
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import MangaCard from '@/components/MangaCard';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import { searchManga, MangaItem } from '@/services/mangaFireService';
import { getLastReadChapter } from '@/services/readChapterService';

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
  
  // State variables
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MangaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastReadChapters, setLastReadChapters] = useState<LastReadChapters>({});

  // Focus input field on screen focus
  useFocusEffect(
    useCallback(() => {
      if (searchQuery === '') {
        inputRef.current?.focus();
      }
    }, [searchQuery])
  );

  // Search function to handle input
  const onChangeSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    if (query.length > 2) {
      setIsLoading(true);
      setError(null);
      try {
        const results = await searchManga(query);
        setSearchResults(results);
      } catch (err) {
        setError('Failed to fetch manga. Please try again.');
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    } else {
      setSearchResults([]);
    }
  }, []);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    inputRef.current?.focus();
  }, [])


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
          lastReadChapter={lastReadChapters[item.id]}
          style={styles.card}
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

  // Handle keyboard dismiss on scroll
  const handleScrollBegin = () => {
    Keyboard.dismiss();
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Search',
          headerTintColor: colors.text,
          headerShown: false,
        }}
      />
     <View style={styles.searchContainer}>
        <Ionicons name="search" size={20} color={colors.text} style={styles.searchIcon} />
        <TextInput
          ref={inputRef}
          style={styles.searchBar}
          placeholder="Search manga"
          placeholderTextColor={colors.tabIconDefault}
          value={searchQuery}
          onChangeText={onChangeSearch}
        />
        {searchQuery.length > 0 && (
          <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
            <Ionicons name="close-sharp" size={20} color={colors.text} />
          </TouchableOpacity>
        )}
      </View>
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : searchResults.length === 0 && searchQuery.length > 2 ? (
        <Text style={styles.emptyText}>No results found.</Text>
      ) : (
        <FlatList
          data={searchResults}
          renderItem={renderMangaCard}
          keyExtractor={keyExtractor}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.contentContainer}
          onScrollBeginDrag={handleScrollBegin}
          keyboardShouldPersistTaps="handled"
        />
      )}
    </SafeAreaView>
  );
}

// Styles with responsiveness adjustments
const getStyles = (colors: typeof Colors.light, width: number, height: number) => {
  const isLandscape = width > height;
  const cardWidth = isLandscape ? (width - 60) / 4 : (width - 48) / 2;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      marginHorizontal: 20,
      paddingHorizontal: 15,
      height: 50,
      borderRadius: 25,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: colors.text,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
      marginBottom: 10,
    },
    searchIcon: {
      marginRight: 10,
    },
    searchBar: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
    },
    clearButton: {
      padding: 5,
      marginLeft: 5,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyText: {
      fontSize: 18,
      textAlign: 'center',
      marginTop: 40,
      color: colors.text,
    },
    contentContainer: {
      paddingHorizontal: 16,
      paddingBottom: 80,
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
  });
};
