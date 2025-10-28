import React, {
  useRef,
  useState,
  useEffect,
  useImperativeHandle,
  forwardRef,
} from 'react';
import { Platform } from 'react-native';
import {
  WebView,
  WebViewNavigation,
  WebViewMessageEvent,
} from 'react-native-webview';
import { ChapterImage, ChapterContent } from '@/types/download';
import { offlineReaderService } from '@/services/offlineReader';
import { webViewRequestInterceptor } from '@/services/webViewRequestInterceptor';

export interface CustomWebViewRef {
  triggerDownloadSuggestion: () => void;
  webViewRef: React.RefObject<WebView | null>;
}

interface CustomWebViewProps extends React.ComponentProps<typeof WebView> {
  allowedHosts?: string[];
  currentUrl?: string;
  enableDownloadDetection?: boolean;
  enableOfflineSupport?: boolean;
  enableAutoDownloadSuggestion?: boolean;
  mangaId?: string;
  chapterNumber?: string;
  mangaTitle?: string;
  isBookmarked?: boolean;
  onImagesDetected?: (images: ChapterImage[]) => void;
  onImageLoadingProgress?: (
    progress: number,
    loadedCount: number,
    totalCount: number
  ) => void;
  onOfflineContentLoaded?: (content: ChapterContent) => void;
  onDownloadSuggestion?: (
    mangaId: string,
    chapterNumber: string,
    mangaTitle?: string
  ) => void;
  onChapterViewed?: (mangaId: string, chapterNumber: string) => void;
}

