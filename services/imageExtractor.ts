import { decode } from 'html-entities';
import { ChapterImage, ImageDownloadStatus } from '@/types/download';
import { ImageExtractor } from '@/types/downloadInterfaces';
import { WebView } from 'react-native-webview';
import { logger } from '@/utils/logger';
import { isDebugEnabled } from '@/constants/env';
import {
  fetchChapterImagesFromUrl,
  fetchChapterImagesFromInterceptedRequest,
} from './mangaFireService';
import { webViewRequestInterceptor } from './webViewRequestInterceptor';

/**
 * Service for extracting image URLs from manga chapter pages
 * Handles both static HTML parsing and dynamic WebView extraction
 */
export class ImageExtractorService implements ImageExtractor {
  private log = logger();

  /**
   * Extract images from static HTML content or using MangaFire API
   * First tries to get chapter ID and use API, falls back to HTML parsing
   */
  async extractImagesFromHtml(
    html: string,
    chapterUrl?: string
  ): Promise<ChapterImage[]> {
    if (!html || typeof html !== 'string') {
      throw new Error('Invalid HTML content provided');
    }

    if (isDebugEnabled()) {
      this.log.info('Service', 'extractImagesFromHtml:start', {
        hasChapterUrl: !!chapterUrl,
        htmlLength: html.length,
      });
    }

    let apiImages: ChapterImage[] = [];
    let apiError: Error | null = null;

    // Try to use the MangaFire API first if we have a chapter URL
    if (chapterUrl) {
      try {
        if (isDebugEnabled()) {
          console.log('Attempting API extraction for:', chapterUrl);
        }

        apiImages = await this.extractImagesFromApi(chapterUrl);

        if (apiImages.length > 0) {
          if (isDebugEnabled()) {
            this.log.info('Service', 'extractImagesFromHtml:api_success', {
              totalImages: apiImages.length,
            });
          }
          return apiImages;
        } else {
          if (isDebugEnabled()) {
            console.log('API returned no images, falling back to HTML parsing');
          }
        }
      } catch (error) {
        apiError = error instanceof Error ? error : new Error(String(error));
        if (isDebugEnabled()) {
          this.log.warn(
            'Service',
            'API extraction failed, falling back to HTML parsing',
            {
              error: apiError.message,
            }
          );
        }
      }
    }

    // Fallback to HTML parsing
    try {
      const htmlImages = await this.extractImagesFromHtmlContent(html);

      if (htmlImages.length > 0) {
        if (isDebugEnabled()) {
          this.log.info('Service', 'extractImagesFromHtml:html_success', {
            totalImages: htmlImages.length,
          });
        }
        return htmlImages;
      } else {
        // If both API and HTML parsing failed, throw the API error if available
        if (apiError) {
          throw new Error(
            `Both API and HTML extraction failed. API error: ${apiError.message}. HTML parsing found no images.`
          );
        } else {
          throw new Error('No images found in HTML content');
        }
      }
    } catch (htmlError) {
      // If HTML parsing also failed, provide comprehensive error info
      const htmlErrorMsg =
        htmlError instanceof Error ? htmlError.message : String(htmlError);

      if (apiError) {
        throw new Error(
          `Both extraction methods failed. API error: ${apiError.message}. HTML error: ${htmlErrorMsg}`
        );
      } else {
        throw new Error(`HTML extraction failed: ${htmlErrorMsg}`);
      }
    }
  }

