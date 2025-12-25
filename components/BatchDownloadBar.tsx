import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, type ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import { useToast } from '@/contexts/ToastContext';
import { useBatchDownload } from '@/hooks/useBatchDownload';
import BatchDownloadPlannerModal from '@/components/BatchDownloadPlannerModal';
import type { Chapter } from '@/types';
import { chapterStorageService } from '@/services/chapterStorageService';
import { sortChaptersByNumber } from '@/utils/chapterOrdering';
import { logger } from '@/utils/logger';

interface BatchDownloadBarProps {
  mangaId: string;
  mangaTitle: string;
  chapters: Chapter[];
  downloadedChapters: string[];
  onDownloadsChanged?: () => void | Promise<void>;
}

const BatchDownloadBar: React.FC<BatchDownloadBarProps> = ({
  mangaId,
  mangaTitle,
  chapters,
  downloadedChapters,
  onDownloadsChanged,
}) => {
  const log = logger();
  const { theme, systemTheme } = useTheme();
  const colorScheme = theme === 'system' ? systemTheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);
  const { showToast } = useToast();

  const handleDownloadsChanged = useCallback(() => {
    if (!onDownloadsChanged) return;
    const maybePromise = onDownloadsChanged();
    if (
      maybePromise &&
      typeof (maybePromise as Promise<void>).then === 'function'
    ) {
      void (maybePromise as Promise<void>).catch(() => {
        // ignore errors from downstream refresh callbacks
      });
    }
  }, [onDownloadsChanged]);

  const {
    state,
    startBatchDownload,
    cancelBatchDownload,
    retryFailedChapters,
    remainingChapters,
  } = useBatchDownload(mangaId, mangaTitle, chapters, {
    onChapterDownloaded: handleDownloadsChanged,
    onBatchFinished: handleDownloadsChanged,
  });

  const [plannerVisible, setPlannerVisible] = useState(false);
  const [planSummary, setPlanSummary] = useState<string | null>(null);
  const [isManagingDownloads, setIsManagingDownloads] = useState(false);
  const [previousStatus, setPreviousStatus] = useState<string>(state.status);

  // Show toast when batch download completes
  useEffect(() => {
    if (previousStatus === 'downloading' && state.status === 'idle') {
      if (state.failedChapters.length > 0) {
        showToast({
          message: `Downloaded with ${state.failedChapters.length} failure${state.failedChapters.length === 1 ? '' : 's'}`,
          type: 'warning',
          icon: 'warning',
          duration: 3000,
        });
      } else {
        showToast({
          message: `Batch download completed successfully!`,
          type: 'success',
          icon: 'checkmark-circle',
          duration: 2500,
        });
      }
    }
    setPreviousStatus(state.status);
  }, [state.status, state.failedChapters.length, showToast, previousStatus]);

  const downloadedChapterDetails = useMemo(() => {
    if (!chapters?.length || !downloadedChapters?.length) {
      return [] as Chapter[];
    }

    const downloadedSet = new Set(downloadedChapters);
    return sortChaptersByNumber(
      chapters.filter((chapter) => downloadedSet.has(chapter.number))
    );
  }, [chapters, downloadedChapters]);

  const totalChapters = chapters?.length ?? 0;
  const downloadedCount = downloadedChapters?.length ?? 0;
  const missingCount = Math.max(totalChapters - downloadedCount, 0);

  const hasFailures = state.failedChapters.length > 0;
  const isBusy = state.status === 'preparing' || state.status === 'downloading';
  const isProcessing = isBusy || isManagingDownloads;

  const plannerLabel = useMemo(() => {
    if (state.status === 'preparing') return 'Preparing…';
    if (state.status === 'downloading') return 'Downloading…';
    if (isManagingDownloads) return 'Processing…';
    return downloadedCount > 0 ? 'Manage downloads' : 'Configure downloads';
  }, [downloadedCount, isManagingDownloads, state.status]);

  const subtitle = useMemo(() => {
    if (state.message) return state.message;
    if (planSummary) return planSummary;
    if (missingCount === 0) {
      return 'All chapters are ready for offline reading.';
    }
    if (missingCount > 0) {
      return `Ready to download ${missingCount} chapter${missingCount === 1 ? '' : 's'} for offline reading.`;
    }
    return 'Prepare all chapters for offline reading.';
  }, [missingCount, planSummary, state.message]);

  const openPlanner = () => {
    if (isProcessing) return;
    setPlannerVisible(true);
  };

  const handlePlannerDownloadConfirm = (
    selection: Chapter[],
    summary: string
  ) => {
    setPlanSummary(summary);
    setPlannerVisible(false);
    showToast({
      message: `Starting download of ${selection.length} chapter${selection.length === 1 ? '' : 's'}...`,
      type: 'info',
      icon: 'download',
      duration: 2500,
    });
    void startBatchDownload(selection);
  };

  const handlePlannerDeleteConfirm = async (selection: Chapter[]) => {
    if (!selection.length) {
      setPlannerVisible(false);
      return;
    }

    setPlannerVisible(false);
    setIsManagingDownloads(true);
    try {
      await Promise.all(
        selection.map((chapter) =>
          chapterStorageService.deleteChapter(mangaId, chapter.number)
        )
      );

      setPlanSummary(
        `Removed ${selection.length} offline chapter${
          selection.length === 1 ? '' : 's'
        }`
      );
      showToast({
        message: `Deleted ${selection.length} chapter${selection.length === 1 ? '' : 's'}`,
        type: 'success',
        icon: 'checkmark-circle',
        duration: 2500,
      });
      handleDownloadsChanged();
    } catch (error) {
      log.error('Service', 'Failed to delete offline chapters', {
        mangaId,
        chapterNumbers: selection.map((chapter) => chapter.number),
        error: error instanceof Error ? error.message : String(error),
      });
      setPlanSummary('Failed to remove downloads');
      showToast({
        message: 'Failed to delete chapters',
        type: 'error',
        icon: 'close-circle',
        duration: 3000,
      });
    } finally {
      setIsManagingDownloads(false);
    }
  };

  return (
    <View style={styles.container}>
      <View style={styles.headerRow}>
        <Ionicons name="download-outline" size={20} color={colors.primary} />
        <Text style={styles.headerText}>Offline download manager</Text>
      </View>

      <Text style={styles.subtitle}>{subtitle}</Text>

      {state.status === 'downloading' ? (
        <View style={styles.progressWrapper}>
          <View style={styles.progressBackground}>
            <View
              style={[styles.progressFill, { width: `${state.progress}%` }]}
            />
          </View>
          <View style={styles.progressStatsRow}>
            <Text style={styles.progressStat}>
              {state.completedChapters}/{state.totalChapters} completed
            </Text>
            <Text style={styles.progressStat}>
              {remainingChapters} remaining
            </Text>
          </View>
        </View>
      ) : null}

      {state.status !== 'downloading' ? (
        <View style={styles.statsRow}>
          <Text style={styles.statText}>
            Downloaded{' '}
            <Text style={styles.statHighlight}>{downloadedCount}</Text> of{' '}
            {totalChapters}
          </Text>
        </View>
      ) : null}

      {hasFailures ? (
        <View style={styles.failureBadge}>
          <Ionicons name="warning-outline" size={16} color={colors.error} />
          <Text style={styles.failureText}>
            {state.failedChapters.length} chapter
            {state.failedChapters.length === 1 ? '' : 's'} failed
          </Text>
        </View>
      ) : null}

      <View style={styles.actionsRow}>
        <TouchableOpacity
          style={[
            styles.primaryButton,
            isProcessing && styles.primaryButtonDisabled,
          ]}
          activeOpacity={0.85}
          onPress={openPlanner}
          disabled={isProcessing}
        >
          {isProcessing ? (
            <ActivityIndicator size="small" color={colors.background} />
          ) : (
            <Text style={styles.primaryButtonText}>{plannerLabel}</Text>
          )}
        </TouchableOpacity>

        {state.status === 'downloading' ? (
          <TouchableOpacity
            style={styles.secondaryButton}
            onPress={cancelBatchDownload}
            activeOpacity={0.8}
          >
            <Text style={styles.secondaryButtonText}>Cancel</Text>
          </TouchableOpacity>
        ) : null}
      </View>

      {hasFailures ? (
        <TouchableOpacity
          style={styles.retryButton}
          onPress={retryFailedChapters}
          activeOpacity={0.85}
        >
          <Ionicons name="refresh-outline" size={16} color={colors.primary} />
          <Text style={styles.retryButtonText}>Retry failed chapters</Text>
        </TouchableOpacity>
      ) : null}

      <BatchDownloadPlannerModal
        visible={plannerVisible}
        onClose={() => setPlannerVisible(false)}
        chapters={chapters}
        downloadedChapters={downloadedChapterDetails}
        onDownloadConfirm={handlePlannerDownloadConfirm}
        onDeleteConfirm={handlePlannerDeleteConfirm}
        initialTab={downloadedChapterDetails.length > 0 ? 'manage' : 'download'}
        isProcessing={isProcessing}
      />
    </View>
  );
};

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    container: {
      backgroundColor: colors.card,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 16,
      padding: 16,
      marginBottom: 16,
      shadowColor: '#000',
      shadowOpacity: 0.05,
      shadowRadius: 6,
      shadowOffset: { width: 0, height: 4 },
      elevation: 3,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
      marginBottom: 8,
    },
    headerText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    subtitle: {
      fontSize: 14,
      color: colors.tabIconDefault,
      marginBottom: 12,
    },
    progressWrapper: {
      marginBottom: 12,
    },
    progressBackground: {
      height: 8,
      backgroundColor: colors.border,
      borderRadius: 4,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: 4,
    },
    progressStatsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 6,
    },
    progressStat: {
      fontSize: 12,
      color: colors.tabIconDefault,
    },
    statsRow: {
      flexDirection: 'row',
      justifyContent: 'flex-start',
      marginBottom: 12,
    },
    statText: {
      fontSize: 13,
      color: colors.tabIconDefault,
    },
    statHighlight: {
      color: colors.text,
      fontWeight: '600',
    },
    failureBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      backgroundColor: colors.error + '14',
      borderRadius: 12,
      paddingHorizontal: 10,
      paddingVertical: 6,
      marginBottom: 12,
    },
    failureText: {
      fontSize: 12,
      color: colors.error,
      fontWeight: '600',
    },
    actionsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    primaryButton: {
      flex: 1,
      backgroundColor: colors.primary,
      borderRadius: 10,
      paddingVertical: 12,
      alignItems: 'center',
      justifyContent: 'center',
    },
    primaryButtonDisabled: {
      backgroundColor: colors.border,
    },
    primaryButtonText: {
      color: colors.background,
      fontSize: 15,
      fontWeight: '600',
    },
    secondaryButton: {
      paddingVertical: 10,
      paddingHorizontal: 16,
    },
    secondaryButtonText: {
      color: colors.error,
      fontWeight: '600',
    },
    retryButton: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginTop: 12,
    },
    retryButtonText: {
      color: colors.primary,
      fontWeight: '600',
      fontSize: 13,
    },
  });

export default BatchDownloadBar;
