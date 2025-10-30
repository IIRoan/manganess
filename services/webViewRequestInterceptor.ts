/**
 * WebView Request Interceptor Service
 * Intercepts AJAX requests from WebView to capture VRF tokens and chapter IDs
 * This is the mobile-friendly approach that doesn't require Puppeteer
 */

import { logger } from '@/utils/logger';
import { isDebugEnabled } from '@/constants/env';

export interface InterceptedAjaxRequest {
  url: string;
  chapterId: string;
  vrfToken: string;
  timestamp: number;
}

export interface RequestInterceptionCallback {
  (request: InterceptedAjaxRequest): void;
}

class WebViewRequestInterceptorService {
  private log = logger();
  private interceptedRequests: Map<string, InterceptedAjaxRequest> = new Map();
  private callbacks: Set<RequestInterceptionCallback> = new Set();

  /**
   * Process a URL from WebView's onShouldStartLoadWithRequest
   * Returns the intercepted request if it's an AJAX request we're looking for
   */
  interceptRequest(url: string): InterceptedAjaxRequest | null {
    if (isDebugEnabled()) {
      this.log.info('Service', 'Intercepting request', { url });
    }

    // Check if this is the AJAX request we're looking for
    // Example: https://mangafire.to/ajax/read/chapter/5438730?vrf=ZBYeRCjYBk0...
    if (url.includes('/ajax/read/chapter/')) {
      if (isDebugEnabled()) {
        this.log.info('Service', 'Found AJAX chapter request', { url });
      }

      // Extract chapter ID and VRF token from URL
      const match = url.match(/\/ajax\/read\/chapter\/(\d+)\?vrf=([^&]+)/);

      if (match && match[1] && match[2]) {
        const chapterId = match[1];
        const vrfToken = decodeURIComponent(match[2]);

        const interceptedRequest: InterceptedAjaxRequest = {
          url,
          chapterId,
          vrfToken,
          timestamp: Date.now(),
        };

        // Store the intercepted request
        const key = `${chapterId}`;
        this.interceptedRequests.set(key, interceptedRequest);

        if (isDebugEnabled()) {
          this.log.info('Service', 'Intercepted AJAX request', {
            chapterId,
            vrfTokenPreview: vrfToken.substring(0, 30) + '...',
          });
        }

        // Notify callbacks
        this.notifyCallbacks(interceptedRequest);

        return interceptedRequest;
      }
    }

    return null;
  }

  /**
   * Get a previously intercepted request by chapter ID
   */
  getInterceptedRequest(chapterId: string): InterceptedAjaxRequest | null {
    return this.interceptedRequests.get(chapterId) || null;
  }

  /**
   * Check if we have an intercepted request for a chapter
   */
  hasInterceptedRequest(chapterId: string): boolean {
    return this.interceptedRequests.has(chapterId);
  }

  /**
   * Clear intercepted request for a chapter
   */
  clearInterceptedRequest(chapterId: string): void {
    this.interceptedRequests.delete(chapterId);
  }

  /**
   * Clear all intercepted requests
   */
  clearAllInterceptedRequests(): void {
    this.interceptedRequests.clear();
  }

  /**
   * Register a callback to be notified when a request is intercepted
   */
  onRequestIntercepted(callback: RequestInterceptionCallback): () => void {
    this.callbacks.add(callback);

    // Return unsubscribe function
    return () => {
      this.callbacks.delete(callback);
    };
  }

  /**
   * Notify all registered callbacks
   */
  private notifyCallbacks(request: InterceptedAjaxRequest): void {
    this.callbacks.forEach((callback) => {
      try {
        callback(request);
      } catch (error) {
        this.log.error('Service', 'Callback error', { error });
      }
    });
  }

  /**
   * Extract chapter ID from a chapter URL
   * This is a helper method to generate keys for storing intercepted requests
   */
  extractChapterIdFromUrl(chapterUrl: string): string | null {
    // Try to extract from the URL path
    // Example: /read/manga-name.abc123/en/chapter-17
    const match = chapterUrl.match(/chapter-(\d+)/);
    return match && match[1] ? match[1] : null;
  }

  /**
   * Clean up old intercepted requests (older than 5 minutes)
   */
  cleanupOldRequests(): void {
    const now = Date.now();
    const maxAge = 5 * 60 * 1000; // 5 minutes

    for (const [key, request] of this.interceptedRequests.entries()) {
      if (now - request.timestamp > maxAge) {
        this.interceptedRequests.delete(key);
        if (isDebugEnabled()) {
          this.log.info('Service', 'Cleaned up old intercepted request', {
            chapterId: request.chapterId,
          });
        }
      }
    }
  }
}

// Export singleton instance
export const webViewRequestInterceptor = new WebViewRequestInterceptorService();