  /**
   * Extract images using intercepted WebView request data
   * This is the preferred method for mobile downloads
   */
  async extractImagesFromInterceptedRequest(
    chapterId: string,
    vrfToken: string,
    refererUrl?: string
  ): Promise<ChapterImage[]> {
    if (isDebugEnabled()) {
      this.log.info('Service', 'extractImagesFromInterceptedRequest:start', {
        chapterId,
      });
    }

    try {
      const apiResponse = await fetchChapterImagesFromInterceptedRequest(
        chapterId,
        vrfToken,
        refererUrl
      );

      if (!apiResponse.images || !Array.isArray(apiResponse.images)) {
        throw new Error(
          `Invalid API response format: ${JSON.stringify(apiResponse)}`
        );
      }

      if (apiResponse.images.length === 0) {
        throw new Error('API returned empty images array');
      }

      // Convert API response to ChapterImage format
      const images: ChapterImage[] = apiResponse.images
        .map((imageData, index) => {
          let imageUrl: string;

          if (Array.isArray(imageData)) {
            imageUrl = imageData[0] || '';
          } else if (typeof imageData === 'string') {
            imageUrl = imageData;
          } else {
            console.warn('Unexpected image data format:', imageData);
            imageUrl = '';
          }

          if (!imageUrl) {
            console.warn(`Empty image URL at index ${index}:`, imageData);
          }

          return {
            pageNumber: index + 1,
            originalUrl: imageUrl,
            downloadStatus: ImageDownloadStatus.PENDING,
          };
        })
        .filter((img) => img.originalUrl && img.originalUrl.trim() !== '');

      if (images.length === 0) {
        throw new Error('No valid image URLs found in API response');
      }

      if (isDebugEnabled()) {
        this.log.info(
          'Service',
          'extractImagesFromInterceptedRequest:success',
          {
            chapterId,
            totalImages: images.length,
            sampleUrls: images.slice(0, 3).map((img) => img.originalUrl),
          }
        );
      }

      return images;
    } catch (error) {
      this.log.error('Service', 'extractImagesFromInterceptedRequest:error', {
        chapterId,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Extract images using the MangaFire API by loading the chapter page in background
   */
  async extractImagesFromApi(chapterUrl: string): Promise<ChapterImage[]> {
    if (isDebugEnabled()) {
      this.log.info('Service', 'extractImagesFromApi:start', { chapterUrl });
    }

    try {
      // Use the new function that loads the chapter page in background and then calls the API
      const apiResponse = await fetchChapterImagesFromUrl(chapterUrl);

      if (!apiResponse.images || !Array.isArray(apiResponse.images)) {
        throw new Error(
          `Invalid API response format: ${JSON.stringify(apiResponse)}`
        );
      }

      if (apiResponse.images.length === 0) {
        throw new Error('API returned empty images array');
      }

      // Convert API response to ChapterImage format
      const images: ChapterImage[] = apiResponse.images
        .map((imageData, index) => {
          // API returns arrays like: ["https://image-url.jpg", 1, 0]
          // Where [0] is URL, [1] might be width/height ratio, [2] might be some flag
          let imageUrl: string;

          if (Array.isArray(imageData)) {
            imageUrl = imageData[0] || '';
          } else if (typeof imageData === 'string') {
            imageUrl = imageData;
          } else {
            console.warn('Unexpected image data format:', imageData);
            imageUrl = '';
          }

          if (!imageUrl) {
            console.warn(`Empty image URL at index ${index}:`, imageData);
          }

          return {
            pageNumber: index + 1,
            originalUrl: imageUrl,
            downloadStatus: ImageDownloadStatus.PENDING,
          };
        })
        .filter((img) => img.originalUrl && img.originalUrl.trim() !== ''); // Filter out empty URLs

      if (images.length === 0) {
        throw new Error('No valid image URLs found in API response');
      }

      if (isDebugEnabled()) {
        this.log.info('Service', 'extractImagesFromApi:success', {
          chapterUrl,
          totalImages: images.length,
          sampleUrls: images.slice(0, 3).map((img) => img.originalUrl),
        });
      }

      return images;
    } catch (error) {
      this.log.error('Service', 'extractImagesFromApi:error', {
        chapterUrl,
        error: error instanceof Error ? error.message : String(error),
      });
      throw error;
    }
  }

  /**
   * Extract images from HTML content (fallback method)
   */
  private async extractImagesFromHtmlContent(
    html: string
  ): Promise<ChapterImage[]> {
    const images: ChapterImage[] = [];

    // Look for the main pages container
    const pagesContainerMatch = html.match(
      /<div class="pages[^"]*"[^>]*>([\s\S]*?)<\/div>/
    );

    if (!pagesContainerMatch) {
      if (isDebugEnabled()) {
        this.log.warn('Service', 'No pages container found in HTML');
      }
      return [];
    }

    const pagesContent = pagesContainerMatch[1];

    if (!pagesContent) {
      return [];
    }

    // Extract individual page divs with images
    const pageRegex = /<div class="page"[^>]*>([\s\S]*?)<\/div>/g;
    let pageMatch;
    let pageIndex = 1;

    while ((pageMatch = pageRegex.exec(pagesContent)) !== null) {
      const pageContent = pageMatch[1];

      if (!pageContent) continue;

      // Look for img tags within the page
      const imgMatch = pageContent.match(/<img[^>]*>/);

      if (!imgMatch) continue;

      const imgTag = imgMatch[0];
      const srcMatch = imgTag.match(/src="([^"]*)"/);
      const dataNumberMatch = imgTag.match(/data-number="(\d+)"/);

      const src = srcMatch ? srcMatch[1] : '';
      const dataNumber = dataNumberMatch ? dataNumberMatch[1] : '';

      if (imgTag) {
        // Determine page number from data-number attribute or use sequential index
        const pageNumber = dataNumber ? parseInt(dataNumber, 10) : pageIndex;

        // Determine if image is loaded or not
        const isLoaded = !!src && src.trim() !== '';

        const chapterImage: ChapterImage = {
          pageNumber,
          originalUrl: src || '',
          downloadStatus: isLoaded
            ? ImageDownloadStatus.PENDING
            : ImageDownloadStatus.PENDING,
        };

        images.push(chapterImage);

        if (isDebugEnabled()) {
          this.log.info('Service', 'Found image', {
            pageNumber,
            hasUrl: !!src,
            isLoaded,
          });
        }
      }

      pageIndex++;
    }

    // Alternative parsing for different HTML structures
    if (images.length === 0) {
      images.push(...this.parseAlternativeStructure(html));
    }

    // Sort images by page number
    images.sort((a, b) => a.pageNumber - b.pageNumber);

    if (isDebugEnabled()) {
      this.log.info('Service', 'extractImagesFromHtmlContent:complete', {
        totalImages: images.length,
      });
    }

    return images;
  }

  /**
   * Parse alternative HTML structures that might be used
   */
  private parseAlternativeStructure(html: string): ChapterImage[] {
    const images: ChapterImage[] = [];

    // Try parsing img tags with data-number attributes directly
    const imgRegex =
      /<img[^>]*data-number="(\d+)"[^>]*(?:src="([^"]*)")?[^>]*>/g;
    let match;

    while ((match = imgRegex.exec(html)) !== null) {
      const pageNumber = parseInt(match[1] || '0', 10);
      const src = match[2] || '';

      const chapterImage: ChapterImage = {
        pageNumber,
        originalUrl: src || '',
        downloadStatus: ImageDownloadStatus.PENDING,
      };

      images.push(chapterImage);
    }

    // If still no images found, try a more generic approach
    if (images.length === 0) {
      const genericImgRegex = /<img[^>]*src="([^"]*)"[^>]*>/g;
      let genericMatch;
      let pageIndex = 1;

      while ((genericMatch = genericImgRegex.exec(html)) !== null) {
        const src = genericMatch[1] || '';

        // Filter out likely non-chapter images (icons, logos, etc.)
        if (this.isLikelyChapterImage(src)) {
          const chapterImage: ChapterImage = {
            pageNumber: pageIndex,
            originalUrl: src,
            downloadStatus: ImageDownloadStatus.PENDING,
          };

          images.push(chapterImage);
          pageIndex++;
        }
      }
    }

