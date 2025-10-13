import React, { useState } from 'react';
import type { ColorValue } from 'react-native';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  FlatList,
  Dimensions,
  RefreshControl,
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
import { LinearGradient } from 'expo-linear-gradient';

interface Genre {
  name: string;
  slug: string;
  color: string;
  icon: keyof typeof Ionicons.glyphMap;
}

const GENRES: Genre[] = [
  { name: 'Action', slug: 'action', color: '#FF6B35', icon: 'flash' },
  { name: 'Adventure', slug: 'adventure', color: '#4ECDC4', icon: 'compass' },
  { name: 'Avant Garde', slug: 'avant-garde', color: '#9B59B6', icon: 'color-palette' },
  { name: 'Boys Love', slug: 'boys-love', color: '#FF69B4', icon: 'heart' },
  { name: 'Comedy', slug: 'comedy', color: '#F39C12', icon: 'happy' },
  { name: 'Demons', slug: 'demons', color: '#8E44AD', icon: 'bonfire' },
  { name: 'Drama', slug: 'drama', color: '#E74C3C', icon: 'chatbubbles' },
  { name: 'Ecchi', slug: 'ecchi', color: '#EC7063', icon: 'sparkles' },
  { name: 'Fantasy', slug: 'fantasy', color: '#2ECC71', icon: 'planet' },
  { name: 'Girls Love', slug: 'girls-love', color: '#E91E63', icon: 'heart-circle' },
  { name: 'Gourmet', slug: 'gourmet', color: '#FF8F00', icon: 'restaurant' },
  { name: 'Harem', slug: 'harem', color: '#E91E63', icon: 'people' },
  { name: 'Horror', slug: 'horror', color: '#95A5A6', icon: 'skull' },
  { name: 'Isekai', slug: 'isekai', color: '#3498DB', icon: 'sparkles-outline' },
  { name: 'Iyashikei', slug: 'iyashikei', color: '#58D68D', icon: 'leaf' },
  { name: 'Josei', slug: 'josei', color: '#AF7AC5', icon: 'female' },
  { name: 'Kids', slug: 'kids', color: '#F7DC6F', icon: 'game-controller' },
  { name: 'Magic', slug: 'magic', color: '#BB8FCE', icon: 'color-wand' },
  { name: 'Mahou Shoujo', slug: 'mahou-shoujo', color: '#F48FB1', icon: 'star' },
  { name: 'Martial Arts', slug: 'martial-arts', color: '#FF5722', icon: 'fitness' },
  { name: 'Mecha', slug: 'mecha', color: '#607D8B', icon: 'hardware-chip' },
  { name: 'Military', slug: 'military', color: '#795548', icon: 'shield' },
  { name: 'Music', slug: 'music', color: '#9C27B0', icon: 'musical-notes' },
  { name: 'Mystery', slug: 'mystery', color: '#34495E', icon: 'search' },
  { name: 'Parody', slug: 'parody', color: '#FFC107', icon: 'chatbubble-ellipses' },
  { name: 'Psychological', slug: 'psychological', color: '#5D4037', icon: 'bulb' },
  { name: 'Reverse Harem', slug: 'reverse-harem', color: '#E91E63', icon: 'people-circle' },
  { name: 'Romance', slug: 'romance', color: '#F06292', icon: 'heart' },
  { name: 'School', slug: 'school', color: '#42A5F5', icon: 'book' },
  { name: 'Sci-Fi', slug: 'sci-fi', color: '#26C6DA', icon: 'rocket' },
  { name: 'Seinen', slug: 'seinen', color: '#546E7A', icon: 'body' },
  { name: 'Shoujo', slug: 'shoujo', color: '#F8BBD9', icon: 'sparkles' },
  { name: 'Shounen', slug: 'shounen', color: '#FF7043', icon: 'flame' },
  { name: 'Slice of Life', slug: 'slice-of-life', color: '#81C784', icon: 'cafe' },
  { name: 'Space', slug: 'space', color: '#7986CB', icon: 'planet' },
  { name: 'Sports', slug: 'sports', color: '#FFB74D', icon: 'trophy' },
  { name: 'Super Power', slug: 'super-power', color: '#FF5252', icon: 'flash-outline' },
  { name: 'Supernatural', slug: 'supernatural', color: '#AB47BC', icon: 'moon' },
  { name: 'Suspense', slug: 'suspense', color: '#78909C', icon: 'alarm' },
  { name: 'Thriller', slug: 'thriller', color: '#424242', icon: 'alert' },
  { name: 'Vampire', slug: 'vampire', color: '#B71C1C', icon: 'water' },
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

  const fetchGenreManga = async (genre: Genre) => {
    setLoading(true);
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
    }
  };

  const parseGenreManga = (html: string): MangaItem[] => {
    const mangaRegex =
      /<div class="unit item-\d+">.*?<a href="(\/manga\/[^"]+)".*?<img src="([^"]+)".*?<span class="type">([^<]+)<\/span>.*?<a href="\/manga\/[^"]+">([^<]+)<\/a>/gs;
    const matches = [...html.matchAll(mangaRegex)];

    return matches
      .map((match) => {
        const link = match[1];
        const id = link?.split('/').pop() || '';
        const imageUrl = match[2];

        return {
          id,
          link: `${MANGA_API_URL}${link}`,
          title: match[4]?.trim() || '',
          banner: imageUrl || '',
          imageUrl: imageUrl || '',
          type: match[3]?.trim() || '',
        };
      })
      .filter((item) => item.id && item.title)
      .slice(0, 20);
  };

  const handleGenreSelect = (genre: Genre) => {
    setSelectedGenre(genre);
    setMangaList([]);
    setLoading(true);
    fetchGenreManga(genre);
  };

  const handleMangaPress = (manga: MangaItem) => {
    router.push(`/manga/${manga.id}`);
  };

  const renderGenreItem = ({ item }: { item: Genre }) => {
    const genreGradient = getGradientShades(item.color, themeColors.primary);

    return (
      <TouchableOpacity
        style={styles.genreTouchArea}
        onPress={() => handleGenreSelect(item)}
        activeOpacity={0.85}
      >
        <LinearGradient
          colors={genreGradient}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={[
            styles.genreCard,
            selectedGenre?.slug === item.slug && styles.genreCardSelected,
          ]}
        >
          <View
            style={[
              styles.genreBadge,
              { backgroundColor: applyOpacity(colors.card, 0.18) },
            ]}
          >
            <Ionicons
              name={item.icon}
              size={18}
              color={colors.card}
            />
          </View>
          <View style={styles.genreInfo}>
            <Text style={[styles.genreName, { color: colors.card }]}>{item.name}</Text>
            <View style={styles.genreMeta}>
              <Ionicons
                name="albums"
                size={14}
                color={applyOpacity(colors.card, 0.8)}
              />
              <Text style={[styles.genreMetaText, { color: applyOpacity(colors.card, 0.85) }]}>
                Stories await
              </Text>
            </View>
          </View>
          <Ionicons
            name="chevron-forward"
            size={16}
            color={applyOpacity(colors.card, 0.85)}
          />
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  const renderMangaItem = ({ item }: { item: MangaItem }) => (
    <MangaCard
      title={item.title}
      imageUrl={item.imageUrl || item.banner}
      onPress={() => handleMangaPress(item)}
      style={styles.mangaCard}
      context="search"
      lastReadChapter={null}
      mangaId={item.id}
    />
  );

  if (selectedGenre) {
    const selectedGradient = getGradientShades(
      selectedGenre.color,
      themeColors.primary
    );

    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <FlatList
          data={mangaList}
          renderItem={renderMangaItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.mangaRow}
          showsVerticalScrollIndicator={false}
          ListHeaderComponent={
            <View style={styles.selectedHeaderWrapper}>
              <LinearGradient
                colors={selectedGradient}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.selectedHero}
              >
                <TouchableOpacity
                  style={[styles.backPill, { backgroundColor: applyOpacity(colors.card, 0.18) }]}
                  onPress={() => {
                    setSelectedGenre(null);
                    setMangaList([]);
                  }}
                  activeOpacity={0.8}
                >
                  <Ionicons name="arrow-back" size={18} color={colors.card} />
                  <Text style={[styles.backPillText, { color: colors.card }]}>Genres</Text>
                </TouchableOpacity>
                <Text style={[styles.selectedHeroTitle, { color: colors.card }]}>
                  {selectedGenre.name}
                </Text>
                <Text style={[styles.selectedHeroSubtitle, { color: applyOpacity(colors.card, 0.85) }]}>
                  Handpicked {selectedGenre.name.toLowerCase()} adventures curated for you.
                </Text>
              </LinearGradient>
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
          refreshControl={
            <RefreshControl
              refreshing={loading}
              tintColor={selectedGenre.color}
              colors={[selectedGenre.color]}
              onRefresh={() => fetchGenreManga(selectedGenre)}
            />
          }
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
          <View>
            <LinearGradient
              colors={getGradientShades(themeColors.primary, colors.background)}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={styles.heroCard}
            >
              <View style={[styles.heroBadge, { backgroundColor: applyOpacity(colors.card, 0.18) }]}> 
                <Ionicons name="sparkles-outline" size={18} color={colors.card} />
                <Text style={[styles.heroBadgeText, { color: colors.card }]}>Curated worlds</Text>
              </View>
              <Text style={[styles.heroTitle, { color: colors.card }]}>Dive into new manga universes</Text>
              <Text style={[styles.heroSubtitle, { color: applyOpacity(colors.card, 0.85) }]}>
                Explore {GENRES.length}+ genres filled with stories that match your mood.
              </Text>
              <View style={styles.heroStatsRow}>
                <View style={styles.heroStat}>
                  <Text style={[styles.heroStatValue, { color: colors.card }]}>{GENRES.length}</Text>
                  <Text style={[styles.heroStatLabel, { color: applyOpacity(colors.card, 0.85) }]}>Genres</Text>
                </View>
                <View style={styles.heroStatDivider} />
                <View style={styles.heroStat}>
                  <Ionicons name="timer-outline" size={18} color={applyOpacity(colors.card, 0.85)} />
                  <Text style={[styles.heroStatLabel, { color: applyOpacity(colors.card, 0.85) }]}>Quick picks</Text>
                </View>
                <View style={styles.heroStatDivider} />
                <View style={styles.heroStat}>
                  <Ionicons name="book-outline" size={18} color={applyOpacity(colors.card, 0.85)} />
                  <Text style={[styles.heroStatLabel, { color: applyOpacity(colors.card, 0.85) }]}>Fresh reads</Text>
                </View>
              </View>
            </LinearGradient>

            <View style={styles.sectionHeading}>
              <Text style={[styles.sectionTitle, { color: colors.text }]}>Browse by Genre</Text>
              <Text style={[styles.sectionSubtitle, { color: applyOpacity(colors.text, 0.7) }]}>
                Choose a vibe to unlock a curated selection of manga
              </Text>
            </View>
          </View>
        }
      />
    </View>
  );
}

