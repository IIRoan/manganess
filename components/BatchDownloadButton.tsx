import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import { useHapticFeedback } from '@/utils/haptics';
import { downloadBatchManager } from '@/services/downloadBatchManager';
import { downloadQueueService } from '@/services/downloadQueue';

interface Chapter {
  number: string;
  title: string;
  date: string;
  url: string;
}

interface BatchDownloadButtonProps {
  mangaId: string;
  mangaTitle: string;
  chapters: Chapter[];
  selectedChapters?: string[];
  onDownloadStart?: (chapterCount: number) => void;
  onDownloadError?: (error: string) => void;
  style?: any;
}

const BatchDownloadButton: React.FC<BatchDownloadButtonProps> = ({
  mangaId,
  chapters,
  selectedChapters,
  onDownloadStart,
  onDownloadError,
  style,
}) => {
  const { theme, systemTheme } = useTheme();
  const colorScheme = theme === 'system' ? systemTheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);
  const haptics = useHapticFeedback();

  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadProgress, setDownloadProgress] = useState(0);
  const [activeDownloads, setActiveDownloads] = useState(0);

  // Determine which chapters to download
  const chaptersToDownload = selectedChapters
    ? chapters.filter((chapter) => selectedChapters.includes(chapter.number))
    : chapters;

  useEffect(() => {
    // Check if there are active batch downloads
    const checkActiveBatches = () => {
      const hasActiveBatches = downloadBatchManager.hasActiveBatches();
      setIsDownloading(hasActiveBatches);

      if (!hasActiveBatches) {
        setDownloadProgress(0);
        setActiveDownloads(0);
      }
    };

    checkActiveBatches();

    // Check periodically while downloading
    const interval = setInterval(checkActiveBatches, 1000);

    return () => {
      clearInterval(interval);
    };
  }, [mangaId]);

  const handleBatchDownload = async () => {
    if (chaptersToDownload.length === 0) {
      Alert.alert('No Chapters', 'No chapters available to download');
      return;
    }

    haptics.onPress();

    const downloadCount = chaptersToDownload.length;
    const message = selectedChapters
      ? `Download ${downloadCount} selected chapters?`
      : `Download all ${downloadCount} chapters?`;

    Alert.alert('Batch Download', message, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Download',
        onPress: async () => {
          try {
            setIsDownloading(true);
            onDownloadStart?.(downloadCount);

            // Prepare chapters for batch download
            const chaptersForBatch = chaptersToDownload.map((chapter) => ({
              mangaId,
              chapterNumber: chapter.number,
              chapterUrl: chapter.url,
            }));

            // Use batch manager for efficient downloading
            const result = await downloadBatchManager.downloadChaptersBatch(
              chaptersForBatch,
              {
                maxConcurrent: 2, // Limit concurrent downloads
                delayBetweenBatches: 1000, // 1 second delay between batches
                onProgress: (completed, total) => {
                  const progress = Math.round((completed / total) * 100);
                  setDownloadProgress(progress);
                  setActiveDownloads(total - completed);
                },
                onError: (error, _, chapterNumber) => {
                  console.error(
                    `Download failed for chapter ${chapterNumber}:`,
                    error
                  );
                },
              }
            );

            setIsDownloading(false);
            setDownloadProgress(0);
            setActiveDownloads(0);

            if (result.success) {
              Alert.alert(
                'Download Complete',
                `Successfully downloaded ${result.successfulDownloads} chapters`
              );
            } else {
              Alert.alert(
                'Download Completed with Errors',
                `Downloaded ${result.successfulDownloads} chapters successfully, ${result.failedDownloads} failed`
              );
            }
          } catch (error) {
            console.error('Error starting batch download:', error);
            setIsDownloading(false);
            setDownloadProgress(0);
            setActiveDownloads(0);
            onDownloadError?.(
              error instanceof Error
                ? error.message
                : 'Failed to start downloads'
            );
          }
        },
      },
    ]);
  };

  const handlePauseAll = async () => {
    try {
      haptics.onPress();
      await downloadQueueService.pauseQueue();
      setIsDownloading(false);
    } catch (error) {
      console.error('Error pausing downloads:', error);
      onDownloadError?.('Failed to pause downloads');
    }
  };

  const handleResumeAll = async () => {
    try {
      haptics.onPress();
      await downloadQueueService.resumeQueue();
      setIsDownloading(true);
    } catch (error) {
      console.error('Error resuming downloads:', error);
      onDownloadError?.('Failed to resume downloads');
    }
  };

  const getButtonText = () => {
    if (isDownloading) {
      return `${activeDownloads} downloading (${downloadProgress}%)`;
    }

    if (selectedChapters) {
      return `Download ${chaptersToDownload.length} selected`;
    }

    return `Download all ${chaptersToDownload.length} chapters`;
  };

  const getButtonIcon = (): keyof typeof Ionicons.glyphMap => {
    if (isDownloading) {
      return 'pause';
    }
    return 'download';
  };

  const handlePress = () => {
    if (isDownloading) {
      handlePauseAll();
    } else {
      handleBatchDownload();
    }
  };

  if (chaptersToDownload.length === 0) {
    return null;
  }

  return (
    <Pressable
      style={[styles.container, style]}
      onPress={handlePress}
      disabled={chaptersToDownload.length === 0}
    >
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          {isDownloading ? (
            <ActivityIndicator size={20} color={colors.primary} />
          ) : (
            <Ionicons name={getButtonIcon()} size={20} color={colors.primary} />
          )}
        </View>

        <View style={styles.textContainer}>
          <Text style={styles.buttonText} numberOfLines={1}>
            {getButtonText()}
          </Text>

          {isDownloading && (
            <View style={styles.progressContainer}>
              <View style={styles.progressBackground}>
                <View
                  style={[
                    styles.progressFill,
                    { width: `${downloadProgress}%` },
                  ]}
                />
              </View>
            </View>
          )}
        </View>

        {isDownloading && (
          <Pressable style={styles.resumeButton} onPress={handleResumeAll}>
            <Ionicons name="play" size={16} color={colors.text} />
          </Pressable>
        )}
      </View>
    </Pressable>
  );
};

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.card,
      borderRadius: 12,
      padding: 16,
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
    buttonText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    progressContainer: {
      marginTop: 4,
    },
    progressBackground: {
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 2,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: 2,
    },
    resumeButton: {
      padding: 8,
      borderRadius: 8,
      backgroundColor: colors.background,
      marginLeft: 8,
    },
  });

export default BatchDownloadButton;
