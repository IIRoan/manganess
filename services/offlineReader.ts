import { chapterStorageService } from './chapterStorageService';
import { downloadValidationService } from './downloadValidationService';
import {
  ChapterImage,
  ChapterContent,
  ImageDownloadStatus,
} from '@/types/download';
import { isDebugEnabled } from '@/constants/env';

export interface OfflineReaderService {
  getChapterContent(
    mangaId: string,
    chapterNumber: string
  ): Promise<ChapterContent>;
  getBlendedChapterContent(
    mangaId: string,
    chapterNumber: string,
    networkImages: ChapterImage[]
  ): Promise<ChapterContent>;
  isChapterAvailableOffline(
    mangaId: string,
    chapterNumber: string
  ): Promise<boolean>;
  generateOfflineHtml(images: ChapterImage[]): string;
  generateBlendedHtml(images: ChapterImage[]): string;
  blendLocalAndNetworkContent(
    localImages: ChapterImage[],
    networkImages: ChapterImage[]
  ): ChapterImage[];
}

class OfflineReader implements OfflineReaderService {
  private static instance: OfflineReader;

  private constructor() {}

  static getInstance(): OfflineReader {
    if (!OfflineReader.instance) {
      OfflineReader.instance = new OfflineReader();
    }
    return OfflineReader.instance;
  }

  /**
   * Check if a chapter is available for offline reading with validation
   */
  async isChapterAvailableOffline(
    mangaId: string,
    chapterNumber: string
  ): Promise<boolean> {
    try {
      // First check if chapter exists in storage
      const isDownloaded = await chapterStorageService.isChapterDownloaded(
        mangaId,
        chapterNumber
      );

      if (!isDownloaded) {
        return false;
      }

      // Validate chapter integrity for offline reading
      const validationResult =
        await downloadValidationService.validateForOfflineReading(
          mangaId,
          chapterNumber
        );

      return validationResult.canRead;
    } catch (error) {
      if (isDebugEnabled()) {
        console.error(
          `Error checking offline availability for ${mangaId}/${chapterNumber}:`,
          error
        );
      }
      return false;
    }
  }

  /**
   * Get chapter content with offline-first approach
   */
  async getChapterContent(
    mangaId: string,
    chapterNumber: string
  ): Promise<ChapterContent> {
    try {
      // First, try to get local content
      const localImages = await chapterStorageService.getChapterImages(
        mangaId,
        chapterNumber
      );

      if (localImages && localImages.length > 0) {
        // We have local content - create offline chapter content
        const html = this.generateOfflineHtml(localImages);

        if (isDebugEnabled()) {
          console.log(
            `Loaded offline content for ${mangaId}/${chapterNumber} with ${localImages.length} images`
          );
        }

        return {
          isOffline: true,
          html,
          images: localImages,
          missingImages: [],
        };
      }

      // No local content available - return empty content for network fallback
      if (isDebugEnabled()) {
        console.log(
          `No offline content available for ${mangaId}/${chapterNumber}`
        );
      }

      return {
        isOffline: false,
        html: '',
        images: [],
        missingImages: [],
      };
    } catch (error) {
      console.error(
        `Error getting chapter content for ${mangaId}/${chapterNumber}:`,
        error
      );

      return {
        isOffline: false,
        html: '',
        images: [],
        missingImages: [],
      };
    }
  }

