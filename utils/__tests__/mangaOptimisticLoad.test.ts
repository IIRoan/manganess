import { getMangaData } from '@/services/bookmarkService';
import { offlineCacheService } from '@/services/offlineCacheService';
import {
  hydrateMangaFromLocal,
  hydrateMangaDisplayFromLocal,
  hasTrustedMangaRoutePreview,
  mangaRoutePreviewDetails,
  resetHydrateMangaFromLocalForTests,
} from '../mangaOptimisticLoad';

jest.mock('@/services/bookmarkService', () => ({
  getMangaData: jest.fn(),
}));

const mockGetMangaData = getMangaData as jest.MockedFunction<
  typeof getMangaData
>;

describe('hydrateMangaFromLocal', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetHydrateMangaFromLocalForTests();
    mockGetMangaData.mockResolvedValue(null);
    (offlineCacheService.getCachedMangaDetails as jest.Mock).mockResolvedValue(
      null
    );
    (offlineCacheService.getCachedMangaHeader as jest.Mock).mockResolvedValue(
      null
    );
  });

  it('hydrates title and description from the header cache without waiting for chapters', async () => {
    (offlineCacheService.getCachedMangaHeader as jest.Mock).mockResolvedValue({
      id: 'abc12',
      title: 'Cached Title',
      alternativeTitle: 'Alt',
      status: 'Ongoing',
      description: 'Cached synopsis',
      author: ['Author'],
      published: '2024',
      genres: ['Action'],
      rating: '8.2',
      reviewCount: '12',
      bannerImage: 'https://example.com/banner.jpg',
      cachedAt: Date.now(),
      lastOpenedAt: Date.now(),
      isBookmarked: true,
    });

    const hydration = await hydrateMangaFromLocal('abc12');

    expect(hydration.hasInstantDetails).toBe(true);
    expect(hydration.hasCachedChapters).toBe(false);
    expect(hydration.details).toMatchObject({
      id: 'abc12',
      title: 'Cached Title',
      description: 'Cached synopsis',
      chapters: [],
    });
  });

  it('returns cached display data without reading bookmark progress', async () => {
    (offlineCacheService.getCachedMangaHeader as jest.Mock).mockResolvedValue({
      id: 'abc12',
      title: 'Cached Title',
      alternativeTitle: '',
      status: 'Ongoing',
      description: 'Cached synopsis',
      author: [],
      published: '',
      genres: [],
      rating: '',
      reviewCount: '',
      bannerImage: '',
      cachedAt: Date.now(),
      lastOpenedAt: Date.now(),
      isBookmarked: false,
    });

    const hydration = await hydrateMangaDisplayFromLocal('abc12');

    expect(hydration.details?.title).toBe('Cached Title');
    expect(hydration.details?.chapters).toEqual([]);
    expect(mockGetMangaData).not.toHaveBeenCalled();
  });

  it('attaches cached chapter lists onto a header snapshot', async () => {
    (offlineCacheService.getCachedMangaHeader as jest.Mock).mockResolvedValue({
      id: 'abc12',
      title: 'Cached Title',
      alternativeTitle: '',
      status: 'Ongoing',
      description: 'Cached synopsis',
      author: [],
      published: '',
      genres: [],
      rating: '',
      reviewCount: '',
      bannerImage: 'https://example.com/banner.jpg',
      cachedAt: Date.now(),
      lastOpenedAt: Date.now(),
      isBookmarked: true,
    });
    (offlineCacheService.getCachedMangaDetails as jest.Mock).mockResolvedValue({
      id: 'abc12',
      title: 'Cached Title',
      alternativeTitle: '',
      status: '',
      description: '',
      author: [],
      published: '',
      genres: [],
      rating: '',
      reviewCount: '',
      bannerImage: 'https://example.com/banner.jpg',
      chapters: [
        { number: '2', title: 'Chapter 2', date: '', url: '/ch/2' },
        { number: '1', title: 'Chapter 1', date: '', url: '/ch/1' },
      ],
      totalChapters: 2432,
      chapterPagination: {
        hasMore: false,
        nextPage: 42,
        lastPage: 41,
      },
      isBookmarked: true,
      cachedAt: Date.now(),
    });

    const hydration = await hydrateMangaFromLocal('abc12');

    expect(hydration.hasCachedChapters).toBe(true);
    expect(hydration.details?.description).toBe('Cached synopsis');
    expect(hydration.details?.chapters).toHaveLength(2);
    expect(hydration.details?.chapterPagination).toEqual({
      hasMore: false,
      nextPage: 42,
      lastPage: 41,
    });
  });

  it('falls back to bookmark manga data when no caches exist', async () => {
    mockGetMangaData.mockResolvedValue({
      id: 'abc12',
      title: 'Bookmarked',
      bannerImage: 'https://example.com/banner.jpg',
      bookmarkStatus: 'Reading',
      readChapters: ['1'],
      lastUpdated: Date.now(),
      description: 'Bookmark synopsis',
    });

    const hydration = await hydrateMangaFromLocal('abc12');

    expect(hydration.hasInstantDetails).toBe(true);
    expect(hydration.mangaData?.bookmarkStatus).toBe('Reading');
    expect(hydration.details?.description).toBe('Bookmark synopsis');
  });

  it('reuses an in-flight hydration for the same manga', async () => {
    let resolveHeader: ((value: unknown) => void) | undefined;
    (offlineCacheService.getCachedMangaHeader as jest.Mock).mockReturnValue(
      new Promise((resolve) => {
        resolveHeader = resolve;
      })
    );

    const first = hydrateMangaFromLocal('abc12');
    const second = hydrateMangaFromLocal('abc12');
    expect(offlineCacheService.getCachedMangaHeader).toHaveBeenCalledTimes(1);

    resolveHeader?.({
      id: 'abc12',
      title: 'Cached Title',
      alternativeTitle: '',
      status: '',
      description: 'Cached synopsis',
      author: [],
      published: '',
      genres: [],
      rating: '',
      reviewCount: '',
      bannerImage: '',
      cachedAt: Date.now(),
      lastOpenedAt: Date.now(),
      isBookmarked: false,
    });

    await expect(first).resolves.toMatchObject({ hasInstantDetails: true });
    await expect(second).resolves.toMatchObject({ hasInstantDetails: true });
  });
});

describe('manga route preview', () => {
  it('accepts a matching previewId with title or cover', () => {
    expect(
      hasTrustedMangaRoutePreview('abc12', 'abc12', 'One Piece', '')
    ).toBe(true);
    expect(
      hasTrustedMangaRoutePreview('abc12', 'abc12', '', 'https://cover.jpg')
    ).toBe(true);
    expect(
      hasTrustedMangaRoutePreview('abc12', 'other', 'One Piece', '')
    ).toBe(false);
  });

  it('builds title-only details without chapters', () => {
    expect(
      mangaRoutePreviewDetails('abc12', 'One Piece', 'https://cover.jpg')
    ).toMatchObject({
      id: 'abc12',
      title: 'One Piece',
      bannerImage: 'https://cover.jpg',
      description: '',
      chapters: [],
    });
  });
});
