import {
  isLoggedInToAniList,
  searchAnilistMangaByName,
  saveMangaMapping,
  getAnilistIdFromInternalId,
  updateMangaStatus,
  updateAniListStatus,
} from '../anilistService';

jest.mock('../anilistOAuth', () => ({
  getAuthData: jest.fn(),
}));

jest.mock('../mangaMappingService', () => ({
  saveMangaMapping: jest.fn(),
  getAnilistIdFromInternalId: jest.fn(),
}));

jest.mock('@/constants/env', () => ({
  isDebugEnabled: () => false,
}));

const { getAuthData } = require('../anilistOAuth');
const mapping = require('../mangaMappingService');

describe('anilistService', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    jest.clearAllMocks();
    globalThis.fetch = jest.fn();
    (Date.now as unknown as jest.Mock | undefined)?.mockRestore?.();
  });

  afterAll(() => {
    globalThis.fetch = originalFetch;
  });

  it('detects login status based on stored auth data', async () => {
    (getAuthData as jest.Mock).mockResolvedValue({
      accessToken: 'token',
      expiresAt: Date.now() + 10000,
    });
    expect(await isLoggedInToAniList()).toBe(true);

    (getAuthData as jest.Mock).mockResolvedValue({
      accessToken: 'token',
      expiresAt: Date.now() - 1000,
    });
    expect(await isLoggedInToAniList()).toBe(false);
  });

  it('searches AniList manga by name', async () => {
    (globalThis.fetch as jest.Mock).mockResolvedValue({
      json: () => Promise.resolve({ data: { Media: { id: 1 } } }),
      ok: true,
    });

    const result = await searchAnilistMangaByName('Test');
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://graphql.anilist.co',
      expect.any(Object)
    );
    expect(result).toEqual({ id: 1 });
  });

  it('delegates manga mapping helpers', async () => {
    (mapping.saveMangaMapping as jest.Mock).mockResolvedValue(undefined);
    await saveMangaMapping('id', 5, 'Title');
    expect(mapping.saveMangaMapping).toHaveBeenCalledWith('id', 5, 'Title');

    (mapping.getAnilistIdFromInternalId as jest.Mock).mockResolvedValue(99);
    const id = await getAnilistIdFromInternalId('id');
    expect(id).toBe(99);
  });

  it('updates manga status when authenticated', async () => {
    (getAuthData as jest.Mock).mockResolvedValue({
      accessToken: 'abc',
      expiresAt: Date.now() + 1000,
    });

    (globalThis.fetch as jest.Mock).mockResolvedValue({
      json: () => Promise.resolve({ data: { result: true } }),
      ok: true,
    });

    await updateMangaStatus(1, 'CURRENT', 10);
    expect(globalThis.fetch).toHaveBeenCalledWith(
      'https://graphql.anilist.co',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer abc' }),
      })
    );
  });

  it('skips updates when not authenticated', async () => {
    (getAuthData as jest.Mock).mockResolvedValue(null);
    await updateMangaStatus(1, 'CURRENT', 10);
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it('updates AniList status end to end', async () => {
    (getAuthData as jest.Mock).mockResolvedValue({
      accessToken: 'token',
      expiresAt: Date.now() + 1000,
    });

    (globalThis.fetch as jest.Mock)
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ data: { Media: { id: 7, title: {} } } }),
        ok: true,
      })
      .mockResolvedValueOnce({
        json: () => Promise.resolve({ data: { SaveMediaListEntry: {} } }),
        ok: true,
      });

    const result = await updateAniListStatus('Title', 'Read', ['1', '2'], 2);

    expect(result.success).toBe(true);
    expect(globalThis.fetch).toHaveBeenCalledTimes(2);
    const secondCall = (globalThis.fetch as jest.Mock).mock.calls[1][1];
    expect(secondCall.body).toContain('SaveMediaListEntry');
  });

  it('returns informative message when not logged in to AniList', async () => {
    (getAuthData as jest.Mock).mockResolvedValue(null);
    const result = await updateAniListStatus('Title', 'Reading', [], 0);
    expect(result.success).toBe(false);
    expect(result.message).toContain('User is not logged in');
  });
});