  /**
   * Get blended chapter content that combines local and network images
   * This is useful for partial downloads or when mixing offline/online content
   */
  async getBlendedChapterContent(
    mangaId: string,
    chapterNumber: string,
    networkImages: ChapterImage[]
  ): Promise<ChapterContent> {
    try {
      // Get local images
      const localImages = await chapterStorageService.getChapterImages(
        mangaId,
        chapterNumber
      );

      if (!localImages || localImages.length === 0) {
        // No local content, return network-only content
        return {
          isOffline: false,
          html: '',
          images: networkImages,
          missingImages: [],
        };
      }

      // Blend local and network images
      const blendedImages = this.blendLocalAndNetworkContent(
        localImages,
        networkImages
      );

      // Identify missing images (pages that exist in network but not locally)
      const localPageNumbers = new Set(
        localImages.map((img) => img.pageNumber)
      );
      const missingImages = networkImages
        .filter((img) => !localPageNumbers.has(img.pageNumber))
        .map((img) => img.pageNumber);

      const isPartiallyOffline = localImages.length > 0;
      const html = isPartiallyOffline
        ? this.generateBlendedHtml(blendedImages)
        : '';

      if (isDebugEnabled()) {
        console.log(
          `Loaded blended content for ${mangaId}/${chapterNumber}: ${localImages.length} local, ${networkImages.length} network, ${missingImages.length} missing`
        );
      }

      return {
        isOffline: isPartiallyOffline,
        html,
        images: blendedImages,
        missingImages,
      };
    } catch (error) {
      console.error(
        `Error getting blended chapter content for ${mangaId}/${chapterNumber}:`,
        error
      );

      return {
        isOffline: false,
        html: '',
        images: networkImages,
        missingImages: [],
      };
    }
  }

  /**
   * Blend local and network content for seamless reading experience
   */
  blendLocalAndNetworkContent(
    localImages: ChapterImage[],
    networkImages: ChapterImage[]
  ): ChapterImage[] {
    if (!networkImages || networkImages.length === 0) {
      return localImages;
    }

    if (!localImages || localImages.length === 0) {
      return networkImages;
    }

    // Create a map of local images by page number for quick lookup
    const localImageMap = new Map<number, ChapterImage>();
    localImages.forEach((img) => {
      localImageMap.set(img.pageNumber, img);
    });

    // Blend the images, preferring local content when available
    const blendedImages: ChapterImage[] = [];
    const processedPages = new Set<number>();

    // First, process network images and replace with local when available
    networkImages.forEach((networkImg) => {
      const localImg = localImageMap.get(networkImg.pageNumber);

      if (localImg && localImg.localPath) {
        // Use local image
        blendedImages.push({
          ...networkImg,
          localPath: localImg.localPath,
          downloadStatus: ImageDownloadStatus.COMPLETED,
          fileSize: localImg.fileSize || 0,
        });
      } else {
        // Use network image
        blendedImages.push(networkImg);
      }

      processedPages.add(networkImg.pageNumber);
    });

    // Add any local images that weren't in the network list
    localImages.forEach((localImg) => {
      if (!processedPages.has(localImg.pageNumber)) {
        blendedImages.push(localImg);
      }
    });

    // Sort by page number
    blendedImages.sort((a, b) => a.pageNumber - b.pageNumber);

    if (isDebugEnabled()) {
      const localCount = blendedImages.filter((img) => img.localPath).length;
      const networkCount = blendedImages.length - localCount;
      console.log(
        `Blended content: ${localCount} local images, ${networkCount} network images`
      );
    }

    return blendedImages;
  }

  /**
   * Generate HTML for offline chapter viewing
   */
  generateOfflineHtml(images: ChapterImage[]): string {
    if (!images || images.length === 0) {
      return this.generateEmptyChapterHtml();
    }

    // Sort images by page number
    const sortedImages = [...images].sort(
      (a, b) => a.pageNumber - b.pageNumber
    );

    // Generate image elements
    const imageElements = sortedImages
      .map((image) => {
        const imageSrc = image.localPath || image.originalUrl;
        return `
          <div class="page" data-page="${image.pageNumber}">
            <img 
              src="${imageSrc}" 
              data-number="${image.pageNumber}"
              alt="Page ${image.pageNumber}"
              loading="lazy"
              style="width: 100%; height: auto; display: block; margin: 0 auto;"
              onload="this.classList.add('loaded')"
              onerror="this.classList.add('error')"
            />
          </div>
        `;
      })
      .join('\n');

    return this.generateChapterHtml(imageElements, sortedImages.length);
  }

