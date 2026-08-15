import {
  useState,
  useEffect,
  useRef,
  useCallback,
  useMemo,
} from 'react';
import {
  Text,
  StyleSheet,
  Pressable,
  StyleProp,
  ImageStyle,
} from 'react-native';
import { Image, type ImageContentFit } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { logger } from '@/utils/logger';
import {
  getImageRetryDelayMs,
  IMAGE_MAX_AUTO_RETRIES,
} from '@/utils/imageRetry';
import {
  downloadReaderImage,
  getCachedReaderImageUri,
} from '@/utils/readerImageDownload';
import type { MangaImageSource } from '@/utils/mangaImageHeaders';

export type ReaderImageStatus = 'loading' | 'loaded' | 'failed';

/** Failed pages keep retrying slowly — a hard failure blocks the strip. */
const FAILED_AUTO_RETRY_DELAY_MS = 20000;
const FAILED_AUTO_RETRY_MAX = 12;

export type ReaderImageStatusHandler = (
  pageNumber: number,
  status: ReaderImageStatus,
  /** Local file URI when the manual download fallback produced one. */
  localUri?: string
) => void;

interface ReaderRetryImageProps {
  source: MangaImageSource;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  cachePolicy?: 'none' | 'disk' | 'memory' | 'memory-disk';
  pageNumber: number;
  /** Height used for the failure placeholder so the strip keeps its layout. */
  fallbackHeight: number;
  colors: typeof Colors.light;
  /** Bump to force every failed page to retry (retry-all banner). */
  retryToken?: number | undefined;
  onStatusChange?: ReaderImageStatusHandler | undefined;
}

/**
 * Chapter page image that retries transient CDN failures with backoff.
 * Each retry remounts expo-image (via key) so a cached failure is not reused.
 * After automatic retries are exhausted the user can tap to retry.
 */
