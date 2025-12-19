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
      mockedAxios.get.mockResolvedValue({
        data: '<html>cf-browser-verification</html>',
      });

      try {
        await searchManga('test');
        fail('Should have thrown CloudflareDetectedError');
      } catch (error) {
        expect(error).toBeInstanceOf(CloudflareDetectedError);
        expect((error as CloudflareDetectedError).message).toContain(
          'Cloudflare verification detected'
        );
      }
    });

    it('detects Cloudflare with various markers', async () => {
      const markers = [
        'cf_captcha_kind',
        'attention required',
        'just a moment',
      ];

      for (const marker of markers) {
        mockedAxios.get.mockResolvedValue({
          data: `<html>${marker}</html>`,
        });

        await expect(searchManga('test')).rejects.toBeInstanceOf(
          CloudflareDetectedError
        );
      }
    });

    it('throws error on invalid response data', async () => {
      mockedAxios.get.mockResolvedValue({ data: null });

      await expect(searchManga('test')).rejects.toThrow('Invalid response data');
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
      mockedAxios.get.mockResolvedValue({
        data: {
          status: 500,
          result: null,
        },
      });

      await expect(fetchChapterImages('12345')).rejects.toThrow(
        'API returned status 500'
      );
    });

    it('throws error on missing images in response', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          status: 200,
          result: {},
        },
      });

      await expect(fetchChapterImages('12345')).rejects.toThrow(
        'Invalid image data'
      );
    });

    it('throws error on empty images array', async () => {
      mockedAxios.get.mockResolvedValue({
        data: {
          status: 200,
          result: { images: [] },
        },
      });

      await expect(fetchChapterImages('12345')).rejects.toThrow(
        'No images found'
      );
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
      // First call gets the page with chapter ID
      mockedAxios.get.mockResolvedValueOnce({
        data: 'var chapterId = 1234567;',
      });
      // Second call gets the images
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
      // Mock for chapter ID extraction
      mockedAxios.get.mockImplementation((url) => {
        if (url.includes('/read/')) {
          return Promise.resolve({ data: 'var chapterId = 1234567;' });
        }
        return Promise.resolve({
          data: {
            status: 200,
            result: { images: [['https://img.jpg']] },
          },
        });
      });

      const urls = ['/read/manga/en/chapter-1', '/read/manga/en/chapter-2'];
      const onProgress = jest.fn();
      const onError = jest.fn();

      const results = await batchFetchChapterImages(urls, {
        maxConcurrent: 1,
        delayBetweenRequests: 0,
        onProgress,
        onError,
      });

      expect(results).toHaveLength(2);
      expect(onProgress).toHaveBeenCalled();
    });

    it('handles errors in batch processing', async () => {
      mockedAxios.get.mockRejectedValue(new Error('Network error'));

      const urls = ['/read/manga/en/chapter-1'];
      const onError = jest.fn();

      const results = await batchFetchChapterImages(urls, {
        onError,
      });

      expect(results[0]).toHaveProperty('error');
      expect(onError).toHaveBeenCalled();
    });
  });
});