const CustomWebView = forwardRef<CustomWebViewRef, CustomWebViewProps>(
  (
    {
      allowedHosts = ['mangafire.to'],
      currentUrl,
      enableDownloadDetection = false,
      enableOfflineSupport = false,
      enableAutoDownloadSuggestion = false,
      mangaId,
      chapterNumber,
      mangaTitle,
      isBookmarked = false,
      onImagesDetected,
      onImageLoadingProgress,
      onOfflineContentLoaded,
      onDownloadSuggestion,
      onChapterViewed,
      ...props
    },
    ref
  ) => {
    const webViewRef = useRef<WebView>(null);
    const [webViewKey, setWebViewKey] = useState(1);
    const [lastLoadedUrl, setLastLoadedUrl] = useState<string | null>(null);
    const [isInitialLoad, setIsInitialLoad] = useState(true);
    const [offlineContent, setOfflineContent] = useState<ChapterContent | null>(
      null
    );
    const [shouldLoadOffline, setShouldLoadOffline] = useState(false);
    const [hasTriggeredDownloadSuggestion, setHasTriggeredDownloadSuggestion] =
      useState(false);
    const [hasNotifiedChapterViewed, setHasNotifiedChapterViewed] =
      useState(false);

    useEffect(() => {
      if (Platform.OS === 'ios') {
        setTimeout(() => setWebViewKey((key) => key + 1), 50);
      }
    }, []);

    // Handle download suggestions and chapter viewing notifications
    useEffect(() => {
      const handleChapterViewing = async () => {
        if (mangaId && chapterNumber) {
          // Reset suggestion state when chapter changes
          setHasTriggeredDownloadSuggestion(false);
          setHasNotifiedChapterViewed(false);
        }
      };

      handleChapterViewing();
    }, [mangaId, chapterNumber]);

    // Trigger chapter viewed notification after a delay
    useEffect(() => {
      if (
        mangaId &&
        chapterNumber &&
        !hasNotifiedChapterViewed &&
        onChapterViewed
      ) {
        const timer = setTimeout(() => {
          onChapterViewed(mangaId, chapterNumber);
          setHasNotifiedChapterViewed(true);
        }, 2000); // Wait 2 seconds to ensure user is actually viewing

        return () => clearTimeout(timer);
      }

      // Return empty cleanup function if condition not met
      return () => {};
    }, [mangaId, chapterNumber, hasNotifiedChapterViewed, onChapterViewed]);

    // Check for offline content when offline support is enabled
    useEffect(() => {
      const checkOfflineContent = async () => {
        if (enableOfflineSupport && mangaId && chapterNumber) {
          try {
            const isAvailable =
              await offlineReaderService.isChapterAvailableOffline(
                mangaId,
                chapterNumber
              );

            if (isAvailable) {
              const content = await offlineReaderService.getChapterContent(
                mangaId,
                chapterNumber
              );

              // Set offline content regardless of whether it's fully offline or partial
              // This allows for blended content scenarios
              if (content.images && content.images.length > 0) {
                setOfflineContent(content);

                // Only load fully offline content directly, otherwise inject into network page
                if (content.isOffline && content.html) {
                  setShouldLoadOffline(true);
                } else {
                  setShouldLoadOffline(false);
                }

                onOfflineContentLoaded?.(content);
              }
            } else {
              // Reset offline content if not available
              setOfflineContent(null);
              setShouldLoadOffline(false);
            }
          } catch (error) {
            console.error('Error checking offline content:', error);
            setOfflineContent(null);
            setShouldLoadOffline(false);
          }
        } else {
          // Reset when offline support is disabled
          setOfflineContent(null);
          setShouldLoadOffline(false);
        }
      };

      checkOfflineContent();
    }, [enableOfflineSupport, mangaId, chapterNumber, onOfflineContentLoaded]);

    const preventHorizontalScrollJS = `
    (function() {
      document.body.style.overflowX = 'hidden';
      window.addEventListener('touchstart', function(e) {
        this.start_x = e.changedTouches[0].clientX;
        this.start_y = e.changedTouches[0].clientY;
      }, { passive: false });

      window.addEventListener('touchmove', function(e) {
        var end_x = e.changedTouches[0].clientX;
        var end_y = e.changedTouches[0].clientY;
        var delta_x = Math.abs(end_x - this.start_x);
        var delta_y = Math.abs(end_y - this.start_y);

        // Check if zoomed in
        var zoomLevel = document.body.offsetWidth / window.innerWidth;

        if (zoomLevel <= 1 && delta_x > delta_y) {
          e.preventDefault();
        }
      }, { passive: false });
    })();
  `;

    const preventRedirectsJS = `
    (function() {
      window.addEventListener('load', function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'PAGE_LOADED',
          url: window.location.href
        }));
      });

      // Override location changes
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      history.pushState = function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'HISTORY_PUSH',
          url: arguments[2]
        }));
        return originalPushState.apply(this, arguments);
      };

      history.replaceState = function() {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'HISTORY_REPLACE',
          url: arguments[2]
        }));
        return originalReplaceState.apply(this, arguments);
      };
    })();
  `;

    const offlineContentInjectionJS = `
    (function() {
      if (!${enableOfflineSupport}) return;
      
      try {
        // Check if we have offline content to inject
        const offlineImages = ${offlineContent ? JSON.stringify(offlineContent.images) : 'null'};
        const isFullyOffline = ${offlineContent?.isOffline || false};
        
        if (offlineImages && offlineImages.length > 0) {
          // Create a map of local images by page number
          const localImageMap = new Map();
          offlineImages.forEach(img => {
            if (img.localPath) {
              localImageMap.set(img.pageNumber, img.localPath);
            }
          });
          
          // Function to replace network images with local ones
          function replaceWithLocalImages() {
            const pages = document.querySelectorAll('.page img[data-number]');
            let replacedCount = 0;
            let totalImages = pages.length;
            
            pages.forEach(img => {
              const pageNumber = parseInt(img.dataset.number);
              const localPath = localImageMap.get(pageNumber);
              
              if (localPath && img.src !== localPath) {
                // Store original URL as backup
                if (!img.dataset.originalSrc) {
                  img.dataset.originalSrc = img.src;
                }
                
                // Replace with local image
                img.src = localPath;
                img.classList.add('offline-image');
                img.classList.remove('network-image');
                replacedCount++;
                
                // Add visual indicator for offline images
                const pageContainer = img.closest('.page');
                if (pageContainer && !pageContainer.querySelector('.offline-badge')) {
                  const badge = document.createElement('div');
                  badge.className = 'offline-badge';
                  badge.innerHTML = '📱';
                  badge.style.cssText = \`
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
                  \`;
                  pageContainer.style.position = 'relative';
                  pageContainer.appendChild(badge);
                }
              }
            });
            
            if (replacedCount > 0) {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'OFFLINE_IMAGES_INJECTED',
                replacedCount: replacedCount,
                totalOfflineImages: offlineImages.length,
                totalImages: totalImages,
                isFullyOffline: isFullyOffline
              }));
            }
          }
          
          // Function to handle fallback to network images if local fails
          function setupImageFallback() {
            document.querySelectorAll('.page img[data-number]').forEach(img => {
              img.addEventListener('error', function() {
                if (this.classList.contains('offline-image') && this.dataset.originalSrc) {
                  console.log('Local image failed, falling back to network:', this.dataset.originalSrc);
                  this.src = this.dataset.originalSrc;
                  this.classList.remove('offline-image');
                  this.classList.add('network-fallback');
                  
                  // Update badge to show fallback
                  const pageContainer = this.closest('.page');
                  const badge = pageContainer?.querySelector('.offline-badge');
                  if (badge) {
                    badge.innerHTML = '🌐';
                    badge.style.background = 'rgba(255, 165, 0, 0.8)';
                  }
                  
                  window.ReactNativeWebView.postMessage(JSON.stringify({
                    type: 'OFFLINE_IMAGE_FALLBACK',
                    pageNumber: parseInt(this.dataset.number),
                    originalUrl: this.dataset.originalSrc
                  }));
                }
              });
            });
          }
          
          // Monitor for new images and replace them
          function setupOfflineImageObserver() {
            const observer = new MutationObserver((mutations) => {
              let shouldReplace = false;
              
              mutations.forEach((mutation) => {
                if (mutation.type === 'childList') {
                  mutation.addedNodes.forEach(node => {
                    if (node.nodeType === 1) { // Element node
                      const images = node.querySelectorAll ? node.querySelectorAll('img[data-number]') : [];
                      if (images.length > 0) {
                        shouldReplace = true;
                      }
                    }
                  });
                } else if (mutation.type === 'attributes' && mutation.attributeName === 'src') {
                  const target = mutation.target;
                  if (target.tagName === 'IMG' && target.dataset.number) {
                    shouldReplace = true;
                  }
                }
              });
              
              if (shouldReplace) {
                setTimeout(replaceWithLocalImages, 100);
              }
            });
            
            const pagesContainer = document.querySelector('.pages') || document.body;
            observer.observe(pagesContainer, {
              childList: true,
              subtree: true,
              attributes: true,
              attributeFilter: ['src', 'class']
            });
          }
          
          // Function to detect offline chapter availability
          function detectOfflineAvailability() {
            const totalPages = document.querySelectorAll('.page img[data-number]').length;
            const availableOfflinePages = offlineImages.filter(img => img.localPath).length;
            const offlinePercentage = totalPages > 0 ? (availableOfflinePages / totalPages) * 100 : 0;
            
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'OFFLINE_AVAILABILITY_DETECTED',
              totalPages: totalPages,
              availableOfflinePages: availableOfflinePages,
              offlinePercentage: offlinePercentage,
              isFullyOffline: offlinePercentage === 100
            }));
          }
          
          // Initialize offline image replacement
          function initializeOfflineSupport() {
            replaceWithLocalImages();
            setupImageFallback();
            setupOfflineImageObserver();
            detectOfflineAvailability();
            
            // Add offline mode indicator
            if (!document.querySelector('.offline-mode-indicator')) {
              const indicator = document.createElement('div');
              indicator.className = 'offline-mode-indicator';
              indicator.innerHTML = isFullyOffline ? '📱 Offline Mode' : '🔄 Mixed Mode';
              indicator.style.cssText = \`
                position: fixed;
                top: 10px;
                right: 10px;
                background: \${isFullyOffline ? 'rgba(0, 150, 0, 0.8)' : 'rgba(255, 165, 0, 0.8)'};
                color: white;
                padding: 5px 10px;
                border-radius: 15px;
                font-size: 12px;
                z-index: 10000;
                backdrop-filter: blur(10px);
                pointer-events: none;
                transition: all 0.3s ease;
              \`;
              document.body.appendChild(indicator);
              
              // Auto-hide after 3 seconds
              setTimeout(() => {
                indicator.style.opacity = '0.3';
              }, 3000);
            }
          }
          
          // Wait for page to load, then initialize
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', initializeOfflineSupport);
          } else {
            initializeOfflineSupport();
          }
          
          // Also initialize on window load as backup
          window.addEventListener('load', () => {
            setTimeout(initializeOfflineSupport, 500);
          });
          
          // Handle page visibility changes to refresh offline content
          document.addEventListener('visibilitychange', () => {
            if (!document.hidden) {
              setTimeout(replaceWithLocalImages, 200);
            }
          });
          
          // Handle network state changes for seamless transitions
          window.addEventListener('online', () => {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'NETWORK_STATE_CHANGED',
              isOnline: true,
              timestamp: Date.now()
            }));
            
            // Refresh images that failed to load offline
            document.querySelectorAll('.page img.network-fallback').forEach(img => {
              if (img.dataset.originalSrc) {
                img.src = img.dataset.originalSrc;
                img.classList.remove('network-fallback');
              }
            });
          });
          
          window.addEventListener('offline', () => {
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'NETWORK_STATE_CHANGED',
              isOnline: false,
              timestamp: Date.now()
            }));
            
            // Force offline mode - replace network images with local ones
            setTimeout(replaceWithLocalImages, 100);
          });
        } else {
          // No offline content available, but still detect availability
          function checkForOfflineContent() {
            const totalPages = document.querySelectorAll('.page img[data-number]').length;
            
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'OFFLINE_AVAILABILITY_DETECTED',
              totalPages: totalPages,
              availableOfflinePages: 0,
              offlinePercentage: 0,
              isFullyOffline: false
            }));
          }
          
          if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', checkForOfflineContent);
          } else {
            checkForOfflineContent();
          }
        }
        
      } catch (error) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'OFFLINE_INJECTION_ERROR',
          error: error.message,
          stack: error.stack
        }));
      }
    })();
  `;

    const downloadDetectionJS = `
    (function() {
      if (!${enableDownloadDetection}) return;
      
      try {
        let hasTriggeredSuggestion = false;
        const enableAutoSuggestion = ${enableAutoDownloadSuggestion};
        const isBookmarkedManga = ${isBookmarked};
        
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
                downloadStatus: 'pending'
              });
            }
          });
          
          window.ReactNativeWebView.postMessage(JSON.stringify({
            type: 'CHAPTER_IMAGES_DETECTED',
            images: images,
            timestamp: Date.now()
          }));
          
          // Trigger download suggestion if enabled and conditions are met
          if (enableAutoSuggestion && !hasTriggeredSuggestion && images.length > 0) {
            hasTriggeredSuggestion = true;
            
            // Delay suggestion to ensure user is actively viewing
            setTimeout(() => {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'DOWNLOAD_SUGGESTION_TRIGGERED',
                totalImages: images.length,
                isBookmarked: isBookmarkedManga,
                timestamp: Date.now()
              }));
            }, 3000); // Wait 3 seconds before suggesting
          }
        }
        
        // Monitor for dynamic image loading with progress
        function monitorImageLoadingProgress() {
          let checkCount = 0;
          const maxChecks = 60; // 30 seconds
          
          function checkProgress() {
            checkCount++;
            
            const pages = document.querySelectorAll('.page img[data-number]');
            let loadedCount = 0;
            const totalCount = pages.length;
            const images = [];
            
            pages.forEach((img, index) => {
              const pageNumber = parseInt(img.dataset.number) || (index + 1);
              const src = img.src || '';
              const isLoaded = img.complete && img.naturalHeight !== 0;
              
              if (isLoaded) loadedCount++;
              
              images.push({
                pageNumber: pageNumber,
                originalUrl: src,
                isLoaded: isLoaded,
                downloadStatus: 'pending'
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
            
            // Continue checking if not all loaded and within time limit
            if (loadedCount < totalCount && checkCount < maxChecks) {
              setTimeout(checkProgress, 500);
            } else {
              window.ReactNativeWebView.postMessage(JSON.stringify({
                type: 'IMAGE_LOADING_COMPLETE',
                images: images,
                loadedCount: loadedCount,
                totalCount: totalCount,
                allLoaded: loadedCount === totalCount
              }));
            }
          }
          
          // Start monitoring after a short delay
          setTimeout(checkProgress, 1000);
        }
        
        // Monitor for dynamic changes
        function setupMutationObserver() {
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
        monitorImageLoadingProgress();
        setupMutationObserver();
        
        // Track user engagement for better download suggestions
        function trackUserEngagement() {
          let scrollCount = 0;
          let lastScrollTime = Date.now();
          let engagementScore = 0;
          
          function handleScroll() {
            const now = Date.now();
            const timeSinceLastScroll = now - lastScrollTime;
            
            // Only count meaningful scrolls (not too frequent)
            if (timeSinceLastScroll > 500) {
              scrollCount++;
              lastScrollTime = now;
              
              // Calculate engagement based on scroll behavior
              const scrollPosition = window.pageYOffset;
              const documentHeight = document.documentElement.scrollHeight;
              const windowHeight = window.innerHeight;
              const scrollPercentage = scrollPosition / (documentHeight - windowHeight);
              
              engagementScore = Math.min(scrollCount * 0.1 + scrollPercentage * 0.5, 1);
              
              // Trigger enhanced suggestion if user is highly engaged
              if (enableAutoSuggestion && !hasTriggeredSuggestion && engagementScore > 0.3) {
                hasTriggeredSuggestion = true;
                
                window.ReactNativeWebView.postMessage(JSON.stringify({
                  type: 'ENGAGED_DOWNLOAD_SUGGESTION',
                  engagementScore: engagementScore,
                  scrollCount: scrollCount,
                  scrollPercentage: scrollPercentage,
                  isBookmarked: isBookmarkedManga,
                  timestamp: Date.now()
                }));
              }
            }
          }
          
          // Throttled scroll listener
          let scrollTimeout;
          window.addEventListener('scroll', () => {
            if (scrollTimeout) clearTimeout(scrollTimeout);
            scrollTimeout = setTimeout(handleScroll, 100);
          }, { passive: true });
          
          // Track time spent on page
          let startTime = Date.now();
          window.addEventListener('beforeunload', () => {
            const timeSpent = Date.now() - startTime;
            
            window.ReactNativeWebView.postMessage(JSON.stringify({
              type: 'CHAPTER_VIEWING_STATS',
              timeSpent: timeSpent,
              scrollCount: scrollCount,
              engagementScore: engagementScore,
              timestamp: Date.now()
            }));
          });
        }
        
        // Initialize engagement tracking
        if (enableAutoSuggestion) {
          trackUserEngagement();
        }
        
        // Also detect on page events
        window.addEventListener('load', detectChapterImages);
        document.addEventListener('DOMContentLoaded', detectChapterImages);
        
      } catch (error) {
        window.ReactNativeWebView.postMessage(JSON.stringify({
          type: 'DOWNLOAD_DETECTION_ERROR',
          error: error.message,
          stack: error.stack
        }));
      }
    })();
  `;

    const handleNavigationStateChange = (navState: WebViewNavigation) => {
      const isAllowedHost = allowedHosts.some((host) =>
        navState.url.toLowerCase().includes(host.toLowerCase())
      );

      // If this is the initial load or it's an allowed navigation from the app, allow it
      if (isInitialLoad || navState.url === currentUrl) {
        setIsInitialLoad(false);
        setLastLoadedUrl(navState.url);
        props.onNavigationStateChange?.(navState);
        return;
      }

      // If it's trying to load a URL we've already loaded, prevent the loop
      if (navState.url === lastLoadedUrl) {
        return;
      }

      // If it's not an allowed host, block it
      if (!isAllowedHost && webViewRef.current) {
        console.log('Blocking navigation to:', navState.url);
        webViewRef.current.stopLoading();
        if (lastLoadedUrl) {
          webViewRef.current.injectJavaScript(`
          window.location.replace('${lastLoadedUrl}');
          true;
        `);
        }
        return;
      }

      // If we get here, it's a new allowed navigation
      setLastLoadedUrl(navState.url);
      props.onNavigationStateChange?.(navState);
    };

    const handleMessage = (event: WebViewMessageEvent) => {
      try {
        const data = JSON.parse(event.nativeEvent.data);
        console.log('WebView message:', data);

        switch (data.type) {
          case 'PAGE_LOADED':
            setLastLoadedUrl(data.url);
            break;

          case 'CHAPTER_IMAGES_DETECTED':
            if (enableDownloadDetection && onImagesDetected && data.images) {
              // Convert the detected images to ChapterImage format
              const chapterImages: ChapterImage[] = data.images.map(
                (img: any) => ({
                  pageNumber: img.pageNumber,
                  originalUrl: img.originalUrl,
                  downloadStatus: 'pending' as const,
                })
              );
              onImagesDetected(chapterImages);
            }
            break;

          case 'IMAGE_LOADING_PROGRESS':
            if (
              enableDownloadDetection &&
              onImageLoadingProgress &&
              data.progress !== undefined
            ) {
              onImageLoadingProgress(
                data.progress,
                data.loadedCount || 0,
                data.totalCount || 0
              );
            }
            break;

          case 'IMAGE_LOADING_COMPLETE':
            if (enableDownloadDetection && onImagesDetected && data.images) {
              const chapterImages: ChapterImage[] = data.images.map(
                (img: any) => ({
                  pageNumber: img.pageNumber,
                  originalUrl: img.originalUrl,
                  downloadStatus: 'pending' as const,
                })
              );
              onImagesDetected(chapterImages);
            }
            break;

          case 'OFFLINE_IMAGES_INJECTED':
            console.log(
              `Offline images injected: ${data.replacedCount}/${data.totalOfflineImages} (${data.totalImages} total pages)`
            );
            break;

          case 'OFFLINE_IMAGE_FALLBACK':
            console.log(
              `Offline image fallback for page ${data.pageNumber}: ${data.originalUrl}`
            );
            break;

          case 'OFFLINE_AVAILABILITY_DETECTED':
            console.log(
              `Offline availability: ${data.availableOfflinePages}/${data.totalPages} pages (${data.offlinePercentage.toFixed(1)}%)`
            );
            break;

          case 'OFFLINE_CONTENT_LOADED':
            console.log(
              `Offline content loaded with ${data.totalImages} images`
            );
            break;

          case 'OFFLINE_CONTENT_EMPTY':
            console.log('Offline content is empty');
            break;

          case 'BLENDED_CONTENT_LOADED':
            console.log(
              `Blended content loaded: ${data.localImages} local, ${data.networkImages} network images`
            );
            break;

          case 'OFFLINE_INJECTION_ERROR':
            console.warn('WebView offline injection error:', data.error);
            break;

          case 'DOWNLOAD_SUGGESTION_TRIGGERED':
            if (
              enableAutoDownloadSuggestion &&
              onDownloadSuggestion &&
              mangaId &&
              chapterNumber &&
              !hasTriggeredDownloadSuggestion
            ) {
              console.log(
                `Download suggestion triggered for ${mangaId}/${chapterNumber} (${data.totalImages} images, bookmarked: ${data.isBookmarked})`
              );
              setHasTriggeredDownloadSuggestion(true);
              onDownloadSuggestion(mangaId, chapterNumber, mangaTitle);
            }
            break;

          case 'ENGAGED_DOWNLOAD_SUGGESTION':
            if (
              enableAutoDownloadSuggestion &&
              onDownloadSuggestion &&
              mangaId &&
              chapterNumber &&
              !hasTriggeredDownloadSuggestion
            ) {
              console.log(
                `Engaged download suggestion for ${mangaId}/${chapterNumber} (engagement: ${data.engagementScore.toFixed(2)}, scrolls: ${data.scrollCount})`
              );
              setHasTriggeredDownloadSuggestion(true);
              onDownloadSuggestion(mangaId, chapterNumber, mangaTitle);
            }
            break;

          case 'CHAPTER_VIEWING_STATS':
            console.log(
              `Chapter viewing stats: ${data.timeSpent}ms, ${data.scrollCount} scrolls, engagement: ${data.engagementScore.toFixed(2)}`
            );
            break;

          case 'NETWORK_STATE_CHANGED':
            console.log(
              `Network state changed: ${data.isOnline ? 'online' : 'offline'}`
            );
            break;

          case 'DOWNLOAD_DETECTION_ERROR':
          case 'IMAGE_EXTRACTION_ERROR':
          case 'IMAGE_LOADING_ERROR':
            console.warn('WebView download detection error:', data.error);
            break;
        }

        props.onMessage?.(event);
      } catch (error) {
        console.warn('Error parsing WebView message:', error);
        props.onMessage?.(event);
      }
    };

    // Method to manually trigger download suggestion
    const triggerDownloadSuggestion = () => {
      if (
        enableAutoDownloadSuggestion &&
        onDownloadSuggestion &&
        mangaId &&
        chapterNumber &&
        !hasTriggeredDownloadSuggestion
      ) {
        setHasTriggeredDownloadSuggestion(true);
        onDownloadSuggestion(mangaId, chapterNumber, mangaTitle);
      }
    };

    // Expose methods via ref
    useImperativeHandle(ref, () => ({
      triggerDownloadSuggestion,
      webViewRef,
    }));

    // Determine what to load - offline content or network URL
    const handleShouldStartLoadWithRequest = (request: any) => {
      // Intercept AJAX requests to capture VRF tokens and chapter IDs
      webViewRequestInterceptor.interceptRequest(request.url);

      // Always return true to allow the request to continue
      return true;
    };

    const webViewSource =
      shouldLoadOffline && offlineContent?.html
        ? { html: offlineContent.html }
        : props.source;

    return (
      <WebView
        ref={webViewRef}
        key={webViewKey}
        {...props}
        {...(webViewSource ? { source: webViewSource } : {})}
        onNavigationStateChange={handleNavigationStateChange}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        onMessage={handleMessage}
        injectedJavaScript={`
        ${preventHorizontalScrollJS}
        ${preventRedirectsJS}
        ${offlineContentInjectionJS}
        ${downloadDetectionJS}
        ${props.injectedJavaScript || ''}
        true;
      `}
        {...(Platform.OS === 'android'
          ? {
              userAgent:
                'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
            }
          : props.userAgent
            ? { userAgent: props.userAgent }
            : {})}
        sharedCookiesEnabled={false}
        thirdPartyCookiesEnabled={false}
        javaScriptCanOpenWindowsAutomatically={false}
        allowsBackForwardNavigationGestures={false}
        allowsLinkPreview={false}
        incognito={true}
      />
    );
  }
);

CustomWebView.displayName = 'CustomWebView';

export default CustomWebView;
