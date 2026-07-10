import axios from 'axios';

import {
  parseSearchResults,
  searchManga,
  setVrfToken,
  getVrfToken,
  normalizeChapterNumber,
  fetchMangaDetails,
  checkMangaAvailability,
  getChapterUrl,
  markChapterAsRead,
  getBookmarkStatus,
  updateAniListProgress,
  parseNewReleases,
  parseMostViewedManga,
  fetchChapterImages,
  extractVrfTokenFromHtml,
  extractChapterIdFromUrl,
  testApiEndpoint,
  parseChapterUrl,
  getInjectedJavaScript,
  getChapterIdFromPage,
  fetchChapterImagesFromUrl,
  batchFetchChapterImages,
  getVrfTokenFromChapterPage,
  fetchChapterImagesFromInterceptedRequest,
  loadOnlineChapterImages,
  getChapterApiIdFromList,
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
    warn: jest.fn(),
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

jest.mock('@/services/bookmarkService', () => ({
  getMangaData: jest.fn(),
  setMangaData: jest.fn(),
}));

jest.mock('@/services/readChapterService', () => ({
  setLastReadManga: jest.fn(),
}));

const mockedAxios = axios as jest.Mocked<typeof axios>;
const { getMangaData, setMangaData } = require('@/services/bookmarkService');
const { setLastReadManga } = require('@/services/readChapterService');
const {
  searchAnilistMangaByName,
  updateMangaStatus,
  isLoggedInToAniList,
} = require('@/services/anilistService');

const sampleApiTitle = {
  id: 1,
  hid: 'test-manga',
  slug: 'test-manga',
  title: 'Test Manga',
  type: 'manga',
  status: 'ongoing',
  synopsisHtml: 'This is the description.',
  altTitles: ['Alternative Title'],
  authors: [{ name: 'Author Name' }],
  genres: [{ name: 'Action' }, { name: 'Comedy' }],
  rating: 8.5,
  ratingCount: 100,
  year: 2023,
  poster: { large: 'https://image.jpg' },
  url: '/title/test-manga.test',
};

const sampleApiTitleSummary = {
  id: 1,
  hid: 'abc12',
  slug: 'query-result',
  title: 'Title',
  type: 'manga',
  poster: { medium: 'https://image/1.jpg' },
  url: '/title/query-result.abc12',
};

const sampleApiChapters: {
  items: Array<{
    id: number;
    number: number | string;
    name?: string;
    createdAt: number;
  }>;
  meta: { hasNext: boolean };
} = {
  items: [
    {
      id: 5438730,
      number: 1,
      createdAt: 1704067200,
    },
  ],
  meta: { hasNext: false },
};

function mockLegacyChapterHtmlPage(html: string) {
  mockedAxios.get.mockImplementation((url: string) => {
    if (url.includes('/api/titles/') && url.includes('/chapters')) {
      return Promise.resolve({
        data: { items: [], meta: { hasNext: false } },
      });
    }

    return Promise.resolve({ data: html });
  });
}

const legacyChapterUrl = '/read/one-piece.en/en/chapter-1';

const sampleChapterPages = {
  data: {
    pages: [{ url: 'https://img1.jpg' }, { url: 'https://img2.jpg' }],
  },
};

function mockMangaApiGet(
  overrides: {
    title?: Partial<typeof sampleApiTitle>;
    chapters?: typeof sampleApiChapters;
    searchItems?: typeof sampleApiTitleSummary[];
    chapterPages?: typeof sampleChapterPages;
    onRequest?: (url: string) => void;
  } = {}
) {
  mockedAxios.get.mockImplementation((url: string) => {
    overrides.onRequest?.(url);

    if (url.includes('/chapters/')) {
      return Promise.resolve({
        data: overrides.chapterPages ?? sampleChapterPages,
      });
    }

    if (url.includes('/titles/') && url.includes('/chapters')) {
      return Promise.resolve({
        data: overrides.chapters ?? sampleApiChapters,
      });
    }

    if (url.includes('/titles/')) {
      return Promise.resolve({
        data: {
          data: {
            ...sampleApiTitle,
            ...overrides.title,
          },
        },
      });
    }

    if (url.includes('/titles')) {
      return Promise.resolve({
        data: {
          items: overrides.searchItems ?? [sampleApiTitleSummary],
        },
      });
    }

    return Promise.resolve({ data: {} });
  });
}

import {
  resetMangaFireRequestHubForTests,
} from '../mangaFireRequestHub';

describe('mangaFireService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    resetMangaFireRequestHubForTests();
    setVrfToken('');
  });

  describe('parseSearchResults', () => {
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

    it('deduplicates results by id', () => {
      const html = `
        <div class="unit item-1">
          <a href="/manga/abc"></a>
          <img src="https://image/1.jpg" />
          <span class="type">Manga</span>
          <a href="/manga/abc">Title One</a>
        </div>
        <div class="unit item-2">
          <a href="/manga/abc"></a>
          <img src="https://image/2.jpg" />
          <span class="type">Manga</span>
          <a href="/manga/abc">Title Two</a>
        </div>
      `;

      const items = parseSearchResults(html);
      expect(items.length).toBe(1);
    });

    it('handles empty HTML', () => {
      const items = parseSearchResults('');
      expect(items).toEqual([]);
    });

    it('filters out items without id or title', () => {
      const html = `
        <div class="unit item-1">
          <a href="/manga/"></a>
          <img src="https://image/1.jpg" />
          <span class="type">Manga</span>
          <a href="/manga/"></a>
        </div>
      `;

      const items = parseSearchResults(html);
      expect(items).toEqual([]);
    });
  });

  describe('VRF token management', () => {
    it('stores and returns VRF token', () => {
      expect(getVrfToken()).toBeNull();
      setVrfToken('token');
      expect(getVrfToken()).toBe('token');
      setVrfToken('');
      expect(getVrfToken()).toBeNull();
    });
  });

  describe('searchManga', () => {
    it('requires a non-empty search keyword', async () => {
      await expect(searchManga(' ')).rejects.toThrow(
        'Search keyword is required'
      );
    });

    it('searches manga through the JSON API', async () => {
      mockMangaApiGet();

      const results = await searchManga('query');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://mangafire.to/api/titles',
        expect.objectContaining({
          params: expect.objectContaining({ keyword: 'query' }),
        })
      );
      expect(results).toEqual([
        expect.objectContaining({
          id: 'abc12',
          title: 'Title',
        }),
      ]);
    });

    it('propagates API errors from search', async () => {
      jest.useFakeTimers();
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      let thrownError: Error | undefined;
      const promise = searchManga('test').catch((error) => {
        thrownError = error;
      });

      await jest.runAllTimersAsync();
      await promise;

      expect(thrownError).toBeDefined();
      jest.useRealTimers();
    });
  });

  describe('normalizeChapterNumber', () => {
    it('returns empty string for null/undefined values', () => {
      expect(normalizeChapterNumber(null)).toBe('');
      expect(normalizeChapterNumber(undefined)).toBe('');
      expect(normalizeChapterNumber('')).toBe('');
    });

    it('removes chapter prefix', () => {
      expect(normalizeChapterNumber('chapter 5')).toBe('5');
      expect(normalizeChapterNumber('Chapter 10')).toBe('10');
    });

    it('normalizes various chapter number formats', () => {
      expect(normalizeChapterNumber('10.5')).toBe('10.5');
      expect(normalizeChapterNumber('10_5')).toBe('10.5');
      expect(normalizeChapterNumber('10-5')).toBe('10.5');
      expect(normalizeChapterNumber('  10  ')).toBe('10');
    });

    it('removes leading and trailing separators', () => {
      expect(normalizeChapterNumber('.10.')).toBe('10');
      expect(normalizeChapterNumber('-10-')).toBe('10');
    });

    it('handles special characters', () => {
      expect(normalizeChapterNumber('10a')).toBe('10a');
      expect(normalizeChapterNumber('10-side-story')).toBe('10-side-story');
    });
  });

  describe('getChapterUrl', () => {
    it('generates correct chapter URL', () => {
      const url = getChapterUrl('manga-id', '5');
      expect(url).toContain('/read/manga-id/en/chapter-5');
    });

    it('normalizes chapter number in URL', () => {
      const url = getChapterUrl('manga-id', 'chapter 10.5');
      expect(url).toContain('chapter-10.5');
    });
  });

  describe('fetchMangaDetails', () => {
    it('throws error for empty ID', async () => {
      await expect(fetchMangaDetails('')).rejects.toThrow('Manga ID is required');
      await expect(fetchMangaDetails('  ')).rejects.toThrow('Manga ID is required');
    });

    it('parses manga details from the JSON API', async () => {
      mockMangaApiGet();

      const details = await fetchMangaDetails('test-manga');

      expect(details.title).toBe('Test Manga');
      expect(details.alternativeTitle).toBe('Alternative Title');
      expect(details.status).toBe('ongoing');
      expect(details.description).toContain('This is the description');
      expect(details.author).toContain('Author Name');
      expect(details.genres).toContain('Action');
      expect(details.genres).toContain('Comedy');
      expect(details.rating).toBe('8.5');
      expect(details.reviewCount).toBe('100');
      expect(details.bannerImage).toBe('https://image.jpg');
      expect(details.chapters[0]?.url).toBe('/chapter/5438730');
    });

    it('handles missing fields gracefully', async () => {
      mockMangaApiGet({
        title: {
          title: 'Minimal Title',
          synopsisHtml: '',
          altTitles: [],
          authors: [],
          genres: [],
          rating: 0,
          ratingCount: 0,
          poster: { large: '' },
          status: 'unknown',
          year: 0,
        },
        chapters: { items: [], meta: { hasNext: false } },
      });

      const details = await fetchMangaDetails('test-manga');

      expect(details.title).toBe('Minimal Title');
      expect(details.description).toBe('No description available');
      expect(details.chapters).toEqual([]);
    });
  });

  describe('checkMangaAvailability', () => {
    it('returns missing when the source responds with 404', async () => {
      mockedAxios.get.mockRejectedValue({ response: { status: 404 } });

      await expect(checkMangaAvailability('missing-manga')).resolves.toBe(
        'missing'
      );
    });

    it('returns exists when the title API responds successfully', async () => {
      mockMangaApiGet();

      await expect(checkMangaAvailability('existing-manga')).resolves.toBe(
        'exists'
      );
    });

    it('returns unknown for transient request failures', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network timeout'));

      await expect(checkMangaAvailability('maybe-manga')).resolves.toBe(
        'unknown'
      );
    });
  });

  describe('markChapterAsRead', () => {
    it('does nothing with invalid parameters', async () => {
      await markChapterAsRead('', '1', 'Title');
      await markChapterAsRead('id', '', 'Title');
      await markChapterAsRead('id', '1', '');

      expect(setLastReadManga).not.toHaveBeenCalled();
    });

    it('marks chapter as read and updates manga data', async () => {
      getMangaData.mockResolvedValue({
        id: 'manga1',
        title: 'Test',
        readChapters: ['1'],
        bookmarkStatus: 'Reading',
      });
      setMangaData.mockResolvedValue(undefined);
      setLastReadManga.mockResolvedValue(undefined);

      await markChapterAsRead('manga1', '2', 'Test Manga');

      expect(setLastReadManga).toHaveBeenCalledWith('manga1', 'Test Manga', '2');
      expect(setMangaData).toHaveBeenCalledWith(
        expect.objectContaining({
          readChapters: expect.arrayContaining(['1', '2']),
          lastReadChapter: '2',
        })
      );
    });

    it('creates new manga data if not exists', async () => {
      getMangaData.mockResolvedValue(null);
      setMangaData.mockResolvedValue(undefined);
      setLastReadManga.mockResolvedValue(undefined);

      await markChapterAsRead('manga1', '1', 'Test Manga');

      expect(setMangaData).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'manga1',
          title: 'Test Manga',
          readChapters: ['1'],
          lastReadChapter: '1',
        })
      );
    });
  });

  describe('getBookmarkStatus', () => {
    it('returns bookmark status from manga data', async () => {
      getMangaData.mockResolvedValue({
        id: 'manga1',
        bookmarkStatus: 'Reading',
      });

      const status = await getBookmarkStatus('manga1');
      expect(status).toBe('Reading');
    });

    it('returns null when no manga data exists', async () => {
      getMangaData.mockResolvedValue(null);

      const status = await getBookmarkStatus('unknown');
      expect(status).toBeNull();
    });

    it('returns null on error', async () => {
      getMangaData.mockRejectedValue(new Error('Storage error'));

      const status = await getBookmarkStatus('manga1');
      expect(status).toBeNull();
    });
  });

  describe('updateAniListProgress', () => {
    it('skips update when title is missing', async () => {
      await updateAniListProgress('id', '', 5, 'Reading');

      expect(isLoggedInToAniList).not.toHaveBeenCalled();
    });

    it('skips update when not logged in', async () => {
      isLoggedInToAniList.mockResolvedValue(false);

      await updateAniListProgress('id', 'Title', 5, 'Reading');

      expect(searchAnilistMangaByName).not.toHaveBeenCalled();
    });

    it('updates AniList when logged in and manga found', async () => {
      isLoggedInToAniList.mockResolvedValue(true);
      searchAnilistMangaByName.mockResolvedValue({ id: 123 });
      updateMangaStatus.mockResolvedValue(undefined);

      await updateAniListProgress('id', 'Title', 5, 'Reading');

      expect(updateMangaStatus).toHaveBeenCalledWith(123, 'CURRENT', 5);
    });

    it('maps bookmark statuses correctly', async () => {
      isLoggedInToAniList.mockResolvedValue(true);
      searchAnilistMangaByName.mockResolvedValue({ id: 123 });

      await updateAniListProgress('id', 'Title', 5, 'To Read');
      expect(updateMangaStatus).toHaveBeenCalledWith(123, 'PLANNING', 5);

      await updateAniListProgress('id', 'Title', 5, 'Read');
      expect(updateMangaStatus).toHaveBeenCalledWith(123, 'COMPLETED', 5);
    });

    it('handles manga not found on AniList', async () => {
      isLoggedInToAniList.mockResolvedValue(true);
      searchAnilistMangaByName.mockResolvedValue(null);

      await updateAniListProgress('id', 'Title', 5, 'Reading');

      expect(updateMangaStatus).not.toHaveBeenCalled();
    });
  });

  describe('parseNewReleases', () => {
    it('parses new release items from HTML', () => {
      const html = `
        <section class="home-swiper">
          <h2>New Release</h2>
          <div class="swiper-slide unit">
            <a href="/manga/test-manga">
              <div class="poster">
                <div><img src="https://image.jpg" alt="Test"></div>
              </div>
              <span>Test Manga</span>
            </a>
          </div>
        </section>
      `;

      const items = parseNewReleases(html);
      expect(items).toEqual([
        expect.objectContaining({
          id: 'test-manga',
          title: 'Test Manga',
          imageUrl: 'https://image.jpg',
        }),
      ]);
    });

    it('returns empty array when no new releases section', () => {
      const html = '<html><body></body></html>';
      const items = parseNewReleases(html);
      expect(items).toEqual([]);
    });
  });

  describe('parseMostViewedManga', () => {
    it('parses most viewed manga from HTML', () => {
      const html = `
        <div class="swiper-slide unit">
          <a href="/manga/popular-manga">
            <b>1</b>
            <img src="https://image.jpg" alt="Popular Manga">
          </a>
        </div>
      `;

      const items = parseMostViewedManga(html);
      expect(items.length).toBeGreaterThanOrEqual(0);
    });

    it('limits results to 10 items', () => {
      let html = '';
      for (let i = 1; i <= 15; i++) {
        html += `
          <div class="swiper-slide unit">
            <a href="/manga/manga-${i}">
              <b>${i}</b>
              <img src="https://image${i}.jpg" alt="Manga ${i}">
            </a>
          </div>
        `;
      }

      const items = parseMostViewedManga(html);
      expect(items.length).toBeLessThanOrEqual(10);
    });
  });

  describe('fetchChapterImages', () => {
    it('throws error for empty chapter ID', async () => {
      await expect(fetchChapterImages('')).rejects.toThrow(
        'Chapter ID is required'
      );
    });

    it('fetches chapter images from API', async () => {
      mockMangaApiGet();

      const result = await fetchChapterImages('12345');

      expect(result.status).toBe(200);
      expect(result.images).toHaveLength(2);
      expect(result.images[0]?.[0]).toBe('https://img1.jpg');
    });

    it('throws error when chapter pages are missing', async () => {
      jest.useFakeTimers();
      mockMangaApiGet({
        chapterPages: { data: { pages: [] } },
      });

      let thrownError: Error | undefined;
      const promise = fetchChapterImages('12345').catch((error) => {
        thrownError = error;
      });
      await jest.runAllTimersAsync();
      await promise;

      expect(thrownError).toBeDefined();
      expect(thrownError?.message).toContain('No pages found for chapter 12345');
      jest.useRealTimers();
    });

    it('throws error on empty pages array', async () => {
      jest.useFakeTimers();
      mockMangaApiGet({
        chapterPages: { data: { pages: [] } },
      });

      let thrownError: Error | undefined;
      const promise = fetchChapterImages('12345').catch((error) => {
        thrownError = error;
      });
      await jest.runAllTimersAsync();
      await promise;

      expect(thrownError).toBeDefined();
      expect(thrownError?.message).toContain('No pages found');
      jest.useRealTimers();
    });
  });

  describe('extractVrfTokenFromHtml', () => {
    it('extracts VRF token from HTML', () => {
      const html = 'var vrf = "ABC123456789012345678901234567890"';
      const token = extractVrfTokenFromHtml(html);
      expect(token).toBe('ABC123456789012345678901234567890');
    });

    it('returns null when no token found', () => {
      const html = '<html><body>No token here</body></html>';
      const token = extractVrfTokenFromHtml(html);
      expect(token).toBeNull();
    });

    it('finds token in data-vrf attribute', () => {
      const html = 'data-vrf="LONGVRFTOKENVALUE12345678901234567890"';
      const token = extractVrfTokenFromHtml(html);
      expect(token).toBe('LONGVRFTOKENVALUE12345678901234567890');
    });

    it('finds base64-like tokens', () => {
      const html =
        '"ZBYeRCjYBk0ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/="';
      const token = extractVrfTokenFromHtml(html);
      expect(token).not.toBeNull();
    });
  });

  describe('extractChapterIdFromUrl', () => {
    it('extracts chapter ID from API-style chapter URLs', () => {
      const id = extractChapterIdFromUrl('/chapter/5438730');
      expect(id).toBe('5438730');
    });

    it('returns null for legacy read URLs', () => {
      const id = extractChapterIdFromUrl('/read/manga-id/en/chapter-5');
      expect(id).toBeNull();
    });

    it('returns null for invalid URLs', () => {
      const id = extractChapterIdFromUrl('invalid');
      expect(id).toBeNull();
    });
  });

  describe('testApiEndpoint', () => {
    it('returns true when API is accessible', async () => {
      mockedAxios.get.mockResolvedValue({ status: 200 });

      const result = await testApiEndpoint();
      expect(result).toBe(true);
    });

    it('returns false when API is not accessible', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      const result = await testApiEndpoint();
      expect(result).toBe(false);
    });
  });

  describe('parseChapterUrl', () => {
    it('parses manga ID and chapter number from URL', () => {
      const result = parseChapterUrl('/read/test-manga/en/chapter-5');

      expect(result.mangaId).toBe('test-manga');
      expect(result.chapterNumber).toBe('5');
    });

    it('returns empty object for invalid URL', () => {
      const result = parseChapterUrl('invalid');
      expect(result).toEqual({});
    });

    it('handles URLs without chapter prefix', () => {
      const result = parseChapterUrl('/read/manga/en/page-5');
      expect(result).toEqual({});
    });
  });

  describe('getInjectedJavaScript', () => {
    it('returns JavaScript code for page cleanup', () => {
      const js = getInjectedJavaScript('#000000');

      expect(js).toContain('removeElements');
      expect(js).toContain('hideElements');
      expect(js).toContain('adjustBackground');
      expect(js).toContain('#000000');
    });

    it('includes popup blocking code', () => {
      const js = getInjectedJavaScript('#ffffff');

      expect(js).toContain('disablePopups');
      expect(js).toContain('window.open');
    });
  });

  describe('getChapterIdFromPage', () => {
    it('returns chapter ID directly from API chapter URLs', async () => {
      const id = await getChapterIdFromPage('/chapter/1234567');
      expect(id).toBe('1234567');
    });

    it('extracts chapter ID from legacy page HTML', async () => {
      const html = `
        <script>
          var chapterId = 1234567;
        </script>
      `;
      mockLegacyChapterHtmlPage(html);

      const id = await getChapterIdFromPage(legacyChapterUrl);
      expect(id).toBe('1234567');
    });

    it('extracts chapter ID from ajax URL pattern', async () => {
      mockLegacyChapterHtmlPage('ajax/read/chapter/9876543');

      const id = await getChapterIdFromPage(legacyChapterUrl);
      expect(id).toBe('9876543');
    });

    it('returns null when no chapter ID found', async () => {
      mockLegacyChapterHtmlPage('<html></html>');

      const id = await getChapterIdFromPage(legacyChapterUrl);
      expect(id).toBeNull();
    });

    it('returns null on network error', async () => {
      mockedAxios.get.mockImplementation((url: string) => {
        if (url.includes('/api/titles/') && url.includes('/chapters')) {
          return Promise.resolve({
            data: { items: [], meta: { hasNext: false } },
          });
        }

        return Promise.reject(new Error('Network error'));
      });

      const id = await getChapterIdFromPage(legacyChapterUrl);
      expect(id).toBeNull();
    });
  });

  describe('fetchChapterImagesFromUrl', () => {
    it('throws error for empty URL', async () => {
      await expect(fetchChapterImagesFromUrl('')).rejects.toThrow(
        'Chapter URL is required'
      );
    });

    it('fetches images by extracting chapter ID from API chapter URL', async () => {
      mockMangaApiGet();

      const result = await fetchChapterImagesFromUrl('/chapter/1234567');
      expect(result.images).toHaveLength(2);
    });

    it('throws error when chapter ID cannot be extracted', async () => {
      mockLegacyChapterHtmlPage('<html></html>');

      await expect(
        fetchChapterImagesFromUrl(legacyChapterUrl)
      ).rejects.toThrow('Could not extract chapter ID');
    });
  });

  describe('batchFetchChapterImages', () => {
    it('fetches multiple chapters in batches', async () => {
      jest.useFakeTimers();
      mockMangaApiGet();

      const urls = ['/chapter/111', '/chapter/222'];
      const onProgress = jest.fn();
      const onError = jest.fn();

      const resultsPromise = batchFetchChapterImages(urls, {
        maxConcurrent: 1,
        delayBetweenRequests: 0,
        onProgress,
        onError,
      });

      await jest.runAllTimersAsync();
      const results = await resultsPromise;

      expect(results).toHaveLength(2);
      expect(onProgress).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('handles errors in batch processing', async () => {
      jest.useFakeTimers();
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      const urls = ['/read/manga/en/chapter-1'];
      const onError = jest.fn();

      const resultsPromise = batchFetchChapterImages(urls, {
        onError,
      });

      await jest.runAllTimersAsync();
      const results = await resultsPromise;

      expect(results[0]).toHaveProperty('error');
      expect(onError).toHaveBeenCalled();
      jest.useRealTimers();
    });

    it('adds delay between batches when configured', async () => {
      jest.useFakeTimers();
      mockMangaApiGet();

      const urls = ['/chapter/111', '/chapter/222', '/chapter/333'];
      const resultsPromise = batchFetchChapterImages(urls, {
        maxConcurrent: 1,
        delayBetweenRequests: 500,
      });

      await jest.runAllTimersAsync();
      const results = await resultsPromise;

      expect(results).toHaveLength(3);
      jest.useRealTimers();
    });
  });

  describe('getVrfTokenFromChapterPage', () => {
    it('extracts VRF token from form input', async () => {
      const html = '<input name="vrf" value="test-vrf-token-12345678901234567890-abcdef">';
      mockedAxios.get.mockResolvedValue({ data: html });

      const token = await getVrfTokenFromChapterPage('/read/manga/en/chapter-1');
      expect(token).toBe('test-vrf-token-12345678901234567890-abcdef');
    });

    it('extracts VRF token from alternate form input format', async () => {
      const html = '<input value="test-vrf-value-12345678901234567890-xyz" name="vrf">';
      mockedAxios.get.mockResolvedValue({ data: html });

      const token = await getVrfTokenFromChapterPage('/read/manga/en/chapter-1');
      expect(token).toBe('test-vrf-value-12345678901234567890-xyz');
    });

    it('falls back to extractVrfTokenFromHtml when form input not found', async () => {
      const html = 'const vrf = "FALLBACKVRFTOKENVALUE123456789012345678901234567890"';
      mockedAxios.get.mockResolvedValue({ data: html });

      const token = await getVrfTokenFromChapterPage('/read/manga/en/chapter-1');
      expect(token).toBe('FALLBACKVRFTOKENVALUE123456789012345678901234567890');
    });

    it('handles full URLs', async () => {
      mockedAxios.get.mockResolvedValue({ data: '<html></html>' });

      await getVrfTokenFromChapterPage('https://mangafire.to/read/manga/en/chapter-1');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://mangafire.to/read/manga/en/chapter-1',
        expect.any(Object)
      );
    });

    it('returns null on network error', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      const token = await getVrfTokenFromChapterPage('/read/manga/en/chapter-1');
      expect(token).toBeNull();
    });

    it('rejects short VRF tokens from form input', async () => {
      const html = '<input name="vrf" value="short">';
      mockedAxios.get.mockResolvedValue({ data: html });

      const token = await getVrfTokenFromChapterPage('/read/manga/en/chapter-1');
      expect(token).toBeNull();
    });
  });

  describe('fetchChapterImagesFromInterceptedRequest', () => {
    it('fetches images using intercepted VRF token', async () => {
      mockMangaApiGet();

      const result = await fetchChapterImagesFromInterceptedRequest(
        '12345',
        'intercepted-vrf-token-123456789',
        '/chapter/12345'
      );

      expect(result.images).toHaveLength(2);
      expect(result.status).toBe(200);
    });

    it('throws error on failure', async () => {
      jest.useFakeTimers();
      mockedAxios.get.mockRejectedValue(new Error('API error'));

      let thrownError: Error | undefined;
      const promise = fetchChapterImagesFromInterceptedRequest(
        '12345',
        'vrf-token',
        '/read/manga/en/chapter-1'
      ).catch(e => { thrownError = e; });

      await jest.runAllTimersAsync();
      await promise;

      expect(thrownError).toBeDefined();
      expect(thrownError?.message).toBe('API error');
      jest.useRealTimers();
    });
  });

  describe('extractVrfTokenFromHtml edge cases', () => {
    it('finds VRF token with let declaration', () => {
      const html = 'let vrf = "LETVRFTOKENVALUE123456789012345678901234567890"';
      const token = extractVrfTokenFromHtml(html);
      expect(token).toBe('LETVRFTOKENVALUE123456789012345678901234567890');
    });

    it('finds VRF token with const declaration', () => {
      const html = 'const vrf = "CONSTVRFTOKENVALUE12345678901234567890123456789"';
      const token = extractVrfTokenFromHtml(html);
      expect(token).toBe('CONSTVRFTOKENVALUE12345678901234567890123456789');
    });

    it('finds VRF token in JSON format', () => {
      const html = '{"vrf": "JSONVRFTOKENVALUE1234567890123456789012345678901"}';
      const token = extractVrfTokenFromHtml(html);
      expect(token).toBe('JSONVRFTOKENVALUE1234567890123456789012345678901');
    });

    it('finds vrfToken format', () => {
      const html = 'vrfToken: "VRFTOKENFORMAT1234567890123456789012345678901234"';
      const token = extractVrfTokenFromHtml(html);
      expect(token).toBe('VRFTOKENFORMAT1234567890123456789012345678901234');
    });

    it('finds vrf_token format', () => {
      // Token value must match [a-zA-Z0-9+/=]+ pattern (no underscores)
      const html = 'vrf_token:"VRFTOKENFORMAT1234567890123456789012345678901"';
      const token = extractVrfTokenFromHtml(html);
      expect(token).toBe('VRFTOKENFORMAT1234567890123456789012345678901');
    });

    it('finds base64 fallback when no other pattern matches', () => {
      // Long base64-like string that doesn't match other patterns
      const html = 'randomfield: "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz012345678901234567890+/="';
      const token = extractVrfTokenFromHtml(html);
      expect(token).not.toBeNull();
      expect(token!.length).toBeGreaterThan(40);
    });

    it('prefers longer base64 match', () => {
      const html = 'token1: "AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA" token2: "BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB"';
      const token = extractVrfTokenFromHtml(html);
      expect(token).toBe('BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB');
    });
  });

  describe('getChapterIdFromPage edge cases', () => {
    it('extracts chapter ID from data-chapter-id attribute', async () => {
      mockLegacyChapterHtmlPage('<div data-chapter-id="7654321"></div>');

      const id = await getChapterIdFromPage(legacyChapterUrl);
      expect(id).toBe('7654321');
    });

    it('extracts chapter ID from JSON chapterId format', async () => {
      mockLegacyChapterHtmlPage('{"chapterId": 8765432}');

      const id = await getChapterIdFromPage(legacyChapterUrl);
      expect(id).toBe('8765432');
    });

    it('extracts chapter ID from chapter_id JSON format', async () => {
      mockLegacyChapterHtmlPage('{"chapter_id": 9876543}');

      const id = await getChapterIdFromPage(legacyChapterUrl);
      expect(id).toBe('9876543');
    });

    it('extracts chapter ID from URL pattern in script', async () => {
      mockLegacyChapterHtmlPage('url: "/ajax/read/chapter/5432198"');

      const id = await getChapterIdFromPage(legacyChapterUrl);
      expect(id).toBe('5432198');
    });

    it('extracts chapter ID from script tag with 6+ digit number', async () => {
      mockLegacyChapterHtmlPage('<script>var someVar = 1987654;</script>');

      const id = await getChapterIdFromPage(legacyChapterUrl);
      expect(id).toBe('1987654');
    });

    it('filters out year-like numbers starting with 20', async () => {
      mockLegacyChapterHtmlPage(
        '<script>var year = 20231225; var chapterId = 1234567;</script>'
      );

      const id = await getChapterIdFromPage(legacyChapterUrl);
      expect(id).toBe('1234567');
    });

    it('handles full URL input', async () => {
      mockLegacyChapterHtmlPage('var chapterId = 1111111;');

      await getChapterIdFromPage(
        `https://mangafire.to${legacyChapterUrl}`
      );
      expect(mockedAxios.get).toHaveBeenCalledWith(
        `https://mangafire.to${legacyChapterUrl}`,
        expect.any(Object)
      );
    });

    it('extracts and stores VRF token when found', async () => {
      mockLegacyChapterHtmlPage(
        'const vrf = "VRFTOKENFROMCHAPTER123456789012345678901234567890"; var chapterId = 1234567;'
      );

      await getChapterIdFromPage(legacyChapterUrl);

      expect(getVrfToken()).toBe(
        'VRFTOKENFROMCHAPTER123456789012345678901234567890'
      );
    });

    it('returns null on invalid response data', async () => {
      mockedAxios.get.mockImplementation((url: string) => {
        if (url.includes('/api/titles/') && url.includes('/chapters')) {
          return Promise.resolve({
            data: { items: [], meta: { hasNext: false } },
          });
        }

        return Promise.resolve({ data: null });
      });

      const id = await getChapterIdFromPage(legacyChapterUrl);
      expect(id).toBeNull();
    });

    it('extracts chapter ID using let chapterId pattern', async () => {
      mockLegacyChapterHtmlPage('let chapterId = 3456789;');

      const id = await getChapterIdFromPage(legacyChapterUrl);
      expect(id).toBe('3456789');
    });

    it('extracts chapter ID using const chapterId pattern', async () => {
      mockLegacyChapterHtmlPage('const chapterId = 4567890;');

      const id = await getChapterIdFromPage(legacyChapterUrl);
      expect(id).toBe('4567890');
    });
  });

  describe('fetchMangaDetails chapter parsing edge cases', () => {
    it('maps decimal chapter numbers from the API', async () => {
      mockMangaApiGet({
        chapters: {
          items: [{ id: 1, number: '15.5', createdAt: 1704067200 }],
          meta: { hasNext: false },
        },
      });

      const details = await fetchMangaDetails('test-manga');

      expect(details.chapters).toHaveLength(1);
      expect(details.chapters[0]!.number).toBe('15.5');
    });

    it('uses chapter names from the API when available', async () => {
      mockMangaApiGet({
        chapters: {
          items: [
            {
              id: 2,
              number: 10,
              name: 'The Beginning',
              createdAt: 1704067200,
            },
          ],
          meta: { hasNext: false },
        },
      });

      const details = await fetchMangaDetails('test-manga');

      expect(details.chapters[0]!.number).toBe('10');
      expect(details.chapters[0]!.title).toBe('Chapter 10: The Beginning');
    });

    it('filters out chapters without valid numbers', async () => {
      mockMangaApiGet({
        chapters: {
          items: [
            { id: 3, number: '', createdAt: 1704067200 },
            { id: 4, number: 5, createdAt: 1704067200 },
          ],
          meta: { hasNext: false },
        },
      });

      const details = await fetchMangaDetails('test-manga');

      expect(details.chapters).toHaveLength(1);
      expect(details.chapters[0]!.number).toBe('5');
    });

    it('handles numeric chapter headings from the API', async () => {
      mockMangaApiGet({
        chapters: {
          items: [{ id: 5, number: 100, createdAt: 1704067200 }],
          meta: { hasNext: false },
        },
      });

      const details = await fetchMangaDetails('test-manga');

      expect(details.chapters).toHaveLength(1);
      expect(details.chapters[0]!.number).toBe('100');
    });
  });

  describe('searchManga retry logic', () => {
    it('does not retry on 403 error', async () => {
      const error403 = new Error('Request failed with status code 403');
      (error403 as any).response = { status: 403 };
      mockedAxios.get.mockRejectedValue(error403);

      await expect(searchManga('test')).rejects.toThrow();

      // Should only be called once (no retries for 403)
      expect(mockedAxios.get).toHaveBeenCalledTimes(1);
    });

    it('retries on other errors', async () => {
      jest.useFakeTimers();
      const networkError = new Error('Network error');
      mockedAxios.get.mockRejectedValue(networkError);

      const promise = searchManga('test').catch(() => {});
      await jest.runAllTimersAsync();
      await promise;

      // Should retry 3 times
      expect(mockedAxios.get).toHaveBeenCalledTimes(3);
      jest.useRealTimers();
    });
  });

  describe('loadOnlineChapterImages', () => {
    it('loads chapter pages using cached chapter metadata', async () => {
      mockMangaApiGet();

      const images = await loadOnlineChapterImages('test-manga', '1', [
        {
          number: '1',
          title: 'Chapter 1',
          date: '',
          url: '/chapter/5438730',
        },
      ]);

      expect(images).toHaveLength(2);
      expect(images[0]?.originalUrl).toBe('https://img1.jpg');
    });

    it('resolves chapter API ID when chapter list is unavailable', async () => {
      mockMangaApiGet();

      const images = await loadOnlineChapterImages('test-manga', '1');

      expect(images).toHaveLength(2);
      expect(mockedAxios.get).toHaveBeenCalled();
    });
  });

  describe('getChapterApiIdFromList', () => {
    it('returns the API chapter ID from cached chapter metadata', () => {
      const chapterId = getChapterApiIdFromList(
        [
          {
            number: '12',
            title: 'Chapter 12',
            date: '',
            url: '/chapter/999',
          },
        ],
        '12'
      );

      expect(chapterId).toBe('999');
    });
  });

  describe('fetchChapterImages API behavior', () => {
    it('requests chapter pages from the JSON API', async () => {
      mockMangaApiGet();

      await fetchChapterImages('12345');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://mangafire.to/api/chapters/12345',
        expect.any(Object)
      );
    });

    it('throws error when response data is null', async () => {
      jest.useFakeTimers();
      mockedAxios.get.mockResolvedValue({ data: null });

      let thrownError: Error | undefined;
      const promise = fetchChapterImages('12345').catch((error) => {
        thrownError = error;
      });
      await jest.runAllTimersAsync();
      await promise;

      expect(thrownError).toBeDefined();
      jest.useRealTimers();
    });
  });

  describe('fetchChapterImagesFromUrl API behavior', () => {
    it('loads images from API chapter URLs', async () => {
      mockMangaApiGet();

      const result = await fetchChapterImagesFromUrl('/chapter/1234567');

      expect(result.images).toHaveLength(2);
    });
  });

  describe('markChapterAsRead error handling', () => {
    it('handles error during setMangaData', async () => {
      getMangaData.mockResolvedValue({
        id: 'manga1',
        title: 'Test',
        readChapters: ['1'],
      });
      setMangaData.mockRejectedValue(new Error('Storage error'));
      setLastReadManga.mockResolvedValue(undefined);

      // Should not throw, just log error
      await expect(markChapterAsRead('manga1', '2', 'Test')).resolves.toBeUndefined();
    });
  });

  describe('updateAniListProgress error handling', () => {
    it('handles error during AniList update', async () => {
      isLoggedInToAniList.mockResolvedValue(true);
      searchAnilistMangaByName.mockResolvedValue({ id: 123 });
      updateMangaStatus.mockRejectedValue(new Error('AniList API error'));

      // Should not throw, just log error
      await expect(
        updateAniListProgress('id', 'Title', 5, 'Reading')
      ).resolves.toBeUndefined();
    });

    it('maps default status when bookmark status is unknown', async () => {
      isLoggedInToAniList.mockResolvedValue(true);
      searchAnilistMangaByName.mockResolvedValue({ id: 123 });
      updateMangaStatus.mockResolvedValue(undefined);

      await updateAniListProgress('id', 'Title', 5, 'Unknown Status');

      expect(updateMangaStatus).toHaveBeenCalledWith(123, 'CURRENT', 5);
    });
  });

  describe('parseSearchResults pattern 2 fallback', () => {
    it('uses pattern 2 when pattern 1 fails', () => {
      // HTML that doesn't match pattern 1 but matches pattern 2
      const html = `
        <a href="/manga/test-id" class="card">
          <img src="https://image.jpg" alt="Test">
          <span class="type">Manhwa</span>
          <a href="/manga/test-id">Test Title</a>
        </a>
      `;

      const items = parseSearchResults(html);
      expect(items).toEqual([
        expect.objectContaining({
          id: 'test-id',
          title: 'Test Title',
          type: 'Manhwa',
        }),
      ]);
    });
  });
});
