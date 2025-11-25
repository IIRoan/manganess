import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Image,
  ActivityIndicator,
} from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import {
  offlineCacheService,
  CachedMangaDetails,
} from '@/services/offlineCacheService';
import { chapterStorageService } from '@/services/chapterStorageService';
import { useMangaImageCache } from '@/services/CacheImages';
import { logger } from '@/utils/logger';

interface OfflineBookmarksListProps {
  onMangaPress?: (mangaId: string) => void;
}

// Component for cached manga image
const CachedMangaImage: React.FC<{
  mangaId: string;
  bannerUrl: string;
  style: any;
}> = ({ mangaId, bannerUrl, style }) => {
  const cachedImagePath = useMangaImageCache(mangaId, bannerUrl, {
    enabled: false,
  });

  if (!cachedImagePath) {
    return <View style={style} />;
  }

  return <Image source={{ uri: cachedImagePath }} style={style} />;
};

export const OfflineBookmarksList: React.FC<OfflineBookmarksListProps> = ({
  onMangaPress,
}) => {
  const router = useRouter();
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const styles = getStyles(colors);

  const [bookmarkedManga, setBookmarkedManga] = useState<CachedMangaDetails[]>(
    []
  );
  const [downloadedChapters, setDownloadedChapters] = useState<
    Record<string, number>
  >({});
  const [isLoading, setIsLoading] = useState(true);

  const loadBookmarkedManga = useCallback(async () => {
    try {
      setIsLoading(true);
      const cached = await offlineCacheService.getBookmarkedMangaDetails();
      setBookmarkedManga(cached);

      // Get downloaded chapter counts for each manga
      const chapterCounts: Record<string, number> = {};
      await Promise.all(
        cached.map(async (manga) => {
          try {
            const chapters = await chapterStorageService.getDownloadedChapters(
              manga.id
            );
            chapterCounts[manga.id] = chapters.length;
          } catch {
            chapterCounts[manga.id] = 0;
          }
        })
      );
      setDownloadedChapters(chapterCounts);
    } catch (error) {
      logger().error('Storage', 'Failed to load bookmarked manga', { error });
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBookmarkedManga();
  }, [loadBookmarkedManga]);

  const handleMangaPress = useCallback(
    (manga: CachedMangaDetails) => {
      if (onMangaPress) {
        onMangaPress(manga.id);
      } else {
        router.navigate(`/manga/${manga.id}`);
      }
    },
    [onMangaPress, router]
  );

  const renderMangaItem = useCallback(
    ({ item }: { item: CachedMangaDetails }) => {
      const downloadedCount = downloadedChapters[item.id] || 0;
      const totalChapters = item.chapters?.length || 0;
      const hasDownloads = downloadedCount > 0;

      return (
        <TouchableOpacity
          style={styles.mangaItem}
          onPress={() => handleMangaPress(item)}
          activeOpacity={0.7}
        >
          <CachedMangaImage
            mangaId={item.id}
            bannerUrl={item.bannerImage}
            style={styles.mangaImage}
          />
          <View style={styles.mangaInfo}>
            <Text style={styles.mangaTitle} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.statusContainer}>
              <View
                style={[
                  styles.statusBadge,
                  { backgroundColor: colors.primary + '20' },
                ]}
              >
                <Text style={[styles.statusText, { color: colors.primary }]}>
                  {item.bookmarkStatus || 'Bookmarked'}
                </Text>
              </View>
            </View>
            <View style={styles.infoRow}>
              <View style={styles.infoItem}>
                <Ionicons name="book-outline" size={14} color={colors.text} />
                <Text style={styles.infoText}>{totalChapters} chapters</Text>
              </View>
              {hasDownloads && (
                <View style={styles.infoItem}>
                  <Ionicons
                    name="download-outline"
                    size={14}
                    color={colors.primary}
                  />
                  <Text style={[styles.infoText, { color: colors.primary }]}>
                    {downloadedCount} downloaded
                  </Text>
                </View>
              )}
            </View>
            <Text style={styles.cachedText}>
              Cached {new Date(item.cachedAt).toLocaleDateString()}
            </Text>
          </View>
          <Ionicons
            name="chevron-forward"
            size={20}
            color={colors.text + '60'}
          />
        </TouchableOpacity>
      );
    },
    [downloadedChapters, colors, styles, handleMangaPress]
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading offline manga...</Text>
      </View>
    );
  }

  if (bookmarkedManga.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Ionicons
          name="cloud-offline-outline"
          size={64}
          color={colors.text + '40'}
        />
        <Text style={styles.emptyTitle}>No Offline Manga</Text>
        <Text style={styles.emptyText}>
          Bookmark manga while online to access them offline
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={bookmarkedManga}
      renderItem={renderMangaItem}
      keyExtractor={(item) => item.id}
      contentContainerStyle={styles.listContainer}
      showsVerticalScrollIndicator={false}
    />
  );
};

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    listContainer: {
      padding: 16,
      paddingBottom: 100,
    },
    mangaItem: {
      flexDirection: 'row',
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.1,
      shadowRadius: 4,
      elevation: 3,
    },
    mangaImage: {
      width: 60,
      height: 80,
      borderRadius: 8,
      backgroundColor: colors.background,
    },
    mangaInfo: {
      flex: 1,
      marginLeft: 12,
      justifyContent: 'space-between',
    },
    mangaTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    statusContainer: {
      marginBottom: 8,
    },
    statusBadge: {
      alignSelf: 'flex-start',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 12,
    },
    statusText: {
      fontSize: 12,
      fontWeight: '600',
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 4,
    },
    infoItem: {
      flexDirection: 'row',
      alignItems: 'center',
      marginRight: 16,
    },
    infoText: {
      fontSize: 12,
      color: colors.text,
      marginLeft: 4,
    },
    cachedText: {
      fontSize: 11,
      color: colors.text + '60',
      fontStyle: 'italic',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    loadingText: {
      fontSize: 16,
      color: colors.text,
      marginTop: 12,
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 40,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
      marginTop: 16,
      marginBottom: 8,
    },
    emptyText: {
      fontSize: 14,
      color: colors.text + '70',
      textAlign: 'center',
      lineHeight: 20,
    },
  });
