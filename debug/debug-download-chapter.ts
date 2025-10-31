// Debug script to test chapter download flow
// This simulates capturing the AJAX request from a WebView
// In the actual app, you'll use WebView's request interception
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { MANGA_API_URL } from '../constants/Config';
import { logger } from '../utils/logger';

interface ChapterImage {
  url: string;
  index: number;
}

interface CapturedRequest {
  url: string;
  chapterId: string;
  vrfToken: string;
}

class ChapterDownloader {
  /**
   * Simulates what happens when WebView intercepts a request
   * In your actual app, this will be called from WebView's onShouldStartLoadWithRequest
   */
  captureAjaxRequest(url: string): CapturedRequest | null {
    logger().debug('Network', 'Checking URL', { url });

    // Check if this is the AJAX request we're looking for
    if (url.includes('/ajax/read/chapter/')) {
      logger().info('Network', 'Found AJAX request');

      // Extract chapter ID and VRF token from URL
      // Example: https://mangafire.to/ajax/read/chapter/5438730?vrf=ZBYeRCjYBk0tkZnKW4kTuWBYw5Y1e-csvu6vYLUY4zeiviixfq7VJ6djZFHAZyMAbiWlOFhCoA
      const match = url.match(/\/ajax\/read\/chapter\/(\d+)\?vrf=([^&]+)/);

      if (match) {
        const [, rawChapterId, rawVrfToken] = match;
        if (!rawChapterId || !rawVrfToken) {
          return null;
        }

        let decodedToken: string;
        try {
          decodedToken = decodeURIComponent(rawVrfToken);
        } catch (decodeError) {
          logger().error('Network', 'Failed to decode VRF token', {
            error: decodeError,
          });
          return null;
        }

        logger().debug('Network', 'Extracted chapter details', {
          chapterId: rawChapterId,
          vrfTokenPreview: decodedToken.substring(0, 30) + '...',
        });

        return {
          url,
          chapterId: rawChapterId,
          vrfToken: decodedToken,
        };
      }
    }

    return null;
  }

  /**
   * Downloads a chapter by making the AJAX request and downloading images
   */
  async downloadChapterFromRequest(
    capturedRequest: CapturedRequest
  ): Promise<void> {
    logger().info(
      'Network',
      'Step 1: Fetching image panels from AJAX request',
      { url: capturedRequest.url }
    );

    const images = await this.getImagePanels(capturedRequest.url);

    if (!images || images.length === 0) {
      logger().warn('Network', 'No images found in response');
      return;
    }

    logger().info('Network', 'Found images', { count: images.length });

    logger().info('Storage', 'Step 2: Downloading images');
    await this.downloadImages(images);

    logger().info('Storage', 'Chapter download complete');
  }

  private async getImagePanels(ajaxUrl: string): Promise<ChapterImage[]> {
    try {
      const response = await axios.get(ajaxUrl, {
        headers: {
          Accept: 'application/json, text/javascript, */*; q=0.01',
          'Accept-Language': 'en-US,en;q=0.9',
          Referer: MANGA_API_URL,
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36',
          'X-Requested-With': 'XMLHttpRequest',
        },
        timeout: 20000,
      });

      logger().info('Network', 'AJAX request successful');
      logger().debug('Network', 'Response data', response.data);

      if (response.data?.result?.images) {
        const images: ChapterImage[] = response.data.result.images.map(
          (img: any, index: number) => ({
            url: img[0],
            index: index + 1,
          })
        );
        return images;
      }

      return [];
    } catch (error) {
      if (axios.isAxiosError(error)) {
        logger().error('Network', 'AJAX request failed', {
          status: error.response?.status,
          data: error.response?.data,
        });
      } else {
        logger().error('Network', 'Request error', { error });
      }
      return [];
    }
  }

  private async downloadImages(images: ChapterImage[]): Promise<void> {
    const downloadDir = path.join(process.cwd(), 'debug', 'downloads');
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    logger().info('Storage', 'Starting image downloads', {
      downloadDir,
      imageCount: images.length,
    });

    let successCount = 0;
    let failCount = 0;

    for (const image of images) {
      try {
        logger().debug('Storage', 'Downloading image', {
          current: image.index,
          total: images.length,
        });

        const response = await axios.get(image.url, {
          responseType: 'arraybuffer',
          headers: {
            'User-Agent':
              'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
            Referer: MANGA_API_URL,
            Accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
          },
          timeout: 30000,
        });

        const urlExt = path.extname(new URL(image.url).pathname);
        const ext = urlExt || '.jpg';
        const filename = `page-${String(image.index).padStart(3, '0')}${ext}`;
        const filepath = path.join(downloadDir, filename);

        fs.writeFileSync(filepath, response.data);

        const sizeKB = (response.data.length / 1024).toFixed(2);
        logger().debug('Storage', 'Image saved', { filename, sizeKB });
        successCount++;
      } catch (error) {
        logger().error('Storage', 'Failed to download image', {
          imageIndex: image.index,
          error: error instanceof Error ? error.message : error,
        });
        failCount++;
      }
    }

    logger().info('Storage', 'Download Summary', {
      success: successCount,
      failed: failCount,
      location: downloadDir,
    });
  }
}

