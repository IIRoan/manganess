import React, { useState, useEffect, useCallback } from 'react';
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
import { imageCache } from '@/services/CacheImages';
import {
  clearAppData,
  exportAppData,
  importAppData,
  migrateToNewStorage,
  refreshMangaImages,
} from '@/services/settingsService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import BackButton from '@/components/BackButton';
import { File, Paths } from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import { logger } from '@/utils/logger';

interface MangaDownloadInfo {
  mangaId: string;
  chapterCount: number;
  totalSize: number;
  chapters: string[];
}

type CacheStats = Awaited<ReturnType<typeof imageCache.getCacheStats>>;

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
  const [cacheStats, setCacheStats] = useState<CacheStats | null>(null);
  const [isCacheLoading, setIsCacheLoading] = useState(false);
  const [activeCacheAction, setActiveCacheAction] = useState<
    'search' | 'manga' | 'all' | 'refresh' | null
  >(null);
  const [isExporting, setIsExporting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isClearingData, setIsClearingData] = useState(false);
  const [isRefreshingImages, setIsRefreshingImages] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);

  const fetchCacheStats = useCallback(async () => {
    try {
      const stats = await imageCache.getCacheStats();
      setCacheStats(stats);
    } catch (error) {
      logger().error('Storage', 'Error loading cache stats', { error });
    }
  }, []);

  const loadDownloads = useCallback(async () => {
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
      await fetchCacheStats();
    } catch (error) {
      logger().error('Storage', 'Error loading downloads', { error });
      Alert.alert('Error', 'Failed to load downloads');
    } finally {
      setIsLoading(false);
    }
  }, [fetchCacheStats]);

  useEffect(() => {
    void loadDownloads();
  }, [loadDownloads]);

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
              logger().error('Storage', 'Error deleting manga', { error });
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
              logger().error('Storage', 'Error clearing all downloads', {
                error,
              });
              Alert.alert('Error', 'Failed to clear downloads');
            } finally {
              setIsLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleClearImageCache = (context?: 'search' | 'manga') => {
    const contextName =
      context === 'search'
        ? 'search cache'
        : context === 'manga'
          ? 'manga cache'
          : 'all image cache';

    Alert.alert(
      'Clear Image Cache',
      `Are you sure you want to clear the ${contextName}? This will free up storage space but images will need to be downloaded again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: () => {
            void (async () => {
              const actionKey = context ?? 'all';
              try {
                setActiveCacheAction(actionKey);
                setIsCacheLoading(true);
                await imageCache.clearCache(context);
                await fetchCacheStats();
                Alert.alert(
                  'Success',
                  `${contextName.charAt(0).toUpperCase() + contextName.slice(1)} cleared successfully.`
                );
              } catch (error) {
                logger().error('Storage', 'Error clearing cache', {
                  error,
                  contextName,
                });
                Alert.alert('Error', `Failed to clear ${contextName}.`);
              } finally {
                setIsCacheLoading(false);
                setActiveCacheAction(null);
              }
            })();
          },
        },
      ]
    );
  };

  const handleRefreshCacheStats = async () => {
    try {
      setActiveCacheAction('refresh');
      setIsCacheLoading(true);
      await fetchCacheStats();
    } catch (error) {
      logger().error('Storage', 'Error refreshing cache stats', { error });
      Alert.alert('Error', 'Failed to refresh cache stats');
    } finally {
      setIsCacheLoading(false);
      setActiveCacheAction(null);
    }
  };

  const handleExportData = async () => {
    try {
      setIsExporting(true);
      const exportedData = await exportAppData();

      const jsonString = JSON.stringify(exportedData, null, 2);
      const fileName = `manganess_${new Date().toISOString().split('T')[0]}.json`;
      const file = new File(Paths.document, fileName);

      try {
        file.create();
      } catch {}
      file.write(jsonString, { encoding: 'utf8' });

      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(file.uri, {
          mimeType: 'application/json',
          dialogTitle: 'Export App Data',
        });
      } else {
        Alert.alert('Export Complete', `File saved to ${file.uri}`);
      }
    } catch (error) {
      logger().error('Service', 'Export error', { error });
      Alert.alert('Error', 'Failed to export data');
    } finally {
      setIsExporting(false);
    }
  };

  const handleImportData = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
      });

      if (result.canceled) return;

      const asset = result.assets?.[0];
      if (!asset) return;
      const file = new File(asset.uri || '');
      const fileContent = await file.text();
      const importedData = JSON.parse(fileContent);

      Alert.alert(
        'Import Data',
        'This will replace all existing data. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: () => {
              void (async () => {
                try {
                  setIsImporting(true);
                  await importAppData(importedData);
                  Alert.alert(
                    'Success',
                    'Data imported! Please restart the app'
                  );
                } catch (error) {
                  logger().error('Service', 'Import error', { error });
                  Alert.alert('Error', 'Failed to import data');
                } finally {
                  setIsImporting(false);
                }
              })();
            },
          },
        ]
      );
    } catch (error) {
      logger().error('Service', 'Import error', { error });
      Alert.alert('Error', 'Failed to import data');
    }
  };

  const handleClearAppData = () => {
    Alert.alert(
      'Clear App Data',
      'Are you sure you want to clear all app data? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'OK',
          onPress: () => {
            void (async () => {
              try {
                setIsClearingData(true);
                await clearAppData();
                await loadDownloads();
                Alert.alert('Success', 'All app data has been cleared.');
              } catch (error) {
                logger().error('Service', 'Error clearing app data', { error });
                Alert.alert('Error', 'Failed to clear app data.');
              } finally {
                setIsClearingData(false);
              }
            })();
          },
        },
      ]
    );
  };

  const handleRefreshMangaImages = async () => {
    try {
      setIsRefreshingImages(true);
      const result = await refreshMangaImages();
      Alert.alert(result.success ? 'Success' : 'Error', result.message);
    } catch (error) {
      logger().error('Service', 'Error refreshing manga images', { error });
      Alert.alert('Error', 'Failed to refresh manga images');
    } finally {
      setIsRefreshingImages(false);
    }
  };

  const handleMigrateStorage = async () => {
    try {
      setIsMigrating(true);
      const result = await migrateToNewStorage();
      Alert.alert(result.success ? 'Success' : 'Error', result.message);
      if (result.success) {
        await loadDownloads();
      }
    } catch (error) {
      logger().error('Service', 'Error migrating data', { error });
      Alert.alert('Error', 'Failed to migrate data');
    } finally {
      setIsMigrating(false);
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number): string => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleDateString();
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

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Image Cache</Text>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Total Size</Text>
            <Text style={styles.cardValue}>
              {cacheStats ? formatFileSize(cacheStats.totalSize) : '—'}
            </Text>
          </View>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Total Files</Text>
            <Text style={styles.cardValue}>
              {cacheStats ? cacheStats.totalFiles : '—'}
            </Text>
          </View>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Manga Images</Text>
            <Text style={styles.cardValue}>
              {cacheStats ? cacheStats.mangaCount : '—'}
            </Text>
          </View>
          <View style={styles.cardRow}>
            <Text style={styles.cardLabel}>Search Cache</Text>
            <Text style={styles.cardValue}>
              {cacheStats ? cacheStats.searchCount : '—'}
            </Text>
          </View>
          {cacheStats?.oldestEntry ? (
            <View style={styles.cardRow}>
              <Text style={styles.cardLabel}>Oldest Entry</Text>
              <Text style={styles.cardValue}>
                {formatDate(cacheStats.oldestEntry)}
              </Text>
            </View>
          ) : null}

          <View style={styles.cardDivider} />

          <TouchableOpacity
            style={[
              styles.cardAction,
              isCacheLoading ? styles.cardActionDisabled : null,
            ]}
            onPress={() => handleClearImageCache('search')}
            disabled={isCacheLoading}
          >
            <View style={styles.cardActionContent}>
              <View style={styles.cardActionIcon}>
                <Ionicons name="images-outline" size={20} color={colors.text} />
              </View>
              <Text style={styles.cardActionText}>Clear Search Cache</Text>
            </View>
            <View style={styles.cardActionTrailing}>
              {activeCacheAction === 'search' && isCacheLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.tabIconDefault}
                />
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.cardAction,
              isCacheLoading ? styles.cardActionDisabled : null,
            ]}
            onPress={() => handleClearImageCache('manga')}
            disabled={isCacheLoading}
          >
            <View style={styles.cardActionContent}>
              <View style={styles.cardActionIcon}>
                <Ionicons
                  name="library-outline"
                  size={20}
                  color={colors.text}
                />
              </View>
              <Text style={styles.cardActionText}>Clear Manga Cache</Text>
            </View>
            <View style={styles.cardActionTrailing}>
              {activeCacheAction === 'manga' && isCacheLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.tabIconDefault}
                />
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.cardAction,
              isCacheLoading ? styles.cardActionDisabled : null,
            ]}
            onPress={() => handleClearImageCache()}
            disabled={isCacheLoading}
          >
            <View style={styles.cardActionContent}>
              <View
                style={[styles.cardActionIcon, styles.cardActionIconWarning]}
              >
                <Ionicons
                  name="trash-outline"
                  size={20}
                  color={colors.notification}
                />
              </View>
              <Text style={[styles.cardActionText, styles.cardActionDanger]}>
                Clear All Image Cache
              </Text>
            </View>
            <View style={styles.cardActionTrailing}>
              {activeCacheAction === 'all' && isCacheLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.tabIconDefault}
                />
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.cardAction,
              isCacheLoading ? styles.cardActionDisabled : null,
            ]}
            onPress={handleRefreshCacheStats}
            disabled={isCacheLoading}
          >
            <View style={styles.cardActionContent}>
              <View style={styles.cardActionIcon}>
                <Ionicons
                  name="refresh-outline"
                  size={20}
                  color={colors.text}
                />
              </View>
              <Text style={styles.cardActionText}>Refresh Cache Stats</Text>
            </View>
            <View style={styles.cardActionTrailing}>
              {activeCacheAction === 'refresh' && isCacheLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.tabIconDefault}
                />
              )}
            </View>
          </TouchableOpacity>
        </View>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>App Data Management</Text>

          <TouchableOpacity
            style={[
              styles.cardAction,
              isExporting ? styles.cardActionDisabled : null,
            ]}
            onPress={handleExportData}
            disabled={isExporting}
          >
            <View style={styles.cardActionContent}>
              <View style={styles.cardActionIcon}>
                <Ionicons
                  name="download-outline"
                  size={20}
                  color={colors.text}
                />
              </View>
              <Text style={styles.cardActionText}>Export App Data</Text>
            </View>
            <View style={styles.cardActionTrailing}>
              {isExporting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.tabIconDefault}
                />
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.cardAction,
              isImporting ? styles.cardActionDisabled : null,
            ]}
            onPress={handleImportData}
            disabled={isImporting}
          >
            <View style={styles.cardActionContent}>
              <View style={styles.cardActionIcon}>
                <Ionicons name="cloud-upload" size={20} color={colors.text} />
              </View>
              <Text style={styles.cardActionText}>Import App Data</Text>
            </View>
            <View style={styles.cardActionTrailing}>
              {isImporting ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.tabIconDefault}
                />
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.cardAction,
              isClearingData ? styles.cardActionDisabled : null,
            ]}
            onPress={handleClearAppData}
            disabled={isClearingData}
          >
            <View style={styles.cardActionContent}>
              <View
                style={[styles.cardActionIcon, styles.cardActionIconDanger]}
              >
                <Ionicons name="trash-outline" size={20} color={colors.error} />
              </View>
              <Text style={[styles.cardActionText, styles.cardActionDanger]}>
                Clear App Data
              </Text>
            </View>
            <View style={styles.cardActionTrailing}>
              {isClearingData ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.tabIconDefault}
                />
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.cardAction,
              isRefreshingImages ? styles.cardActionDisabled : null,
            ]}
            onPress={handleRefreshMangaImages}
            disabled={isRefreshingImages}
          >
            <View style={styles.cardActionContent}>
              <View style={styles.cardActionIcon}>
                <Ionicons
                  name="refresh-outline"
                  size={20}
                  color={colors.text}
                />
              </View>
              <Text style={styles.cardActionText}>Refresh Manga Images</Text>
            </View>
            <View style={styles.cardActionTrailing}>
              {isRefreshingImages ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.tabIconDefault}
                />
              )}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.cardAction,
              isMigrating ? styles.cardActionDisabled : null,
            ]}
            onPress={handleMigrateStorage}
            disabled={isMigrating}
          >
            <View style={styles.cardActionContent}>
              <View style={styles.cardActionIcon}>
                <Ionicons name="sync-outline" size={20} color={colors.text} />
              </View>
              <Text style={styles.cardActionText}>Migrate Storage Format</Text>
            </View>
            <View style={styles.cardActionTrailing}>
              {isMigrating ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.tabIconDefault}
                />
              )}
            </View>
          </TouchableOpacity>
        </View>

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
                  style={[
                    styles.deleteButton,
                    deletingManga.has(manga.mangaId)
                      ? styles.deleteButtonDisabled
                      : null,
                  ]}
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
    card: {
      backgroundColor: colors.card,
      marginHorizontal: 16,
      marginBottom: 16,
      padding: 18,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    cardTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 12,
    },
    cardRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 8,
    },
    cardLabel: {
      fontSize: 14,
      color: colors.text,
    },
    cardValue: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.primary,
    },
    cardDivider: {
      height: 1,
      backgroundColor: colors.border,
      marginVertical: 12,
    },
    cardAction: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      backgroundColor: colors.background,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      paddingVertical: 14,
      paddingHorizontal: 16,
      marginBottom: 12,
    },
    cardActionDisabled: {
      opacity: 0.6,
    },
    cardActionContent: {
      flexDirection: 'row',
      alignItems: 'center',
      flex: 1,
      marginRight: 12,
    },
    cardActionIcon: {
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 12,
    },
    cardActionIconDanger: {
      backgroundColor: colors.error + '10',
      borderColor: colors.error + '40',
    },
    cardActionIconWarning: {
      backgroundColor: colors.notification + '10',
      borderColor: colors.notification + '40',
    },
    cardActionText: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      fontWeight: '500',
    },
    cardActionDanger: {
      color: colors.error,
      fontWeight: '600',
    },
    cardActionTrailing: {
      width: 28,
      alignItems: 'center',
      justifyContent: 'center',
    },
    clearAllButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.error,
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderRadius: 12,
      marginTop: 20,
      gap: 10,
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
      paddingVertical: 14,
      paddingHorizontal: 16,
      borderTopWidth: 1,
      borderTopColor: colors.border,
      gap: 10,
      backgroundColor: colors.error + '12',
    },
    deleteButtonDisabled: {
      opacity: 0.6,
    },
    deleteText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.error,
    },
  });
