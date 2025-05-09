import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
  Image,
  RefreshControl,
  StatusBar,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { MANGA_API_URL } from '@/constants/Config';
import MangaCard from '@/components/MangaCard';
import { parseMostViewedManga, parseNewReleases } from '@/services/mangaFireService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCloudflareDetection } from '@/hooks/useCloudflareDetection';
import axios from 'axios';
import { MangaItem } from '@/types';

const TRENDING_CARD_WIDTH = 200;
const TRENDING_CARD_HEIGHT = 260;
const FEATURED_HEIGHT = 280;



export default function HomeScreen() {
  const router = useRouter();
  const { actualTheme, accentColor } = useTheme();
  const colors = Colors[actualTheme];
  const themeColors = { ...colors, primary: accentColor || colors.primary };
  const { checkForCloudflare, resetCloudflareDetection } = useCloudflareDetection();
  const insets = useSafeAreaInsets();

  const [mostViewedManga, setMostViewedManga] = useState<MangaItem[]>([]);
  const [newReleases, setNewReleases] = useState<MangaItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [featuredManga, setFeaturedManga] = useState<MangaItem | null>(null);

  useEffect(() => {
    fetchMangaData();
    return () => {
      resetCloudflareDetection();
    };
  }, []);

  const fetchMangaData = async () => {
    try {
      setError(null);
      if (!isRefreshing) {
        setIsLoading(true);
      }

      const response = await axios.get(`${MANGA_API_URL}/home`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        },
        timeout: 10000,
      });

      const html = response.data as string;

      if (checkForCloudflare(html)) {
        return;
      }

      const parsedMostViewed = parseMostViewedManga(html);
      const parsedNewReleases = parseNewReleases(html);

      setMostViewedManga(parsedMostViewed);
      setNewReleases(parsedNewReleases);

      if (parsedMostViewed.length > 0) {
        setFeaturedManga(parsedMostViewed[0]);
      }
    } catch (error) {
      console.error('Error fetching manga data:', error);
      setError('An error occurred while fetching manga data. Please try again.');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const handleRefresh = () => {
    setIsRefreshing(true);
    fetchMangaData();
  };

  const renderSectionTitle = (title: string, iconName: keyof typeof Ionicons.glyphMap) => (
    <View style={styles.sectionTitleContainer}>
      <View style={[styles.iconBackground, { backgroundColor: themeColors.primary + '20' }]}>
        <Ionicons name={iconName} size={20} color={themeColors.primary} />
      </View>
      <Text style={[styles.sectionTitle, { color: themeColors.text }]}>{title}</Text>
    </View>
  );

  const renderTrendingItem = ({ item, index }: { item: MangaItem; index: number }) => (
    <TouchableOpacity
      style={[
        styles.trendingItem,
        { marginLeft: index === 0 ? 16 : 12 }
      ]}
      onPress={() => router.navigate(`/manga/${item.id}`)}
      activeOpacity={0.7}
    >
      <Image source={{ uri: item.imageUrl }} style={styles.trendingImage} />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.9)']}
        style={styles.trendingGradient}
      >
        <View style={styles.trendingContent}>
          <Text style={styles.trendingTitle} numberOfLines={2}>
            {item.title}
          </Text>
          {item.rank && (
            <View style={[styles.rankBadge, { backgroundColor: themeColors.primary }]}>
              <Text style={styles.rankText}>#{item.rank}</Text>
            </View>
          )}
        </View>
      </LinearGradient>
    </TouchableOpacity>
  );

  const renderNewReleaseGrid = () => {
    return (
      <View style={styles.newReleaseGrid}>
        {newReleases.map((item, index) => (
          <View key={item.id} style={styles.newReleaseWrapper}>
            <TouchableOpacity
              onPress={() => router.navigate(`/manga/${item.id}`)}
              activeOpacity={0.7}
              style={styles.newReleaseCard}
            >
              <MangaCard
                title={item.title}
                imageUrl={item.imageUrl}
                onPress={() => router.navigate(`/manga/${item.id}`)}
                lastReadChapter={null}
                style={styles.card}
              />
              <View style={styles.titleContainer}>
                <Text style={[styles.mangaTitle, { color: themeColors.text }]} numberOfLines={2}>
                  {item.title}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    );
  };

  const renderFeaturedManga = () => {
    if (!featuredManga) return null;

    return (
      <TouchableOpacity
        style={[styles.featuredContainer, { marginTop: insets.top + 16 }]} 
        onPress={() => router.navigate(`/manga/${featuredManga.id}`)}
        activeOpacity={0.8}
      >
        <Image source={{ uri: featuredManga.imageUrl }} style={styles.featuredImage} />
        <LinearGradient
          colors={['transparent', 'rgba(0,0,0,0.8)']}
          style={styles.featuredGradient}
        >
          <View style={styles.featuredContent}>
            <View style={styles.featuredBadge}>
              <MaterialCommunityIcons name="fire" size={16} color="#FFF" />
              <Text style={styles.featuredBadgeText}>Featured</Text>
            </View>
            <Text style={styles.featuredTitle} numberOfLines={2}>
              {featuredManga.title}
            </Text>
            <TouchableOpacity
              style={[styles.readNowButton, { backgroundColor: themeColors.primary }]}
              onPress={() => router.navigate(`/manga/${featuredManga.id}`)}
            >
              <Text style={styles.readNowText}>Read Now</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <StatusBar barStyle={actualTheme === 'dark' ? 'light-content' : 'dark-content'} />
        <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={themeColors.primary} style={styles.loadingIndicator} />
          <Text style={[styles.loadingText, { color: themeColors.text }]}>
            Loading your manga...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      <StatusBar barStyle={actualTheme === 'dark' ? 'light-content' : 'dark-content'} />

      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content]} // Removed explicit paddingTop here as it's handled by the first element (Featured)
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[themeColors.primary]}
            tintColor={themeColors.primary}
          />
        }
      >
        {error ? (
          <View style={[styles.errorContainer, { paddingTop: insets.top + 20 }]}> {/* Adjust error container padding */}
            <Ionicons name="alert-circle-outline" size={48} color={themeColors.notification} />
            <Text style={[styles.errorText, { color: themeColors.notification }]}>{error}</Text>
            <TouchableOpacity
              style={[styles.retryButton, { backgroundColor: themeColors.primary }]}
              onPress={fetchMangaData}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            {renderFeaturedManga()}

            <View style={styles.section}>
              {renderSectionTitle('Trending Now', 'trophy')}
              <FlatList
                data={mostViewedManga.slice(1)}
                renderItem={renderTrendingItem}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.trendingList}
                decelerationRate="fast"
                snapToInterval={TRENDING_CARD_WIDTH + 12}
                snapToAlignment="start"
              />
            </View>

            <View style={styles.section}>
              {renderSectionTitle('New Releases', 'sparkles')}
              {renderNewReleaseGrid()}
            </View>

            <View style={styles.section}>
              {renderSectionTitle('Continue Reading', 'book')}
              <View style={[styles.emptyStateContainer, { backgroundColor: themeColors.card + '50' }]}>
                <Ionicons name="book-outline" size={40} color={themeColors.text + '70'} />
                <Text style={[styles.emptyStateText, { color: themeColors.text + '90' }]}>
                  Manga you're reading will appear here (W.I.P)
                </Text>
                <TouchableOpacity
                  style={[styles.browseButton, { backgroundColor: themeColors.primary + '20' }]}
                  onPress={() => router.navigate('/mangasearch')}
                >
                  <Text style={[styles.browseButtonText, { color: themeColors.primary }]}>
                    Browse Manga
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    paddingBottom: 100,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    marginBottom: 16,
  },
  iconBackground: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  featuredContainer: {
    height: FEATURED_HEIGHT,
    marginHorizontal: 16,
    marginBottom: 24,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 8,
  },
  featuredImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  featuredGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '70%',
    justifyContent: 'flex-end',
    padding: 16,
  },
  featuredContent: {
    alignItems: 'flex-start',
  },
  featuredBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 59, 48, 0.8)',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    marginBottom: 8,
  },
  featuredBadgeText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
    marginLeft: 4,
  },
  featuredTitle: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 12,
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  readNowButton: {
    paddingHorizontal: 20,
    paddingVertical: 8,
    borderRadius: 20,
  },
  readNowText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: 'bold',
  },
  trendingList: {
    paddingRight: 16,
    paddingBottom: 8,
  },
  trendingItem: {
    width: TRENDING_CARD_WIDTH,
    height: TRENDING_CARD_HEIGHT,
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 6,
  },
  trendingImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  trendingGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    justifyContent: 'flex-end',
    padding: 12,
  },
  trendingContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  trendingTitle: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 8,
    textShadowColor: 'rgba(0, 0, 0, 0.7)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 3,
  },
  rankBadge: {
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  rankText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: 'bold',
  },
  newReleaseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
  },
  newReleaseWrapper: {
    width: '50%',
    padding: 8,
  },
  newReleaseCard: {
    borderRadius: 12,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  card: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 12,
  },
  titleContainer: {
    marginTop: 8,
    paddingHorizontal: 4,
    paddingBottom: 4,
  },
  mangaTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  emptyStateContainer: {
    marginHorizontal: 16,
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyStateText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 16,
  },
  browseButton: {
    paddingHorizontal: 20,
    paddingVertical: 10,
    borderRadius: 20,
  },
  browseButtonText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingIndicator: {
    marginTop: 20,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 12,
    marginBottom: 20,
  },
  retryButton: {
    paddingHorizontal: 30,
    paddingVertical: 10,
    borderRadius: 8,
    elevation: 2,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: 'bold',
  },
});
