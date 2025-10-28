import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  Pressable,
  Alert,
  RefreshControl,
  ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import { useHapticFeedback } from '@/utils/haptics';
import { downloadManagerService } from '@/services/downloadManager';
import { downloadQueueService } from '@/services/downloadQueue';
import { chapterStorageService } from '@/services/chapterStorageService';
import {
  DownloadItem,
  DownloadStatus,
  StorageStats,
  QueueStatus,
} from '@/types/download';

interface DownloadItemWithActions extends DownloadItem {
  canPause: boolean;
  canResume: boolean;
  canCancel: boolean;
  canRetry: boolean;
}

const DownloadsScreen: React.FC = () => {
  const { theme, systemTheme } = useTheme();
  const colorScheme = theme === 'system' ? systemTheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);
  const haptics = useHapticFeedback();

  const [downloads, setDownloads] = useState<DownloadItemWithActions[]>([]);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [queueStatus, setQueueStatus] = useState<QueueStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Load data on mount
  useEffect(() => {
    loadData();

    // Set up periodic refresh for active downloads
    const interval = setInterval(() => {
      if (queueStatus?.isProcessing) {
        loadDownloads();
      }
    }, 2000);

    return () => {
      clearInterval(interval);
      // Cleanup any pending operations
      setDownloads([]);
      setStorageStats(null);
      setQueueStatus(null);
    };
  }, [queueStatus?.isProcessing]);

  const loadData = async () => {
    try {
      setIsLoading(true);
      await Promise.all([
        loadDownloads(),
        loadStorageStats(),
        loadQueueStatus(),
      ]);
    } catch (error) {
      console.error('Error loading downloads data:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const loadDownloads = async () => {
    try {
      const activeDownloads = await downloadManagerService.getActiveDownloads();
      const downloadsWithActions = activeDownloads.map((download) => ({
        ...download,
        canPause: download.status === DownloadStatus.DOWNLOADING,
        canResume: download.status === DownloadStatus.PAUSED,
        canCancel: [
          DownloadStatus.DOWNLOADING,
          DownloadStatus.PAUSED,
          DownloadStatus.QUEUED,
        ].includes(download.status),
        canRetry: download.status === DownloadStatus.FAILED,
      }));

      setDownloads(downloadsWithActions);
    } catch (error) {
      console.error('Error loading downloads:', error);
    }
  };

  const loadStorageStats = async () => {
    try {
      const stats = await chapterStorageService.getStorageStats();
      setStorageStats(stats);
    } catch (error) {
      console.error('Error loading storage stats:', error);
    }
  };

  const loadQueueStatus = async () => {
    try {
      const status = await downloadQueueService.getQueueStatus();
      setQueueStatus(status);
    } catch (error) {
      console.error('Error loading queue status:', error);
    }
  };

  const handleRefresh = useCallback(async () => {
    setIsRefreshing(true);
    await loadData();
    setIsRefreshing(false);
  }, []);

  const handlePauseDownload = async (downloadId: string) => {
    try {
      haptics.onPress();
      await downloadManagerService.pauseDownload(downloadId);
      await loadDownloads();
    } catch (error) {
      console.error('Error pausing download:', error);
      Alert.alert('Error', 'Failed to pause download');
    }
  };

  const handleResumeDownload = async (downloadId: string) => {
    try {
      haptics.onPress();
      await downloadManagerService.resumeDownload(downloadId);
      await loadDownloads();
    } catch (error) {
      console.error('Error resuming download:', error);
      Alert.alert('Error', 'Failed to resume download');
    }
  };

  const handleCancelDownload = async (
    downloadId: string,
    mangaTitle: string
  ) => {
    haptics.onPress();

    Alert.alert(
      'Cancel Download',
      `Are you sure you want to cancel downloading "${mangaTitle}"?`,
      [
        { text: 'No', style: 'cancel' },
        {
          text: 'Yes',
          style: 'destructive',
          onPress: async () => {
            try {
              await downloadManagerService.cancelDownload(downloadId);
              await loadDownloads();
            } catch (error) {
              console.error('Error cancelling download:', error);
              Alert.alert('Error', 'Failed to cancel download');
            }
          },
        },
      ]
    );
  };

  const handleRetryDownload = async (download: DownloadItem) => {
    try {
      haptics.onPress();
      await downloadManagerService.downloadChapter(
        download.mangaId,
        download.chapterNumber,
        download.chapterUrl
      );
      await loadDownloads();
    } catch (error) {
      console.error('Error retrying download:', error);
      Alert.alert('Error', 'Failed to retry download');
    }
  };

  const handlePauseAllDownloads = async () => {
    try {
      haptics.onPress();
      await downloadQueueService.pauseQueue();
      await loadData();
    } catch (error) {
      console.error('Error pausing all downloads:', error);
      Alert.alert('Error', 'Failed to pause all downloads');
    }
  };

  const handleResumeAllDownloads = async () => {
    try {
      haptics.onPress();
      await downloadQueueService.resumeQueue();
      await loadData();
    } catch (error) {
      console.error('Error resuming all downloads:', error);
      Alert.alert('Error', 'Failed to resume all downloads');
    }
  };

  const handleClearCompleted = async () => {
    haptics.onPress();

    Alert.alert(
      'Clear Completed',
      'Remove all completed downloads from the list?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              await downloadQueueService.clearCompletedDownloads();
              await loadDownloads();
            } catch (error) {
              console.error('Error clearing completed downloads:', error);
              Alert.alert('Error', 'Failed to clear completed downloads');
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
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const formatTimeAgo = (timestamp: number): string => {
    const now = Date.now();
    const diff = now - timestamp;
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (days > 0) return `${days}d ago`;
    if (hours > 0) return `${hours}h ago`;
    if (minutes > 0) return `${minutes}m ago`;
    return 'Just now';
  };

  const getStatusColor = (status: DownloadStatus): string => {
    switch (status) {
      case DownloadStatus.DOWNLOADING:
        return colors.primary;
      case DownloadStatus.COMPLETED:
        return '#4CAF50';
      case DownloadStatus.FAILED:
        return colors.error;
      case DownloadStatus.PAUSED:
        return '#FF9800';
      default:
        return colors.tabIconDefault;
    }
  };

  const getStatusText = (status: DownloadStatus): string => {
    switch (status) {
      case DownloadStatus.QUEUED:
        return 'Queued';
      case DownloadStatus.DOWNLOADING:
        return 'Downloading';
      case DownloadStatus.COMPLETED:
        return 'Completed';
      case DownloadStatus.FAILED:
        return 'Failed';
      case DownloadStatus.PAUSED:
        return 'Paused';
      case DownloadStatus.CANCELLED:
        return 'Cancelled';
      default:
        return 'Unknown';
    }
  };

  const renderDownloadItem = ({ item }: { item: DownloadItemWithActions }) => (
    <View style={styles.downloadItem}>
      <View style={styles.downloadHeader}>
        <View style={styles.downloadInfo}>
          <Text style={styles.mangaTitle} numberOfLines={1}>
            {item.mangaTitle}
          </Text>
          <Text style={styles.chapterNumber}>Chapter {item.chapterNumber}</Text>
        </View>
        <View style={styles.downloadActions}>
          {item.canPause && (
            <Pressable
              style={styles.actionButton}
              onPress={() => handlePauseDownload(item.id)}
            >
              <Ionicons name="pause" size={20} color={colors.text} />
            </Pressable>
          )}
          {item.canResume && (
            <Pressable
              style={styles.actionButton}
              onPress={() => handleResumeDownload(item.id)}
            >
              <Ionicons name="play" size={20} color={colors.primary} />
            </Pressable>
          )}
          {item.canRetry && (
            <Pressable
              style={styles.actionButton}
              onPress={() => handleRetryDownload(item)}
            >
              <Ionicons name="refresh" size={20} color={colors.primary} />
            </Pressable>
          )}
          {item.canCancel && (
            <Pressable
              style={styles.actionButton}
              onPress={() => handleCancelDownload(item.id, item.mangaTitle)}
            >
              <Ionicons name="close" size={20} color={colors.error} />
            </Pressable>
          )}
        </View>
      </View>

      <View style={styles.downloadProgress}>
        <View style={styles.progressInfo}>
          <Text
            style={[styles.statusText, { color: getStatusColor(item.status) }]}
          >
            {getStatusText(item.status)}
          </Text>
          <Text style={styles.progressText}>
            {item.downloadedImages}/{item.totalImages} images ({item.progress}%)
          </Text>
        </View>
        <Text style={styles.timeText}>{formatTimeAgo(item.updatedAt)}</Text>
      </View>

      {(item.status === DownloadStatus.DOWNLOADING ||
        item.status === DownloadStatus.PAUSED) && (
        <View style={styles.progressBarContainer}>
          <View
            style={[
              styles.progressBar,
              {
                width: `${item.progress}%`,
                backgroundColor: getStatusColor(item.status),
              },
            ]}
          />
        </View>
      )}

      {item.error && (
        <Text style={styles.errorText} numberOfLines={2}>
          {item.error}
        </Text>
      )}
    </View>
  );

  const renderHeader = () => (
    <View style={styles.header}>
      <View style={styles.headerTop}>
        <Pressable
          style={styles.backButton}
          onPress={() => {
            haptics.onPress();
            router.back();
          }}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </Pressable>
        <Text style={styles.headerTitle}>Downloads</Text>
        <View style={styles.headerActions}>
          {queueStatus?.isPaused ? (
            <Pressable
              style={styles.headerActionButton}
              onPress={handleResumeAllDownloads}
            >
              <Ionicons name="play" size={20} color={colors.primary} />
            </Pressable>
          ) : (
            <Pressable
              style={styles.headerActionButton}
              onPress={handlePauseAllDownloads}
            >
              <Ionicons name="pause" size={20} color={colors.text} />
            </Pressable>
          )}
          <Pressable
            style={styles.headerActionButton}
            onPress={handleClearCompleted}
          >
            <Ionicons name="trash-outline" size={20} color={colors.text} />
          </Pressable>
        </View>
      </View>

      {/* Queue Status */}
      {queueStatus && (
        <View style={styles.queueStatus}>
          <View style={styles.queueInfo}>
            <Text style={styles.queueText}>
              {queueStatus.activeDownloads} active • {queueStatus.queuedItems}{' '}
              queued
            </Text>
            {queueStatus.isPaused && (
              <Text style={[styles.queueText, { color: '#FF9800' }]}>
                Queue Paused
              </Text>
            )}
          </View>
        </View>
      )}

      {/* Storage Stats */}
      {storageStats && (
        <View style={styles.storageStats}>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Downloaded</Text>
            <Text style={styles.statValue}>
              {storageStats.totalChapters} chapters
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Storage Used</Text>
            <Text style={styles.statValue}>
              {formatFileSize(storageStats.totalSize)}
            </Text>
          </View>
          <View style={styles.statItem}>
            <Text style={styles.statLabel}>Manga Series</Text>
            <Text style={styles.statValue}>{storageStats.mangaCount}</Text>
          </View>
        </View>
      )}
    </View>
  );

  const renderEmptyState = () => (
    <View style={styles.emptyState}>
      <Ionicons
        name="download-outline"
        size={64}
        color={colors.tabIconDefault}
      />
      <Text style={styles.emptyTitle}>No Downloads</Text>
      <Text style={styles.emptySubtitle}>
        Downloaded chapters will appear here
      </Text>
    </View>
  );

  if (isLoading) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: colors.background }]}
      >
        {renderHeader()}
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.loadingText}>Loading downloads...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: colors.background }]}
    >
      <FlatList
        data={downloads}
        renderItem={renderDownloadItem}
        keyExtractor={(item) => item.id}
        ListHeaderComponent={renderHeader}
        ListEmptyComponent={renderEmptyState}
        refreshControl={
          <RefreshControl
            refreshing={isRefreshing}
            onRefresh={handleRefresh}
            colors={[colors.primary]}
            tintColor={colors.primary}
          />
        }
        contentContainerStyle={
          downloads.length === 0 ? styles.emptyContainer : undefined
        }
        showsVerticalScrollIndicator={false}
      />
    </SafeAreaView>
  );
};

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    container: {
      flex: 1,
    },
    header: {
      paddingHorizontal: 16,
      paddingBottom: 16,
    },
    headerTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    backButton: {
      padding: 8,
      marginLeft: -8,
    },
    headerTitle: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.text,
      flex: 1,
      textAlign: 'center',
      marginHorizontal: 16,
    },
    headerActions: {
      flexDirection: 'row',
      gap: 8,
    },
    headerActionButton: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: colors.card,
    },
    queueStatus: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 12,
      marginBottom: 12,
    },
    queueInfo: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    queueText: {
      fontSize: 14,
      color: colors.text,
      fontWeight: '500',
    },
    storageStats: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
      flexDirection: 'row',
      justifyContent: 'space-around',
    },
    statItem: {
      alignItems: 'center',
    },
    statLabel: {
      fontSize: 12,
      color: colors.tabIconDefault,
      marginBottom: 4,
    },
    statValue: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    downloadItem: {
      backgroundColor: colors.card,
      marginHorizontal: 16,
      marginBottom: 12,
      borderRadius: 12,
      padding: 16,
    },
    downloadHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    downloadInfo: {
      flex: 1,
      marginRight: 12,
    },
    mangaTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    chapterNumber: {
      fontSize: 14,
      color: colors.tabIconDefault,
    },
    downloadActions: {
      flexDirection: 'row',
      gap: 8,
    },
    actionButton: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: colors.background,
    },
    downloadProgress: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    progressInfo: {
      flex: 1,
    },
    statusText: {
      fontSize: 14,
      fontWeight: '600',
      marginBottom: 2,
    },
    progressText: {
      fontSize: 12,
      color: colors.tabIconDefault,
    },
    timeText: {
      fontSize: 12,
      color: colors.tabIconDefault,
    },
    progressBarContainer: {
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 2,
      overflow: 'hidden',
      marginBottom: 8,
    },
    progressBar: {
      height: '100%',
      borderRadius: 2,
    },
    errorText: {
      fontSize: 12,
      color: colors.error,
      fontStyle: 'italic',
    },
    emptyContainer: {
      flex: 1,
    },
    emptyState: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 32,
    },
    emptyTitle: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
      marginTop: 16,
      marginBottom: 8,
    },
    emptySubtitle: {
      fontSize: 16,
      color: colors.tabIconDefault,
      textAlign: 'center',
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loadingText: {
      fontSize: 16,
      color: colors.tabIconDefault,
      marginTop: 16,
    },
  });

export default DownloadsScreen;
