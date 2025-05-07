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
  Animated,
  Dimensions,
  Platform,
  RefreshControl,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { NessieAnimation } from '@/components/NessieAnimation';
import { MANGA_API_URL } from '@/constants/Config';
import MangaCard from '@/components/MangaCard';
import { parseMostViewedManga, parseNewReleases } from '@/services/mangaFireService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCloudflareDetection } from '@/hooks/useCloudflareDetection';
import axios from 'axios';

// Constants
const { width: SCREEN_WIDTH } = Dimensions.get('window');
const TRENDING_CARD_WIDTH = 180;
const TRENDING_CARD_HEIGHT = 260;

// Types
interface MangaItem {
  id: string;
  title: string;
  imageUrl: string;
  rank?: number;
}

export default function HomeScreen() {
  // Hooks
  const router = useRouter();
  const { actualTheme, accentColor } = useTheme();
  const colors = Colors[actualTheme];
  const themeColors = { ...colors, primary: accentColor || colors.primary };
  const { checkForCloudflare, resetCloudflareDetection } = useCloudflareDetection();
  const insets = useSafeAreaInsets();
  const scrollY = useRef(new Animated.Value(0)).current;

  // State
  const [mostViewedManga, setMostViewedManga] = useState<MangaItem[]>([]);
  const [newReleases, setNewReleases] = useState<MangaItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  // Animations
  const headerOpacity = scrollY.interpolate({
    inputRange: [0, 50, 100],
    outputRange: [0, 0.5, 1],
    extrapolate: 'clamp',
  });

  const headerHeight = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, 50],
    extrapolate: 'clamp',
  });

  const titleScale = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [1, 0.8],
    extrapolate: 'clamp',
  });

  const titleTranslateY = scrollY.interpolate({
    inputRange: [0, 100],
    outputRange: [0, -10],
    extrapolate: 'clamp',
  });

  // Effects
  useEffect(() => {
    fetchMangaData();
    return () => {
      resetCloudflareDetection();
    };
  }, []);

  // Data Fetching
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

  // Render helpers
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
        colors={['transparent', `rgba(0,0,0,0.9)`]}
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

  // Main render
  if (isLoading) {
    return (
      <View style={[styles.container, { backgroundColor: themeColors.background }]}>
        <View style={[styles.loadingContainer, { paddingTop: insets.top }]}>
          <ActivityIndicator size="large" color={themeColors.primary} />
          <Text style={[styles.loadingText, { color: themeColors.text }]}>
            Loading...
          </Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { backgroundColor: themeColors.background }]}>
      {/* Animated Header */}
      <Animated.View
        style={[
          styles.animatedHeader,
          {
            height: headerHeight.interpolate({
              inputRange: [0, 50],
              outputRange: [insets.top, insets.top + 50],
            }),
            backgroundColor: themeColors.card,
            opacity: headerOpacity,
            paddingTop: insets.top,
          }
        ]}
      >
        <View style={styles.headerContent}>
          <Animated.Text
            style={[
              styles.headerTitle,
              {
                color: themeColors.text,
                transform: [
                  { scale: titleScale },
                  { translateY: titleTranslateY }
                ]
              }
            ]}
          >
            MangaNess
          </Animated.Text>
          <TouchableOpacity
            style={[styles.searchButton, { backgroundColor: themeColors.background + '50' }]}
            onPress={() => router.navigate('/mangasearch')}
          >
            <Ionicons name="search" size={22} color={themeColors.text} />
          </TouchableOpacity>
        </View>
      </Animated.View>

      {/* Main Content */}
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content, { paddingTop: insets.top + 16 }]}
        onScroll={Animated.event(
          [{ nativeEvent: { contentOffset: { y: scrollY } } }],
          { useNativeDriver: false }
        )}
        scrollEventThrottle={16}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[themeColors.primary]}
            tintColor={themeColors.primary}
          />
        }
      >
        {/* Hero Section */}
        <View style={styles.heroSection}>
          <View style={styles.headerRow}>
            <View style={styles.headerTitleContainer}>
              <Text style={[styles.headerTitle, { color: themeColors.text }]}>MangaNess</Text>
              <View style={styles.nessieContainer}>
                <NessieAnimation imageSize={30} />
              </View>
            </View>

            {/* Simple search icon */}
            <TouchableOpacity
              style={[styles.searchIconButton, { backgroundColor: themeColors.card }]}
              onPress={() => router.navigate('/mangasearch')}
            >
              <Ionicons name="search" size={22} color={themeColors.text} />
            </TouchableOpacity>
          </View>
        </View>

        {error ? (
          <View style={styles.errorContainer}>
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
            {/* Trending Section */}
            <View style={styles.section}>
              {renderSectionTitle('Trending Now', 'trophy')}
              <FlatList
                data={mostViewedManga}
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

            {/* New Releases Section */}
            <View style={styles.section}>
              {renderSectionTitle('New Releases', 'sparkles')}
              {renderNewReleaseGrid()}
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
  animatedHeader: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    justifyContent: 'flex-end',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 4,
  },
  headerContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    height: 50,
  },
  content: {
    paddingBottom: 100,
  },
  heroSection: {
    marginBottom: 24,
    paddingHorizontal: 16,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  headerTitle: {
    fontSize: 28,
    fontWeight: 'bold',
    marginRight: 10,
  },
  nessieContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  // Simple search icon button
  searchIconButton: {
    width: 38,
    height: 38,
    borderRadius: 19,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.1,
    shadowRadius: 2,
    elevation: 2,
  },
  searchButton: {
    padding: 8,
    borderRadius: 20,
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
  // Trending section
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
    shadowOpacity: 0.1,
    shadowRadius: 5,
    elevation: 5,
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
    fontSize: 14,
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
  // New releases grid
  newReleaseGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
  },
  newReleaseWrapper: {
    width: '50%',
    padding: 8,
  },
  card: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 12,
  },
  titleContainer: {
    marginTop: 8,
  },
  mangaTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  // Loading and error states
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
    marginTop: 40,
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