    return images;
  }

  /**
   * Determine if an image URL is likely a chapter page image
   */
  private isLikelyChapterImage(url: string): boolean {
    if (!url) return false;

    const lowerUrl = url.toLowerCase();

    // Exclude common non-chapter image patterns
    const excludePatterns = [
      'logo',
      'icon',
      'avatar',
      'banner',
      'cover',
      'thumb',
      'favicon',
      'ads',
      'advertisement',
    ];

    for (const pattern of excludePatterns) {
      if (lowerUrl.includes(pattern)) {
        return false;
      }
    }

    // Include common chapter image patterns
    const includePatterns = ['chapter', 'page', 'manga', 'manhwa', 'manhua'];

    for (const pattern of includePatterns) {
      if (lowerUrl.includes(pattern)) {
        return true;
      }
    }

    // If no specific patterns match, check if it's a reasonable image URL
    return /\.(jpg|jpeg|png|webp|gif)(\?|$)/i.test(url);
  }

  /**
   * Extract images from WebView using JavaScript injection
   */
  async extractImagesFromWebView(webView: WebView): Promise<ChapterImage[]> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebView image extraction timeout'));
      }, 10000); // 10 second timeout

      // Inject JavaScript to extract images
      const extractionScript = this.getImageExtractionScript();

      try {
        webView.injectJavaScript(extractionScript);

        // The result will be handled by the message handler
        // This is a simplified implementation - the actual extraction
        // will be handled through WebView message events
        resolve([]);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Wait for images to be loaded in WebView and then extract them
   */
  async waitForImagesLoaded(webView: WebView): Promise<ChapterImage[]> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('WebView image loading timeout'));
      }, 30000); // 30 second timeout for loading

      // Inject JavaScript to monitor image loading
      const monitoringScript = this.getImageLoadingMonitorScript();

      try {
        webView.injectJavaScript(monitoringScript);

        // The result will be handled by the message handler
        resolve([]);
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Validate and clean image URLs
   */
  private validateImageUrl(url: string): string {
    if (!url) return '';

    try {
      // Decode HTML entities
      const decodedUrl = decode(url);

      // Basic URL validation
      new URL(decodedUrl);

      return decodedUrl;
    } catch {
      // If URL is invalid, return empty string
      return '';
    }
  }

  /**
   * Generate JavaScript code for extracting images from WebView
   */
  getImageExtractionScript(): string {
    return `
      (function() {
        try {
          function extractChapterImages() {
            const images = [];
            
            // Look for pages container
            const pagesContainer = document.querySelector('.pages');
            if (!pagesContainer) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'IMAGE_EXTRACTION_ERROR',
                error: 'No pages container found'
              }));
              return;
            }
            
            // Extract images from page elements
            const pages = pagesContainer.querySelectorAll('.page');
            pages.forEach((page, index) => {
              const img = page.querySelector('img[data-number]');
              if (img) {
                const pageNumber = parseInt(img.dataset.number) || (index + 1);
                const src = img.src || '';
                const isLoaded = img.complete && img.naturalHeight !== 0;
                
                images.push({
                  pageNumber: pageNumber,
                  originalUrl: src,
                  isLoaded: isLoaded,
                  hasDataNumber: !!img.dataset.number
                });
              }
            });
            
            // Send results back to React Native
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'CHAPTER_IMAGES_EXTRACTED',
              images: images,
              totalFound: images.length
            }));
          }
          
          // Execute extraction
          extractChapterImages();
          
        } catch (error) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'IMAGE_EXTRACTION_ERROR',
            error: error.message
          }));
        }
      })();
      true;
    `;
  }

  /**
   * Generate JavaScript code for monitoring image loading in WebView
   */
  getImageLoadingMonitorScript(): string {
    return `
      (function() {
        try {
          let checkCount = 0;
          const maxChecks = 60; // Check for 30 seconds (500ms intervals)
          
          function checkImageLoading() {
            checkCount++;
            
            const pagesContainer = document.querySelector('.pages');
            if (!pagesContainer) {
              if (checkCount < maxChecks) {
                setTimeout(checkImageLoading, 500);
                return;
              } else {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'IMAGE_LOADING_TIMEOUT',
                  error: 'Pages container not found after timeout'
                }));
                return;
              }
            }
            
            const images = [];
            const pages = pagesContainer.querySelectorAll('.page img[data-number]');
            let loadedCount = 0;
            let totalCount = pages.length;
            
            pages.forEach((img, index) => {
              const pageNumber = parseInt(img.dataset.number) || (index + 1);
              const src = img.src || '';
              const isLoaded = img.complete && img.naturalHeight !== 0;
              
              if (isLoaded) loadedCount++;
              
              images.push({
                pageNumber: pageNumber,
                originalUrl: src,
                isLoaded: isLoaded,
                hasDataNumber: !!img.dataset.number
              });
            });
            
            // Send progress update
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'IMAGE_LOADING_PROGRESS',
              images: images,
              loadedCount: loadedCount,
              totalCount: totalCount,
              progress: totalCount > 0 ? (loadedCount / totalCount) * 100 : 0
            }));
            
            // If all images are loaded or we've reached max checks, send final result
            if (loadedCount === totalCount || checkCount >= maxChecks) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'IMAGE_LOADING_COMPLETE',
                images: images,
                loadedCount: loadedCount,
                totalCount: totalCount,
                allLoaded: loadedCount === totalCount
              }));
            } else {
              // Continue checking
              setTimeout(checkImageLoading, 500);
            }
          }
          
          // Start monitoring
          checkImageLoading();
          
        } catch (error) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'IMAGE_LOADING_ERROR',
            error: error.message
          }));
        }
      })();
      true;
    `;
  }

  /**
   * Generate enhanced JavaScript injection for download detection
   */
  getDownloadDetectionScript(): string {
    return `
      (function() {
        try {
          // Enhanced image detection for download purposes
          function detectChapterImages() {
            const pages = document.querySelectorAll('.page');
            const images = [];
            
            pages.forEach((page, index) => {
              const img = page.querySelector('img[data-number]');
              if (img) {
                const pageNumber = parseInt(img.dataset.number) || (index + 1);
                const src = img.src || '';
                const isLoaded = img.complete && img.naturalHeight !== 0;
                
                images.push({
                  pageNumber: pageNumber,
                  originalUrl: src,
                  isLoaded: isLoaded,
                  element: {
                    width: img.naturalWidth || 0,
                    height: img.naturalHeight || 0,
                    className: img.className
                  }
                });
              }
            });
            
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'CHAPTER_IMAGES_DETECTED',
              images: images,
              timestamp: Date.now()
            }));
          }
          
          // Monitor for dynamic image loading
          function monitorImageLoading() {
            const observer = new MutationObserver((mutations) => {
              let shouldUpdate = false;
              
              mutations.forEach((mutation) => {
                if (mutation.type === 'attributes' && 
                    (mutation.attributeName === 'src' || mutation.attributeName === 'class')) {
                  shouldUpdate = true;
                } else if (mutation.type === 'childList') {
                  shouldUpdate = true;
                }
              });
              
              if (shouldUpdate) {
                detectChapterImages();
              }
            });
            
            const pagesContainer = document.querySelector('.pages');
            if (pagesContainer) {
              observer.observe(pagesContainer, {
                childList: true,
                subtree: true,
                attributes: true,
                attributeFilter: ['src', 'class', 'data-number']
              });
            }
          }
          
          // Initialize detection
          detectChapterImages();
          monitorImageLoading();
          
          // Also detect on page load events
          window.addEventListener('load', detectChapterImages);
          document.addEventListener('DOMContentLoaded', detectChapterImages);
          
        } catch (error) {
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'DOWNLOAD_DETECTION_ERROR',
            error: error.message
          }));
        }
      })();
      true;
    `;
  }

  /**
   * Process WebView message data and convert to ChapterImage array
   */
  processWebViewMessage(messageData: any): ChapterImage[] {
    try {
      if (!messageData || !Array.isArray(messageData.images)) {
        return [];
      }

      const images: ChapterImage[] = messageData.images
        .map((img: any) => {
          if (!img.pageNumber || typeof img.pageNumber !== 'number') {
            return null;
          }

          const validatedUrl = this.validateImageUrl(img.originalUrl || '');

          return {
            pageNumber: img.pageNumber,
            originalUrl: validatedUrl,
            downloadStatus: ImageDownloadStatus.PENDING,
          };
        })
        .filter(
          (img: ChapterImage | null): img is ChapterImage => img !== null
        );

      // Sort by page number
      images.sort((a, b) => a.pageNumber - b.pageNumber);

      if (isDebugEnabled()) {
        this.log.info('Service', 'Processed WebView message', {
          originalCount: messageData.images.length,
          processedCount: images.length,
        });
      }

      return images;
    } catch (error) {
      this.log.error('Service', 'Error processing WebView message', {
        error,
      });
      return [];
    }
  }

  /**
   * Extract images from a specific page element (for WebView integration)
   */
  extractImagesFromPageElement(pageElement: string): ChapterImage | null {
    try {
      const imgMatch = pageElement.match(/<img[^>]*>/);

      if (!imgMatch) return null;

      const imgTag = imgMatch[0];
      const srcMatch = imgTag.match(/src="([^"]*)"/);
      const dataNumberMatch = imgTag.match(/data-number="(\d+)"/);

      const src = srcMatch ? srcMatch[1] : '';
      const dataNumber = dataNumberMatch ? dataNumberMatch[1] : '';

      if (!dataNumber) return null;

      const pageNumber = parseInt(dataNumber, 10);
      const validatedUrl = this.validateImageUrl(src || '');

      return {
        pageNumber,
        originalUrl: validatedUrl,
        downloadStatus: validatedUrl
          ? ImageDownloadStatus.PENDING
          : ImageDownloadStatus.PENDING,
      };
    } catch (error) {
      if (isDebugEnabled()) {
        this.log.warn('Service', 'Failed to extract from page element', {
          error,
        });
      }
      return null;
    }
  }
}

// Export singleton instance
export const imageExtractorService = new ImageExtractorService();