  /**
   * Generate HTML for blended content (mix of local and network images)
   */
  generateBlendedHtml(images: ChapterImage[]): string {
    if (!images || images.length === 0) {
      return this.generateEmptyChapterHtml();
    }

    // Sort images by page number
    const sortedImages = [...images].sort(
      (a, b) => a.pageNumber - b.pageNumber
    );

    // Generate image elements with special handling for local vs network
    const imageElements = sortedImages
      .map((image) => {
        const imageSrc = image.localPath || image.originalUrl;
        const isLocal = !!image.localPath;
        const fallbackSrc = image.originalUrl;

        return `
          <div class="page" data-page="${image.pageNumber}">
            <img 
              src="${imageSrc}" 
              data-number="${image.pageNumber}"
              ${!isLocal && fallbackSrc ? `data-fallback="${fallbackSrc}"` : ''}
              alt="Page ${image.pageNumber}"
              loading="lazy"
              class="${isLocal ? 'local-image' : 'network-image'}"
              style="width: 100%; height: auto; display: block; margin: 0 auto;"
              onload="this.classList.add('loaded')"
              onerror="handleImageError(this)"
            />
            ${isLocal ? '<div class="local-indicator">📱</div>' : ''}
          </div>
        `;
      })
      .join('\n');

    return this.generateBlendedChapterHtml(imageElements, sortedImages.length);
  }

  /**
   * Generate the complete HTML structure for a chapter
   */
  private generateChapterHtml(
    imageElements: string,
    totalImages: number
  ): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>Offline Chapter</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #000;
            color: #fff;
            overflow-x: hidden;
            -webkit-user-select: none;
            user-select: none;
        }
        
        .pages {
            display: flex;
            flex-direction: column;
            align-items: center;
            min-height: 100vh;
        }
        
        .page {
            width: 100%;
            max-width: 100vw;
            display: flex;
            justify-content: center;
            align-items: center;
            position: relative;
        }
        
        .page img {
            max-width: 100%;
            height: auto;
            display: block;
            transition: opacity 0.3s ease;
        }
        
        .page img:not(.loaded) {
            opacity: 0.5;
        }
        
        .page img.loaded {
            opacity: 1;
        }
        
        .page img.error {
            opacity: 0.3;
            filter: grayscale(100%);
        }
        
        .offline-indicator {
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(0, 150, 0, 0.8);
            color: white;
            padding: 5px 10px;
            border-radius: 15px;
            font-size: 12px;
            z-index: 1000;
            backdrop-filter: blur(10px);
        }
        
        .loading-indicator {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 20px;
            font-size: 14px;
            z-index: 1000;
            backdrop-filter: blur(10px);
            display: none;
        }
        
        /* Prevent horizontal scrolling */
        html, body {
            overflow-x: hidden;
            width: 100%;
        }
        
        /* Smooth scrolling */
        html {
            scroll-behavior: smooth;
        }
    </style>
