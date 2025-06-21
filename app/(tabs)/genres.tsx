import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Dimensions,
} from 'react-native';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { MangaItem } from '@/services/mangaFireService';
import { MANGA_API_URL } from '@/constants/Config';
import axios from 'axios';
import { router } from 'expo-router';
import MangaCard from '@/components/MangaCard';
import { SmoothRefreshControl } from '@/components/SmoothRefreshControl';

interface Genre {
  name: string;
  slug: string;
  color: string;
}

const GENRES: Genre[] = [
  { name: 'Action', slug: 'action', color: '#FF6B35' },
  { name: 'Adventure', slug: 'adventure', color: '#4ECDC4' },
  { name: 'Avant Garde', slug: 'avant-garde', color: '#9B59B6' },
  { name: 'Boys Love', slug: 'boys-love', color: '#FF69B4' },
  { name: 'Comedy', slug: 'comedy', color: '#F39C12' },
  { name: 'Demons', slug: 'demons', color: '#8E44AD' },
  { name: 'Drama', slug: 'drama', color: '#E74C3C' },
  { name: 'Ecchi', slug: 'ecchi', color: '#EC7063' },
  { name: 'Fantasy', slug: 'fantasy', color: '#2ECC71' },
  { name: 'Girls Love', slug: 'girls-love', color: '#E91E63' },
  { name: 'Gourmet', slug: 'gourmet', color: '#FF8F00' },
  { name: 'Harem', slug: 'harem', color: '#E91E63' },
  { name: 'Horror', slug: 'horror', color: '#95A5A6' },
  { name: 'Isekai', slug: 'isekai', color: '#3498DB' },
  { name: 'Iyashikei', slug: 'iyashikei', color: '#58D68D' },
  { name: 'Josei', slug: 'josei', color: '#AF7AC5' },
  { name: 'Kids', slug: 'kids', color: '#F7DC6F' },
  { name: 'Magic', slug: 'magic', color: '#BB8FCE' },
  { name: 'Mahou Shoujo', slug: 'mahou-shoujo', color: '#F48FB1' },
  { name: 'Martial Arts', slug: 'martial-arts', color: '#FF5722' },
  { name: 'Mecha', slug: 'mecha', color: '#607D8B' },
  { name: 'Military', slug: 'military', color: '#795548' },
  { name: 'Music', slug: 'music', color: '#9C27B0' },
  { name: 'Mystery', slug: 'mystery', color: '#34495E' },
  { name: 'Parody', slug: 'parody', color: '#FFC107' },
  { name: 'Psychological', slug: 'psychological', color: '#5D4037' },
  { name: 'Reverse Harem', slug: 'reverse-harem', color: '#E91E63' },
  { name: 'Romance', slug: 'romance', color: '#F06292' },
  { name: 'School', slug: 'school', color: '#42A5F5' },
  { name: 'Sci-Fi', slug: 'sci-fi', color: '#26C6DA' },
  { name: 'Seinen', slug: 'seinen', color: '#546E7A' },
  { name: 'Shoujo', slug: 'shoujo', color: '#F8BBD9' },
  { name: 'Shounen', slug: 'shounen', color: '#FF7043' },
  { name: 'Slice of Life', slug: 'slice-of-life', color: '#81C784' },
  { name: 'Space', slug: 'space', color: '#7986CB' },
  { name: 'Sports', slug: 'sports', color: '#FFB74D' },
  { name: 'Super Power', slug: 'super-power', color: '#FF5252' },
  { name: 'Supernatural', slug: 'supernatural', color: '#AB47BC' },
  { name: 'Suspense', slug: 'suspense', color: '#78909C' },
  { name: 'Thriller', slug: 'thriller', color: '#424242' },
  { name: 'Vampire', slug: 'vampire', color: '#B71C1C' },
];

const { width: SCREEN_WIDTH } = Dimensions.get('window');

