import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import WebView from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { MANGA_API_URL } from '@/constants/Config';
import { Colors } from '@/constants/Colors';
import { useTheme } from '@/hooks/useTheme';
import {
  buildVrfScript,
  mangaFireVrfBridge,
} from '@/services/mangaFireVrfBridge';
import { logger } from '@/utils/logger';
import { isDebugEnabled } from '@/constants/env';

const MAX_HOST_RELOADS = 2;
const HOST_RELOAD_WINDOW_MS = 60_000;

const MangaFireVrfHost: React.FC = () => {
  const log = logger();
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors, insets.top);
  const webViewRef = useRef<WebView>(null);
  const reloadAtRef = useRef<number[]>([]);
  const [challengeVisible, setChallengeVisible] = useState(false);
  const readinessScript = useMemo(() => buildVrfScript(), []);

  const reloadWebView = useCallback(() => {
    const now = Date.now();
    const recent = reloadAtRef.current.filter(
      (ts) => now - ts < HOST_RELOAD_WINDOW_MS
    );
    if (recent.length >= MAX_HOST_RELOADS) {
      reloadAtRef.current = recent;
      log.warn('Service', 'MangaFire VRF host reload limit reached');
      return;
    }
    recent.push(now);
    reloadAtRef.current = recent;
    log.warn('Service', 'Reloading MangaFire VRF host WebView', {
      attempt: recent.length,
    });
    webViewRef.current?.reload();
  }, [log]);

  useEffect(() => {
    const inject = (script: string) => {
      webViewRef.current?.injectJavaScript(script);
    };

    mangaFireVrfBridge.attachHost(inject, { reload: reloadWebView });
    return () => {
      mangaFireVrfBridge.detachHost();
    };
  }, [reloadWebView]);

  useEffect(() => {
    return mangaFireVrfBridge.subscribeHostUi((state) => {
      setChallengeVisible(state.challengeVisible);
    });
  }, []);

  const handleLoadEnd = useCallback(() => {
    mangaFireVrfBridge.reportHostEvent({ type: 'loadEnd' });
    if (isDebugEnabled()) {
      log.info('Service', 'MangaFire VRF host loaded');
    }
    webViewRef.current?.injectJavaScript(readinessScript);
  }, [log, readinessScript]);

  const handleMessage = useCallback(
    (event: { nativeEvent: { data: string } }) => {
      const payload = event.nativeEvent.data;
      try {
        const parsed = JSON.parse(payload) as { type?: string };
        if (parsed.type === 'ready') {
          reloadAtRef.current = [];
        }
      } catch {
        // Bridge ignores malformed payloads too
      }
      mangaFireVrfBridge.handleMessage(payload);
    },
    []
  );

  const handleError = useCallback(
    (event: { nativeEvent: { description?: string } }) => {
      const description =
        event.nativeEvent.description || 'Unknown WebView error';
      mangaFireVrfBridge.reportHostEvent({
        type: 'error',
        description,
      });
      log.error('Service', 'MangaFire VRF host failed to load', {
        error: description,
      });
    },
    [log]
  );

  const handleHttpError = useCallback(
    (event: {
      nativeEvent: { statusCode?: number; description?: string; url?: string };
    }) => {
      const statusCode = event.nativeEvent.statusCode;
      mangaFireVrfBridge.reportHostEvent({
        type: 'httpError',
        ...(statusCode != null ? { statusCode } : {}),
        ...(event.nativeEvent.description
          ? { description: event.nativeEvent.description }
          : {}),
        ...(event.nativeEvent.url ? { url: event.nativeEvent.url } : {}),
      });

      // Cloudflare interstitial pages are served as 403. That is expected
      // until the user completes the visible challenge.
      if (statusCode === 403) {
        log.warn('Network', 'MangaFire VRF host received Cloudflare 403', {
          url: event.nativeEvent.url,
        });
        return;
      }

      log.error('Service', 'MangaFire VRF host HTTP error', {
        statusCode,
        error: event.nativeEvent.description,
        url: event.nativeEvent.url,
      });
    },
    [log]
  );

  const handleProcessGone = useCallback(() => {
    mangaFireVrfBridge.reportHostEvent({ type: 'terminated' });
    log.error('Service', 'MangaFire VRF host WebView process terminated');
    reloadWebView();
  }, [log, reloadWebView]);

  const handleDismissChallenge = useCallback(() => {
    mangaFireVrfBridge.dismissChallenge();
  }, []);

  return (
    <View
      collapsable={false}
      pointerEvents={challengeVisible ? 'auto' : 'none'}
      style={challengeVisible ? styles.challengeContainer : styles.container}
      accessibilityElementsHidden={!challengeVisible}
      importantForAccessibility={
        challengeVisible ? 'yes' : 'no-hide-descendants'
      }
    >
      {challengeVisible ? (
        <View style={styles.challengeHeader}>
          <View style={styles.challengeHeaderText}>
            <Text style={styles.challengeTitle}>Security check</Text>
            <Text style={styles.challengeSubtitle}>
              Complete the check so manga can load on this device.
            </Text>
          </View>
          <Pressable
            onPress={handleDismissChallenge}
            accessibilityRole="button"
            accessibilityLabel="Dismiss security check"
            style={styles.challengeClose}
          >
            <Ionicons name="close" size={22} color={colors.text} />
          </Pressable>
        </View>
      ) : null}
      <WebView
        ref={webViewRef}
        source={{ uri: MANGA_API_URL }}
        injectedJavaScript={readinessScript}
        onLoadEnd={handleLoadEnd}
        onMessage={handleMessage}
        onError={handleError}
        onHttpError={handleHttpError}
        onContentProcessDidTerminate={handleProcessGone}
        onRenderProcessGone={handleProcessGone}
        style={challengeVisible ? styles.challengeWebView : styles.webView}
        originWhitelist={['*']}
        javaScriptEnabled
        domStorageEnabled
        sharedCookiesEnabled
        thirdPartyCookiesEnabled
        cacheEnabled
        incognito={false}
        setSupportMultipleWindows={false}
        javaScriptCanOpenWindowsAutomatically={false}
        allowsInlineMediaPlayback
        mediaPlaybackRequiresUserAction={false}
        allowsLinkPreview={false}
        scrollEnabled={challengeVisible}
        bounces={false}
        androidLayerType="hardware"
        mixedContentMode="always"
      />
    </View>
  );
};

const getStyles = (colors: typeof Colors.light, topInset: number) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      top: 0,
      left: 0,
      width: 64,
      height: 64,
      opacity: 0.04,
      overflow: 'hidden',
      zIndex: 0,
    },
    webView: {
      width: 64,
      height: 64,
      backgroundColor: 'transparent',
      opacity: 0.04,
    },
    challengeContainer: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      backgroundColor: colors.background,
      opacity: 1,
      zIndex: 9999,
    },
    challengeHeader: {
      paddingTop: topInset + 12,
      paddingHorizontal: 16,
      paddingBottom: 12,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    challengeHeaderText: {
      flex: 1,
    },
    challengeTitle: {
      fontSize: 17,
      fontWeight: '700',
      color: colors.text,
    },
    challengeSubtitle: {
      marginTop: 4,
      fontSize: 13,
      lineHeight: 18,
      color: colors.secondaryText,
    },
    challengeClose: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
    },
    challengeWebView: {
      flex: 1,
      backgroundColor: colors.background,
    },
  });

export default MangaFireVrfHost;
