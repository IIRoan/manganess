import {
  peekFreshCache,
  resetMangaFireRequestHubForTests,
  scheduleMangaFireRequest,
  withMangaFireRateLimit,
} from '../mangaFireRequestHub';

describe('mangaFireRequestHub', () => {
  beforeEach(() => {
    resetMangaFireRequestHubForTests();
  });

  it('coalesces identical in-flight requests', async () => {
    const operation = jest.fn(async () => 'value');

    const first = scheduleMangaFireRequest('details:test', operation, {
      ttlMs: 0,
    });
    const second = scheduleMangaFireRequest('details:test', operation, {
      ttlMs: 0,
    });

    await Promise.all([first, second]);

    expect(operation).toHaveBeenCalledTimes(1);
    expect(await first).toBe('value');
    expect(await second).toBe('value');
  });

  it('returns cached values within TTL without re-fetching', async () => {
    const operation = jest
      .fn()
      .mockResolvedValueOnce('fresh')
      .mockResolvedValueOnce('stale');

    await scheduleMangaFireRequest('details:test', operation, {
      ttlMs: 60_000,
    });

    const cached = await scheduleMangaFireRequest('details:test', operation, {
      ttlMs: 60_000,
    });

    expect(cached).toBe('fresh');
    expect(operation).toHaveBeenCalledTimes(1);
    expect(peekFreshCache<string>('details:test', 60_000)).toBe('fresh');
  });

  it('skips cache writes when shouldCache returns false', async () => {
    const operation = jest
      .fn()
      .mockResolvedValueOnce({ value: 'partial', partialFailure: true })
      .mockResolvedValueOnce({ value: 'complete', partialFailure: false });

    const shouldCache = (value: { partialFailure: boolean }) =>
      !value.partialFailure;

    const first = await scheduleMangaFireRequest('home:test', operation, {
      ttlMs: 60_000,
      shouldCache,
    });

    expect(first).toEqual({ value: 'partial', partialFailure: true });
    expect(peekFreshCache('home:test', 60_000)).toBeUndefined();

    const second = await scheduleMangaFireRequest('home:test', operation, {
      ttlMs: 60_000,
      shouldCache,
    });

    expect(second).toEqual({ value: 'complete', partialFailure: false });
    expect(operation).toHaveBeenCalledTimes(2);
    expect(peekFreshCache('home:test', 60_000)).toEqual({
      value: 'complete',
      partialFailure: false,
    });
  });

  it('spaces sequential requests through the rate limiter', async () => {
    const timestamps: number[] = [];

    await withMangaFireRateLimit(async () => {
      timestamps.push(Date.now());
    });
    await withMangaFireRateLimit(async () => {
      timestamps.push(Date.now());
    });

    expect(timestamps).toHaveLength(2);
    expect(timestamps[1]! - timestamps[0]!).toBeGreaterThanOrEqual(350);
  });
});
