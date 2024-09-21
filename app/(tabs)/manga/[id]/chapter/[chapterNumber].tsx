import React, { useState, useRef, useCallback, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Platform, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { WebView, WebViewNavigation, WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { getChapterUrl, markChapterAsRead, getInjectedJavaScript } from '@/services/mangaFireService';
import { BackHandler } from 'react-native';
import { useTheme } from '@/constants/ThemeContext';
import { Colors } from '@/constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';

const CustomWebView = (props: any) => {
  const webViewRef = useRef<WebView>(null);

  const handleMessage = (event: WebViewMessageEvent) => {
    console.log('message', event.nativeEvent.data);
  };

  return (
    <WebView
      ref={webViewRef}
      onMessage={handleMessage}
      {...props}
    />
  );
};

export default function ReadChapterScreen() {
  const { id, chapterNumber } = useLocalSearchParams();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mangaTitle, setMangaTitle] = useState<string | null>(null);
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const styles = getStyles(colors);

  const chapterUrl = getChapterUrl(id as string, chapterNumber as string);

  useEffect(() => {
    const fetchMangaTitle = async () => {
      try {
        const title = await AsyncStorage.getItem(`title_${id}`);
        setMangaTitle(title);
        if (title) {
          await markChapterAsRead(id as string, chapterNumber as string, title);
        } else {
          console.log('Manga title not found for id:', id);
        }
      } catch (error) {
        console.error('Error fetching manga title:', error);
      }
    };

    fetchMangaTitle();
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

  const handleLoadEnd = () => setIsLoading(false);
  const handleBackPress = () => router.navigate(`/manga/${id}`);
  const handleError = () => {
    setError('Failed to load chapter. Please try again.');
    setIsLoading(false);
  };

  const handleNavigationStateChange = async (navState: WebViewNavigation) => {
    if (navState.url !== chapterUrl) {
      const newChapterMatch = navState.url.match(/\/chapter-(\d+)/);
      if (newChapterMatch) {
        const newChapterNumber = newChapterMatch[1];
        if (mangaTitle) {
          await markChapterAsRead(id as string, newChapterNumber, mangaTitle);
        } else {
          console.error('Manga title not available for marking new chapter as read');
        }
        router.replace(`/manga/${id}/chapter/${newChapterNumber}`);
      }
    }
  };

  return (
    <View style={styles.container}>
      {isLoading && (
        <View style={styles.loadingContainer}>
          <ActivityIndicator testID="loading-indicator" size="large" color={colors.primary} />
        </View>
      )}
      {error ? (
        <View style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </View>
      ) : (
        <>
          <CustomWebView
            source={{ uri: chapterUrl }}
            style={styles.webView}
            onLoadEnd={handleLoadEnd}
            onError={handleError}
            testID="chapter-webview"
            injectedJavaScript={getInjectedJavaScript(colors.card)}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            originWhitelist={['*']}
            onNavigationStateChange={handleNavigationStateChange}
            allowsBackForwardNavigationGestures={Platform.OS === 'ios'}
            decelerationRate="normal"
            nestedScrollEnabled={true}
          />
          <TouchableOpacity testID="back-button" style={styles.backButton} onPress={handleBackPress}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}


const getStyles = (colors: typeof Colors.light) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: 'transparent',
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
  },
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  errorText: {
    fontSize: 18,
    textAlign: 'center',
    color: colors.error,
  },
  backButton: {
    position: 'absolute',
    top: 50,
    left: 10,
    zIndex: 1000,
    color: colors.text,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
    borderRadius: 20,
    padding: 8,
  },
});
