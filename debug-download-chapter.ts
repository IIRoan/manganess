// Debug script to test chapter download flow
// This simulates capturing the AJAX request from a WebView
// In the actual app, you'll use WebView's request interception
import axios from 'axios';
import * as fs from 'fs';
import * as path from 'path';
import { MANGA_API_URL } from './constants/Config';

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
    console.log('🔍 Checking URL:', url);

    // Check if this is the AJAX request we're looking for
    if (url.includes('/ajax/read/chapter/')) {
      console.log('✅ Found AJAX request!');

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
          console.error('Failed to decode VRF token:', decodeError);
          return null;
        }

        console.log('   ↳ Chapter ID:', rawChapterId);
        console.log('   ↳ VRF Token:', decodedToken.substring(0, 30) + '...');

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
    console.log('\n📥 Step 1: Fetching image panels from AJAX request...');
    console.log('URL:', capturedRequest.url);

    const images = await this.getImagePanels(capturedRequest.url);

    if (!images || images.length === 0) {
      console.log('❌ No images found in response');
      return;
    }

    console.log(`✅ Found ${images.length} images`);

    console.log('\n💾 Step 2: Downloading images...');
    await this.downloadImages(images);

    console.log('\n🎉 Chapter download complete!');
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

      console.log('✅ AJAX request successful');
      console.log('Response:', JSON.stringify(response.data, null, 2));

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
        console.error('❌ AJAX request failed');
        console.error('Status:', error.response?.status);
        console.error('Data:', error.response?.data);
      } else {
        console.error('❌ Error:', error);
      }
      return [];
    }
  }

  private async downloadImages(images: ChapterImage[]): Promise<void> {
    const downloadDir = path.join(process.cwd(), 'debug', 'downloads');
    if (!fs.existsSync(downloadDir)) {
      fs.mkdirSync(downloadDir, { recursive: true });
    }

    console.log(`Downloading to: ${downloadDir}`);
    console.log('');

    let successCount = 0;
    let failCount = 0;

    for (const image of images) {
      try {
        console.log(`📥 Downloading image ${image.index}/${images.length}...`);

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
        console.log(`   ✅ Saved: ${filename} (${sizeKB} KB)`);
        successCount++;
      } catch (error) {
        console.error(
          `   ❌ Failed to download image ${image.index}:`,
          error instanceof Error ? error.message : error
        );
        failCount++;
      }
    }

    console.log('');
    console.log('📊 Download Summary:');
    console.log(`   ✅ Success: ${successCount}`);
    console.log(`   ❌ Failed: ${failCount}`);
    console.log(`   📁 Location: ${downloadDir}`);
  }
}

// Test with a known AJAX URL (you need to get this from browser DevTools)
async function testWithManualUrl() {
  console.log('🧪 Testing with manually captured AJAX URL');
  console.log('='.repeat(80));
  console.log('');
  console.log('📋 INSTRUCTIONS:');
  console.log(
    '1. Open Chrome and go to: https://mangafire.to/read/tonari-no-wakao-san-wa-miesou-de-mienai.yj820/en/chapter-17'
  );
  console.log('2. Open DevTools (F12) and go to Network tab');
  console.log(
    '3. Look for a request like: GET /ajax/read/chapter/XXXXXXX?vrf=YYYYY'
  );
  console.log('4. Right-click on it and "Copy > Copy URL"');
  console.log('5. Paste the URL below and run this script again');
  console.log('');
  console.log('='.repeat(80));
  console.log('');

  // PASTE THE CAPTURED URL HERE:
  const defaultAjaxUrl =
    process.env.DEBUG_CAPTURED_AJAX_URL ??
    'https://mangafire.to/ajax/read/chapter/5438730?vrf=ZBYeRCjYBk0tkZnKW4kTuWBYw5Y1e-csvu6vYLUY4zeiviixfq7VJ6djZFHAZyMAbiWlOFhCoA';
  const capturedAjaxUrl: string = defaultAjaxUrl.trim();

  if (!capturedAjaxUrl) {
    console.log(
      '⚠️  No URL provided. Please capture the AJAX URL from browser DevTools.'
    );
    console.log('');
    console.log('Example URL format:');
    console.log(
      'https://mangafire.to/ajax/read/chapter/5438730?vrf=ZBYeRCjYBk0...'
    );
    return;
  }

  const downloader = new ChapterDownloader();
  const captured = downloader.captureAjaxRequest(capturedAjaxUrl);

  if (captured) {
    await downloader.downloadChapterFromRequest(captured);
  } else {
    console.log('❌ Invalid AJAX URL format');
  }
}

