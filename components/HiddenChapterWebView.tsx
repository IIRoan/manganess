/**
 * Hidden WebView Component for Chapter Download
 * Opens a chapter page in a hidden WebView to intercept the AJAX request
 * This captures the VRF token and chapter ID needed for downloading
 */

import React, { useRef, useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import WebView from 'react-native-webview';
import { webViewRequestInterceptor } from '@/services/webViewRequestInterceptor';
import { logger } from '@/utils/logger';
import { isDebugEnabled } from '@/constants/env';
import type { WebViewNavigation } from 'react-native-webview/lib/WebViewTypes';

interface HiddenChapterWebViewProps {
  chapterUrl: string;
  onRequestIntercepted?: (chapterId: string, vrfToken: string) => void;
  onError?: (error: string) => void;
  onTimeout?: () => void;
  timeout?: number; // Timeout in milliseconds
}

const HiddenChapterWebView: React.FC<HiddenChapterWebViewProps> = ({
  chapterUrl,
  onRequestIntercepted,
  onError,
  onTimeout,
  timeout = 30000, // 30 seconds default
}) => {
  const log = logger();
  const webViewRef = useRef<WebView>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const interceptedRef = useRef(false);

  // Ensure we have a full URL
  const fullUrl = React.useMemo(
    () =>
      chapterUrl.startsWith('http')
        ? chapterUrl
        : `https://mangafire.to${chapterUrl}`,
    [chapterUrl]
  );

  useEffect(() => {
    if (isDebugEnabled()) {
      log.info('Service', 'HiddenChapterWebView mounted', {
        chapterUrl,
        fullUrl,
        timeout,
      });
    }

    // Set up timeout
    timeoutRef.current = setTimeout(() => {
      if (!interceptedRef.current) {
        if (isDebugEnabled()) {
          log.warn(
            'Service',
            'WebView timeout - no AJAX request intercepted',
            {
              chapterUrl,
              timeout,
            }
          );
        }
        onTimeout?.();
      }
    }, timeout);

    // Set up request interception callback
    const unsubscribe = webViewRequestInterceptor.onRequestIntercepted(
      (request) => {
        if (!interceptedRef.current) {
          interceptedRef.current = true;

          if (isDebugEnabled()) {
            log.info('Service', 'AJAX request intercepted', {
              chapterId: request.chapterId,
              vrfTokenPreview: request.vrfToken.substring(0, 30) + '...',
            });
          }

          // Clear timeout
          if (timeoutRef.current) {
            clearTimeout(timeoutRef.current);
            timeoutRef.current = null;
          }

          // Notify parent
          onRequestIntercepted?.(request.chapterId, request.vrfToken);
        }
      }
    );

    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      unsubscribe();

      if (isDebugEnabled()) {
        log.info('Service', 'HiddenChapterWebView unmounted', {
          chapterUrl,
        });
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chapterUrl, timeout, onRequestIntercepted, onTimeout]);

  const handleShouldStartLoadWithRequest = (request: any): boolean => {
    if (isDebugEnabled()) {
      log.info('Service', 'WebView request', {
        url: request.url.substring(0, 100) + '...',
      });
    }

    // Try to intercept the request
    const intercepted = webViewRequestInterceptor.interceptRequest(request.url);

    if (intercepted) {
      if (isDebugEnabled()) {
        log.info('Service', 'Intercepted AJAX request', {
          chapterId: intercepted.chapterId,
        });
      }
    }

    // Always allow the request to continue
    return true;
  };

  const handleError = (syntheticEvent: any) => {
    const { nativeEvent } = syntheticEvent;
    if (isDebugEnabled()) {
      log.error('Service', 'WebView error', {
        error: nativeEvent,
      });
    }
    onError?.(nativeEvent.description || 'WebView error');
  };

  const handleLoadEnd = () => {
    if (isDebugEnabled()) {
      log.info('Service', 'WebView load complete', {
        chapterUrl,
      });
    }

    // Inject JavaScript to intercept AJAX requests
    const injectedJS = `
      (function() {
        const originalFetch = window.fetch;
        const originalXHROpen = XMLHttpRequest.prototype.open;
        
        // Intercept fetch
        window.fetch = function(...args) {
          const url = args[0];
          if (typeof url === 'string' && url.includes('/ajax/read/chapter/')) {
            window.ReactNativeWebView?.postMessage(JSON.stringify({
              type: 'AJAX_REQUEST',
              url: url
            }));
          }
          return originalFetch.apply(this, args);
        };
        
        // Intercept XMLHttpRequest
        XMLHttpRequest.prototype.open = function(method, url, ...rest) {
          if (typeof url === 'string' && url.includes('/ajax/read/chapter/')) {
            window.ReactNativeWebView?.postMessage(JSON.stringify({
              type: 'AJAX_REQUEST',
              url: url
            }));
          }
          return originalXHROpen.apply(this, [method, url, ...rest]);
        };
      })();
      true;
    `;

    webViewRef.current?.injectJavaScript(injectedJS);
  };

  const handleMessage = (event: any) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);

      if (data.type === 'AJAX_REQUEST') {
        if (isDebugEnabled()) {
          log.info('Service', 'Received message from WebView', {
            url: data.url.substring(0, 100) + '...',
          });
        }

        // Try to intercept the request
        const intercepted = webViewRequestInterceptor.interceptRequest(
          data.url
        );

        if (intercepted) {
          if (isDebugEnabled()) {
            log.info('Service', 'Intercepted AJAX request from message', {
              chapterId: intercepted.chapterId,
            });
          }
        }
      }
    } catch (error) {
      if (isDebugEnabled()) {
        log.warn('Service', 'Failed to parse WebView message', {
          error,
        });
      }
    }
  };

  const handleLoadStart = () => {
    if (isDebugEnabled()) {
      log.info('Service', 'WebView load started', {
        fullUrl,
      });
    }
  };

  const handleNavigationStateChange = (navState: WebViewNavigation) => {
    if (isDebugEnabled()) {
      log.info('Service', 'Navigation state change', {
        url: navState.url.substring(0, 100) + '...',
        loading: navState.loading,
      });
    }

    // Try to intercept the request (works on Android)
    const intercepted = webViewRequestInterceptor.interceptRequest(
      navState.url
    );

      if (intercepted) {
        if (isDebugEnabled()) {
          log.info('Service', 'Intercepted AJAX request from navigation', {
          chapterId: intercepted.chapterId,
        });
      }
    }
  };

  return (
    <View style={styles.container}>
      <WebView
        ref={webViewRef}
        source={{ uri: fullUrl }}
        onShouldStartLoadWithRequest={handleShouldStartLoadWithRequest}
        onNavigationStateChange={handleNavigationStateChange}
        onLoadStart={handleLoadStart}
        onError={handleError}
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        style={styles.webView}
        originWhitelist={['*']}
        pointerEvents="none"
        cacheEnabled={false}
        incognito={true}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        // Android-specific props
        mixedContentMode="always"
        thirdPartyCookiesEnabled={true}
      />
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: -9999,
    top: -9999,
    width: 1,
    height: 1,
    opacity: 0,
    overflow: 'hidden',
  },
  webView: {
    width: 1,
    height: 1,
  },
});

export default HiddenChapterWebView;
