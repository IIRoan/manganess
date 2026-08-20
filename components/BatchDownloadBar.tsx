import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, type ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/hooks/useTheme';
import { useToast } from '@/hooks/useToast';
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
  /** Optional style override for the compact header trigger. */
  buttonStyle?: StyleProp<ViewStyle>;
  children: (slots: {
    button: React.ReactNode;
    progressBanner: React.ReactNode;
  }) => React.ReactNode;
}

const BatchDownloadBar: React.FC<BatchDownloadBarProps> = ({
  mangaId,
  mangaTitle,
  chapters,
  downloadedChapters,
  onDownloadsChanged,
  buttonStyle,
  children,
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
    onBatchFinished: handleDownloadsChanged,
  });

  const [plannerVisible, setPlannerVisible] = useState(false);
  const [isManagingDownloads, setIsManagingDownloads] = useState(false);
  const [previousStatus, setPreviousStatus] = useState<string>(state.status);

  useEffect(() => {
    if (
      previousStatus === 'downloading' &&
      (state.status === 'completed' || state.status === 'error')
    ) {
      if (state.failedChapters.length > 0) {
        showToast({
          message: `Downloaded with ${state.failedChapters.length} failure${state.failedChapters.length === 1 ? '' : 's'}`,
          type: 'warning',
          icon: 'warning',
          duration: 3000,
        });
      } else {
        showToast({
          message: 'Batch download completed',
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

  const downloadedCount = downloadedChapters?.length ?? 0;
  const hasFailures = state.failedChapters.length > 0;
  const isBusy = state.status === 'preparing' || state.status === 'downloading';
  const isProcessing = isBusy || isManagingDownloads;

  const buttonLabel = useMemo(() => {
    if (state.status === 'preparing') return null;
    if (state.status === 'downloading') {
      return `${Math.max(0, Math.min(100, Math.round(state.progress)))}`;
    }
    if (isManagingDownloads) return null;
    if (hasFailures) return '!';
    return null;
  }, [
    hasFailures,
    isManagingDownloads,
    state.progress,
    state.status,
  ]);

  const openPlanner = () => {
    if (isProcessing) return;
    setPlannerVisible(true);
  };

  const handlePlannerDownloadConfirm = (
    selection: Chapter[],
    _summary: string
  ) => {
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

  const button = (
    <TouchableOpacity
      onPress={openPlanner}
      disabled={isProcessing}
      style={[
        styles.triggerButton,
        isProcessing && styles.triggerButtonDisabled,
        buttonStyle,
      ]}
      accessibilityRole="button"
      accessibilityState={{ disabled: isProcessing, busy: isBusy }}
      accessibilityLabel={
        downloadedCount > 0
          ? 'Manage offline downloads'
          : 'Configure offline downloads'
      }
    >
      {isProcessing && state.status !== 'downloading' ? (
        <ActivityIndicator size="small" color={colors.primary} />
      ) : (
        <Ionicons
          name={
            hasFailures
              ? 'warning-outline'
              : downloadedCount > 0
                ? 'cloud-done-outline'
                : 'download-outline'
          }
          size={18}
          color={hasFailures ? colors.error : colors.primary}
        />
      )}
      {buttonLabel ? (
        <View
          style={[
            styles.triggerBadge,
            hasFailures ? styles.triggerBadgeError : null,
          ]}
        >
          <Text style={styles.triggerBadgeText}>{buttonLabel}</Text>
        </View>
      ) : null}
    </TouchableOpacity>
  );

  const progressBanner =
    isBusy || hasFailures ? (
      <View
        style={styles.progressBanner}
        accessibilityRole="progressbar"
        accessibilityLabel={
          state.status === 'downloading'
            ? `Downloading chapters, ${state.completedChapters} of ${state.totalChapters} complete`
            : hasFailures
              ? `${state.failedChapters.length} chapter downloads failed`
              : 'Preparing chapter downloads'
        }
      >
        <View style={styles.progressBannerHeader}>
          <Text style={styles.progressBannerLabel} numberOfLines={1}>
            {state.status === 'preparing'
              ? 'Preparing downloads…'
              : state.status === 'downloading'
                ? state.message ||
                  `Downloading ${state.completedChapters}/${state.totalChapters}`
                : hasFailures
                  ? `${state.failedChapters.length} chapter${
                      state.failedChapters.length === 1 ? '' : 's'
                    } failed`
                  : 'Download status'}
          </Text>
          {state.status === 'downloading' ? (
            <Text style={styles.progressBannerPercent}>
              {Math.max(0, Math.min(100, Math.round(state.progress)))}%
            </Text>
          ) : null}
        </View>

        {state.status === 'downloading' ? (
          <>
            <View style={styles.progressTrack}>
              <View
                style={[
                  styles.progressFill,
                  {
                    width: `${Math.max(0, Math.min(100, state.progress))}%`,
                  },
                ]}
              />
            </View>
            <View style={styles.progressBannerFooter}>
              <Text style={styles.progressBannerHint}>
                {remainingChapters} remaining
              </Text>
              <TouchableOpacity
                onPress={cancelBatchDownload}
                accessibilityRole="button"
                accessibilityLabel="Cancel batch download"
                hitSlop={8}
              >
                <Text style={styles.cancelText}>Cancel</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}

        {hasFailures && state.status !== 'downloading' ? (
          <TouchableOpacity
            style={styles.retryRow}
            onPress={retryFailedChapters}
            accessibilityRole="button"
            accessibilityLabel="Retry failed chapter downloads"
          >
            <Ionicons
              name="refresh-outline"
              size={14}
              color={colors.primary}
            />
            <Text style={styles.retryText}>Retry failed chapters</Text>
          </TouchableOpacity>
        ) : null}
      </View>
    ) : null;

  return (
    <>
      {children({ button, progressBanner })}
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
    </>
  );
};

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    triggerButton: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: 10,
      backgroundColor: colors.background,
    },
    triggerButtonDisabled: {
      opacity: 0.5,
    },
    triggerBadge: {
      position: 'absolute',
      top: -4,
      right: -4,
      minWidth: 18,
      height: 16,
      paddingHorizontal: 4,
      borderRadius: 8,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    triggerBadgeError: {
      backgroundColor: colors.error,
    },
    triggerBadgeText: {
      fontSize: 9,
      fontWeight: '700',
      color: colors.background,
    },
    progressBanner: {
      marginBottom: 10,
      padding: 10,
      borderRadius: 8,
      backgroundColor: colors.background,
      gap: 8,
    },
    progressBannerHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    progressBannerLabel: {
      flex: 1,
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
    },
    progressBannerPercent: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.primary,
    },
    progressTrack: {
      height: 6,
      borderRadius: 999,
      backgroundColor: colors.border,
      overflow: 'hidden',
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: colors.primary,
    },
    progressBannerFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    progressBannerHint: {
      fontSize: 11,
      color: colors.text,
      opacity: 0.7,
    },
    cancelText: {
      fontSize: 12,
      fontWeight: '700',
      color: colors.error,
    },
    retryRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    retryText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
  });

export default BatchDownloadBar;
