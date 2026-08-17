const RATE_LIMIT_DELAYS_MS = [5000, 15000, 30000, 45000] as const;
/** Intermittent WAF/VRF 403s often clear after a short pause + fresh token. */
const FORBIDDEN_DELAYS_MS = [1500, 3500, 7000] as const;
const DEFAULT_API_MAX_RETRIES = 3;

export const RATE_LIMIT_USING_CACHE_MESSAGE =
  'MangaFire is busy — showing your saved data. Try refreshing in a minute.';

export const RATE_LIMIT_NO_CACHE_MESSAGE =
  'MangaFire is temporarily limiting requests. Please wait a minute and try again.';

export function getErrorMessage(error: unknown): string {
  if (!error || typeof error !== 'object') {
    return String(error ?? '');
  }
  return String((error as { message?: string }).message ?? '');
}

export function getHttpStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') {
    return undefined;
  }

  const status = (error as { response?: { status?: number } }).response?.status;
  return typeof status === 'number' ? status : undefined;
}

export function isRateLimitError(error: unknown): boolean {
  return (
    getHttpStatus(error) === 429 || getErrorMessage(error).includes('429')
  );
}

export function isForbiddenError(error: unknown): boolean {
  return (
    getHttpStatus(error) === 403 || getErrorMessage(error).includes('403')
  );
}

export function isNotFoundError(error: unknown): boolean {
  return (
    getHttpStatus(error) === 404 || getErrorMessage(error).includes('404')
  );
}

export function isCloudflareError(error: unknown): boolean {
  return getErrorMessage(error).includes('Cloudflare verification');
}

export function getApiRetryDelayMs(error: unknown, attempt: number): number {
  if (isRateLimitError(error)) {
    const retryAfter = (
      error as { response?: { headers?: Record<string, string> } }
    )?.response?.headers?.['retry-after'];

    if (retryAfter) {
      const seconds = Number.parseInt(String(retryAfter), 10);
      if (Number.isFinite(seconds) && seconds > 0) {
        return seconds * 1000;
      }
    }

    const index = Math.min(
      Math.max(attempt - 1, 0),
      RATE_LIMIT_DELAYS_MS.length - 1
    );
    return RATE_LIMIT_DELAYS_MS[index] ?? RATE_LIMIT_DELAYS_MS[0];
  }

  if (isForbiddenError(error)) {
    const index = Math.min(
      Math.max(attempt - 1, 0),
      FORBIDDEN_DELAYS_MS.length - 1
    );
    return FORBIDDEN_DELAYS_MS[index] ?? FORBIDDEN_DELAYS_MS[0];
  }

  return 1000 * Math.pow(2, Math.max(attempt - 1, 0));
}

export function getRateLimitMaxRetries(): number {
  return RATE_LIMIT_DELAYS_MS.length;
}

export function getForbiddenMaxRetries(): number {
  return FORBIDDEN_DELAYS_MS.length;
}

export function getEffectiveApiMaxRetries(
  error: unknown,
  defaultMax: number = DEFAULT_API_MAX_RETRIES
): number {
  if (isRateLimitError(error)) {
    return getRateLimitMaxRetries();
  }
  if (isForbiddenError(error)) {
    return getForbiddenMaxRetries();
  }
  return defaultMax;
}

export interface ApiRetryOptions {
  maxRetries?: number;
  onRetry?: (info: {
    attempt: number;
    delayMs: number;
    error: unknown;
  }) => void;
}

/**
 * Retries transient API failures (network, 5xx, 429, intermittent 403).
 * 404 is treated as permanent and is not retried.
 */
export async function withApiRetry<T>(
  operation: () => Promise<T>,
  options: ApiRetryOptions = {}
): Promise<T> {
  const maxRetries = options.maxRetries ?? DEFAULT_API_MAX_RETRIES;
  let attempt = 0;

  while (true) {
    attempt += 1;

    try {
      return await operation();
    } catch (error) {
      if (isNotFoundError(error)) {
        throw error;
      }

      if (isCloudflareError(error)) {
        throw error;
      }

      const effectiveMaxRetries = getEffectiveApiMaxRetries(error, maxRetries);
      if (attempt >= effectiveMaxRetries) {
        throw error;
      }

      const delayMs = getApiRetryDelayMs(error, attempt);
      options.onRetry?.({ attempt, delayMs, error });
      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }
  }
}
