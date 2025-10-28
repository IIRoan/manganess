import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
  ActivityIndicator,
  TouchableOpacity,
  Alert,
} from 'react-native';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { chapterStorageService } from '@/services/chapterStorageService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import BackButton from '@/components/BackButton';

interface MangaDownloadInfo {
  mangaId: string;
  chapterCount: number;
  totalSize: number;
  chapters: string[];
}

export default function DownloadsScreen() {
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme =
    theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [storageStats, setStorageStats] = useState<any>(null);
  const [mangaDownloads, setMangaDownloads] = useState<MangaDownloadInfo[]>([]);
  const [deletingManga, setDeletingManga] = useState<Set<string>>(new Set());

  useEffect(() => {
    loadDownloads();
  }, []);

  const loadDownloads = async () => {
    try {
      setIsLoading(true);

      // Get storage stats
      const stats = await chapterStorageService.getDetailedStorageStats();
      setStorageStats(stats);

      // Build manga download info
      const mangaList: MangaDownloadInfo[] = [];

      for (const [mangaId, breakdown] of Object.entries(
        stats.storageBreakdown
      )) {
        const chapters =
          await chapterStorageService.getDownloadedChapters(mangaId);

        mangaList.push({
          mangaId,
          chapterCount: breakdown.chapters,
          totalSize: breakdown.totalSize,
          chapters,
        });
      }

      // Sort by total size (largest first)
      mangaList.sort((a, b) => b.totalSize - a.totalSize);

      setMangaDownloads(mangaList);
    } catch (error) {
      console.error('Error loading downloads:', error);
      Alert.alert('Error', 'Failed to load downloads');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDeleteManga = async (mangaId: string) => {
    Alert.alert(
      'Delete All Chapters',
      `Delete all downloaded chapters for this manga? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              setDeletingManga((prev) => new Set(prev).add(mangaId));

              const manga = mangaDownloads.find((m) => m.mangaId === mangaId);
              if (manga) {
                for (const chapterNumber of manga.chapters) {
                  await chapterStorageService.deleteChapter(
                    mangaId,
                    chapterNumber
                  );
                }
              }

              // Reload downloads
              await loadDownloads();
            } catch (error) {
              console.error('Error deleting manga:', error);
              Alert.alert('Error', 'Failed to delete chapters');
            } finally {
              setDeletingManga((prev) => {
                const next = new Set(prev);
                next.delete(mangaId);
                return next;
              });
            }
          },
        },
      ]
    );
  };

  const handleClearAll = async () => {
    Alert.alert(
      'Clear All Downloads',
      `Delete all ${storageStats?.totalChapters || 0} downloaded chapters? This cannot be undone.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsLoading(true);
              await chapterStorageService.clearAllDownloads();
              await loadDownloads();
            } catch (error) {
              console.error('Error clearing all downloads:', error);
              Alert.alert('Error', 'Failed to clear downloads');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (isLoading) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <BackButton />
          <Text style={styles.title}>Downloads</Text>
        </View>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.title}>Downloads</Text>
      </View>

      <ScrollView style={styles.scrollView}>
        {/* Storage Stats */}
        {storageStats && (
          <View style={styles.statsCard}>
            <Text style={styles.statsTitle}>Storage Usage</Text>
            <View style={styles.statsRow}>
              <Text style={styles.statsLabel}>Total Size:</Text>
              <Text style={styles.statsValue}>
                {formatFileSize(storageStats.totalSize)}
              </Text>
            </View>
            <View style={styles.statsRow}>
              <Text style={styles.statsLabel}>Total Chapters:</Text>
              <Text style={styles.statsValue}>
                {storageStats.totalChapters}
              </Text>
            </View>
            <View style={styles.statsRow}>
              <Text style={styles.statsLabel}>Manga Count:</Text>
              <Text style={styles.statsValue}>{storageStats.mangaCount}</Text>
            </View>
            <View style={styles.statsRow}>
              <Text style={styles.statsLabel}>Available Space:</Text>
              <Text style={styles.statsValue}>
                {formatFileSize(storageStats.availableSpace)}
              </Text>
            </View>

            {storageStats.totalChapters > 0 && (
              <TouchableOpacity
                style={styles.clearAllButton}
                onPress={handleClearAll}
              >
                <Ionicons name="trash-outline" size={20} color="white" />
                <Text style={styles.clearAllText}>Clear All Downloads</Text>
              </TouchableOpacity>
            )}
          </View>
        )}

        {/* Manga List */}
        {mangaDownloads.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Ionicons
              name="download-outline"
              size={64}
              color={colors.tabIconDefault}
            />
            <Text style={styles.emptyText}>No downloads yet</Text>
            <Text style={styles.emptySubtext}>
              Downloaded chapters will appear here
            </Text>
          </View>
        ) : (
          <View style={styles.mangaList}>
            <Text style={styles.sectionTitle}>Downloaded Manga</Text>
            {mangaDownloads.map((manga) => (
              <View key={manga.mangaId} style={styles.mangaCard}>
                <TouchableOpacity
                  style={styles.mangaInfo}
                  onPress={() => router.push(`/manga/${manga.mangaId}`)}
                >
                  <View style={styles.mangaDetails}>
                    <Text style={styles.mangaId} numberOfLines={1}>
                      {manga.mangaId}
                    </Text>
                    <Text style={styles.mangaStats}>
                      {manga.chapterCount} chapter
                      {manga.chapterCount !== 1 ? 's' : ''} •{' '}
                      {formatFileSize(manga.totalSize)}
                    </Text>
                  </View>
                  <Ionicons
                    name="chevron-forward"
                    size={20}
                    color={colors.text}
                  />
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.deleteButton}
                  onPress={() => handleDeleteManga(manga.mangaId)}
                  disabled={deletingManga.has(manga.mangaId)}
                >
                  {deletingManga.has(manga.mangaId) ? (
                    <ActivityIndicator size="small" color={colors.error} />
                  ) : (
                    <>
                      <Ionicons
                        name="trash-outline"
                        size={18}
                        color={colors.error}
                      />
                      <Text style={styles.deleteText}>Delete</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ))}
          </View>
        )}
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 15,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.text,
      marginLeft: 15,
    },
    scrollView: {
      flex: 1,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    statsCard: {
      backgroundColor: colors.card,
      margin: 16,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    statsTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 12,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    statsLabel: {
      fontSize: 14,
      color: colors.text,
    },
    statsValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    clearAllButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.error,
      padding: 12,
      borderRadius: 8,
      marginTop: 16,
      gap: 8,
    },
    clearAllText: {
      color: 'white',
      fontSize: 16,
      fontWeight: '600',
    },
    emptyContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingVertical: 60,
    },
    emptyText: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginTop: 16,
    },
    emptySubtext: {
      fontSize: 14,
      color: colors.tabIconDefault,
      marginTop: 8,
    },
    mangaList: {
      padding: 16,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 12,
    },
    mangaCard: {
      backgroundColor: colors.card,
      borderRadius: 12,
      marginBottom: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    mangaInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
    },
    mangaDetails: {
      flex: 1,
    },
    mangaId: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    mangaStats: {
      fontSize: 14,
      color: colors.tabIconDefault,
    },
    deleteButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      padding: 12,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 8,
    },
    deleteText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.error,
    },
  });
