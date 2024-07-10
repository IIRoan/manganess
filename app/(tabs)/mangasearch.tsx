import React, { useState, useCallback } from 'react';
import { View, TextInput, FlatList, StyleSheet, Text, useColorScheme } from 'react-native';
import { Stack, useRouter } from 'expo-router';
import MangaCard from '@/components/MangaCard';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';

// MangaItem interface
export interface MangaItem {
  id: string;
  title: string;
  banner: string;
  link: string;
  type: string;
}

export const searchManga = async (keyword: string): Promise<MangaItem[]> => {
  try {
    const response = await fetch(`https://mangafire.to/filter?keyword=${encodeURIComponent(keyword)}`, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
      },
    });

    const html = await response.text();
    const mangaRegex = /<div class="unit item-\d+">.*?<a href="(\/manga\/[^"]+)".*?<img src="([^"]+)".*?<span class="type">([^<]+)<\/span>.*?<a href="\/manga\/[^"]+">([^<]+)<\/a>/gs;
    const matches = [...html.matchAll(mangaRegex)];

    return matches.map(match => {
      const link = match[1];
      const id = link.split('/').pop() || '';
      return {
        id,
        link: `https://mangafire.to${link}`,
        title: match[4].trim(),
        banner: match[2],
        type: match[3].trim(),
      };
    });
  } catch (error) {
    console.error('Error searching manga:', error);
    return [];
  }
};


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
    router.push({
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
          backgroundColor: colors.card,
        },
        headerTintColor: colors.text,
      }} />
      <View style={[styles.container, { backgroundColor: colors.background }]}>
        <TextInput
          style={[styles.searchBar, {
            borderColor: colors.border,
            color: colors.text,
            backgroundColor: colors.card,
          }]}
          placeholder="Search manga"
          placeholderTextColor={colors.tabIconDefault}
          value={searchQuery}
          onChangeText={onChangeSearch}
        />
        {isLoading && <Text style={{ color: colors.text }}>Loading...</Text>}
        {error && <Text style={[styles.errorText, { color: colors.notification }]}>{error}</Text>}
        <FlatList
          data={searchResults}
          renderItem={renderMangaCard}
          keyExtractor={keyExtractor}
          numColumns={2}
          columnWrapperStyle={styles.row}
          ListEmptyComponent={() =>
            !isLoading && searchQuery.length > 2 ?
              <Text style={{ color: colors.text }}>No results found</Text> : null
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
    padding: 10,
  },
  searchBar: {
    height: 40,
    borderWidth: 1,
    borderRadius: 5,
    paddingHorizontal: 10,
    marginTop: 35,
    marginBottom: 20,
  },
  errorText: {
    marginBottom: 10,
  },
  row: {
    flex: 1,
    justifyContent: 'space-between',
    paddingHorizontal: 5,
  },
});