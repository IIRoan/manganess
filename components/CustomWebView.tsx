import React, { useRef, useState, useEffect } from 'react';
import { Platform } from 'react-native';
import {
  WebView,
  WebViewNavigation,
  WebViewMessageEvent,
} from 'react-native-webview';

interface CustomWebViewProps extends React.ComponentProps<typeof WebView> {
  allowedHosts?: string[];
  currentUrl?: string;
}

const CustomWebView: React.FC<CustomWebViewProps> = ({
  allowedHosts = ['mangafire.to'],
  currentUrl,
  ...props
}) => {
  const webViewRef = useRef<WebView>(null);
  const [webViewKey, setWebViewKey] = useState(1);
  const [lastLoadedUrl, setLastLoadedUrl] = useState<string | null>(null);
  const [isInitialLoad, setIsInitialLoad] = useState(true);

  useEffect(() => {
    if (Platform.OS === 'ios') {
      setTimeout(() => setWebViewKey((key) => key + 1), 50);
    }
  }, []);

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
      }

      props.onMessage?.(event);
    } catch {
      props.onMessage?.(event);
    }
  };

  return (
    <WebView
      ref={webViewRef}
      key={webViewKey}
      {...props}
      onNavigationStateChange={handleNavigationStateChange}
      onMessage={handleMessage}
      injectedJavaScript={`
        ${preventHorizontalScrollJS}
        ${preventRedirectsJS}
        ${props.injectedJavaScript || ''}
        true;
      `}
      {...(Platform.OS === 'android' ? { 
        userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36' 
      } : props.userAgent ? { userAgent: props.userAgent } : {})}
      sharedCookiesEnabled={false}
      thirdPartyCookiesEnabled={false}
      javaScriptCanOpenWindowsAutomatically={false}
      allowsBackForwardNavigationGestures={false}
      allowsLinkPreview={false}
      incognito={true}
    />
  );
};

export default CustomWebView;
