import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useDownloadNavigation } from '@/utils/downloadNavigation';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import { downloadManagerService } from '@/services/downloadManager';
import { chapterStorageService } from '@/services/chapterStorageService';
import { DownloadStatus } from '@/types/download';

interface MangaDownloadStatusProps {
  mangaId: string;
  totalChapters: number;
  style?: any;
}

interface MangaDownloadStats {
  downloadedChapters: number;
  activeDownloads: number;
  queuedDownloads: number;
  failedDownloads: number;
  totalSize: number;
}

const MangaDownloadStatus: React.FC<MangaDownloadStatusProps> = ({
  mangaId,
  totalChapters,
  style,
}) => {
  const { theme, systemTheme } = useTheme();
  const colorScheme = theme === 'system' ? systemTheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);
  const { navigateToDownloads } = useDownloadNavigation();

  const [stats, setStats] = useState<MangaDownloadStats | null>(null);
  const [loading, setLoading] = useState(true);

  const loadDownloadStats = React.useCallback(async () => {
    try {
      setLoading(true);

      // Get active downloads for this manga
      const activeDownloads = await downloadManagerService.getActiveDownloads();
      const mangaDownloads = activeDownloads.filter(
        (download) => download.mangaId === mangaId
      );

      // Count downloads by status
      const activeCount = mangaDownloads.filter(
        (d) => d.status === DownloadStatus.DOWNLOADING
      ).length;
      const queuedCount = mangaDownloads.filter(
        (d) =>
          d.status === DownloadStatus.QUEUED ||
          d.status === DownloadStatus.PAUSED
      ).length;
      const failedCount = mangaDownloads.filter(
        (d) => d.status === DownloadStatus.FAILED
      ).length;

      // Get downloaded chapters count
      const downloadedChapters =
        await chapterStorageService.getDownloadedChaptersCount(mangaId);

      // Get total download size for this manga
      const mangaSize =
        await chapterStorageService.getMangaStorageSize(mangaId);

      setStats({
        downloadedChapters,
        activeDownloads: activeCount,
        queuedDownloads: queuedCount,
        failedDownloads: failedCount,
        totalSize: mangaSize,
      });
    } catch (error) {
      console.error('Error loading download stats:', error);
      setStats({
        downloadedChapters: 0,
        activeDownloads: 0,
        queuedDownloads: 0,
        failedDownloads: 0,
        totalSize: 0,
      });
    } finally {
      setLoading(false);
    }
  }, [mangaId]);

  useEffect(() => {
    loadDownloadStats();

    // Set up periodic refresh for active downloads
    const interval = setInterval(() => {
      loadDownloadStats();
    }, 5000); // Increased interval to reduce load

    return () => {
      clearInterval(interval);
    };
  }, [loadDownloadStats]);

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const getDownloadProgress = (): number => {
    if (!stats || totalChapters === 0) return 0;
    return Math.round((stats.downloadedChapters / totalChapters) * 100);
  };

  const getStatusText = (): string => {
    if (!stats) return 'Loading...';

    if (stats.activeDownloads > 0) {
      return `${stats.activeDownloads} downloading`;
    }

    if (stats.queuedDownloads > 0) {
      return `${stats.queuedDownloads} queued`;
    }

    if (stats.downloadedChapters > 0) {
      return `${stats.downloadedChapters}/${totalChapters} downloaded`;
    }

    return 'No downloads';
  };

  const getStatusIcon = (): keyof typeof Ionicons.glyphMap => {
    if (!stats) return 'download-outline';

    if (stats.activeDownloads > 0) return 'download';
    if (stats.queuedDownloads > 0) return 'time-outline';
    if (stats.failedDownloads > 0) return 'warning-outline';
    if (stats.downloadedChapters > 0) return 'checkmark-circle-outline';

    return 'download-outline';
  };

  const getStatusColor = (): string => {
    if (!stats) return colors.text;

    if (stats.activeDownloads > 0) return colors.primary;
    if (stats.failedDownloads > 0) return colors.error;
    if (stats.downloadedChapters > 0) return colors.primary;

    return colors.text;
  };

  const handlePress = () => {
    navigateToDownloads();
  };

  if (loading) {
    return (
      <View style={[styles.container, style]}>
        <ActivityIndicator size="small" color={colors.primary} />
        <Text style={styles.loadingText}>Loading downloads...</Text>
      </View>
    );
  }

  if (
    !stats ||
    (stats.downloadedChapters === 0 &&
      stats.activeDownloads === 0 &&
      stats.queuedDownloads === 0)
  ) {
    return null; // Don't show if no downloads
  }

  return (
    <TouchableOpacity
      style={[styles.container, style]}
      onPress={handlePress}
      activeOpacity={0.7}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name={getStatusIcon()} size={20} color={getStatusColor()} />
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.statusText}>{getStatusText()}</Text>
          {stats.totalSize > 0 && (
            <Text style={styles.sizeText}>
              {formatFileSize(stats.totalSize)} stored
            </Text>
          )}
        </View>

        {stats.downloadedChapters > 0 && (
          <View style={styles.progressContainer}>
            <Text style={styles.progressText}>{getDownloadProgress()}%</Text>
          </View>
        )}

        <Ionicons name="chevron-forward" size={16} color={colors.text} />
      </View>

      {stats.downloadedChapters > 0 && (
        <View style={styles.progressBar}>
          <View
            style={[
              styles.progressFill,
              {
                width: `${getDownloadProgress()}%`,
                backgroundColor: colors.primary,
              },
            ]}
          />
        </View>
      )}
    </TouchableOpacity>
  );
};

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 12,
      marginHorizontal: 16,
      marginVertical: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    iconContainer: {
      marginRight: 12,
    },
    textContainer: {
      flex: 1,
    },
    statusText: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 2,
    },
    sizeText: {
      fontSize: 12,
      color: colors.tabIconDefault,
    },
    progressContainer: {
      marginRight: 8,
    },
    progressText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
    progressBar: {
      height: 3,
      backgroundColor: colors.border,
      borderRadius: 1.5,
      marginTop: 8,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 1.5,
    },
    loadingText: {
      fontSize: 12,
      color: colors.tabIconDefault,
      marginLeft: 8,
    },
  });

export default MangaDownloadStatus;
