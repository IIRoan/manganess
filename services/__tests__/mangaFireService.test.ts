import axios from 'axios';

import {
  parseSearchResults,
  searchManga,
  setVrfToken,
  getVrfToken,
  CloudflareDetectedError,
  normalizeChapterNumber,
  fetchMangaDetails,
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

describe('mangaFireService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
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
      jest.useFakeTimers();
      mockedAxios.get.mockResolvedValue({
        data: '<html>cf-browser-verification</html>',
      });

      let thrownError: Error | undefined;
      const promise = searchManga('test').catch(e => { thrownError = e; });

      await jest.runAllTimersAsync();
      await promise;

      expect(thrownError).toBeDefined();
      expect(thrownError).toBeInstanceOf(CloudflareDetectedError);
      expect((thrownError as CloudflareDetectedError).message).toContain(
        'Cloudflare verification detected'
      );
      jest.useRealTimers();
    });

    it('detects Cloudflare with various markers', async () => {
      jest.useFakeTimers();
      const markers = [
        'cf_captcha_kind',
        'attention required',
        'just a moment',
      ];

      for (const marker of markers) {
        mockedAxios.get.mockResolvedValue({
          data: `<html>${marker}</html>`,
        });

        let thrownError: Error | undefined;
        const promise = searchManga('test').catch(e => { thrownError = e; });
        await jest.runAllTimersAsync();
        await promise;

        expect(thrownError).toBeInstanceOf(CloudflareDetectedError);
      }
      jest.useRealTimers();
    });

    it('throws error on invalid response data', async () => {
      jest.useFakeTimers();
      mockedAxios.get.mockResolvedValue({ data: null });

      let thrownError: Error | undefined;
      const promise = searchManga('test').catch(e => { thrownError = e; });
      await jest.runAllTimersAsync();
      await promise;

      expect(thrownError).toBeDefined();
      expect(thrownError?.message).toContain('Invalid response data');
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

    it('parses manga details from HTML', async () => {
      const html = `
        <h1 itemprop="name">Test Manga</h1>
        <h6>Alternative Title</h6>
        <p>Ongoing</p>
        <div class="modal fade" id="synopsis">
          <div class="modal-content p-4">
            <div class="modal-close"></div>
            This is the description.
          </div>
        </div>
        <span>Author:</span><span><a href="#">Author Name</a></span>
        <span>Published:</span><span>2023</span>
        <span>Genres:</span><span><a href="#">Action</a><a href="#">Comedy</a></span>
        <span class="live-score" itemprop="ratingValue">8.5</span>
        <span itemprop="reviewCount">100</span>
        <div class="poster"><img src="https://image.jpg" itemprop="image"></div>
        <li class="item">
          <a href="/read/test/en/chapter-1">
            <span>Chapter 1</span>
            <span>Jan 1, 2024</span>
          </a>
        </li>
      `;

      mockedAxios.get.mockResolvedValue({ data: html });

      const details = await fetchMangaDetails('test-manga');

      expect(details.title).toBe('Test Manga');
      expect(details.alternativeTitle).toBe('Alternative Title');
      expect(details.status).toBe('Ongoing');
      expect(details.description).toContain('This is the description');
      expect(details.author).toContain('Author Name');
      expect(details.genres).toContain('Action');
      expect(details.genres).toContain('Comedy');
      expect(details.rating).toBe('8.5');
      expect(details.reviewCount).toBe('100');
      expect(details.bannerImage).toBe('https://image.jpg');
    });

    it('handles missing fields gracefully', async () => {
      const html = '<html><body></body></html>';
      mockedAxios.get.mockResolvedValue({ data: html });

      const details = await fetchMangaDetails('test-manga');

      expect(details.title).toBe('Unknown Title');
      expect(details.description).toBe('No description available');
      expect(details.chapters).toEqual([]);
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
      mockedAxios.get.mockResolvedValue({
        data: {
          status: 200,
          result: {
            images: [['https://img1.jpg'], ['https://img2.jpg']],
          },
        },
      });

      const result = await fetchChapterImages('12345');

      expect(result.status).toBe(200);
      expect(result.images).toHaveLength(2);
    });

    it('throws error on invalid API status', async () => {
      jest.useFakeTimers();
      mockedAxios.get.mockResolvedValue({
        data: {
          status: 500,
          result: null,
        },
      });

      let thrownError: Error | undefined;
      const promise = fetchChapterImages('12345').catch(e => { thrownError = e; });
      await jest.runAllTimersAsync();
      await promise;

      expect(thrownError).toBeDefined();
      expect(thrownError?.message).toContain('API returned status 500');
      jest.useRealTimers();
    });

    it('throws error on missing images in response', async () => {
      jest.useFakeTimers();
      mockedAxios.get.mockResolvedValue({
        data: {
          status: 200,
          result: {},
        },
      });

      let thrownError: Error | undefined;
      const promise = fetchChapterImages('12345').catch(e => { thrownError = e; });
      await jest.runAllTimersAsync();
      await promise;

      expect(thrownError).toBeDefined();
      expect(thrownError?.message).toContain('Invalid image data');
      jest.useRealTimers();
    });

    it('throws error on empty images array', async () => {
      jest.useFakeTimers();
      mockedAxios.get.mockResolvedValue({
        data: {
          status: 200,
          result: { images: [] },
        },
      });

      let thrownError: Error | undefined;
      const promise = fetchChapterImages('12345').catch(e => { thrownError = e; });
      await jest.runAllTimersAsync();
      await promise;

      expect(thrownError).toBeDefined();
      expect(thrownError?.message).toContain('No images found');
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
    it('returns null for chapter URLs (needs page load)', () => {
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
    it('extracts chapter ID from page HTML', async () => {
      const html = `
        <script>
          var chapterId = 1234567;
        </script>
      `;
      mockedAxios.get.mockResolvedValue({ data: html });

      const id = await getChapterIdFromPage('/read/manga/en/chapter-1');
      expect(id).toBe('1234567');
    });

    it('extracts chapter ID from ajax URL pattern', async () => {
      const html = 'ajax/read/chapter/9876543';
      mockedAxios.get.mockResolvedValue({ data: html });

      const id = await getChapterIdFromPage('/read/manga/en/chapter-1');
      expect(id).toBe('9876543');
    });

    it('returns null when no chapter ID found', async () => {
      mockedAxios.get.mockResolvedValue({ data: '<html></html>' });

      const id = await getChapterIdFromPage('/read/manga/en/chapter-1');
      expect(id).toBeNull();
    });

    it('returns null on network error', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      const id = await getChapterIdFromPage('/read/manga/en/chapter-1');
      expect(id).toBeNull();
    });
  });

  describe('fetchChapterImagesFromUrl', () => {
    it('throws error for empty URL', async () => {
      await expect(fetchChapterImagesFromUrl('')).rejects.toThrow(
        'Chapter URL is required'
      );
    });

    it('fetches images by extracting chapter ID from page', async () => {
      // First call: getVrfTokenFromChapterPage
      mockedAxios.get.mockResolvedValueOnce({
        data: '<html>some page content</html>',
      });
      // Second call: getChapterIdFromPage - gets the page with chapter ID
      mockedAxios.get.mockResolvedValueOnce({
        data: 'var chapterId = 1234567;',
      });
      // Third call: fetchChapterImages - gets the images
      mockedAxios.get.mockResolvedValueOnce({
        data: {
          status: 200,
          result: { images: [['https://img.jpg']] },
        },
      });

      const result = await fetchChapterImagesFromUrl('/read/manga/en/chapter-1');
      expect(result.images).toHaveLength(1);
    });

    it('throws error when chapter ID cannot be extracted', async () => {
      mockedAxios.get.mockResolvedValue({ data: '<html></html>' });

      await expect(
        fetchChapterImagesFromUrl('/read/manga/en/chapter-1')
      ).rejects.toThrow('Could not extract chapter ID');
    });
  });

  describe('batchFetchChapterImages', () => {
    it('fetches multiple chapters in batches', async () => {
      jest.useFakeTimers();
      // Track call count to return different responses
      let callCount = 0;
      mockedAxios.get.mockImplementation((_url) => {
        callCount++;
        // Each chapter URL requires 3 calls: VRF token, chapter ID, then images
        // Calls 1, 4 = VRF token fetch (returns HTML)
        // Calls 2, 5 = Chapter ID fetch (returns HTML with chapterId)
        // Calls 3, 6 = Images fetch (returns JSON)
        const callInCycle = ((callCount - 1) % 3) + 1;

        if (callInCycle === 1) {
          // VRF token page
          return Promise.resolve({ data: '<html>some content</html>' });
        } else if (callInCycle === 2) {
          // Chapter ID page
          return Promise.resolve({ data: 'var chapterId = 1234567;' });
        } else {
          // Images API
          return Promise.resolve({
            data: {
              status: 200,
              result: { images: [['https://img.jpg']] },
            },
          });
        }
      });

      const urls = ['/read/manga/en/chapter-1', '/read/manga/en/chapter-2'];
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
      let callCount = 0;
      mockedAxios.get.mockImplementation(() => {
        callCount++;
        const callInCycle = ((callCount - 1) % 3) + 1;
        if (callInCycle === 1) {
          return Promise.resolve({ data: '<html>content</html>' });
        } else if (callInCycle === 2) {
          return Promise.resolve({ data: 'var chapterId = 1234567;' });
        } else {
          return Promise.resolve({
            data: { status: 200, result: { images: [['https://img.jpg']] } },
          });
        }
      });

      const urls = ['/read/manga/en/chapter-1', '/read/manga/en/chapter-2', '/read/manga/en/chapter-3'];
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
      mockedAxios.get.mockResolvedValue({
        data: {
          status: 200,
          result: { images: [['https://img1.jpg'], ['https://img2.jpg']] },
        },
      });

      const result = await fetchChapterImagesFromInterceptedRequest(
        '12345',
        'intercepted-vrf-token-123456789',
        '/read/manga/en/chapter-1'
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
      const html = '<div data-chapter-id="7654321"></div>';
      mockedAxios.get.mockResolvedValue({ data: html });

      const id = await getChapterIdFromPage('/read/manga/en/chapter-1');
      expect(id).toBe('7654321');
    });

    it('extracts chapter ID from JSON chapterId format', async () => {
      const html = '{"chapterId": 8765432}';
      mockedAxios.get.mockResolvedValue({ data: html });

      const id = await getChapterIdFromPage('/read/manga/en/chapter-1');
      expect(id).toBe('8765432');
    });

    it('extracts chapter ID from chapter_id JSON format', async () => {
      const html = '{"chapter_id": 9876543}';
      mockedAxios.get.mockResolvedValue({ data: html });

      const id = await getChapterIdFromPage('/read/manga/en/chapter-1');
      expect(id).toBe('9876543');
    });

    it('extracts chapter ID from URL pattern in script', async () => {
      const html = 'url: "/ajax/read/chapter/5432198"';
      mockedAxios.get.mockResolvedValue({ data: html });

      const id = await getChapterIdFromPage('/read/manga/en/chapter-1');
      expect(id).toBe('5432198');
    });

    it('extracts chapter ID from script tag with 6+ digit number', async () => {
      const html = '<script>var someVar = 1987654;</script>';
      mockedAxios.get.mockResolvedValue({ data: html });

      const id = await getChapterIdFromPage('/read/manga/en/chapter-1');
      expect(id).toBe('1987654');
    });

    it('filters out year-like numbers starting with 20', async () => {
      const html = '<script>var year = 20231225; var chapterId = 1234567;</script>';
      mockedAxios.get.mockResolvedValue({ data: html });

      const id = await getChapterIdFromPage('/read/manga/en/chapter-1');
      expect(id).toBe('1234567');
    });

    it('handles full URL input', async () => {
      mockedAxios.get.mockResolvedValue({ data: 'var chapterId = 1111111;' });

      await getChapterIdFromPage('https://mangafire.to/read/manga/en/chapter-1');
      expect(mockedAxios.get).toHaveBeenCalledWith(
        'https://mangafire.to/read/manga/en/chapter-1',
        expect.any(Object)
      );
    });

    it('extracts and stores VRF token when found', async () => {
      const html = 'const vrf = "VRFTOKENFROMCHAPTER123456789012345678901234567890"; var chapterId = 1234567;';
      mockedAxios.get.mockResolvedValue({ data: html });

      await getChapterIdFromPage('/read/manga/en/chapter-1');

      // VRF token should be stored
      expect(getVrfToken()).toBe('VRFTOKENFROMCHAPTER123456789012345678901234567890');
    });

    it('throws error on invalid response data', async () => {
      mockedAxios.get.mockResolvedValue({ data: null });

      const id = await getChapterIdFromPage('/read/manga/en/chapter-1');
      expect(id).toBeNull();
    });

    it('extracts chapter ID using let chapterId pattern', async () => {
      const html = 'let chapterId = 3456789;';
      mockedAxios.get.mockResolvedValue({ data: html });

      const id = await getChapterIdFromPage('/read/manga/en/chapter-1');
      expect(id).toBe('3456789');
    });

    it('extracts chapter ID using const chapterId pattern', async () => {
      const html = 'const chapterId = 4567890;';
      mockedAxios.get.mockResolvedValue({ data: html });

      const id = await getChapterIdFromPage('/read/manga/en/chapter-1');
      expect(id).toBe('4567890');
    });
  });

  describe('fetchMangaDetails chapter parsing edge cases', () => {
    it('extracts chapter number from URL when heading extraction fails', async () => {
      const html = `
        <h1 itemprop="name">Test Manga</h1>
        <h6></h6>
        <p>Ongoing</p>
        <li class="item">
          <a href="/read/test/en/chapter-15.5">
            <span></span>
            <span>Jan 1, 2024</span>
          </a>
        </li>
      `;
      mockedAxios.get.mockResolvedValue({ data: html });

      const details = await fetchMangaDetails('test-manga');

      expect(details.chapters).toHaveLength(1);
      expect(details.chapters[0].number).toBe('15.5');
    });

    it('handles chapter with extra title after colon', async () => {
      const html = `
        <h1 itemprop="name">Test Manga</h1>
        <li class="item">
          <a href="/read/test/en/chapter-10">
            <span>Chapter 10: The Beginning</span>
            <span>Jan 1, 2024</span>
          </a>
        </li>
      `;
      mockedAxios.get.mockResolvedValue({ data: html });

      const details = await fetchMangaDetails('test-manga');

      expect(details.chapters).toHaveLength(1);
      expect(details.chapters[0].number).toBe('10');
      expect(details.chapters[0].title).toBe('Chapter 10: The Beginning');
    });

    it('skips chapters without valid number', async () => {
      // Use empty spans and URL without chapter- prefix to ensure no valid number
      const html = `
        <h1 itemprop="name">Test Manga</h1>
        <li class="item">
          <a href="/read/test/en/page-1">
            <span></span>
            <span>Jan 1, 2024</span>
          </a>
        </li>
        <li class="item">
          <a href="/read/test/en/chapter-5">
            <span>Chapter 5</span>
            <span>Jan 2, 2024</span>
          </a>
        </li>
      `;
      mockedAxios.get.mockResolvedValue({ data: html });

      const details = await fetchMangaDetails('test-manga');

      expect(details.chapters).toHaveLength(1);
      expect(details.chapters[0].number).toBe('5');
    });

    it('handles non-Chapter prefixed headings', async () => {
      const html = `
        <h1 itemprop="name">Test Manga</h1>
        <li class="item">
          <a href="/read/test/en/chapter-100">
            <span>100</span>
            <span>Jan 1, 2024</span>
          </a>
        </li>
      `;
      mockedAxios.get.mockResolvedValue({ data: html });

      const details = await fetchMangaDetails('test-manga');

      expect(details.chapters).toHaveLength(1);
      expect(details.chapters[0].number).toBe('100');
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

  describe('fetchChapterImages with VRF token', () => {
    it('includes VRF token in request when provided', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          status: 200,
          result: { images: [['https://img.jpg']] },
        },
      });

      await fetchChapterImages('12345', 'my-vrf-token');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('vrf=my-vrf-token'),
        expect.any(Object)
      );
    });

    it('uses session VRF token when no token provided', async () => {
      setVrfToken('session-vrf-token');
      mockedAxios.get.mockResolvedValue({
        data: {
          status: 200,
          result: { images: [['https://img.jpg']] },
        },
      });

      await fetchChapterImages('12345');

      expect(mockedAxios.get).toHaveBeenCalledWith(
        expect.stringContaining('vrf=session-vrf-token'),
        expect.any(Object)
      );
    });

    it('throws error when response data is null', async () => {
      jest.useFakeTimers();
      mockedAxios.get.mockResolvedValue({ data: null });

      let thrownError: Error | undefined;
      const promise = fetchChapterImages('12345').catch(e => { thrownError = e; });
      await jest.runAllTimersAsync();
      await promise;

      expect(thrownError?.message).toContain('Invalid response data');
      jest.useRealTimers();
    });
  });

  describe('fetchChapterImagesFromUrl with VRF token', () => {
    it('uses provided VRF token', async () => {
      setVrfToken('existing-session-token');

      // getChapterIdFromPage
      mockedAxios.get.mockResolvedValueOnce({ data: 'var chapterId = 1234567;' });
      // fetchChapterImages
      mockedAxios.get.mockResolvedValueOnce({
        data: { status: 200, result: { images: [['https://img.jpg']] } },
      });

      const result = await fetchChapterImagesFromUrl('/read/manga/en/chapter-1', 'provided-vrf-token');

      expect(result.images).toHaveLength(1);
    });

    it('extracts VRF token when none provided and none in session', async () => {
      setVrfToken(''); // Clear session token

      // getVrfTokenFromChapterPage
      mockedAxios.get.mockResolvedValueOnce({
        data: '<input name="vrf" value="extracted-vrf-token-123456789012345">',
      });
      // getChapterIdFromPage
      mockedAxios.get.mockResolvedValueOnce({ data: 'var chapterId = 1234567;' });
      // fetchChapterImages
      mockedAxios.get.mockResolvedValueOnce({
        data: { status: 200, result: { images: [['https://img.jpg']] } },
      });

      const result = await fetchChapterImagesFromUrl('/read/manga/en/chapter-1');

      expect(result.images).toHaveLength(1);
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
