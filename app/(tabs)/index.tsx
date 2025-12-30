import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import Reanimated from 'react-native-reanimated';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import { MANGA_API_URL } from '@/constants/Config';
import MangaCard from '@/components/MangaCard';
import {
  RecentlyReadSkeleton,
  TrendingSkeleton,
  NewReleasesSkeleton,
  FeaturedMangaSkeleton,
} from '@/components/SkeletonLoading';
import { PageTransition } from '@/components/PageTransition';
import {
  parseMostViewedManga,
  parseNewReleases,
} from '@/services/mangaFireService';
import { logger } from '@/utils/logger';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCloudflareDetection } from '@/hooks/useCloudflareDetection';
import axios from 'axios';
import { MangaItem, RecentMangaItem } from '@/types';
import { getRecentlyReadManga } from '@/services/readChapterService';
import { useOffline } from '@/contexts/OfflineContext';
import { offlineCacheService } from '@/services/offlineCacheService';
import { useParallaxScroll, ParallaxImage } from '@/components/ParallaxLayout';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const TRENDING_CARD_WIDTH = 200;
const TRENDING_CARD_HEIGHT = 260;
const FEATURED_HEIGHT = 280;
const RECENTLY_READ_CARD_WIDTH = Math.min(160, (SCREEN_WIDTH - 64) / 2);

const DEFAULT_MANGA_COVER =
  'https://static.mangafire.to/default/img/no-image.jpg';

