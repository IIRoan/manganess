const RATE_LIMIT_DELAYS_MS = [5000, 15000, 30000, 45000] as const;

export const RATE_LIMIT_USING_CACHE_MESSAGE =
  'MangaFire is busy — showing your saved data. Try refreshing in a minute.';

export const RATE_LIMIT_NO_CACHE_MESSAGE =
  'MangaFire is temporarily limiting requests. Please wait a minute and try again.';

export function isRateLimitError(error: unknown): boolean {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const axiosError = error as {
    response?: { status?: number };
    message?: string;
  };

  return (
    axiosError.response?.status === 429 ||
    String(axiosError.message ?? '').includes('429')
  );
}

export function getApiRetryDelayMs(error: unknown, attempt: number): number {
  if (!isRateLimitError(error)) {
    return 1000 * Math.pow(2, Math.max(attempt - 1, 0));
  }

  const retryAfter = (error as { response?: { headers?: Record<string, string> } })
    ?.response?.headers?.['retry-after'];

  if (retryAfter) {
    const seconds = Number.parseInt(String(retryAfter), 10);
    if (Number.isFinite(seconds) && seconds > 0) {
      return seconds * 1000;
    }
  }

  const index = Math.min(Math.max(attempt - 1, 0), RATE_LIMIT_DELAYS_MS.length - 1);
  return RATE_LIMIT_DELAYS_MS[index] ?? RATE_LIMIT_DELAYS_MS[0];
}

export function getRateLimitMaxRetries(): number {
  return RATE_LIMIT_DELAYS_MS.length;
}
