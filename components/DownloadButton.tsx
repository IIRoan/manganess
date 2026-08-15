import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/hooks/useTheme';
import { useHapticFeedback } from '@/utils/haptics';
import { useToast } from '@/hooks/useToast';
import { useAtomValue } from '@zedux/react';
import { downloadManagerAtom } from '@/atoms/downloadManagerAtom';
import { downloadManagerService } from '@/services/downloadManager';
import { downloadStatusService } from '@/services/downloadStatusService';
import {
  DownloadStatus,
  DownloadProgress,
  DownloadErrorType,
} from '@/types/download';
import { logger } from '@/utils/logger';
import { isDebugEnabled } from '@/constants/env';

interface DownloadButtonProps {
  mangaId: string;
  chapterNumber: string;
  chapterUrl: string;
  mangaTitle?: string | undefined;
  size?: 'small' | 'medium' | 'large';
  variant?: 'icon' | 'text' | 'full';
  appearance?: 'default' | 'swipe';
  onDownloadStart?: () => void;
  onDownloadComplete?: () => void;
  onDownloadError?: (error: string) => void;
  disabled?: boolean;
  style?: any;
}

interface CircularProgressProps {
  size: number;
  progress: number;
  color: string;
  trackColor: string;
  children?: React.ReactNode;
}

function CircularProgress({
  size,
  progress,
  color,
  trackColor,
  children,
}: CircularProgressProps) {
  const strokeWidth = Math.max(2.5, size * 0.08);
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(100, progress));
  const strokeDashoffset = circumference * (1 - clamped / 100);
  const center = size / 2;

  return (
    <View
      style={{
        width: size,
        height: size,
        alignItems: 'center',
        justifyContent: 'center',
      }}
      accessibilityRole="progressbar"
      accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
    >
      <Svg
        width={size}
        height={size}
        style={StyleSheet.absoluteFill}
      >
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={trackColor}
          strokeWidth={strokeWidth}
          fill="none"
        />
        <Circle
          cx={center}
          cy={center}
          r={radius}
          stroke={color}
          strokeWidth={strokeWidth}
          fill="none"
          strokeDasharray={`${circumference} ${circumference}`}
          strokeDashoffset={strokeDashoffset}
          strokeLinecap="round"
          transform={`rotate(-90 ${center} ${center})`}
        />
      </Svg>
      {children}
    </View>
  );
}

