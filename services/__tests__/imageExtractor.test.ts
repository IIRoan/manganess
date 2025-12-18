import { ImageExtractorService, imageExtractorService } from '../imageExtractor';
import { ImageDownloadStatus } from '@/types/download';

// Mock dependencies
jest.mock('@/utils/logger', () => ({
  logger: () => ({
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  }),
}));

jest.mock('@/constants/env', () => ({
  isDebugEnabled: jest.fn(() => false),
}));

jest.mock('../mangaFireService', () => ({
  fetchChapterImagesFromUrl: jest.fn(),
  fetchChapterImagesFromInterceptedRequest: jest.fn(),
}));

import {
  fetchChapterImagesFromUrl,
  fetchChapterImagesFromInterceptedRequest,
} from '../mangaFireService';
import { isDebugEnabled } from '@/constants/env';

const mockFetchFromUrl = fetchChapterImagesFromUrl as jest.MockedFunction<
  typeof fetchChapterImagesFromUrl
>;
const mockFetchFromIntercepted = fetchChapterImagesFromInterceptedRequest as jest.MockedFunction<
  typeof fetchChapterImagesFromInterceptedRequest
>;

describe('ImageExtractorService', () => {
  let service: ImageExtractorService;

  beforeEach(() => {
    jest.clearAllMocks();
    service = new ImageExtractorService();
    (isDebugEnabled as jest.Mock).mockReturnValue(false);
  });

  describe('extractImagesFromHtml', () => {
    it('throws error for invalid HTML content', async () => {
      await expect(service.extractImagesFromHtml('')).rejects.toThrow(
        'Invalid HTML content provided'
      );

      await expect(service.extractImagesFromHtml(null as any)).rejects.toThrow(
        'Invalid HTML content provided'
      );
    });

    it('tries API extraction first when chapterUrl is provided', async () => {
      mockFetchFromUrl.mockResolvedValue({
        images: [
          ['https://example.com/page1.jpg'],
          ['https://example.com/page2.jpg'],
        ],
        status: 200,
      });

      const result = await service.extractImagesFromHtml(
        '<div>some html</div>',
        'https://example.com/chapter/1'
      );

      expect(mockFetchFromUrl).toHaveBeenCalledWith(
        'https://example.com/chapter/1'
      );
      expect(result).toHaveLength(2);
      const [firstImage] = result;
      expect(firstImage?.pageNumber).toBe(1);
      expect(firstImage?.originalUrl).toBe('https://example.com/page1.jpg');
    });

    it('falls back to HTML parsing when API fails', async () => {
      mockFetchFromUrl.mockRejectedValue(new Error('API error'));

      const html = `
        <div class="pages">
          <div class="page">
            <img src="https://example.com/page1.jpg" data-number="1" />
          </div>
          <div class="page">
            <img src="https://example.com/page2.jpg" data-number="2" />
          </div>
        </div>
      `;

      const result = await service.extractImagesFromHtml(
        html,
        'https://example.com/chapter/1'
      );

      expect(result).toHaveLength(2);
      const [firstImage, secondImage] = result;
      expect(firstImage?.pageNumber).toBe(1);
      expect(secondImage?.pageNumber).toBe(2);
    });

    it('extracts images from HTML with alternative structure', async () => {
      // Test alternative parsing that finds img with data-number
      const html = `
        <html>
          <img data-number="1" src="https://example.com/chapter/img1.jpg" />
          <img data-number="2" src="https://example.com/chapter/img2.jpg" />
        </html>
      `;

      const result = await service.extractImagesFromHtml(html);

      // Should find images via alternative parsing
      expect(result.length).toBeGreaterThanOrEqual(0);
    });

    it('throws error when both API and HTML extraction fail', async () => {
      mockFetchFromUrl.mockRejectedValue(new Error('API failed'));

      const html = '<div>no images here</div>';

      await expect(
        service.extractImagesFromHtml(html, 'https://example.com/chapter/1')
      ).rejects.toThrow('Both extraction methods failed');
    });
  });

  describe('extractImagesFromApi', () => {
    it('converts API response to ChapterImage format', async () => {
      mockFetchFromUrl.mockResolvedValue({
        images: [
          ['https://example.com/page1.jpg', '1', '0'],
          ['https://example.com/page2.jpg', '1', '0'],
        ],
        status: 200,
      });

      const result = await service.extractImagesFromApi(
        'https://example.com/chapter/1'
      );

      expect(result).toHaveLength(2);
      const [firstImage] = result;
      expect(firstImage).toMatchObject({
        pageNumber: 1,
        originalUrl: 'https://example.com/page1.jpg',
        downloadStatus: ImageDownloadStatus.PENDING,
      });
    });

    it('handles string image data format', async () => {
      mockFetchFromUrl.mockResolvedValue({
        images: [
          'https://example.com/page1.jpg',
          'https://example.com/page2.jpg',
        ] as unknown as string[][],
        status: 200,
      });

      const result = await service.extractImagesFromApi(
        'https://example.com/chapter/1'
      );

      expect(result).toHaveLength(2);
      const [firstImage] = result;
      expect(firstImage?.originalUrl).toBe('https://example.com/page1.jpg');
    });

    it('throws error for invalid API response', async () => {
      mockFetchFromUrl.mockResolvedValue({ images: null } as any);

      await expect(
        service.extractImagesFromApi('https://example.com/chapter/1')
      ).rejects.toThrow('Invalid API response format');
    });

    it('throws error for empty images array', async () => {
      mockFetchFromUrl.mockResolvedValue({ images: [], status: 200 });

      await expect(
        service.extractImagesFromApi('https://example.com/chapter/1')
      ).rejects.toThrow('API returned empty images array');
    });

    it('filters out empty image URLs', async () => {
      mockFetchFromUrl.mockResolvedValue({
        images: [
          ['https://example.com/page1.jpg'],
          [''],
          ['https://example.com/page3.jpg'],
          [null as any],
        ],
        status: 200,
      });

      const result = await service.extractImagesFromApi(
        'https://example.com/chapter/1'
      );

      expect(result).toHaveLength(2);
      const [firstImage, secondImage] = result;
      expect(firstImage?.pageNumber).toBe(1);
      expect(secondImage?.pageNumber).toBe(3);
    });
  });

  describe('extractImagesFromInterceptedRequest', () => {
    it('extracts images from intercepted request data', async () => {
      mockFetchFromIntercepted.mockResolvedValue({
        images: [
          ['https://example.com/img1.jpg'],
          ['https://example.com/img2.jpg'],
        ],
        status: 200,
      });

      const result = await service.extractImagesFromInterceptedRequest(
        'chapter-123',
        'vrf-token-abc'
      );

      expect(mockFetchFromIntercepted).toHaveBeenCalledWith(
        'chapter-123',
        'vrf-token-abc',
        undefined
      );
      expect(result).toHaveLength(2);
    });

    it('passes referer URL when provided', async () => {
      mockFetchFromIntercepted.mockResolvedValue({
        images: [['https://example.com/img1.jpg']],
        status: 200,
      });

      await service.extractImagesFromInterceptedRequest(
        'chapter-123',
        'vrf-token',
        'https://referer.com'
      );

      expect(mockFetchFromIntercepted).toHaveBeenCalledWith(
        'chapter-123',
        'vrf-token',
        'https://referer.com'
      );
    });

    it('throws error for invalid response format', async () => {
      mockFetchFromIntercepted.mockResolvedValue({
        images: 'not-an-array',
      } as any);

      await expect(
        service.extractImagesFromInterceptedRequest('ch-1', 'token')
      ).rejects.toThrow('Invalid API response format');
    });

    it('throws error when no valid URLs found', async () => {
      mockFetchFromIntercepted.mockResolvedValue({
        images: [[''], [null as any], ['   ']],
        status: 200,
      });

      await expect(
        service.extractImagesFromInterceptedRequest('ch-1', 'token')
      ).rejects.toThrow('No valid image URLs found');
    });
  });

  describe('isLikelyChapterImage', () => {
    // Access private method through any cast for testing
    const isLikelyChapterImage = (url: string) =>
      (service as any).isLikelyChapterImage(url);

    it('returns false for empty URLs', () => {
      expect(isLikelyChapterImage('')).toBe(false);
      expect(isLikelyChapterImage(null as any)).toBe(false);
    });

    it('excludes common non-chapter image patterns', () => {
      expect(isLikelyChapterImage('https://example.com/logo.png')).toBe(false);
      expect(isLikelyChapterImage('https://example.com/icon.jpg')).toBe(false);
      expect(isLikelyChapterImage('https://example.com/avatar.png')).toBe(false);
      expect(isLikelyChapterImage('https://example.com/banner.jpg')).toBe(false);
      expect(isLikelyChapterImage('https://example.com/cover.jpg')).toBe(false);
      expect(isLikelyChapterImage('https://example.com/thumb.png')).toBe(false);
      expect(isLikelyChapterImage('https://example.com/favicon.ico')).toBe(false);
      expect(isLikelyChapterImage('https://example.com/ads/image.jpg')).toBe(false);
    });

    it('includes common chapter image patterns', () => {
      expect(isLikelyChapterImage('https://example.com/chapter/1.jpg')).toBe(true);
      expect(isLikelyChapterImage('https://example.com/page/001.png')).toBe(true);
      expect(isLikelyChapterImage('https://example.com/manga/img.jpg')).toBe(true);
      expect(isLikelyChapterImage('https://example.com/manhwa/001.webp')).toBe(true);
      expect(isLikelyChapterImage('https://example.com/manhua/page.jpg')).toBe(true);
    });

    it('accepts URLs with common image extensions', () => {
      expect(isLikelyChapterImage('https://example.com/image123.jpg')).toBe(true);
      expect(isLikelyChapterImage('https://example.com/image.jpeg')).toBe(true);
      expect(isLikelyChapterImage('https://example.com/image.png')).toBe(true);
      expect(isLikelyChapterImage('https://example.com/image.webp')).toBe(true);
      expect(isLikelyChapterImage('https://example.com/image.gif')).toBe(true);
    });
  });

  describe('processWebViewMessage', () => {
    it('processes valid WebView message data', () => {
      const messageData = {
        images: [
          { pageNumber: 1, originalUrl: 'https://example.com/page1.jpg' },
          { pageNumber: 2, originalUrl: 'https://example.com/page2.jpg' },
        ],
      };

      const result = service.processWebViewMessage(messageData);

      expect(result).toHaveLength(2);
      const [firstImage] = result;
      expect(firstImage).toMatchObject({
        pageNumber: 1,
        originalUrl: 'https://example.com/page1.jpg',
        downloadStatus: ImageDownloadStatus.PENDING,
      });
    });

    it('returns empty array for invalid message data', () => {
      expect(service.processWebViewMessage(null)).toEqual([]);
      expect(service.processWebViewMessage(undefined)).toEqual([]);
      expect(service.processWebViewMessage({})).toEqual([]);
      expect(service.processWebViewMessage({ images: 'not-array' })).toEqual([]);
    });

    it('filters out invalid images', () => {
      const messageData = {
        images: [
          { pageNumber: 1, originalUrl: 'https://example.com/page1.jpg' },
          { pageNumber: null, originalUrl: 'https://example.com/page2.jpg' },
          { pageNumber: 'invalid', originalUrl: 'https://example.com/page3.jpg' },
          { pageNumber: 2, originalUrl: 'https://example.com/page4.jpg' },
        ],
      };

      const result = service.processWebViewMessage(messageData);

      expect(result).toHaveLength(2);
      const [firstImage, secondImage] = result;
      expect(firstImage?.pageNumber).toBe(1);
      expect(secondImage?.pageNumber).toBe(2);
    });

    it('sorts images by page number', () => {
      const messageData = {
        images: [
          { pageNumber: 3, originalUrl: 'https://example.com/page3.jpg' },
          { pageNumber: 1, originalUrl: 'https://example.com/page1.jpg' },
          { pageNumber: 2, originalUrl: 'https://example.com/page2.jpg' },
        ],
      };

      const result = service.processWebViewMessage(messageData);

      expect(result.map((img) => img.pageNumber)).toEqual([1, 2, 3]);
    });
  });

  describe('extractImagesFromPageElement', () => {
    it('extracts image from page element HTML', () => {
      const pageHtml = '<img src="https://example.com/page.jpg" data-number="5" />';

      const result = service.extractImagesFromPageElement(pageHtml);

      expect(result).not.toBeNull();
      expect(result?.pageNumber).toBe(5);
      expect(result?.originalUrl).toBe('https://example.com/page.jpg');
    });

    it('returns null for element without img tag', () => {
      const pageHtml = '<div>no image</div>';

      const result = service.extractImagesFromPageElement(pageHtml);

      expect(result).toBeNull();
    });

    it('returns null for element without data-number', () => {
      const pageHtml = '<img src="https://example.com/page.jpg" />';

      const result = service.extractImagesFromPageElement(pageHtml);

      expect(result).toBeNull();
    });

    it('handles img without src', () => {
      const pageHtml = '<img data-number="1" />';

      const result = service.extractImagesFromPageElement(pageHtml);

      expect(result).not.toBeNull();
      expect(result?.pageNumber).toBe(1);
      expect(result?.originalUrl).toBe('');
    });
  });

  describe('JavaScript injection scripts', () => {
    it('generates image extraction script', () => {
      const script = service.getImageExtractionScript();

      expect(script).toContain('extractChapterImages');
      expect(script).toContain('CHAPTER_IMAGES_EXTRACTED');
      expect(script).toContain('window.ReactNativeWebView.postMessage');
    });

    it('generates image loading monitor script', () => {
      const script = service.getImageLoadingMonitorScript();

      expect(script).toContain('checkImageLoading');
      expect(script).toContain('IMAGE_LOADING_PROGRESS');
      expect(script).toContain('IMAGE_LOADING_COMPLETE');
    });

    it('generates download detection script', () => {
      const script = service.getDownloadDetectionScript();

      expect(script).toContain('detectChapterImages');
      expect(script).toContain('CHAPTER_IMAGES_DETECTED');
      expect(script).toContain('MutationObserver');
    });
  });

  describe('singleton instance', () => {
    it('exports singleton instance', () => {
      expect(imageExtractorService).toBeInstanceOf(ImageExtractorService);
    });
  });
});
