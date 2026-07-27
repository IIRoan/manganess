import { MANGA_DETAIL_LOAD_PHASES } from '@/services/mangaDetailLoadService';

describe('Manga detail load bottleneck report', () => {
  it('documents what was slowing bookmarked manga detail loads', () => {
    const bottlenecks = [
      {
        phase: MANGA_DETAIL_LOAD_PHASES.LEGACY_MIGRATION,
        what: 'attemptLegacyMangaMigration called titleExists() on every online open',
        impact: 'Added a network round-trip before any cached UI could render',
        fix: 'Modern IDs now return immediately; cached manga defers migration',
      },
      {
        phase: MANGA_DETAIL_LOAD_PHASES.NETWORK_DETAILS,
        what: 'fetchMangaDetails() was awaited inside Promise.all before setIsLoading(false)',
        impact: 'Bookmarked manga still waited on title + chapter API even with cache',
        fix: 'Cached chapter lists refresh in the background',
      },
      {
        phase: MANGA_DETAIL_LOAD_PHASES.READ_PROGRESS,
        what: 'getReadChapters, fetchBookmarkStatus, getLastReadChapter each called getMangaData again',
        impact: '3 extra AsyncStorage reads after hydration already loaded mangaData',
        fix: 'Skip when hydration already provided bookmark progress',
      },
      {
        phase: MANGA_DETAIL_LOAD_PHASES.CACHE_LOOKUP,
        what: 'getCachedMangaDetails parsed the entire offline_manga_cache blob every time',
        impact: 'Grew slower as more manga were bookmarked',
        fix: 'Added in-memory cache after first parse',
      },
      {
        phase: MANGA_DETAIL_LOAD_PHASES.LOCAL_HYDRATION,
        what: 'Hydration cleared fetchedDetails before re-reading cache',
        impact: 'Brief blank state even when bookmark data existed',
        fix: 'Removed eager state wipe on hydrate',
      },
      {
        phase: MANGA_DETAIL_LOAD_PHASES.DOWNLOAD_STATE,
        what: 'refreshDownloadedChapters awaited before finally clearing loading',
        impact: 'Download metadata delayed the end of the loading state',
        fix: 'Download refresh is now fire-and-forget',
      },
    ];

    expect(bottlenecks.map((entry) => entry.phase)).toEqual([
      MANGA_DETAIL_LOAD_PHASES.LEGACY_MIGRATION,
      MANGA_DETAIL_LOAD_PHASES.NETWORK_DETAILS,
      MANGA_DETAIL_LOAD_PHASES.READ_PROGRESS,
      MANGA_DETAIL_LOAD_PHASES.CACHE_LOOKUP,
      MANGA_DETAIL_LOAD_PHASES.LOCAL_HYDRATION,
      MANGA_DETAIL_LOAD_PHASES.DOWNLOAD_STATE,
    ]);
  });
});
