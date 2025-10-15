import axios from 'axios';

import {
  parseSearchResults,
  searchManga,
  setVrfToken,
  getVrfToken,
  CloudflareDetectedError,
} from '../mangaFireService';

jest.mock('axios');
jest.mock('@/utils/performance', () => ({
  performanceMonitor: {
    measureAsync: jest.fn((_, fn) => fn()),
  },
}));

jest.mock('@/utils/logger', () => ({
  logger: () => ({
    info: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('@/constants/env', () => ({
  isDebugEnabled: () => false,
}));

jest.mock('@/services/anilistService', () => ({
  searchAnilistMangaByName: jest.fn(),
  updateMangaStatus: jest.fn(),
  isLoggedInToAniList: jest.fn().mockResolvedValue(false),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;

describe('mangaFireService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    setVrfToken('');
  });

  it('parses HTML search results', () => {
    const html = `
      <div class="unit item-1">
        <a href="/manga/abc"></a>
        <img src="https://image/1.jpg" />
        <span class="type">Manga</span>
        <a href="/manga/abc">Title</a>
      </div>
    `;

    const items = parseSearchResults(html);
    expect(items).toEqual([
      expect.objectContaining({
        id: 'abc',
        title: 'Title',
        imageUrl: 'https://image/1.jpg',
      }),
    ]);
  });

  it('stores and returns VRF token', () => {
    expect(getVrfToken()).toBeNull();
    setVrfToken('token');
    expect(getVrfToken()).toBe('token');
    setVrfToken('');
    expect(getVrfToken()).toBeNull();
  });

  it('requires a non-empty search keyword', async () => {
    await expect(searchManga(' ')).rejects.toThrow(
      'Search keyword is required'
    );
  });

  it('searches manga and appends VRF token when present', async () => {
    setVrfToken('vrf123');
    mockedAxios.get.mockResolvedValue({ data: '<div></div>' });

    const results = await searchManga('query');
    expect(mockedAxios.get).toHaveBeenCalledWith(
      expect.stringContaining('keyword=query&vrf=vrf123'),
      expect.any(Object)
    );
    expect(Array.isArray(results)).toBe(true);
  });

  it('throws CloudflareDetectedError when challenge HTML detected', async () => {
    mockedAxios.get.mockResolvedValue({
      data: '<html>cf-browser-verification</html>',
    });

    await expect(searchManga('test')).rejects.toBeInstanceOf(
      CloudflareDetectedError
    );
  });
});