// Simulate how it will work in the actual app
async function simulateWebViewFlow() {
  console.log('📱 Simulating WebView Request Interception Flow');
  console.log('='.repeat(80));
  console.log('');
  console.log('This is how it will work in your React Native app:');
  console.log('');
  console.log('1. User opens chapter in WebView');
  console.log('2. WebView loads the page and makes requests');
  console.log('3. onShouldStartLoadWithRequest intercepts ALL requests');
  console.log('4. We check each request URL for /ajax/read/chapter/');
  console.log('5. When found, extract chapter ID and VRF token');
  console.log('6. Make the AJAX request ourselves to get image URLs');
  console.log('7. Download images using React Native FileSystem');
  console.log('');
  console.log('='.repeat(80));
  console.log('');

  // Simulate intercepting various requests
  const downloader = new ChapterDownloader();

  const testUrls = [
    'https://mangafire.to/assets/script.js',
    'https://mangafire.to/ajax/read/chapter/5438730?vrf=ZBYeRCjYBk0tkZnKW4kTuWBYw5Y1e-csvu6vYLUY4zeiviixfq7VJ6djZFHAZyMAbiWlOFhCoA',
    'https://mangafire.to/assets/style.css',
  ];

  console.log('Simulating WebView intercepting requests...');
  console.log('');

  for (const url of testUrls) {
    const captured = downloader.captureAjaxRequest(url);
    if (captured) {
      console.log('');
      console.log('🎯 Found the AJAX request! Now downloading chapter...');
      console.log('');
      await downloader.downloadChapterFromRequest(captured);
      break;
    }
  }
}

// Main execution
async function main() {
  console.log('🚀 Chapter Download Debug Script');
  console.log('='.repeat(80));
  console.log('');

  const mode = (process.env.DEBUG_DOWNLOAD_MODE ?? 'simulate').toLowerCase();

  if (mode === 'manual') {
    await testWithManualUrl();
  } else {
    await simulateWebViewFlow();
  }

  console.log('');
  console.log('='.repeat(80));
  console.log('📝 IMPLEMENTATION NOTES FOR YOUR APP:');
  console.log('='.repeat(80));
  console.log('');
  console.log('In your React Native WebView component:');
  console.log('');
  console.log('<WebView');
  console.log('  source={{ uri: chapterUrl }}');
  console.log('  onShouldStartLoadWithRequest={(request) => {');
  console.log('    // Check if this is the AJAX request');
  console.log('    if (request.url.includes("/ajax/read/chapter/")) {');
  console.log('      // Extract chapter ID and VRF token');
  console.log(
    '      const match = request.url.match(/\\/ajax\\/read\\/chapter\\/(\\d+)\\?vrf=([^&]+)/);'
  );
  console.log('      if (match) {');
  console.log('        const chapterId = match[1];');
  console.log('        const vrfToken = decodeURIComponent(match[2]);');
  console.log('        // Start download process');
  console.log('        downloadChapter(chapterId, vrfToken);');
  console.log('      }');
  console.log('    }');
  console.log('    return true; // Allow the request to continue');
  console.log('  }}');
  console.log('/>');
  console.log('');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