</head>
<body>
    <div class="offline-indicator">
        📱 Offline Mode
    </div>
    
    <div class="loading-indicator" id="loadingIndicator">
        Loading images...
    </div>
    
    <div class="pages longstrip">
        ${imageElements}
    </div>
    
    <script>
        (function() {
            let loadedCount = 0;
            const totalImages = ${totalImages};
            const loadingIndicator = document.getElementById('loadingIndicator');
            
            // Show loading indicator initially
            if (totalImages > 0) {
                loadingIndicator.style.display = 'block';
            }
            
            // Track image loading
            function updateLoadingProgress() {
                const progress = Math.round((loadedCount / totalImages) * 100);
                loadingIndicator.textContent = \`Loading images... \${progress}%\`;
                
                if (loadedCount >= totalImages) {
                    setTimeout(() => {
                        loadingIndicator.style.display = 'none';
                    }, 1000);
                }
            }
            
            // Add load event listeners to all images
            document.querySelectorAll('.page img').forEach(img => {
                if (img.complete && img.naturalHeight !== 0) {
                    loadedCount++;
                    img.classList.add('loaded');
                } else {
                    img.addEventListener('load', () => {
                        loadedCount++;
                        img.classList.add('loaded');
                        updateLoadingProgress();
                    });
                    
                    img.addEventListener('error', () => {
                        loadedCount++;
                        img.classList.add('error');
                        updateLoadingProgress();
                    });
                }
            });
            
            // Initial progress update
            updateLoadingProgress();
            
            // Prevent context menu and text selection
            document.addEventListener('contextmenu', e => e.preventDefault());
            document.addEventListener('selectstart', e => e.preventDefault());
            
            // Prevent horizontal scrolling
            let startX = 0;
            let startY = 0;
            
            document.addEventListener('touchstart', e => {
                startX = e.touches[0].clientX;
                startY = e.touches[0].clientY;
            }, { passive: false });
            
            document.addEventListener('touchmove', e => {
                const deltaX = Math.abs(e.touches[0].clientX - startX);
                const deltaY = Math.abs(e.touches[0].clientY - startY);
                
                // Prevent horizontal scrolling if not zoomed
                const zoomLevel = document.body.offsetWidth / window.innerWidth;
                if (zoomLevel <= 1 && deltaX > deltaY) {
                    e.preventDefault();
                }
            }, { passive: false });
            
            // Notify React Native about offline content load
            if (window.ReactNativeWebView) {
                window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'OFFLINE_CONTENT_LOADED',
                    totalImages: totalImages,
                    timestamp: Date.now()
                }));
            }
        })();
    </script>
</body>
</html>
    `.trim();
  }

  /**
   * Generate HTML for empty chapter (no images available)
   */
  private generateEmptyChapterHtml(): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chapter Not Available</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #000;
            color: #fff;
            display: flex;
            justify-content: center;
            align-items: center;
            min-height: 100vh;
            text-align: center;
            padding: 20px;
        }
        
        .message {
            max-width: 400px;
        }
        
        .icon {
            font-size: 48px;
            margin-bottom: 20px;
        }
        
        .title {
            font-size: 24px;
            margin-bottom: 10px;
            font-weight: 600;
        }
        
        .description {
            font-size: 16px;
            opacity: 0.7;
            line-height: 1.5;
        }
    </style>
</head>
<body>
    <div class="message">
        <div class="icon">📱</div>
        <div class="title">Chapter Not Available Offline</div>
        <div class="description">
            This chapter is not downloaded for offline reading. 
            Please connect to the internet to view this chapter.
        </div>
    </div>
    
    <script>
        // Notify React Native about empty content
        if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'OFFLINE_CONTENT_EMPTY',
                timestamp: Date.now()
            }));
        }
    </script>
</body>
</html>
    `.trim();
  }
  /**
   * Generate the complete HTML structure for a blended chapter
   */
  private generateBlendedChapterHtml(
    imageElements: string,
    totalImages: number
  ): string {
    return `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, user-scalable=no">
    <title>Blended Chapter</title>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
            background-color: #000;
            color: #fff;
            overflow-x: hidden;
            -webkit-user-select: none;
            user-select: none;
        }
        
        .pages {
            display: flex;
            flex-direction: column;
            align-items: center;
            min-height: 100vh;
        }
        
        .page {
            width: 100%;
            max-width: 100vw;
            display: flex;
            justify-content: center;
            align-items: center;
            position: relative;
        }
        
        .page img {
            max-width: 100%;
            height: auto;
            display: block;
            transition: opacity 0.3s ease;
        }
        
        .page img:not(.loaded) {
            opacity: 0.5;
        }
        
        .page img.loaded {
            opacity: 1;
        }
        
        .page img.error {
            opacity: 0.3;
            filter: grayscale(100%);
        }
        
        .local-indicator {
            position: absolute;
            top: 5px;
            left: 5px;
            background: rgba(0, 150, 0, 0.8);
            color: white;
            padding: 2px 6px;
            border-radius: 10px;
            font-size: 10px;
            z-index: 100;
            pointer-events: none;
        }
        
        .blended-indicator {
            position: fixed;
            top: 10px;
            right: 10px;
            background: rgba(255, 165, 0, 0.8);
            color: white;
            padding: 5px 10px;
            border-radius: 15px;
            font-size: 12px;
            z-index: 1000;
            backdrop-filter: blur(10px);
        }
        
        .loading-indicator {
            position: fixed;
            bottom: 20px;
            left: 50%;
            transform: translateX(-50%);
            background: rgba(0, 0, 0, 0.8);
            color: white;
            padding: 10px 20px;
            border-radius: 20px;
            font-size: 14px;
            z-index: 1000;
            backdrop-filter: blur(10px);
            display: none;
        }
        
        /* Prevent horizontal scrolling */
        html, body {
            overflow-x: hidden;
            width: 100%;
        }
        
        /* Smooth scrolling */
        html {
            scroll-behavior: smooth;
        }
    </style>