export default function HomeScreen() {
  const router = useRouter();
  const { actualTheme, accentColor } = useTheme();
  const colors = Colors[actualTheme];
  const themeColors = useMemo(
    () => ({ ...colors, primary: accentColor || colors.primary }),
    [colors, accentColor]
  );
  const { checkForCloudflare, resetCloudflareDetection } =
    useCloudflareDetection();
  const insets = useSafeAreaInsets();
  const { isOffline } = useOffline();

  const [mostViewedManga, setMostViewedManga] = useState<MangaItem[]>([]);
  const [newReleases, setNewReleases] = useState<MangaItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);
  const [featuredManga, setFeaturedManga] = useState<MangaItem | null>(null);

  const [recentlyReadManga, setRecentlyReadManga] = useState<RecentMangaItem[]>(
    []
  );
  const [isRecentMangaLoading, setIsRecentMangaLoading] =
    useState<boolean>(true);

  const { scrollY, scrollHandler } = useParallaxScroll();

  const fetchMangaData = useCallback(async () => {
    try {
      setError(null);

      // 1. Load cached data immediately (Stale-while-revalidate)
      const cachedData = await offlineCacheService.getCachedHomeData();
      if (cachedData) {
        setMostViewedManga(cachedData.mostViewed);
        setNewReleases(cachedData.newReleases);
        setFeaturedManga(cachedData.featuredManga);
        setIsLoading(false); // Show content immediately
        logger().info('Service', 'Loaded cached home data');
      } else {
        if (!isRefreshing) setIsLoading(true);
      }

      // If offline, stop here
      if (isOffline) {
        if (!cachedData) {
          setError(
            'You are offline. Please connect to internet or view your saved manga.'
          );
        }
        return;
      }

      // 2. Fetch fresh data in background
      const response = await axios.get(`${MANGA_API_URL}/home`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
          Accept:
            'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: MANGA_API_URL,
        },
        timeout: 20000,
      });

      const html = response.data as string;

      if (checkForCloudflare(html, '/(tabs)')) {
        return;
      }

      const parsedMostViewed = parseMostViewedManga(html);
      const parsedNewReleases = parseNewReleases(html);
      const newFeatured =
        parsedMostViewed.length > 0 ? parsedMostViewed[0] || null : null;

      // Update state with fresh data
      setMostViewedManga(parsedMostViewed);
      setNewReleases(parsedNewReleases);
      setFeaturedManga(newFeatured);

      // Cache the fresh data
      await offlineCacheService.cacheHomeData(
        parsedMostViewed,
        parsedNewReleases,
        newFeatured
      );
    } catch (error) {
      logger().error('Service', 'Error fetching manga data', { error });

      // Only show error if we don't have any cached data to display
      const hasNoData = mostViewedManga.length === 0 && newReleases.length === 0;
      if (hasNoData) {
        setError(
          'An error occurred while fetching manga data. Please try again.'
        );
      }
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isRefreshing, checkForCloudflare, isOffline]);

  const fetchRecentlyReadManga = useCallback(async (showLoading = true) => {
    try {
      if (showLoading) {
        setIsRecentMangaLoading(true);
      }
      const recentManga = await getRecentlyReadManga(6);

      const processedManga = recentManga.map((manga) => ({
        ...manga,
        bannerImage: manga.bannerImage || DEFAULT_MANGA_COVER,
      }));

      setRecentlyReadManga(processedManga);
    } catch (error) {
      logger().error('Service', 'Error fetching recently read manga', {
        error,
      });
    } finally {
      if (showLoading) {
        setIsRecentMangaLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    fetchMangaData();
    fetchRecentlyReadManga(true);
    return () => {
      resetCloudflareDetection();
    };
  }, [fetchMangaData, fetchRecentlyReadManga, resetCloudflareDetection]);

  useFocusEffect(
    useCallback(() => {
      fetchRecentlyReadManga(false);
    }, [fetchRecentlyReadManga])
  );

  const renderSectionTitle = useCallback(
    (title: string, iconName: keyof typeof Ionicons.glyphMap) => (
      <View style={styles.sectionTitleContainer}>
        <View
          style={[
            styles.iconBackground,
            { backgroundColor: themeColors.primary + '20' },
          ]}
        >
          <Ionicons
            name={iconName}
            size={20}
            color={themeColors.primary}
            accessibilityElementsHidden={true}
          />
        </View>
        <Text
          style={[styles.sectionTitle, { color: themeColors.text }]}
          accessibilityRole="header"
        >
          {title}
        </Text>
      </View>
    ),
    [themeColors]
  );

  const renderTrendingItem = useCallback(
    ({ item }: { item: MangaItem; index: number }) => (
      <View style={{ marginRight: 15 }}>
        <TouchableOpacity
          style={styles.trendingItem}
          onPress={() => router.navigate(`/manga/${item.id}`)}
          activeOpacity={0.7}
          accessibilityRole="button"
          accessibilityLabel={`View ${item.title}`}
          accessibilityHint={
            item.rank
              ? `Ranked #${item.rank} in trending`
              : 'Currently trending manga'
          }
        >
          <Image
            source={{ uri: item.imageUrl }}
            style={styles.trendingImage}
            accessibilityLabel={`Cover image for ${item.title}`}
            contentFit="cover"
            transition={300}
            cachePolicy="memory-disk"
          />
          <LinearGradient
            colors={['transparent', 'rgba(0,0,0,0.9)']}
            style={styles.trendingGradient}
          >
            <View style={styles.trendingContent}>
              <Text style={styles.trendingTitle} numberOfLines={2}>
                {item.title}
              </Text>
              {item.rank && (
                <View
                  style={[
                    styles.rankBadge,
                    { backgroundColor: themeColors.primary },
                  ]}
                >
                  <Text style={styles.rankText}>#{item.rank}</Text>
                </View>
              )}
            </View>
          </LinearGradient>
        </TouchableOpacity>
      </View>
    ),
    [router, themeColors.primary]
  );

  const renderRecentlyReadItem = useCallback(
    ({ item }: { item: RecentMangaItem; index: number }) => {
      const lastReadChapter = item.lastReadChapter
        ? `Chapter ${item.lastReadChapter}`
        : 'Not started';

      return (
        <View style={styles.recentlyReadItem}>
          <MangaCard
            title={item.title}
            imageUrl={item.bannerImage}
            onPress={() => router.navigate(`/manga/${item.id}`)}
            lastReadChapter={lastReadChapter}
            style={styles.recentlyReadCard}
            context="manga"
            mangaId={item.id}
          />
          <Text
            style={[styles.recentlyReadTitle, { color: themeColors.text }]}
            numberOfLines={2}
          >
            {item.title}
          </Text>
        </View>
      );
    },
    [router, themeColors.text]
  );

  const renderNewReleaseGrid = useCallback(() => {
    return (
      <View style={styles.newReleaseGrid}>
        {newReleases.map((item) => (
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
                context="manga"
                mangaId={item.id}
              />
              <View style={styles.titleContainer}>
                <Text
                  style={[styles.mangaTitle, { color: themeColors.text }]}
                  numberOfLines={2}
                >
                  {item.title}
                </Text>
              </View>
            </TouchableOpacity>
          </View>
        ))}
      </View>
    );
  }, [newReleases, router, themeColors.text]);

  const renderContinueReadingSection = useCallback(() => {
    if (isRecentMangaLoading) {
      return <RecentlyReadSkeleton />;
    }

    if (recentlyReadManga.length === 0) {
      return (
        <View
          style={[
            styles.emptyStateContainer,
            { backgroundColor: themeColors.card + '50' },
          ]}
        >
          <Ionicons
            name="book-outline"
            size={40}
            color={themeColors.text + '70'}
          />
          <Text
            style={[styles.emptyStateText, { color: themeColors.text + '90' }]}
          >
            Manga you&apos;re reading will appear here
          </Text>
          <TouchableOpacity
            style={[
              styles.browseButton,
              { backgroundColor: themeColors.primary + '20' },
            ]}
            onPress={() => router.navigate('/mangasearch')}
          >
            <Text
              style={[styles.browseButtonText, { color: themeColors.primary }]}
            >
              Browse Manga
            </Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={{ height: 260 }}>
        <FlashList<RecentMangaItem>
          data={recentlyReadManga}
          renderItem={renderRecentlyReadItem}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.recentlyReadList}
          // @ts-ignore
          estimatedItemSize={RECENTLY_READ_CARD_WIDTH + 15}
        />
      </View>
    );
  }, [
    isRecentMangaLoading,
    recentlyReadManga,
    themeColors,
    router,
    renderRecentlyReadItem,
  ]);

  const renderFeaturedManga = useCallback(() => {
    if (!featuredManga) return null;

    return (
      <TouchableOpacity
        style={[styles.featuredContainer, { marginTop: insets.top + 16 }]}
        onPress={() => router.navigate(`/manga/${featuredManga.id}`)}
        activeOpacity={0.9}
      >
        <ParallaxImage
          scrollY={scrollY}
          source={featuredManga.imageUrl}
          height={FEATURED_HEIGHT}
          style={styles.featuredImage}
        />
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
              style={[
                styles.readNowButton,
                { backgroundColor: themeColors.primary },
              ]}
              onPress={() => router.navigate(`/manga/${featuredManga.id}`)}
            >
              <Text style={styles.readNowText}>Read Now</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  }, [featuredManga, insets.top, router, themeColors.primary, scrollY]);

  if (isLoading) {
    return (
      <View
        style={[styles.container, { backgroundColor: themeColors.background }]}
      >
        <ScrollView
          showsVerticalScrollIndicator={false}
          contentContainerStyle={[styles.content]}
        >
          <FeaturedMangaSkeleton />

          <View style={styles.section}>
            {renderSectionTitle('Continue Reading', 'book')}
            <RecentlyReadSkeleton />
          </View>

          <View style={styles.section}>
            {renderSectionTitle('Trending Now', 'trophy')}
            <TrendingSkeleton />
          </View>

          <View style={styles.section}>
            {renderSectionTitle('New Releases', 'sparkles')}
            <NewReleasesSkeleton />
          </View>
        </ScrollView>
      </View>
    );
  }

  // Show offline warning when offline - redirect to saved content
  if (isOffline) {
    return (
      <View
        style={[styles.container, { backgroundColor: themeColors.background }]}
      >
        <View
          style={[
            styles.offlineHeader,
            {
              paddingTop: insets.top + 16,
              backgroundColor: themeColors.card,
              borderBottomColor: themeColors.border,
            },
          ]}
        >
          <View style={styles.offlineHeaderContent}>
            <Ionicons
              name="cloud-offline"
              size={48}
              color={themeColors.primary}
            />
            <Text style={[styles.offlineTitle, { color: themeColors.text }]}>
              You&apos;re Offline
            </Text>
            <Text
              style={[
                styles.offlineSubtitle,
                { color: themeColors.text + '80' },
              ]}
            >
              Connect to internet or view your saved manga
            </Text>
            <TouchableOpacity
              style={[
                styles.offlineButton,
                { backgroundColor: themeColors.primary },
              ]}
              onPress={() => router.navigate('/bookmarks')}
            >
              <Ionicons name="bookmark" size={20} color="#FFFFFF" />
              <Text style={styles.offlineButtonText}>View Saved Manga</Text>
            </TouchableOpacity>
          </View>
        </View>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, { backgroundColor: themeColors.background }]}
    >
      <Reanimated.ScrollView
        onScroll={scrollHandler}
        scrollEventThrottle={16}
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content]}
        bounces={false}
        overScrollMode="never"
      >
        {error ? (
          <View
            style={[styles.errorContainer, { paddingTop: insets.top + 20 }]}
          >
            <Ionicons
              name="alert-circle-outline"
              size={48}
              color={themeColors.notification}
            />
            <Text
              style={[styles.errorText, { color: themeColors.notification }]}
            >
              {error}
            </Text>
            <TouchableOpacity
              style={[
                styles.retryButton,
                { backgroundColor: themeColors.primary },
              ]}
              onPress={fetchMangaData}
            >
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <>
            <PageTransition transitionType="fade" duration={400}>
              {renderFeaturedManga()}
            </PageTransition>

            <PageTransition transitionType="slide" duration={400} delay={100}>
              <View style={styles.section}>
                {renderSectionTitle('Continue Reading', 'book')}
                {renderContinueReadingSection()}
              </View>
            </PageTransition>

            <PageTransition transitionType="slide" duration={400} delay={200}>
              <View style={styles.section}>
                {renderSectionTitle('Trending Now', 'trophy')}
                <View style={{ height: TRENDING_CARD_HEIGHT + 20 }}>
                  <FlashList<MangaItem>
                    data={mostViewedManga.slice(1)}
                    renderItem={renderTrendingItem}
                    keyExtractor={(item) => item.id}
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.trendingList}
                    // @ts-ignore
                    estimatedItemSize={TRENDING_CARD_WIDTH + 15}
                  />
                </View>
              </View>
            </PageTransition>

            <PageTransition transitionType="slide" duration={400} delay={250}>
              <View style={styles.section}>
                {renderSectionTitle('Browse Genres', 'albums')}
                <TouchableOpacity
                  style={[
                    styles.genresCard,
                    {
                      backgroundColor: themeColors.card,
                      borderColor: themeColors.border,
                    },
                  ]}
                  onPress={() => router.navigate('/genres')}
                  activeOpacity={0.7}
                >
                  <View style={styles.genresCardContent}>
                    <View
                      style={[
                        styles.genresIconContainer,
                        { backgroundColor: themeColors.primary + '20' },
                      ]}
                    >
                      <Ionicons
                        name="albums"
                        size={32}
                        color={themeColors.primary}
                      />
                    </View>
                    <View style={styles.genresTextContainer}>
                      <Text
                        style={[
                          styles.genresTitle,
                          { color: themeColors.text },
                        ]}
                      >
                        Explore by Genre
                      </Text>
                      <Text
                        style={[
                          styles.genresSubtitle,
                          { color: themeColors.text + '80' },
                        ]}
                      >
                        Discover manga by your favorite categories
                      </Text>
                    </View>
                    <Ionicons
                      name="chevron-forward"
                      size={24}
                      color={themeColors.text + '60'}
                    />
                  </View>
                </TouchableOpacity>
              </View>
            </PageTransition>

            <PageTransition transitionType="slide" duration={400} delay={300}>
              <View style={styles.section}>
                {renderSectionTitle('New Releases', 'sparkles')}
                {renderNewReleaseGrid()}
              </View>
            </PageTransition>
          </>
        )}
      </Reanimated.ScrollView>
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
    paddingHorizontal: 16,
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
    paddingHorizontal: 7.5,
  },
  newReleaseWrapper: {
    width: '50%',
    padding: 7.5,
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
    paddingVertical: 12,
    borderRadius: 12,
  },
  browseButtonText: {
    fontSize: 16,
    fontWeight: '600',
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
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    elevation: 2,
  },
  retryButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
  recentlyReadList: {
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  recentlyReadItem: {
    width: RECENTLY_READ_CARD_WIDTH,
    marginRight: 15,
  },
  recentlyReadCard: {
    width: '100%',
    aspectRatio: 3 / 4,
    borderRadius: 12,
    overflow: 'hidden',
  },
  recentlyReadTitle: {
    fontSize: 12,
    fontWeight: 'bold',
    marginTop: 6,
    textAlign: 'center',
  },
  genresCard: {
    marginHorizontal: 16,
    borderRadius: 16,
    borderWidth: 1,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  genresCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 20,
  },
  genresIconContainer: {
    width: 64,
    height: 64,
    borderRadius: 32,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 16,
  },
  genresTextContainer: {
    flex: 1,
  },
  genresTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  genresSubtitle: {
    fontSize: 14,
    lineHeight: 20,
  },
  offlineHeader: {
    paddingHorizontal: 20,
    paddingBottom: 20,
    borderBottomWidth: 1,
  },
  offlineHeaderContent: {
    alignItems: 'center',
  },
  offlineTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    marginTop: 12,
  },
  offlineSubtitle: {
    fontSize: 16,
    marginTop: 4,
    textAlign: 'center',
    marginBottom: 24,
  },
  offlineButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
    borderRadius: 12,
    gap: 8,
  },
  offlineButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