const DownloadButton: React.FC<DownloadButtonProps> = ({
  mangaId,
  chapterNumber,
  chapterUrl,
  mangaTitle,
  size = 'medium',
  variant = 'icon',
  appearance = 'default',
  onDownloadStart,
  onDownloadComplete,
  onDownloadError,
  disabled = false,
  style,
}) => {
  const { theme, systemTheme } = useTheme();
  const colorScheme = theme === 'system' ? systemTheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const styles = useMemo(
    () => getStyles(colors, size, appearance),
    [colors, size, appearance]
  );
  const haptics = useHapticFeedback();
  const { showToast } = useToast();

  const log = logger();
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>(
    DownloadStatus.QUEUED
  );
  const [progress, setProgress] = useState<number>(0);
  const [estimatedTime, setEstimatedTime] = useState<number | undefined>();
  const [isLoading, setIsLoading] = useState(true);

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const dmState = useAtomValue(downloadManagerAtom);

  const loadDownloadStatus = React.useCallback(async () => {
    try {
      setIsLoading(true);

      const statusInfo = await downloadStatusService.getChapterDownloadStatus(
        mangaId,
        chapterNumber
      );

      setDownloadStatus(statusInfo.status);
      setProgress(statusInfo.progress);
      setEstimatedTime(statusInfo.estimatedTimeRemaining);
    } catch (error) {
      log.error('Service', 'Error loading download status', {
        mangaId,
        chapterNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      setDownloadStatus(DownloadStatus.QUEUED);
    } finally {
      setIsLoading(false);
    }
  }, [mangaId, chapterNumber, log]);

  const handleProgressUpdate = React.useCallback(
    (progressUpdate: DownloadProgress) => {
      setProgress(progressUpdate.progress);
      setEstimatedTime(progressUpdate.estimatedTimeRemaining);

      if (progressUpdate.status === DownloadStatus.COMPLETED) {
        setDownloadStatus(DownloadStatus.COMPLETED);
        onDownloadComplete?.();
      } else if (progressUpdate.status === DownloadStatus.FAILED) {
        setDownloadStatus(DownloadStatus.FAILED);
        onDownloadError?.('Download failed');
      }
    },
    [onDownloadComplete, onDownloadError]
  );

  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadDownloadStatus();
    }, 100);

    return () => clearTimeout(timeoutId);
  }, [loadDownloadStatus]);

  useEffect(() => {
    if (downloadStatus !== DownloadStatus.DOWNLOADING) {
      return undefined;
    }

    const downloadId = generateDownloadId(mangaId, chapterNumber);
    const unsubscribe = downloadManagerService.addProgressListener(
      downloadId,
      handleProgressUpdate
    );

    return () => {
      if (unsubscribe) {
        unsubscribe();
      }
    };
  }, [downloadStatus, mangaId, chapterNumber, handleProgressUpdate]);

  useEffect(() => {
    const downloadId = generateDownloadId(mangaId, chapterNumber);

    const activeProgress = dmState.activeDownloads.get(downloadId);
    if (activeProgress) {
      if (activeProgress.error) {
        setDownloadStatus(DownloadStatus.FAILED);
        onDownloadError?.(activeProgress.error.message);
      } else {
        setDownloadStatus(DownloadStatus.DOWNLOADING);
        setProgress(activeProgress.progress);
        setEstimatedTime(activeProgress.estimatedTimeRemaining);
      }
      return;
    }

    const pausedInfo = dmState.pausedDownloads.get(downloadId);
    if (pausedInfo) {
      setDownloadStatus(DownloadStatus.PAUSED);
      setProgress(pausedInfo.progress?.progress ?? 0);
    }
  }, [dmState, mangaId, chapterNumber, onDownloadError]);

  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress / 100,
      duration: 250,
      useNativeDriver: false,
    }).start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [progress]);

  const handlePress = async () => {
    if (disabled || isLoading) return;

    haptics.onPress();

    try {
      switch (downloadStatus) {
        case DownloadStatus.QUEUED:
        case DownloadStatus.FAILED:
          await startDownload();
          break;
        case DownloadStatus.DOWNLOADING:
          await pauseDownload();
          break;
        case DownloadStatus.PAUSED:
          await resumeDownload();
          break;
        case DownloadStatus.COMPLETED:
          break;
      }
    } catch (error) {
      log.error('Service', 'Download action error', {
        mangaId,
        chapterNumber,
        error: error instanceof Error ? error.message : String(error),
      });
      onDownloadError?.(
        error instanceof Error ? error.message : 'Unknown error'
      );
    }
  };

  const startDownload = async () => {
    if (isDebugEnabled()) {
      log.info('Service', 'Starting download process', {
        mangaId,
        chapterNumber,
        chapterUrl,
      });
    }

    setDownloadStatus(DownloadStatus.DOWNLOADING);
    setProgress(0);
    onDownloadStart?.();
    showToast({
      message: mangaTitle
        ? `Downloading ${mangaTitle} ch. ${chapterNumber}...`
        : `Downloading chapter ${chapterNumber}...`,
      type: 'info',
      icon: 'download',
      duration: 2000,
    });

    try {
      const downloadIdForChapter = generateDownloadId(mangaId, chapterNumber);
      const result = await downloadManagerService.downloadChapter(
        mangaId,
        chapterNumber,
        chapterUrl,
        mangaTitle
      );

      if (result.success) {
        setDownloadStatus(DownloadStatus.COMPLETED);
        setProgress(100);
        onDownloadComplete?.();
        const pageCount = result.chapterImages?.length;
        showToast({
          message: pageCount
            ? `Downloaded ch. ${chapterNumber} (${pageCount} pages)`
            : `Downloaded chapter ${chapterNumber}`,
          type: 'success',
          icon: 'checkmark-circle',
          duration: 2500,
        });
      } else if (
        downloadManagerService.isDownloadPaused(downloadIdForChapter) ||
        result.error?.type === DownloadErrorType.CANCELLED
      ) {
        setDownloadStatus(DownloadStatus.PAUSED);

        if (isDebugEnabled()) {
          log.info('Service', 'Download paused during processing', {
            mangaId,
            chapterNumber,
            reason: result.error?.message,
          });
        }
      } else {
        setDownloadStatus(DownloadStatus.FAILED);
        onDownloadError?.(result.error?.message || 'Download failed');

        if (isDebugEnabled()) {
          log.error('Service', 'Download failed', {
            error: result.error,
          });
        }
      }
    } catch (error) {
      setDownloadStatus(DownloadStatus.FAILED);
      onDownloadError?.(
        error instanceof Error ? error.message : 'Download failed'
      );

      if (isDebugEnabled()) {
        log.error('Service', 'Download exception', {
          error,
        });
      }
    }
  };

  const pauseDownload = async () => {
    const downloadId = generateDownloadId(mangaId, chapterNumber);
    await downloadManagerService.pauseDownload(downloadId);
    setDownloadStatus(DownloadStatus.PAUSED);
    showToast({
      message: `Chapter ${chapterNumber} download paused`,
      type: 'info',
      icon: 'pause',
      duration: 2000,
    });
  };

  const resumeDownload = async () => {
    const downloadId = generateDownloadId(mangaId, chapterNumber);
    await downloadManagerService.resumeDownload(downloadId);
    setDownloadStatus(DownloadStatus.DOWNLOADING);
    showToast({
      message: `Resuming download for chapter ${chapterNumber}`,
      type: 'info',
      icon: 'play',
      duration: 2000,
    });
  };

  const handlePressIn = () => {
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const getIconName = (): keyof typeof Ionicons.glyphMap => {
    if (isLoading) return 'ellipsis-horizontal';

    switch (downloadStatus) {
      case DownloadStatus.QUEUED:
      case DownloadStatus.FAILED:
        return 'download-outline';
      case DownloadStatus.DOWNLOADING:
        return 'pause-outline';
      case DownloadStatus.PAUSED:
        return 'play-outline';
      case DownloadStatus.COMPLETED:
        return 'checkmark-circle-outline';
      default:
        return 'download-outline';
    }
  };

  const getIconColor = () => {
    if (appearance === 'swipe') {
      if (disabled) return 'rgba(255, 255, 255, 0.6)';
      if (downloadStatus === DownloadStatus.FAILED) {
        return '#ffe3e3';
      }
      return '#ffffff';
    }

    if (disabled) return colors.tabIconDefault;

    switch (downloadStatus) {
      case DownloadStatus.COMPLETED:
        return colors.primary;
      case DownloadStatus.FAILED:
        return colors.error;
      case DownloadStatus.DOWNLOADING:
      case DownloadStatus.PAUSED:
        return colors.primary;
      default:
        return colors.text;
    }
  };

  const displayProgress = Math.round(Math.max(0, Math.min(100, progress)));

  const getStatusText = () => {
    if (isLoading) return 'Loading...';

    switch (downloadStatus) {
      case DownloadStatus.QUEUED:
        return 'Download';
      case DownloadStatus.DOWNLOADING:
        return `${displayProgress}%`;
      case DownloadStatus.PAUSED:
        return `${displayProgress}% · Paused`;
      case DownloadStatus.COMPLETED:
        return 'Downloaded';
      case DownloadStatus.FAILED:
        return 'Failed';
      default:
        return 'Download';
    }
  };

  const formatEstimatedTime = (seconds: number): string => {
    if (seconds < 60) return `${Math.round(seconds)}s`;
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = Math.round(seconds % 60);
    return `${minutes}m ${remainingSeconds}s`;
  };

  const generateDownloadId = (
    mangaIdValue: string,
    chapterNumberValue: string
  ): string => {
    return `${mangaIdValue}_${chapterNumberValue}`;
  };

  const ringSize = size === 'small' ? 28 : size === 'large' ? 40 : 34;
  const percentFontSize = size === 'small' ? 9 : size === 'large' ? 12 : 10;
  const iconColor = getIconColor();
  const trackColor =
    appearance === 'swipe' ? 'rgba(255, 255, 255, 0.28)' : colors.border + '99';

  const renderIcon = () => {
    if (isLoading) {
      return (
        <ActivityIndicator
          size={size === 'small' ? 16 : size === 'large' ? 24 : 20}
          color={iconColor}
        />
      );
    }

    if (
      downloadStatus === DownloadStatus.DOWNLOADING ||
      downloadStatus === DownloadStatus.PAUSED
    ) {
      return (
        <CircularProgress
          size={ringSize}
          progress={displayProgress}
          color={iconColor}
          trackColor={trackColor}
        >
          <Text
            style={[
              styles.progressPercent,
              {
                color: iconColor,
                fontSize: percentFontSize,
              },
            ]}
            numberOfLines={1}
          >
            {displayProgress}
            <Text style={{ fontSize: percentFontSize * 0.75 }}>%</Text>
          </Text>
        </CircularProgress>
      );
    }

    return (
      <Ionicons
        name={getIconName()}
        size={size === 'small' ? 16 : size === 'large' ? 24 : 20}
        color={iconColor}
      />
    );
  };

  const renderProgressBar = () => {
    if (
      downloadStatus !== DownloadStatus.DOWNLOADING &&
      downloadStatus !== DownloadStatus.PAUSED
    ) {
      return null;
    }

    // Icon/swipe uses the circular ring — no thin underline bar.
    if (variant === 'icon') {
      return null;
    }

    return (
      <View style={styles.progressContainer}>
        <View style={styles.progressBackground}>
          <Animated.View
            style={[
              styles.progressFill,
              {
                width: progressAnim.interpolate({
                  inputRange: [0, 1],
                  outputRange: ['0%', '100%'],
                }),
              },
            ]}
          />
        </View>
        <Text style={styles.progressLabel}>{displayProgress}%</Text>
      </View>
    );
  };

  const renderContent = () => {
    switch (variant) {
      case 'icon':
        return <View style={styles.iconContainer}>{renderIcon()}</View>;

      case 'text':
        return (
          <View style={styles.textContainer}>
            <Text style={styles.statusText}>{getStatusText()}</Text>
            {estimatedTime !== undefined &&
              downloadStatus === DownloadStatus.DOWNLOADING && (
                <Text style={styles.estimatedTimeText}>
                  {formatEstimatedTime(estimatedTime)}
                </Text>
              )}
            {renderProgressBar()}
          </View>
        );

      case 'full':
        return (
          <View style={styles.fullContainer}>
            {renderIcon()}
            <View style={styles.textSection}>
              <Text style={styles.statusText}>{getStatusText()}</Text>
              {estimatedTime !== undefined &&
                downloadStatus === DownloadStatus.DOWNLOADING && (
                  <Text style={styles.estimatedTimeText}>
                    {formatEstimatedTime(estimatedTime)}
                  </Text>
                )}
            </View>
            {renderProgressBar()}
          </View>
        );

      default:
        return renderIcon();
    }
  };

  return (
    <Pressable
      onPress={handlePress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
      disabled={disabled || isLoading}
      style={[styles.container, style]}
      accessibilityRole="button"
      accessibilityLabel={
        downloadStatus === DownloadStatus.DOWNLOADING
          ? `Downloading chapter ${chapterNumber}, ${displayProgress} percent. Tap to pause`
          : `Download chapter ${chapterNumber}`
      }
      accessibilityHint={getStatusText()}
      accessibilityValue={
        downloadStatus === DownloadStatus.DOWNLOADING ||
        downloadStatus === DownloadStatus.PAUSED
          ? { min: 0, max: 100, now: displayProgress }
          : undefined
      }
    >
      <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
        {renderContent()}
      </Animated.View>
    </Pressable>
  );
};

const getStyles = (
  colors: typeof Colors.light,
  size: 'small' | 'medium' | 'large',
  appearance: 'default' | 'swipe'
) => {
  const baseSize = size === 'small' ? 32 : size === 'large' ? 48 : 40;
  const padding = size === 'small' ? 6 : size === 'large' ? 12 : 8;
  const isSwipe = appearance === 'swipe';

  return StyleSheet.create({
    container: {
      borderRadius: isSwipe ? 0 : 8,
      backgroundColor: isSwipe ? 'transparent' : colors.card,
      borderWidth: isSwipe ? 0 : 1,
      borderColor: isSwipe ? 'transparent' : colors.border,
      overflow: isSwipe ? 'visible' : 'hidden',
      width: isSwipe ? '100%' : undefined,
      height: isSwipe ? '100%' : undefined,
      flex: isSwipe ? 1 : undefined,
      alignItems: isSwipe ? 'center' : undefined,
      justifyContent: isSwipe ? 'center' : undefined,
    },
    iconContainer: {
      width: isSwipe ? 'auto' : baseSize,
      height: isSwipe ? 'auto' : baseSize,
      minWidth: isSwipe ? ringSizeFor(size) : baseSize,
      minHeight: isSwipe ? ringSizeFor(size) : baseSize,
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
    },
    textContainer: {
      paddingHorizontal: isSwipe ? 0 : padding * 2,
      paddingVertical: isSwipe ? 0 : padding,
      minWidth: isSwipe ? undefined : 96,
      alignItems: 'center',
      position: 'relative',
      gap: 6,
    },
    fullContainer: {
      flexDirection: isSwipe ? 'column' : 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: isSwipe ? 0 : padding,
      paddingVertical: isSwipe ? 0 : padding,
      minWidth: isSwipe ? undefined : 140,
      position: 'relative',
      height: isSwipe ? '100%' : undefined,
      gap: 8,
      flexWrap: 'wrap',
    },
    textSection: {
      marginLeft: isSwipe ? 0 : 8,
      marginTop: isSwipe ? 6 : 0,
      flex: isSwipe ? undefined : 1,
      alignItems: isSwipe ? 'center' : undefined,
    },
    statusText: {
      fontSize: size === 'small' ? 12 : size === 'large' ? 16 : 14,
      fontWeight: '600',
      color: isSwipe ? '#ffffff' : colors.text,
      textAlign: 'center',
    },
    estimatedTimeText: {
      fontSize: size === 'small' ? 10 : size === 'large' ? 12 : 11,
      color: isSwipe ? 'rgba(255, 255, 255, 0.8)' : colors.tabIconDefault,
      textAlign: 'center',
      marginTop: 2,
    },
    progressPercent: {
      fontWeight: '700',
      fontVariant: ['tabular-nums'],
      textAlign: 'center',
    },
    progressContainer: {
      width: '100%',
      gap: 4,
    },
    progressBackground: {
      height: 6,
      borderRadius: 999,
      overflow: 'hidden',
      backgroundColor: isSwipe ? 'rgba(255, 255, 255, 0.28)' : colors.border,
    },
    progressFill: {
      height: '100%',
      borderRadius: 999,
      backgroundColor: isSwipe ? '#ffffff' : colors.primary,
    },
    progressLabel: {
      fontSize: 11,
      fontWeight: '600',
      fontVariant: ['tabular-nums'],
      color: isSwipe ? 'rgba(255, 255, 255, 0.9)' : colors.tabIconDefault,
      textAlign: 'right',
    },
  });
};

function ringSizeFor(size: 'small' | 'medium' | 'large'): number {
  return size === 'small' ? 28 : size === 'large' ? 40 : 34;
}

export default DownloadButton;
