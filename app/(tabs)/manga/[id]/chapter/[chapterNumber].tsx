import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { WebView, WebViewNavigation } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { getChapterUrl, markChapterAsRead, getInjectedJavaScript } from '@/services/mangaFireService';
import { BackHandler } from 'react-native';

export default function ReadChapterScreen() {
  const { id, chapterNumber } = useLocalSearchParams();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [webViewKey, setWebViewKey] = useState(0);
  const webViewRef = useRef<WebView>(null);
  const [currentUrl, setCurrentUrl] = useState('');

  const chapterUrl = getChapterUrl(id as string, chapterNumber as string);

  useEffect(() => {
    setWebViewKey(prevKey => prevKey + 1);
    markChapterAsRead(id as string, chapterNumber as string);
  }, [id, chapterNumber]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        router.navigate(`/manga/${id}`);
        return true;
      };

      const backHandler = BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => backHandler.remove();
    }, [id, router])
  );

  const handleLoadEnd = () => {
    setIsLoading(false);
  };

  const handleBackPress = () => {
    router.navigate(`/manga/${id}`);
  };

  const handleError = () => {
    setError('Failed to load chapter. Please try again.');
    setIsLoading(false);
  };

  const handleNavigationStateChange = async (navState: WebViewNavigation) => {
    console.log('Current URL:', navState.url);
    setCurrentUrl(navState.url);

    if (navState.url !== chapterUrl) {
      const newChapterMatch = navState.url.match(/\/chapter-(\d+)/);
      if (newChapterMatch) {
        const newChapterNumber = newChapterMatch[1];
        console.log('Navigating to new chapter:', newChapterNumber);
        await markChapterAsRead(id as string, chapterNumber as string);
        router.replace(`/manga/${id}/chapter/${newChapterNumber}`);
      }
    }
  };

  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#0000ff" />
        </View>
      )}
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <>
          <WebView
            ref={webViewRef}
            key={webViewKey}
            source={{ uri: chapterUrl }}
            style={styles.webView}
            onLoadEnd={handleLoadEnd}
            onError={handleError}
            injectedJavaScript={getInjectedJavaScript()}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            originWhitelist={['*']}
            onNavigationStateChange={handleNavigationStateChange}
            onMessage={(event) => {
              console.log('Message from WebView:', event.nativeEvent.data);
            }}
            allowsBackForwardNavigationGestures={Platform.OS === 'ios'} 
          />
          <TouchableOpacity style={styles.backButton} onPress={handleBackPress}>
            <Ionicons name="chevron-back" size={24} color="white" />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  webView: {
    flex: 1,
  },
  loadingContainer: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    bottom: 0,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    color: 'red',
    textAlign: 'center',
  },
  backButton: {
    position: 'absolute',
    top: 40,
    left: 10,
    zIndex: 1000,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    borderRadius: 20,
    padding: 8,
  },
});
