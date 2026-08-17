import {
  getApiRetryDelayMs,
  getForbiddenMaxRetries,
  isForbiddenError,
  isNotFoundError,
  isRateLimitError,
  RATE_LIMIT_NO_CACHE_MESSAGE,
  RATE_LIMIT_USING_CACHE_MESSAGE,
  withApiRetry,
} from '../httpErrors';

describe('httpErrors', () => {
  describe('isRateLimitError', () => {
    it('detects axios 429 responses', () => {
      expect(isRateLimitError({ response: { status: 429 } })).toBe(true);
    });

    it('detects 429 in error messages', () => {
      expect(
        isRateLimitError(new Error('Request failed with status code 429'))
      ).toBe(true);
    });

    it('returns false for other errors', () => {
      expect(isRateLimitError(new Error('Network Error'))).toBe(false);
      expect(isRateLimitError(null)).toBe(false);
    });
  });

  describe('isForbiddenError', () => {
    it('detects axios 403 responses', () => {
      expect(isForbiddenError({ response: { status: 403 } })).toBe(true);
    });

    it('detects 403 in error messages', () => {
      expect(
        isForbiddenError(new Error('Request failed with status code 403'))
      ).toBe(true);
    });
  });

  describe('isNotFoundError', () => {
    it('detects axios 404 responses', () => {
      expect(isNotFoundError({ response: { status: 404 } })).toBe(true);
    });
  });

  describe('getApiRetryDelayMs', () => {
    it('uses longer delays for rate limits', () => {
      expect(getApiRetryDelayMs({ response: { status: 429 } }, 1)).toBe(5000);
      expect(getApiRetryDelayMs({ response: { status: 429 } }, 2)).toBe(15000);
    });

    it('respects Retry-After headers', () => {
      expect(
        getApiRetryDelayMs(
          {
            response: {
              status: 429,
              headers: { 'retry-after': '12' },
            },
          },
          1
        )
      ).toBe(12000);
    });

    it('uses dedicated delays for forbidden errors', () => {
      expect(getApiRetryDelayMs({ response: { status: 403 } }, 1)).toBe(1500);
      expect(getApiRetryDelayMs({ response: { status: 403 } }, 2)).toBe(3500);
      expect(getApiRetryDelayMs({ response: { status: 403 } }, 3)).toBe(7000);
    });

    it('uses exponential backoff for non-rate-limit errors', () => {
      expect(getApiRetryDelayMs(new Error('timeout'), 1)).toBe(1000);
      expect(getApiRetryDelayMs(new Error('timeout'), 2)).toBe(2000);
    });
  });

  describe('withApiRetry', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('retries intermittent 403 errors then succeeds', async () => {
      const error403 = Object.assign(
        new Error('Request failed with status code 403'),
        {
          response: { status: 403 },
        }
      );
      const operation = jest
        .fn()
        .mockRejectedValueOnce(error403)
        .mockResolvedValueOnce('ok');

      const promise = withApiRetry(operation);
      await jest.runAllTimersAsync();
      await expect(promise).resolves.toBe('ok');
      expect(operation).toHaveBeenCalledTimes(2);
    });

    it('does not retry Cloudflare verification errors', async () => {
      const error = Object.assign(
        new Error('Cloudflare verification detected'),
        { response: { status: 403 } }
      );
      const operation = jest.fn().mockRejectedValue(error);

      await expect(withApiRetry(operation)).rejects.toThrow(
        'Cloudflare verification detected'
      );
      expect(operation).toHaveBeenCalledTimes(1);
    });

    it('exhausts forbidden retries', async () => {
      const error403 = Object.assign(
        new Error('Request failed with status code 403'),
        {
          response: { status: 403 },
        }
      );
      const operation = jest.fn().mockRejectedValue(error403);

      const promise = withApiRetry(operation).catch((error) => error);
      await jest.runAllTimersAsync();
      const error = await promise;

      expect(error).toMatchObject({ response: { status: 403 } });
      expect(operation).toHaveBeenCalledTimes(getForbiddenMaxRetries());
    });
  });

  it('exposes user-facing rate limit messages', () => {
    expect(RATE_LIMIT_USING_CACHE_MESSAGE).toContain('saved data');
    expect(RATE_LIMIT_NO_CACHE_MESSAGE).toContain('wait');
  });
});
