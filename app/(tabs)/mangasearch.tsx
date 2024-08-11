import React, { useState, useCallback, useRef } from 'react';
import { View, TextInput, FlatList, StyleSheet, Text, useColorScheme, TouchableOpacity } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import MangaCard from '@/components/MangaCard';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { searchManga, MangaItem } from '@/services/mangaFireService';

export default function MangaSearchScreen() {
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<MangaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme = theme === 'system' ? systemColorScheme : theme as ColorScheme;
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);
  const inputRef = useRef<TextInput>(null);

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
      // @ts-ignore
      pathname: `/manga/${item.id}`,
      params: {
        title: item.title,
        bannerImage: item.banner
      }
    });
  }, [router]);
  

  const renderMangaCard = useCallback(({ item }: { item: MangaItem }) => {
    return (
      <MangaCard
        key={item.id}
        title={item.title}
        imageUrl={item.banner}
        onPress={() => handleMangaPress(item)}
      />
    );
  }, [handleMangaPress]);

  const keyExtractor = useCallback((item: MangaItem) => item.id, []);

  return (
    <>
      <Stack.Screen options={{
        title: 'Manga Search',
        headerTintColor: colors.text,
      }} />
      <View style={styles.container}>
        <TouchableOpacity 
          style={styles.searchContainer}
          onPress={() => inputRef.current?.focus()}
          activeOpacity={0.7}
        >
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
        </TouchableOpacity>
        {isLoading && (
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        )}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </View>
        )}
        {!isLoading && searchQuery.length <= 2 && (
          <View style={styles.instructionContainer}>
            <Text style={styles.instructionText}>
              Start searching for manga by entering a keyword in the search bar above.
            </Text>
            <Text style={styles.instructionSubText}>
              Enter at least 3 characters to start searching for manga
            </Text>
          </View>
        )}
        <FlatList
          data={searchResults}
          renderItem={renderMangaCard}
          keyExtractor={keyExtractor}
          numColumns={2}
          columnWrapperStyle={styles.row}
          contentContainerStyle={styles.flatListContent}
          ListEmptyComponent={() =>
            !isLoading && searchQuery.length > 2 ? (
              <View style={styles.noResultsContainer}>
                <Text style={styles.noResultsText}>No results found</Text>
              </View>
            ) : null
          }
          extraData={searchResults}
        />
      </View>
    </>
  );
}

const getStyles = (colors: typeof Colors.light) => StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.card,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 10,
    borderRadius: 25,
    marginTop: 30,
    paddingHorizontal: 15,
    height: 50,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 }, 

  },
  searchIcon: {
    marginRight: 10,
  },
  searchBar: {
    flex: 1,
    fontSize: 16,
    height: '100%',
    color: colors.text,
  },
  loadingContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  loadingText: {
    fontSize: 18,
    color: colors.text,
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
  flatListContent: {
    paddingTop: 10,
  },
  row: {
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  noResultsContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  noResultsText: {
    fontSize: 16,
    color: colors.text,
  },
});
