import {
  getApiRetryDelayMs,
  isRateLimitError,
  RATE_LIMIT_NO_CACHE_MESSAGE,
  RATE_LIMIT_USING_CACHE_MESSAGE,
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

    it('uses exponential backoff for non-rate-limit errors', () => {
      expect(getApiRetryDelayMs(new Error('timeout'), 1)).toBe(1000);
      expect(getApiRetryDelayMs(new Error('timeout'), 2)).toBe(2000);
    });
  });

  it('exposes user-facing rate limit messages', () => {
    expect(RATE_LIMIT_USING_CACHE_MESSAGE).toContain('saved data');
    expect(RATE_LIMIT_NO_CACHE_MESSAGE).toContain('wait');
  });
});
