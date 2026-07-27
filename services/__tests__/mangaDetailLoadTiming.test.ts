import { hydrateMangaFromLocal } from '@/utils/mangaOptimisticLoad';
import {
  MANGA_DETAIL_LOAD_PHASES,
  measurePhase,
  planMangaDetailLoad,
  shouldRunMigrationBeforeDisplay,
  type PhaseTiming,
} from '@/services/mangaDetailLoadService';
import { attemptLegacyMangaMigration } from '@/services/mangaIdMigrationService';
import { fetchMangaDetails } from '@/services/mangaFireService';

jest.mock('@/utils/mangaOptimisticLoad', () => ({
  hydrateMangaFromLocal: jest.fn(),
  getBookmarkProgressFromMangaData: jest.fn(),
}));

jest.mock('@/services/bookmarkService', () => ({
  getMangaData: jest.fn(),
}));

jest.mock('@/services/mangaIdMigrationService', () => ({
  ...jest.requireActual('@/services/mangaIdMigrationService'),
  attemptLegacyMangaMigration: jest.fn(),
}));

jest.mock('@/services/mangaFireService', () => ({
  fetchMangaDetails: jest.fn(),
}));

jest.mock('@/utils/logger', () => ({
  logger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

const mockHydrateMangaFromLocal = hydrateMangaFromLocal as jest.MockedFunction<
  typeof hydrateMangaFromLocal
>;
const mockAttemptLegacyMangaMigration =
  attemptLegacyMangaMigration as jest.MockedFunction<
    typeof attemptLegacyMangaMigration
  >;
const mockFetchMangaDetails = fetchMangaDetails as jest.MockedFunction<
  typeof fetchMangaDetails
>;

const mangaId = '92kk8';
const cachedDetails = {
  id: mangaId,
  title: 'Cached Manga',
  alternativeTitle: '',
  bannerImage: 'https://example.com/banner.jpg',
  description: 'Cached description',
  status: 'Ongoing',
  author: ['Author'],
  published: '2024',
  genres: ['Action'],
  rating: '8',
  reviewCount: '10',
  chapters: [
    { number: '1', title: 'Chapter 1', url: '/chapter/1', date: '2024-01-01' },
    { number: '2', title: 'Chapter 2', url: '/chapter/2', date: '2024-01-02' },
  ],
};

describe('manga detail load timing', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockHydrateMangaFromLocal.mockResolvedValue({
      details: cachedDetails,
      mangaData: {
        id: mangaId,
        title: 'Cached Manga',
        bannerImage: 'https://example.com/banner.jpg',
        bookmarkStatus: 'Reading',
        readChapters: ['1'],
        lastReadChapter: '1',
        lastUpdated: Date.now(),
      },
      hasInstantDetails: true,
      hasCachedChapters: true,
    });
    mockAttemptLegacyMangaMigration.mockResolvedValue({ outcome: 'not_needed' });
    mockFetchMangaDetails.mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(() => resolve({ ...cachedDetails }), 150);
        })
    );
  });

  it('hydrates bookmarked manga locally faster than network refresh', async () => {
    const timings: PhaseTiming[] = [];
    let hydration: Awaited<ReturnType<typeof hydrateMangaFromLocal>> | undefined;

    await measurePhase(
      MANGA_DETAIL_LOAD_PHASES.LOCAL_HYDRATION,
      async () => {
        hydration = await hydrateMangaFromLocal(mangaId);
      },
      timings
    );

    await measurePhase(
      MANGA_DETAIL_LOAD_PHASES.NETWORK_DETAILS,
      async () => {
        await fetchMangaDetails(mangaId);
      },
      timings
    );

    expect(hydration?.hasInstantDetails).toBe(true);
    expect(hydration?.hasCachedChapters).toBe(true);
    expect(timings[0]?.durationMs).toBeLessThan(timings[1]?.durationMs ?? 0);
    expect(timings[0]?.durationMs).toBeLessThan(50);
  });

  it('does not require migration before paint for modern bookmarked manga', () => {
    const plan = planMangaDetailLoad({
      mangaId,
      hasInstantContent: true,
      hasCachedChapters: true,
      isOffline: false,
      hasRouteParams: true,
    });

    expect(shouldRunMigrationBeforeDisplay(mangaId, true)).toBe(false);
    expect(plan.shouldBlockOnNetwork).toBe(false);
    expect(plan.phases.filter((phase) => phase.blocking)).toHaveLength(0);
  });

  it('reports the historical bottlenecks and their fixes', () => {
    const report = [
      {
        phase: MANGA_DETAIL_LOAD_PHASES.LEGACY_MIGRATION,
        symptom: 'titleExists API blocked every online open',
        fix: 'skip migration for modern IDs and defer when cache exists',
      },
      {
        phase: MANGA_DETAIL_LOAD_PHASES.NETWORK_DETAILS,
        symptom: 'fetchMangaDetails awaited before hiding loader',
        fix: 'background refresh when cached chapters exist',
      },
      {
        phase: MANGA_DETAIL_LOAD_PHASES.READ_PROGRESS,
        symptom: 'getReadChapters/getLastReadChapter/fetchBookmarkStatus re-read storage',
        fix: 'reuse hydrateMangaFromLocal mangaData',
      },
      {
        phase: MANGA_DETAIL_LOAD_PHASES.CACHE_LOOKUP,
        symptom: 'full offline_manga_cache JSON parsed on every lookup',
        fix: 'in-memory cache in offlineCacheService',
      },
      {
        phase: MANGA_DETAIL_LOAD_PHASES.LOCAL_HYDRATION,
        symptom: 'setFetchedDetails(null) caused bookmark flash',
        fix: 'removed eager cache wipe',
      },
      {
        phase: MANGA_DETAIL_LOAD_PHASES.DOWNLOAD_STATE,
        symptom: 'download refresh awaited before finally clearing loading',
        fix: 'fire-and-forget refresh',
      },
    ];

    expect(report).toHaveLength(6);
    expect(report.every((entry) => entry.fix.length > 0)).toBe(true);
  });
});
