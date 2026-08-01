const IMAGE_RETRY_DELAYS_MS = [2000, 5000, 10000] as const;

/** Maximum automatic retry attempts before requiring a manual tap-to-retry. */
export const IMAGE_MAX_AUTO_RETRIES = IMAGE_RETRY_DELAYS_MS.length;

/**
 * Exponential-ish backoff for chapter page image retries.
 * Transient CDN 403/429s usually clear within a few seconds.
 */
export function getImageRetryDelayMs(attempt: number): number {
  const index = Math.min(
    Math.max(attempt - 1, 0),
    IMAGE_RETRY_DELAYS_MS.length - 1
  );
  return IMAGE_RETRY_DELAYS_MS[index] ?? IMAGE_RETRY_DELAYS_MS[0];
}
