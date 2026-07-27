import React, { useCallback, useEffect, useRef } from 'react';
import { StyleSheet, View } from 'react-native';
import WebView from 'react-native-webview';
import { MANGA_API_URL } from '@/constants/Config';
import {
  buildVrfScript,
  mangaFireVrfBridge,
} from '@/services/mangaFireVrfBridge';
import { logger } from '@/utils/logger';
import { isDebugEnabled } from '@/constants/env';

const MangaFireVrfHost: React.FC = () => {
  const log = logger();
  const webViewRef = useRef<WebView>(null);

  useEffect(() => {
    const inject = (script: string) => {
      webViewRef.current?.injectJavaScript(script);
    };

    mangaFireVrfBridge.attachHost(inject);
    return () => {
      mangaFireVrfBridge.detachHost();
    };
  }, []);

  const handleLoadEnd = useCallback(() => {
    if (isDebugEnabled()) {
      log.info('Service', 'MangaFire VRF host loaded');
    }
    webViewRef.current?.injectJavaScript(buildVrfScript());
  }, [log]);

  const handleMessage = useCallback((event: { nativeEvent: { data: string } }) => {
    mangaFireVrfBridge.handleMessage(event.nativeEvent.data);
  }, []);

  const handleError = useCallback(
    (event: { nativeEvent: { description?: string } }) => {
      log.error('Service', 'MangaFire VRF host failed to load', {
        error: event.nativeEvent.description || 'Unknown WebView error',
      });
    },
    [log]
  );

  return (
    <View style={styles.container} pointerEvents="none">
      <WebView
        ref={webViewRef}
        source={{ uri: MANGA_API_URL }}
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        onError={handleError}
        style={styles.webView}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        cacheEnabled
        incognito={false}
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

export default MangaFireVrfHost;
