import { fetchTitleDetails } from '@/services/mangaFireApi';
import { startMangaOpen } from '@/services/mangaOpenTrace';
import { hydrateMangaDisplayFromLocal } from '@/utils/mangaOptimisticLoad';
import {
  mangaOpenRouteParams,
  navigateToMangaDetails,
  loadMangaOpenHeader,
  prefetchMangaOpen,
} from '../mangaOpenNavigation';

jest.mock('@/services/mangaFireApi', () => ({
  fetchTitleDetails: jest.fn().mockResolvedValue({ hid: 'abc12' }),
  mapApiTitleToMangaDetails: jest.fn().mockReturnValue({
    id: 'abc12',
    title: 'One Piece',
    chapters: [],
  }),
}));

jest.mock('@/services/mangaOpenTrace', () => ({
  startMangaOpen: jest.fn(),
}));

jest.mock('@/utils/mangaOptimisticLoad', () => ({
  hydrateMangaDisplayFromLocal: jest.fn().mockResolvedValue({}),
}));

describe('mangaOpenNavigation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('passes preview params so the detail screen can paint immediately', () => {
    expect(
      mangaOpenRouteParams({
        id: 'abc12',
        title: 'One Piece',
        banner: 'https://cover.jpg',
      })
    ).toEqual({
      id: 'abc12',
      title: 'One Piece',
      imageUrl: 'https://cover.jpg',
      previewId: 'abc12',
    });
  });

  it('starts tracing, hydrates local data, and navigates on open', () => {
    const router = { push: jest.fn() };
    navigateToMangaDetails(
      router,
      { id: 'abc12', title: 'One Piece', imageUrl: 'https://cover.jpg' },
      'card'
    );

    expect(startMangaOpen).toHaveBeenCalledWith('abc12', 'card');
    expect(hydrateMangaDisplayFromLocal).toHaveBeenCalledWith('abc12');
    expect(fetchTitleDetails).not.toHaveBeenCalled();
    expect(router.push).toHaveBeenCalledWith({
      pathname: '/manga/[id]',
      params: {
        id: 'abc12',
        title: 'One Piece',
        imageUrl: 'https://cover.jpg',
        previewId: 'abc12',
      },
    });
  });

  it('ignores empty ids', () => {
    prefetchMangaOpen('  ');
    expect(hydrateMangaDisplayFromLocal).not.toHaveBeenCalled();
  });

  it('reuses title details as a chapter-free first-paint header', async () => {
    await expect(loadMangaOpenHeader('abc12')).resolves.toMatchObject({
      id: 'abc12',
      title: 'One Piece',
      chapters: [],
    });
    expect(fetchTitleDetails).toHaveBeenCalledWith('abc12', { retry: false });
  });
});