export default function GenresScreen() {
  const { actualTheme, accentColor } = useTheme();
  const colors = Colors[actualTheme];
  const themeColors = { ...colors, primary: accentColor || colors.primary };
  const styles = getStyles(themeColors);
  const insets = useSafeAreaInsets();

  const [selectedGenre, setSelectedGenre] = useState<Genre | null>(null);
  const [mangaList, setMangaList] = useState<MangaItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const fetchGenreManga = async (genre: Genre, isRefresh = false) => {
    if (!isRefresh) setLoading(true);
    try {
      const response = await axios.get(`${MANGA_API_URL}/genre/${genre.slug}`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
        },
        timeout: 10000,
      });

      if (response.data && typeof response.data === 'string') {
        const html = response.data as string;
        const mangaItems = parseGenreManga(html);
        setMangaList(mangaItems);
      }
    } catch (error) {
      console.error('Error fetching genre manga:', error);
      setMangaList([]);
    } finally {
      setLoading(false);
      if (isRefresh) setRefreshing(false);
    }
  };

  const parseGenreManga = (html: string): MangaItem[] => {
    const mangaRegex =
      /<div class="unit item-\d+">.*?<a href="(\/manga\/[^"]+)".*?<img src="([^"]+)".*?<span class="type">([^<]+)<\/span>.*?<a href="\/manga\/[^"]+">([^<]+)<\/a>/gs;
    const matches = [...html.matchAll(mangaRegex)];

    return matches
      .map((match) => {
        const link = match[1];
        const id = link.split('/').pop() || '';
        const imageUrl = match[2];

        return {
          id,
          link: `${MANGA_API_URL}${link}`,
          title: match[4].trim(),
          banner: imageUrl,
          imageUrl: imageUrl,
          type: match[3].trim(),
        };
      })
      .filter((item) => item.id && item.title)
      .slice(0, 20);
  };

  const handleGenreSelect = (genre: Genre) => {
    setSelectedGenre(genre);
    setMangaList([]);
    fetchGenreManga(genre);
  };

  const handleRefresh = () => {
    if (selectedGenre) {
      setRefreshing(true);
      fetchGenreManga(selectedGenre, true);
    }
  };

  const handleMangaPress = (manga: MangaItem) => {
    router.push(`/manga/${manga.id}`);
  };

  const renderGenreItem = ({ item }: { item: Genre }) => (
    <TouchableOpacity
      style={[
        styles.genreCard,
        {
          backgroundColor: colors.background,
          borderColor: colors.border,
        },
      ]}
      onPress={() => handleGenreSelect(item)}
      activeOpacity={0.7}
    >
      <View style={[styles.genreColorDot, { backgroundColor: item.color }]} />
      <Text style={[styles.genreText, { color: colors.text }]}>
        {item.name}
      </Text>
    </TouchableOpacity>
  );

  const renderMangaItem = ({ item }: { item: MangaItem }) => (
    <MangaCard
      title={item.title}
      imageUrl={item.imageUrl || item.banner}
      onPress={() => handleMangaPress(item)}
      style={styles.mangaCard}
      context="search"
    />
  );

  if (selectedGenre) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <FlatList
          data={mangaList}
          renderItem={renderMangaItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.mangaRow}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <SmoothRefreshControl
              refreshing={refreshing}
              onRefresh={handleRefresh}
              colors={[themeColors.primary]}
              tintColor={themeColors.primary}
            />
          }
          ListHeaderComponent={
            <View style={styles.selectedGenreHeader}>
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => {
                  setSelectedGenre(null);
                  setMangaList([]);
                }}
              >
                <Ionicons name="arrow-back" size={24} color={colors.text} />
              </TouchableOpacity>
              <Text
                style={[
                  styles.selectedGenreTitle,
                  { color: selectedGenre.color },
                ]}
              >
                {selectedGenre.name} Manga
              </Text>
            </View>
          }
          ListEmptyComponent={
            loading ? (
              <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={themeColors.primary} />
                <Text style={styles.loadingText}>Loading manga...</Text>
              </View>
            ) : (
              <View style={styles.emptyContainer}>
                <Ionicons
                  name="library-outline"
                  size={64}
                  color={colors.text}
                />
                <Text style={styles.emptyText}>
                  No manga found for this genre
                </Text>
              </View>
            )
          }
          contentContainerStyle={styles.contentContainer}
        />
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <FlatList
        data={GENRES}
        renderItem={renderGenreItem}
        keyExtractor={(item) => item.slug}
        numColumns={2}
        columnWrapperStyle={styles.genreRow}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={styles.contentContainer}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text style={styles.title}>Browse by Genre</Text>
            <Text style={styles.subtitle}>
              Discover manga by your favorite genres
            </Text>
          </View>
        }
      />
    </View>
  );
}

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.card,
    },
    contentContainer: {
      paddingHorizontal: 20,
      paddingBottom: 100,
    },
    header: {
      marginBottom: 25,
      marginTop: 10,
    },
    title: {
      fontSize: 32,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: colors.text,
      opacity: 0.7,
    },
    genreRow: {
      justifyContent: 'space-between',
      marginBottom: 12,
    },
    genreCard: {
      width: (SCREEN_WIDTH - 52) / 2,
      paddingVertical: 16,
      paddingHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      flexDirection: 'row',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 1,
    },
    genreColorDot: {
      width: 12,
      height: 12,
      borderRadius: 6,
      marginRight: 12,
    },
    genreText: {
      fontSize: 14,
      fontWeight: '500',
      flex: 1,
    },
    selectedGenreHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 25,
      marginTop: 10,
    },
    backButton: {
      padding: 8,
      marginRight: 15,
      borderRadius: 20,
      backgroundColor: colors.background,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 2,
      elevation: 2,
    },
    selectedGenreTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      flex: 1,
    },
    mangaRow: {
      justifyContent: 'space-between',
      marginBottom: 15,
    },
    mangaCard: {
      width: (SCREEN_WIDTH - 52) / 2,
      backgroundColor: colors.background,
      borderRadius: 12,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 2,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
      minHeight: 200,
    },
    loadingText: {
      marginTop: 15,
      fontSize: 16,
      color: colors.text,
      opacity: 0.7,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
      minHeight: 200,
    },
    emptyText: {
      marginTop: 15,
      fontSize: 16,
      color: colors.text,
      textAlign: 'center',
      opacity: 0.7,
    },
  });
