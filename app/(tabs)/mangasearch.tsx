import React, { useState, useCallback } from 'react';
import { View, TextInput, FlatList, StyleSheet, Text, useColorScheme, Image } from 'react-native';
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
        headerStyle: {
          backgroundColor: colors.background,
        },
        headerTintColor: colors.text,
      }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <View style={styles.searchContainer}>
          <Ionicons name="search" size={20} color={colors.text} style={styles.searchIcon} />
          <TextInput
            style={[styles.searchBar, {
              color: colors.text,
              backgroundColor: colors.card,
            }]}
            placeholder="Search manga"
            placeholderTextColor={colors.tabIconDefault}
            value={searchQuery}
            onChangeText={onChangeSearch}
          />
        </View>
        {isLoading && (
          <View style={styles.loadingContainer}>
            <Text style={[styles.loadingText, { color: colors.text }]}>Loading...</Text>
          </View>
        )}
        {error && (
          <View style={styles.errorContainer}>
            <Text style={[styles.errorText, { color: colors.notification }]}>{error}</Text>
          </View>
        )}
        {!isLoading && searchQuery.length <= 2 && (
          <View style={styles.instructionContainer}>
            <Text style={[styles.instructionText, { color: colors.text }]}>
              Start searching for manga by entering a keyword in the search bar above.
            </Text>
            <Text style={[styles.instructionSubText, { color: colors.text }]}>
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
                <Text style={[styles.noResultsText, { color: colors.text }]}>No results found</Text>
              </View>
            ) : null
          }
          extraData={searchResults}
        />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
    marginTop: 40,
    borderRadius: 10,
    overflow: 'hidden',
  },
  searchIcon: {
    padding: 10,
  },
  searchBar: {
    flex: 1,
    height: 50,
    paddingHorizontal: 10,
    fontSize: 16,
  },
  loadingContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  loadingText: {
    fontSize: 18,
  },
  errorContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
  },
  instructionContainer: {
    alignItems: 'center',
    marginTop: 20,
  },
  instructionText: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 10,
  },
  instructionSubText: {
    fontSize: 14,
    textAlign: 'center',
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
  },
});