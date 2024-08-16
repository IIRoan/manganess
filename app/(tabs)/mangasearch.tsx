import React, { useState, useCallback, useRef, useEffect } from 'react';
import { 
  View, 
  TextInput, 
  FlatList, 
  StyleSheet, 
  Text, 
  TouchableOpacity, 
  SafeAreaView, 
  Platform, 
  StatusBar, 
  Dimensions,
  Keyboard,
  ActivityIndicator
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import MangaCard from '@/components/MangaCard';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { searchManga, MangaItem } from '@/services/mangaFireService';
import AsyncStorage from '@react-native-async-storage/async-storage';


const { height, width } = Dimensions.get('window');

export default function MangaSearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MangaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const styles = getStyles(colors);
  const inputRef = useRef<TextInput>(null);
  const [lastReadChapters, setLastReadChapters] = useState<{[key: string]: string | null}>({});

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

  const handleMangaPress = useCallback((item: MangaItem) => {
    router.navigate({
      pathname: "/manga/[id]",
      params: {
        id: item.id,
        title: item.title,
        bannerImage: item.banner
      }
    });
  }, [router]);

  const getLastReadChapter = async (mangaId: string): Promise<string | null> => {
    try {
      const key = `manga_${mangaId}_read_chapters`;
      const readChapters = await AsyncStorage.getItem(key) || '[]';
      const chaptersArray = JSON.parse(readChapters);

      if (chaptersArray.length === 0) {
        return null;
      }

      const numericChapters = chaptersArray.map((chapter: string) => parseFloat(chapter));
      const lastReadChapter = Math.max(...numericChapters);

      return `Chapter ${lastReadChapter}`;
    } catch (error) {
      console.error('Error getting last read chapter:', error);
      return null;
    }
  };

  const renderMangaCard = useCallback(({ item }: { item: MangaItem }) => {
    return (
      <MangaCard
        key={item.id}
        title={item.title}
        imageUrl={item.banner}
        onPress={() => handleMangaPress(item)}
        lastReadChapter={lastReadChapters[item.id]}
      />
    );
  }, [handleMangaPress, lastReadChapters]);

  useEffect(() => {
    const fetchLastReadChapters = async () => {
      const chapters: {[key: string]: string | null} = {};
      for (const item of searchResults) {
        chapters[item.id] = await getLastReadChapter(item.id);
      }
      setLastReadChapters(chapters);
    };

    if (searchResults.length > 0) {
      fetchLastReadChapters();
    }
  }, [searchResults]);

  const keyExtractor = useCallback((item: MangaItem) => item.id, []);

  const handleScrollBegin = () => {
    Keyboard.dismiss();
  };

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen options={{
        title: 'Manga Search',
        headerTintColor: colors.text,
        headerShown: false,
      }} />
      <View style={styles.searchContainer}>
        <Ionicons
          name="search"
          size={20}
          color={colors.text}
          style={styles.searchIcon}
        />
        <TextInput
          ref={inputRef}
          style={styles.searchBar}
          placeholder="Search manga"
          placeholderTextColor={colors.tabIconDefault}
          value={searchQuery}
          onChangeText={onChangeSearch}
        />
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

const getStyles = (colors: typeof Colors.light) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginHorizontal: 20,
    marginBottom: 20,
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
  },
  searchIcon: {
    marginRight: 10,
  },
  searchBar: {
    flex: 1,
    fontSize: 16,
    color: colors.text,
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
    paddingHorizontal: 10,
    paddingBottom: 80,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  errorContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    color: colors.notification,
  },
  instructionContainer: {
    alignItems: 'center',
    marginTop: 20,
    paddingHorizontal: 20,
  },
  instructionText: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 10,
    color: colors.text,
  },
  instructionSubText: {
    fontSize: 14,
    textAlign: 'center',
    color: colors.text,
  },
});