const applyOpacity = (hex: string, opacity: number) => {
  const normalized = hex.replace('#', '');
  if (normalized.length !== 6) return hex;

  const alpha = Math.round(Math.min(Math.max(opacity, 0), 1) * 255)
    .toString(16)
    .padStart(2, '0');

  return `#${normalized}${alpha}`;
};

const getGradientShades = (
  color: string,
  fallback: string
): [ColorValue, ColorValue, ColorValue] => [
  applyOpacity(color, 0.95),
  applyOpacity(color, 0.75),
  applyOpacity(fallback, 0.6),
];

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.card,
    },
    contentContainer: {
      paddingHorizontal: 20,
      paddingBottom: 100,
      gap: 12,
    },
    heroCard: {
      borderRadius: 24,
      padding: 24,
      marginBottom: 28,
      overflow: 'hidden',
    },
    heroBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
      marginBottom: 18,
      gap: 6,
    },
    heroBadgeText: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    heroTitle: {
      fontSize: 28,
      fontWeight: '800',
      marginBottom: 10,
      letterSpacing: 0.3,
    },
    heroSubtitle: {
      fontSize: 15,
      lineHeight: 22,
      marginBottom: 24,
    },
    heroStatsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    heroStat: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    heroStatValue: {
      fontSize: 26,
      fontWeight: '700',
      marginRight: 6,
    },
    heroStatLabel: {
      fontSize: 13,
      fontWeight: '500',
      letterSpacing: 0.3,
    },
    heroStatDivider: {
      width: 1,
      height: 20,
      backgroundColor: applyOpacity(colors.card, 0.25),
    },
    sectionHeading: {
      marginBottom: 18,
      gap: 6,
    },
    sectionTitle: {
      fontSize: 24,
      fontWeight: '700',
    },
    sectionSubtitle: {
      fontSize: 15,
      lineHeight: 22,
    },
    genreRow: {
      justifyContent: 'space-between',
      marginBottom: 18,
    },
    genreTouchArea: {
      width: (SCREEN_WIDTH - 60) / 2,
    },
    genreCard: {
      borderRadius: 20,
      padding: 20,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 14,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 10 },
      shadowOpacity: 0.12,
      shadowRadius: 12,
      elevation: 4,
    },
    genreCardSelected: {
      transform: [{ translateY: -4 }],
      shadowOpacity: 0.2,
    },
    genreBadge: {
      width: 36,
      height: 36,
      borderRadius: 18,
      alignItems: 'center',
      justifyContent: 'center',
    },
    genreInfo: {
      flex: 1,
      gap: 4,
    },
    genreName: {
      fontSize: 16,
      fontWeight: '700',
      letterSpacing: 0.2,
    },
    genreMeta: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    genreMetaText: {
      fontSize: 12,
      fontWeight: '600',
      letterSpacing: 0.3,
      textTransform: 'uppercase',
    },
    selectedHeaderWrapper: {
      marginBottom: 24,
    },
    selectedHero: {
      borderRadius: 24,
      padding: 24,
      overflow: 'hidden',
      gap: 16,
    },
    backPill: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 6,
      borderRadius: 999,
    },
    backPillText: {
      fontSize: 13,
      fontWeight: '600',
      letterSpacing: 0.4,
      textTransform: 'uppercase',
    },
    selectedHeroTitle: {
      fontSize: 30,
      fontWeight: '800',
      letterSpacing: 0.3,
    },
    selectedHeroSubtitle: {
      fontSize: 16,
      lineHeight: 22,
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
