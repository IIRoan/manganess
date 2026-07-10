import type { MangaData } from '@/types/manga';
import {
  MANGA_DETAIL_LOAD_PHASES,
  MANGA_CACHE_REFRESH_MIN_INTERVAL_MS,
  consolidateBookmarkProgress,
  planMangaDetailLoad,
  shouldRunMigrationBeforeDisplay,
  shouldSkipBackgroundNetworkRefresh,
  measurePhase,
  type MangaDetailLoadPhase,
} from '../mangaDetailLoadService';

describe('mangaDetailLoadService', () => {
  describe('shouldRunMigrationBeforeDisplay', () => {
    it('skips blocking migration for modern short manga IDs', () => {
      expect(shouldRunMigrationBeforeDisplay('92kk8', false)).toBe(false);
      expect(shouldRunMigrationBeforeDisplay('abc12', false)).toBe(false);
    });

    it('blocks migration for legacy slug IDs without cached content', () => {
      expect(shouldRunMigrationBeforeDisplay('one-piece', false)).toBe(true);
      expect(shouldRunMigrationBeforeDisplay('tougen-ankii.37z1y', false)).toBe(
        true
      );
    });

    it('never blocks migration when instant cached content exists', () => {
      expect(shouldRunMigrationBeforeDisplay('one-piece', true)).toBe(false);
      expect(shouldRunMigrationBeforeDisplay('92kk8', true)).toBe(false);
    });
  });

  describe('planMangaDetailLoad', () => {
    it('marks no phases as blocking for bookmarked manga with cached chapters', () => {
      const plan = planMangaDetailLoad({
        mangaId: '92kk8',
        hasInstantContent: true,
        hasCachedChapters: true,
        isOffline: false,
        hasRouteParams: true,
      });

      const blocking = plan.phases.filter((phase) => phase.blocking);
      expect(blocking).toHaveLength(0);
      expect(plan.canRenderImmediately).toBe(true);
      expect(plan.shouldBlockOnNetwork).toBe(false);
    });

    it('blocks on network when there is no cache and no route params', () => {
      const plan = planMangaDetailLoad({
        mangaId: '92kk8',
        hasInstantContent: false,
        hasCachedChapters: false,
        isOffline: false,
        hasRouteParams: false,
      });

      const blockingPhases = plan.phases
        .filter((phase) => phase.blocking)
        .map((phase) => phase.phase);

      expect(blockingPhases).toContain(MANGA_DETAIL_LOAD_PHASES.LOCAL_HYDRATION);
      expect(blockingPhases).toContain(MANGA_DETAIL_LOAD_PHASES.NETWORK_DETAILS);
      expect(plan.canRenderImmediately).toBe(false);
      expect(plan.shouldBlockOnNetwork).toBe(true);
    });

    it('defers network refresh for bookmark metadata without cached chapter list', () => {
      const plan = planMangaDetailLoad({
        mangaId: '92kk8',
        hasInstantContent: true,
        hasCachedChapters: false,
        isOffline: false,
        hasRouteParams: true,
      });

      expect(plan.shouldBlockOnNetwork).toBe(false);
      expect(
        plan.phases.find(
          (phase) => phase.phase === MANGA_DETAIL_LOAD_PHASES.NETWORK_DETAILS
        )?.blocking
      ).toBe(false);
    });

    it('defers legacy migration when cached content is already available', () => {
      const plan = planMangaDetailLoad({
        mangaId: 'one-piece',
        hasInstantContent: true,
        hasCachedChapters: true,
        isOffline: false,
        hasRouteParams: false,
      });

      const migrationPhase = plan.phases.find(
        (phase) => phase.phase === MANGA_DETAIL_LOAD_PHASES.LEGACY_MIGRATION
      );

      expect(migrationPhase?.blocking).toBe(false);
      expect(migrationPhase?.deferred).toBe(true);
    });

    it('lists duplicate storage reads as a performance risk', () => {
      const plan = planMangaDetailLoad({
        mangaId: '92kk8',
        hasInstantContent: true,
        hasCachedChapters: true,
        isOffline: false,
        hasRouteParams: true,
      });

      expect(plan.performanceRisks).toEqual(
        expect.arrayContaining([
          expect.stringContaining('getMangaData'),
          expect.stringContaining('getCachedMangaDetails'),
        ])
      );
    });
  });

  describe('shouldSkipBackgroundNetworkRefresh', () => {
    it('skips refresh when cache is still fresh', () => {
      const now = Date.now();
      expect(
        shouldSkipBackgroundNetworkRefresh(
          now - MANGA_CACHE_REFRESH_MIN_INTERVAL_MS + 1000,
          now
        )
      ).toBe(true);
    });

    it('allows refresh when cache is stale', () => {
      const now = Date.now();
      expect(
        shouldSkipBackgroundNetworkRefresh(
          now - MANGA_CACHE_REFRESH_MIN_INTERVAL_MS - 1000,
          now
        )
      ).toBe(false);
    });
  });

  describe('consolidateBookmarkProgress', () => {
    it('derives read progress from a single manga data read', () => {
      const mangaData: MangaData = {
        id: '92kk8',
        title: 'Test Manga',
        bannerImage: 'https://example.com/banner.jpg',
        bookmarkStatus: 'Reading',
        readChapters: ['1', '2', '5'],
        lastReadChapter: '5',
        lastUpdated: Date.now(),
      };

      expect(consolidateBookmarkProgress(mangaData)).toEqual({
        readChapters: ['1', '2', '5'],
        bookmarkStatus: 'Reading',
        lastReadChapter: 'Chapter 5',
      });
    });
  });

  describe('measurePhase', () => {
    it('records how long each load phase takes', async () => {
      const timings: Array<{ phase: MangaDetailLoadPhase; durationMs: number }> =
        [];

      await measurePhase(
        MANGA_DETAIL_LOAD_PHASES.LOCAL_HYDRATION,
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 15));
        },
        timings
      );

      expect(timings).toHaveLength(1);
      expect(timings[0]?.phase).toBe(MANGA_DETAIL_LOAD_PHASES.LOCAL_HYDRATION);
      expect(timings[0]?.durationMs).toBeGreaterThanOrEqual(10);
    });

    it('keeps local hydration much faster than simulated network refresh', async () => {
      const timings: Array<{ phase: MangaDetailLoadPhase; durationMs: number }> =
        [];

      await measurePhase(
        MANGA_DETAIL_LOAD_PHASES.LOCAL_HYDRATION,
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 5));
        },
        timings
      );

      await measurePhase(
        MANGA_DETAIL_LOAD_PHASES.NETWORK_DETAILS,
        async () => {
          await new Promise((resolve) => setTimeout(resolve, 120));
        },
        timings
      );

      const local = timings.find(
        (entry) => entry.phase === MANGA_DETAIL_LOAD_PHASES.LOCAL_HYDRATION
      );
      const network = timings.find(
        (entry) => entry.phase === MANGA_DETAIL_LOAD_PHASES.NETWORK_DETAILS
      );

      expect(local!.durationMs).toBeLessThan(network!.durationMs);
      expect(local!.durationMs).toBeLessThan(50);
    });
  });
});
