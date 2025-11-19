import React, { useState, useEffect, useRef, useMemo } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import { useHapticFeedback } from '@/utils/haptics';
import { downloadManagerService } from '@/services/downloadManager';
import { downloadStatusService } from '@/services/downloadStatusService';
import { downloadEventEmitter } from '@/utils/downloadEventEmitter';
import { DownloadStatus, DownloadProgress, DownloadErrorType } from '@/types/download';
import HiddenChapterWebView from './HiddenChapterWebView';
import { logger } from '@/utils/logger';
import { isDebugEnabled } from '@/constants/env';

interface DownloadButtonProps {
  mangaId: string;
  chapterNumber: string;
  chapterUrl: string;
  size?: 'small' | 'medium' | 'large';
  variant?: 'icon' | 'text' | 'full';
  appearance?: 'default' | 'swipe';
  onDownloadStart?: () => void;
  onDownloadComplete?: () => void;
  onDownloadError?: (error: string) => void;
  disabled?: boolean;
  style?: any;
}

const DownloadButton: React.FC<DownloadButtonProps> = ({
  mangaId,
  chapterNumber,
  chapterUrl,
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

  const log = logger();
  const [downloadStatus, setDownloadStatus] = useState<DownloadStatus>(
    DownloadStatus.QUEUED
  );
  const [progress, setProgress] = useState<number>(0);
  const [estimatedTime, setEstimatedTime] = useState<number | undefined>();
  const [isLoading, setIsLoading] = useState(true);
  const [showWebView, setShowWebView] = useState(false);

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;

  const loadDownloadStatus = React.useCallback(async () => {
    try {
      setIsLoading(true);
      
      // Use the new download status service for consistent status
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

        // Emit download completion event
        downloadEventEmitter.emitCompleted(mangaId, chapterNumber, generateDownloadId(mangaId, chapterNumber));
      } else if (progressUpdate.status === DownloadStatus.FAILED) {
        setDownloadStatus(DownloadStatus.FAILED);
        onDownloadError?.('Download failed');

        // Emit download failed event
        downloadEventEmitter.emitFailed(
          mangaId, 
          chapterNumber, 
          generateDownloadId(mangaId, chapterNumber),
          'Download failed'
        );
      }
    },
    [mangaId, chapterNumber, onDownloadComplete, onDownloadError]
  );

  // Load initial download status with throttling
  useEffect(() => {
    const timeoutId = setTimeout(() => {
      loadDownloadStatus();
    }, 100); // Small delay to prevent blocking

    return () => clearTimeout(timeoutId);
  }, [loadDownloadStatus]);

  // Set up progress listener when downloading
  useEffect(() => {
    if (downloadStatus === DownloadStatus.DOWNLOADING) {
      const downloadId = generateDownloadId(mangaId, chapterNumber);
      const unsubscribe = downloadManagerService.addProgressListener(
        downloadId,
        handleProgressUpdate
      );

      return () => {
        if (unsubscribe) {
          unsubscribe();
        }
        // Cleanup state
        setProgress(0);
        setEstimatedTime(undefined);
      };
    }
    return undefined;
  }, [downloadStatus, mangaId, chapterNumber, handleProgressUpdate]);

  useEffect(() => {
    const unsubscribe = downloadEventEmitter.subscribe(
      mangaId,
      chapterNumber,
      (event) => {
        if (event.type === 'download_paused') {
          setDownloadStatus(DownloadStatus.PAUSED);
          if (typeof event.progress === 'number') {
            setProgress(event.progress);
          }
        }

        if (event.type === 'download_resumed') {
          setDownloadStatus(DownloadStatus.DOWNLOADING);
          if (typeof event.progress === 'number') {
            setProgress(event.progress);
          }
          if (event.estimatedTimeRemaining !== undefined) {
            setEstimatedTime(event.estimatedTimeRemaining);
          }
        }

        if (event.type === 'download_started') {
          setDownloadStatus(DownloadStatus.DOWNLOADING);
          setProgress(0);
        }

        if (event.type === 'download_completed') {
          setDownloadStatus(DownloadStatus.COMPLETED);
          setProgress(100);
          onDownloadComplete?.();
        }

        if (event.type === 'download_failed') {
          setDownloadStatus(DownloadStatus.FAILED);
          onDownloadError?.(event.error || 'Download failed');
        }

        if (event.type === 'download_deleted') {
          setDownloadStatus(DownloadStatus.QUEUED);
          setProgress(0);
          setEstimatedTime(undefined);
        }

        if (event.type === 'download_progress') {
           if (downloadStatus !== DownloadStatus.DOWNLOADING) {
             setDownloadStatus(DownloadStatus.DOWNLOADING);
           }
           if (typeof event.progress === 'number') {
             setProgress(event.progress);
           }
           if (event.estimatedTimeRemaining !== undefined) {
             setEstimatedTime(event.estimatedTimeRemaining);
           }
        }
      }
    );

    return unsubscribe;
  }, [mangaId, chapterNumber, downloadStatus, onDownloadComplete, onDownloadError]);

  // Animate progress changes
  useEffect(() => {
    Animated.timing(progressAnim, {
      toValue: progress / 100,
      duration: 300,
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
          // Already downloaded, could show options or do nothing
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

    // Step 1: Open hidden WebView to intercept AJAX request
    if (isDebugEnabled()) {
      log.info('Service', 'Opening hidden WebView to intercept request', {
        chapterUrl,
      });
    }

    setShowWebView(true);
  };

  const handleRequestIntercepted = async (
    chapterId: string,
    vrfToken: string
  ) => {
    if (isDebugEnabled()) {
      log.info('Service', 'Request intercepted, starting download', {
        chapterId,
        vrfTokenPreview: vrfToken.substring(0, 30) + '...',
      });
    }

    // Hide WebView
    setShowWebView(false);

    // Step 2: Start actual download using intercepted data
    try {
      const downloadIdForChapter = generateDownloadId(mangaId, chapterNumber);

      const result =
        await downloadManagerService.downloadChapterFromInterceptedRequest(
          mangaId,
          chapterNumber,
          chapterId,
          vrfToken,
          chapterUrl
        );

      if (result.success) {
        setDownloadStatus(DownloadStatus.COMPLETED);
        setProgress(100);
        onDownloadComplete?.();

        if (isDebugEnabled()) {
          log.info('Service', 'Download completed successfully', {
            mangaId,
            chapterNumber,
          });
        }
      } else if (
        downloadManagerService.isDownloadPaused(downloadIdForChapter) ||
        result.error?.type === DownloadErrorType.CANCELLED ||
        result.error?.retryable
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

  const handleWebViewError = (error: string) => {
    if (isDebugEnabled()) {
      log.error('Service', 'WebView error', {
        error,
      });
    }

    setShowWebView(false);
    setDownloadStatus(DownloadStatus.FAILED);
    onDownloadError?.(`WebView error: ${error}`);
  };

  const handleWebViewTimeout = () => {
    if (isDebugEnabled()) {
      log.warn('Service', 'WebView timeout', {
        chapterUrl,
      });
    }

    setShowWebView(false);
    setDownloadStatus(DownloadStatus.FAILED);
    onDownloadError?.('Timeout waiting for chapter page to load');
  };

  const pauseDownload = async () => {
    const downloadId = generateDownloadId(mangaId, chapterNumber);
    await downloadManagerService.pauseDownload(downloadId);
    setDownloadStatus(DownloadStatus.PAUSED);
  };

  const resumeDownload = async () => {
    const downloadId = generateDownloadId(mangaId, chapterNumber);
    await downloadManagerService.resumeDownload(downloadId);
    setDownloadStatus(DownloadStatus.DOWNLOADING);
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
        return colors.primary;
      default:
        return colors.text;
    }
  };

  const getStatusText = () => {
    if (isLoading) return 'Loading...';

    switch (downloadStatus) {
      case DownloadStatus.QUEUED:
        return 'Download';
      case DownloadStatus.DOWNLOADING:
        return `${progress}%`;
      case DownloadStatus.PAUSED:
        return 'Paused';
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
    mangaId: string,
    chapterNumber: string
  ): string => {
    return `${mangaId}_${chapterNumber}`;
  };

  const renderIcon = () => {
    if (isLoading || downloadStatus === DownloadStatus.DOWNLOADING) {
      return (
        <ActivityIndicator
          size={size === 'small' ? 16 : size === 'large' ? 24 : 20}
          color={getIconColor()}
        />
      );
    }

    return (
      <Ionicons
        name={getIconName()}
        size={size === 'small' ? 16 : size === 'large' ? 24 : 20}
        color={getIconColor()}
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
      </View>
    );
  };

  const renderContent = () => {
    switch (variant) {
      case 'icon':
        return (
          <View style={styles.iconContainer}>
            {renderIcon()}
            {renderProgressBar()}
          </View>
        );

      case 'text':
        return (
          <View style={styles.textContainer}>
            <Text style={styles.statusText}>{getStatusText()}</Text>
            {estimatedTime !== undefined && downloadStatus === DownloadStatus.DOWNLOADING && (
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
    <>
      <Pressable
        onPress={handlePress}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        disabled={disabled || isLoading}
        style={[styles.container, style]}
        accessibilityRole="button"
        accessibilityLabel={`Download chapter ${chapterNumber}`}
        accessibilityHint={getStatusText()}
      >
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          {renderContent()}
        </Animated.View>
      </Pressable>

      {/* Hidden WebView for intercepting AJAX requests */}
      {showWebView && (
        <HiddenChapterWebView
          chapterUrl={chapterUrl}
          onRequestIntercepted={handleRequestIntercepted}
          onError={handleWebViewError}
          onTimeout={handleWebViewTimeout}
          timeout={30000}
        />
      )}
    </>
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
      justifyContent: 'center',
      alignItems: 'center',
      position: 'relative',
    },
    textContainer: {
      paddingHorizontal: isSwipe ? 0 : padding * 2,
      paddingVertical: isSwipe ? 0 : padding,
      minWidth: isSwipe ? undefined : 80,
      alignItems: 'center',
      position: 'relative',
    },
    fullContainer: {
      flexDirection: isSwipe ? 'column' : 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: isSwipe ? 0 : padding,
      paddingVertical: isSwipe ? 0 : padding,
      minWidth: isSwipe ? undefined : 120,
      position: 'relative',
      height: isSwipe ? '100%' : undefined,
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
    progressContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      height: 2,
    },
    progressBackground: {
      flex: 1,
      backgroundColor: isSwipe ? 'rgba(255, 255, 255, 0.3)' : colors.border,
    },
    progressFill: {
      height: '100%',
      backgroundColor: isSwipe ? '#ffffff' : colors.primary,
    },
  });
};

export default DownloadButton;