export default function ReaderRetryImage({
  source,
  style,
  contentFit = 'contain',
  cachePolicy = 'memory-disk',
  pageNumber,
  fallbackHeight,
  colors,
  retryToken,
  onStatusChange,
}: ReaderRetryImageProps) {
  const [status, setStatus] = useState<ReaderImageStatus>('loading');
  const [retryKey, setRetryKey] = useState(0);
  const [localUri, setLocalUri] = useState<string | null>(null);
  const attemptRef = useRef(0);
  const failedAutoRetryRef = useRef(0);
  const generationRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const styles = useMemo(() => getStyles(colors), [colors]);

  const reportStatus = useCallback(
    (next: ReaderImageStatus, resolvedLocalUri?: string) => {
      setStatus(next);
      onStatusChange?.(pageNumber, next, resolvedLocalUri);
    },
    [onStatusChange, pageNumber]
  );

  const clearRetryTimeout = useCallback(() => {
    if (retryTimeoutRef.current) {
      clearTimeout(retryTimeoutRef.current);
      retryTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    generationRef.current += 1;
    attemptRef.current = 0;
    failedAutoRetryRef.current = 0;
    setRetryKey(0);
    // Reuse a file from a previous manual download (e.g. revisiting a chapter).
    const cached = source.uri.startsWith('http')
      ? getCachedReaderImageUri(source.uri)
      : null;
    setLocalUri(cached);
    reportStatus(cached ? 'loaded' : 'loading', cached ?? undefined);
    return clearRetryTimeout;
  }, [source.uri, reportStatus, clearRetryTimeout]);

  // Restart the full load chain without clearing the auto-retry budget.
  const restartLoading = useCallback(() => {
    clearRetryTimeout();
    attemptRef.current = 0;
    setLocalUri(null);
    reportStatus('loading');
    setRetryKey((current) => current + 1);
  }, [clearRetryTimeout, reportStatus]);

  const handleManualRetry = useCallback(() => {
    failedAutoRetryRef.current = 0;
    restartLoading();
  }, [restartLoading]);

  // Last resort: download the bytes ourselves with axios (long timeout),
  // write to the cache dir, and render the local file.
  const attemptManualDownload = useCallback(async () => {
    const generation = generationRef.current;
    logger().warn('UI', 'Falling back to manual reader image download', {
      pageNumber,
    });
    try {
      const uri = await downloadReaderImage(source.uri);
      if (generation !== generationRef.current) return;
      attemptRef.current = 0;
      failedAutoRetryRef.current = 0;
      setLocalUri(uri);
      reportStatus('loaded', uri);
    } catch (error) {
      if (generation !== generationRef.current) return;
      logger().error('UI', 'Reader image failed after retries and download', {
        pageNumber,
        error,
      });
      reportStatus('failed');
      // Sequential reading blocks at this page — keep recovering on our own.
      if (failedAutoRetryRef.current < FAILED_AUTO_RETRY_MAX) {
        failedAutoRetryRef.current += 1;
        retryTimeoutRef.current = setTimeout(() => {
          retryTimeoutRef.current = null;
          restartLoading();
        }, FAILED_AUTO_RETRY_DELAY_MS);
      }
    }
  }, [source.uri, pageNumber, reportStatus, restartLoading]);

  const handleError = useCallback(() => {
    if (localUri) {
      // The local file itself failed to decode — nothing left to try.
      reportStatus('failed');
      return;
    }

    attemptRef.current += 1;

    if (attemptRef.current < IMAGE_MAX_AUTO_RETRIES) {
      const delayMs = getImageRetryDelayMs(attemptRef.current);
      // Transient CDN timeouts/403s are expected — retry quietly.
      logger().warn('UI', 'Reader image failed, retrying', {
        pageNumber,
        attempt: attemptRef.current,
        retryInMs: delayMs,
      });
      retryTimeoutRef.current = setTimeout(() => {
        retryTimeoutRef.current = null;
        setRetryKey((current) => current + 1);
      }, delayMs);
      return;
    }

    attemptManualDownload();
  }, [localUri, pageNumber, attemptManualDownload, reportStatus]);

  const handleLoad = useCallback(() => {
    attemptRef.current = 0;
    failedAutoRetryRef.current = 0;
    reportStatus('loaded', localUri ?? undefined);
  }, [localUri, reportStatus]);

  const lastRetryTokenRef = useRef(retryToken);
  useEffect(() => {
    if (retryToken !== lastRetryTokenRef.current) {
      lastRetryTokenRef.current = retryToken;
      if (status === 'failed') {
        handleManualRetry();
      }
    }
  }, [retryToken, status, handleManualRetry]);

  if (status === 'failed') {
    return (
      <Pressable
        style={[
          styles.placeholder,
          { height: Math.max(fallbackHeight, 120) },
        ]}
        onPress={handleManualRetry}
        accessibilityRole="button"
        accessibilityLabel={`Page ${pageNumber} failed to load. Tap to retry.`}
      >
        <Ionicons
          name="cloud-offline-outline"
          size={28}
          color={colors.secondaryText}
        />
        <Text style={styles.placeholderText}>Page {pageNumber} failed to load</Text>
        <Text style={styles.placeholderHint}>Tap to retry</Text>
      </Pressable>
    );
  }

  const activeSource: MangaImageSource = localUri ? { uri: localUri } : source;

  return (
    <Image
      key={`${retryKey}-${localUri ? 'local' : 'remote'}`}
      source={activeSource}
      style={style}
      contentFit={contentFit}
      cachePolicy={cachePolicy}
      transition={200}
      onLoad={handleLoad}
      onError={handleError}
    />
  );
}

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    placeholder: {
      width: '100%',
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.card,
      borderRadius: 8,
      marginVertical: 4,
      gap: 6,
    },
    placeholderText: {
      color: colors.text,
      fontSize: 14,
      fontWeight: '600',
    },
    placeholderHint: {
      color: colors.secondaryText,
      fontSize: 12,
    },
  });
