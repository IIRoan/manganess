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