</head>
<body>
    <div class="blended-indicator">
        🔄 Mixed Mode
    </div>
    
    <div class="loading-indicator" id="loadingIndicator">
        Loading images...
    </div>
    
    <div class="pages longstrip">
        ${imageElements}
    </div>
    
    <script>
        let loadedCount = 0;
        const totalImages = ${totalImages};
        const loadingIndicator = document.getElementById('loadingIndicator');
        
        // Show loading indicator initially
        if (totalImages > 0) {
            loadingIndicator.style.display = 'block';
        }
        
        // Handle image loading errors with fallback
        function handleImageError(img) {
            if (img.dataset.fallback && img.src !== img.dataset.fallback) {
                console.log('Local image failed, trying network fallback');
                img.src = img.dataset.fallback;
                img.classList.remove('local-image');
                img.classList.add('network-image');
                
                // Remove local indicator
                const indicator = img.parentElement.querySelector('.local-indicator');
                if (indicator) {
                    indicator.remove();
                }
            } else {
                img.classList.add('error');
                loadedCount++;
                updateLoadingProgress();
            }
        }
        
        // Track image loading
        function updateLoadingProgress() {
            const progress = Math.round((loadedCount / totalImages) * 100);
            loadingIndicator.textContent = \`Loading images... \${progress}%\`;
            
            if (loadedCount >= totalImages) {
                setTimeout(() => {
                    loadingIndicator.style.display = 'none';
                }, 1000);
            }
        }
        
        // Add load event listeners to all images
        document.querySelectorAll('.page img').forEach(img => {
            if (img.complete && img.naturalHeight !== 0) {
                loadedCount++;
                img.classList.add('loaded');
            } else {
                img.addEventListener('load', () => {
                    loadedCount++;
                    img.classList.add('loaded');
                    updateLoadingProgress();
                });
            }
        });
        
        // Initial progress update
        updateLoadingProgress();
        
        // Prevent context menu and text selection
        document.addEventListener('contextmenu', e => e.preventDefault());
        document.addEventListener('selectstart', e => e.preventDefault());
        
        // Prevent horizontal scrolling
        let startX = 0;
        let startY = 0;
        
        document.addEventListener('touchstart', e => {
            startX = e.touches[0].clientX;
            startY = e.touches[0].clientY;
        }, { passive: false });
        
        document.addEventListener('touchmove', e => {
            const deltaX = Math.abs(e.touches[0].clientX - startX);
            const deltaY = Math.abs(e.touches[0].clientY - startY);
            
            // Prevent horizontal scrolling if not zoomed
            const zoomLevel = document.body.offsetWidth / window.innerWidth;
            if (zoomLevel <= 1 && deltaX > deltaY) {
                e.preventDefault();
            }
        }, { passive: false });
        
        // Notify React Native about blended content load
        if (window.ReactNativeWebView) {
            window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'BLENDED_CONTENT_LOADED',
                totalImages: totalImages,
                localImages: document.querySelectorAll('.local-image').length,
                networkImages: document.querySelectorAll('.network-image').length,
                timestamp: Date.now()
            }));
        }
    </script>
</body>
</html>
    `.trim();
  }
}

// Export singleton instance
export const offlineReaderService = OfflineReader.getInstance();
