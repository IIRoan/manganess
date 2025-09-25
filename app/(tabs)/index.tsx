import React, { useCallback, useEffect, useMemo } from 'react';
import { StyleSheet, View, Text, TouchableOpacity, FlatList, ScrollView, Dimensions } from 'react-native';
import { Image as ExpoImage } from 'expo-image';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons, MaterialCommunityIcons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { LinearGradient } from 'expo-linear-gradient';
import MangaCard from '@/components/MangaCard';
import {
  RecentlyReadSkeleton,
  TrendingSkeleton,
  NewReleasesSkeleton,
  FeaturedMangaSkeleton,
} from '@/components/SkeletonLoading';
import { SmoothRefreshControl } from '@/components/SmoothRefreshControl';
import { PageTransition } from '@/components/PageTransition';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCloudflareDetection } from '@/hooks/useCloudflareDetection';
import { useHomeContent, useRecentlyReadQuery } from '@/hooks/queries/useHomeQueries';
import { MangaItem, RecentMangaItem } from '@/types';
import { useQueryClient } from '@tanstack/react-query';
import { queryKeys } from '@/hooks/queries/queryKeys';
import { mangaDetailsQueryOptions } from '@/services/mangaFireService';

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
  const themeColors = { ...colors, primary: accentColor || colors.primary };
  const { checkForCloudflare, resetCloudflareDetection } =
    useCloudflareDetection();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();

  const {
    data: homeData,
    isLoading: isHomeLoading,
    isRefetching: isHomeRefetching,
    error: homeError,
    refetch: refetchHome,
  } = useHomeContent(checkForCloudflare);

  const {
    data: recentMangaData,
    isLoading: isRecentLoading,
    isRefetching: isRecentRefetching,
    refetch: refetchRecent,
  } = useRecentlyReadQuery(6);

  const mostViewedManga: MangaItem[] = (homeData as any)?.mostViewed ?? [];
  const newReleases: MangaItem[] = (homeData as any)?.newReleases ?? [];
  const featuredManga: MangaItem | null = (homeData as any)?.featured ?? null;

  const recentlyReadManga = useMemo<RecentMangaItem[]>(() => {
    return ((recentMangaData as any) ?? []).map((manga: RecentMangaItem) => ({
      ...manga,
      bannerImage: manga.bannerImage || DEFAULT_MANGA_COVER,
    }));
  }, [recentMangaData]);

  const isRefreshing = isHomeRefetching || isRecentRefetching;
  const homeErrorMessage =
    homeError instanceof Error ? homeError.message : null;
  const showHomeError =
    !!homeErrorMessage && homeErrorMessage !== 'cloudflare-detected';
  const homeErrorDisplay = showHomeError
    ? 'An error occurred while fetching manga data. Please try again.'
    : null;

  useEffect(() => {
    return () => {
      resetCloudflareDetection();
    };
  }, [resetCloudflareDetection]);

  useFocusEffect(
    useCallback(() => {
      refetchRecent();
    }, [refetchRecent])
  );

  const handleRefresh = useCallback(() => {
    refetchHome();
    refetchRecent();
  }, [refetchHome, refetchRecent]);

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
    ({ item, index }: { item: MangaItem; index: number }) => (
      <TouchableOpacity
        style={[styles.trendingItem, { marginLeft: index === 0 ? 16 : 12 }]}
        onPress={() => router.navigate({ pathname: '/manga/[id]', params: { id: item.id, title: item.title, bannerImage: item.imageUrl } })}
        onPressIn={() =>
          queryClient.prefetchQuery(mangaDetailsQueryOptions(item.id))
        }
        activeOpacity={0.7}
        accessibilityRole="button"
        accessibilityLabel={`View ${item.title}`}
        accessibilityHint={
          item.rank
            ? `Ranked #${item.rank} in trending`
            : 'Currently trending manga'
        }
      >
        <View style={styles.trendingImagePlaceholder} />
        <ExpoImage
          source={{ uri: item.imageUrl }}
          style={styles.trendingImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={200}
          accessibilityLabel={`Cover image for ${item.title}`}
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
    ),
    [router, themeColors.primary]
  );

  const renderRecentlyReadItem = useCallback(
    ({ item, index }: { item: RecentMangaItem; index: number }) => {
      const lastReadChapter = item.lastReadChapter
        ? `Chapter ${item.lastReadChapter}`
        : 'Not started';

      return (
        <View
          style={[
            styles.recentlyReadItem,
            { marginLeft: index === 0 ? 16 : 12 },
          ]}
        >
          <MangaCard
            title={item.title}
            imageUrl={item.bannerImage}
            onPress={() => router.navigate({ pathname: '/manga/[id]', params: { id: item.id, title: item.title, bannerImage: item.bannerImage } })}
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
              onPress={() => router.navigate({ pathname: '/manga/[id]', params: { id: item.id, title: item.title, bannerImage: item.imageUrl } })}
              activeOpacity={0.7}
              style={styles.newReleaseCard}
            >
              <MangaCard
                title={item.title}
                imageUrl={item.imageUrl}
                onPress={() => router.navigate({ pathname: '/manga/[id]', params: { id: item.id, title: item.title, bannerImage: item.imageUrl } })}
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
    if (isRecentLoading) {
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
      <FlatList
        data={recentlyReadManga}
        renderItem={renderRecentlyReadItem}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.recentlyReadList}
        decelerationRate="fast"
        getItemLayout={(_data, index) => ({
          length: RECENTLY_READ_CARD_WIDTH + 12,
          offset: (RECENTLY_READ_CARD_WIDTH + 12) * index,
          index,
        })}
        removeClippedSubviews={true}
        maxToRenderPerBatch={3}
        updateCellsBatchingPeriod={100}
        windowSize={8}
      />
    );
  }, [
    isRecentLoading,
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
        onPress={() => router.navigate({ pathname: '/manga/[id]', params: { id: featuredManga.id, title: featuredManga.title, bannerImage: featuredManga.imageUrl } })}
        onPressIn={() =>
          queryClient.prefetchQuery(
            mangaDetailsQueryOptions(featuredManga.id)
          )
        }
        activeOpacity={0.8}
      >
        <View style={styles.featuredImagePlaceholder} />
        <ExpoImage
          source={{ uri: featuredManga.imageUrl }}
          style={styles.featuredImage}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={250}
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
              onPress={() => router.navigate({ pathname: '/manga/[id]', params: { id: featuredManga.id, title: featuredManga.title, bannerImage: featuredManga.imageUrl } })}
            >
              <Text style={styles.readNowText}>Read Now</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </TouchableOpacity>
    );
  }, [featuredManga, insets.top, router, themeColors.primary]);

  if (isHomeLoading) {
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

  return (
    <View
      style={[styles.container, { backgroundColor: themeColors.background }]}
    >
      <ScrollView
        showsVerticalScrollIndicator={false}
        contentContainerStyle={[styles.content]}
        refreshControl={
          <SmoothRefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
          />
        }
      >
        {showHomeError ? (
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
              {homeErrorDisplay}
            </Text>
            <TouchableOpacity
              style={[
                styles.retryButton,
                { backgroundColor: themeColors.primary },
              ]}
              onPress={() => {
                refetchHome();
              }}
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
                  getItemLayout={(_data, index) => ({
                    length: TRENDING_CARD_WIDTH + 12,
                    offset: (TRENDING_CARD_WIDTH + 12) * index,
                    index,
                  })}
                  removeClippedSubviews={true}
                  maxToRenderPerBatch={5}
                  updateCellsBatchingPeriod={100}
                  windowSize={10}
                />
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
  featuredImagePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000014',
  },
  featuredImage: {
    ...StyleSheet.absoluteFillObject,
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
  trendingImagePlaceholder: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#00000014',
  },
  trendingImage: {
    ...StyleSheet.absoluteFillObject,
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
  recentlyReadList: {
    paddingRight: 16,
    paddingBottom: 8,
  },
  recentlyReadItem: {
    width: RECENTLY_READ_CARD_WIDTH,
    marginRight: 12,
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
});