// Test with a known AJAX URL (you need to get this from browser DevTools)
async function testWithManualUrl() {
  logger().info('Service', 'Testing with manually captured AJAX URL');
  logger().info('Service', 'INSTRUCTIONS:');
  logger().info(
    'Service',
    '1. Open Chrome and go to: https://mangafire.to/read/tonari-no-wakao-san-wa-miesou-de-mienai.yj820/en/chapter-17'
  );
  logger().info('Service', '2. Open DevTools (F12) and go to Network tab');
  logger().info(
    'Service',
    '3. Look for a request like: GET /ajax/read/chapter/XXXXXXX?vrf=YYYYY'
  );
  logger().info('Service', '4. Right-click on it and "Copy > Copy URL"');
  logger().info('Service', '5. Paste the URL below and run this script again');

  // PASTE THE CAPTURED URL HERE:
  const defaultAjaxUrl =
    process.env.DEBUG_CAPTURED_AJAX_URL ??
    'https://mangafire.to/ajax/read/chapter/5438730?vrf=ZBYeRCjYBk0tkZnKW4kTuWBYw5Y1e-csvu6vYLUY4zeiviixfq7VJ6djZFHAZyMAbiWlOFhCoA';
  const capturedAjaxUrl: string = defaultAjaxUrl.trim();

  if (!capturedAjaxUrl) {
    logger().warn(
      'Service',
      'No URL provided. Please capture the AJAX URL from browser DevTools.'
    );
    logger().info(
      'Service',
      'Example URL format: https://mangafire.to/ajax/read/chapter/5438730?vrf=ZBYeRCjYBk0...'
    );
    return;
  }

  const downloader = new ChapterDownloader();
  const captured = downloader.captureAjaxRequest(capturedAjaxUrl);

  if (captured) {
    await downloader.downloadChapterFromRequest(captured);
  } else {
    logger().error('Service', 'Invalid AJAX URL format');
  }
}

// Simulate how it will work in the actual app
async function simulateWebViewFlow() {
  logger().info('Service', 'Simulating WebView Request Interception Flow');
  logger().info(
    'Service',
    'This is how it will work in your React Native app:'
  );
  logger().info('Service', '1. User opens chapter in WebView');
  logger().info('Service', '2. WebView loads the page and makes requests');
  logger().info(
    'Service',
    '3. onShouldStartLoadWithRequest intercepts ALL requests'
  );
  logger().info(
    'Service',
    '4. We check each request URL for /ajax/read/chapter/'
  );
  logger().info('Service', '5. When found, extract chapter ID and VRF token');
  logger().info(
    'Service',
    '6. Make the AJAX request ourselves to get image URLs'
  );
  logger().info('Service', '7. Download images using React Native FileSystem');

  // Simulate intercepting various requests
  const downloader = new ChapterDownloader();

  const testUrls = [
    'https://mangafire.to/assets/script.js',
    'https://mangafire.to/ajax/read/chapter/5438730?vrf=ZBYeRCjYBk0tkZnKW4kTuWBYw5Y1e-csvu6vYLUY4zeiviixfq7VJ6djZFHAZyMAbiWlOFhCoA',
    'https://mangafire.to/assets/style.css',
  ];

  logger().info('Service', 'Simulating WebView intercepting requests');

  for (const url of testUrls) {
    const captured = downloader.captureAjaxRequest(url);
    if (captured) {
      logger().info(
        'Service',
        'Found the AJAX request! Now downloading chapter'
      );
      await downloader.downloadChapterFromRequest(captured);
      break;
    }
  }
}

// Main execution
async function main() {
  logger().info('Service', 'Chapter Download Debug Script');

  const mode = (process.env.DEBUG_DOWNLOAD_MODE ?? 'simulate').toLowerCase();

  if (mode === 'manual') {
    await testWithManualUrl();
  } else {
    await simulateWebViewFlow();
  }

  logger().info('Service', 'IMPLEMENTATION NOTES FOR YOUR APP:');
  logger().info('Service', 'In your React Native WebView component:');
  logger().info('Service', '<WebView');
  logger().info('Service', '  source={{ uri: chapterUrl }}');
  logger().info('Service', '  onShouldStartLoadWithRequest={(request) => {');
  logger().info('Service', '    // Check if this is the AJAX request');
  logger().info(
    'Service',
    '    if (request.url.includes("/ajax/read/chapter/")) {'
  );
  logger().info('Service', '      // Extract chapter ID and VRF token');
  logger().info(
    'Service',
    '      const match = request.url.match(/\\/ajax\\/read\\/chapter\\/(\\d+)\\?vrf=([^&]+)/);'
  );
  logger().info('Service', '      if (match) {');
  logger().info('Service', '        const chapterId = match[1];');
  logger().info(
    'Service',
    '        const vrfToken = decodeURIComponent(match[2]);'
  );
  logger().info('Service', '        // Start download process');
  logger().info('Service', '        downloadChapter(chapterId, vrfToken);');
  logger().info('Service', '      }');
  logger().info('Service', '    }');
  logger().info('Service', '    return true; // Allow the request to continue');
  logger().info('Service', '  }}');
  logger().info('Service', '/>');
}

main().catch((error) => {
  logger().error('Service', 'Fatal error', { error });
  process.exit(1);
});
