import React, { useState, useCallback, useRef, useEffect } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity, BackHandler, Platform, useColorScheme } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { WebView, WebViewNavigation, WebViewMessageEvent } from 'react-native-webview';
import { Ionicons } from '@expo/vector-icons';
import { getChapterUrl, markChapterAsRead, getInjectedJavaScript, fetchMangaDetails, MangaDetails } from '@/services/mangaFireService';
import { useTheme } from '@/constants/ThemeContext';
import { Colors, ColorScheme } from '@/constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface CustomWebViewProps extends React.ComponentProps<typeof WebView> {}

const CustomWebView: React.FC<CustomWebViewProps> = (props) => {
  const webViewRef = useRef<WebView>(null);
  const [webViewKey, setWebViewKey] = useState(1);

  useEffect(() => {
    if (Platform.OS === "ios") {
      setTimeout(() => setWebViewKey(key => key + 1), 50);
    }
  }, []);

  const handleMessage = (event: WebViewMessageEvent) => {
    console.log('message', event.nativeEvent.data);
  };

  return (
    <WebView 
      ref={webViewRef} 
      key={webViewKey}
      onMessage={handleMessage} 
      {...props} 
    />
  );
};

export default function ReadChapterScreen() {
  const { id, chapterNumber } = useLocalSearchParams<{ id: string; chapterNumber: string }>();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mangaTitle, setMangaTitle] = useState<string | null>(null);
  const [mangaDetails, setMangaDetails] = useState<MangaDetails | null>(null);
  
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme = theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const chapterUrl = getChapterUrl(id, chapterNumber);

  useEffect(() => {
    const markChapterAsReadWithFallback = async () => {
      try {
        let title = await AsyncStorage.getItem(`title_${id}`);
        if (!title) {
          const details = await fetchMangaDetails(id);
          title = details.title;
        }
        await markChapterAsRead(id, chapterNumber, title);
        setMangaTitle(title);
      } catch (error) {
        console.error('Error marking chapter as read:', error);
      }
    };
    markChapterAsReadWithFallback();
  }, [id, chapterNumber]);

  useEffect(() => {
    const fetchDetails = async () => {
      try {
        const details = await fetchMangaDetails(id);
        setMangaDetails(details);
      } catch (error) {
        console.error('Error fetching manga details:', error);
      }
    };
    fetchDetails();
  }, [id]);

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
          await markChapterAsRead(id, newChapterNumber, mangaTitle);
        }
        router.replace(`/manga/${id}/chapter/${newChapterNumber}`);
      }
    }
  };

  const handleNextChapterPress = () => {
    if (!mangaDetails?.chapters) return;

    const currentChapterIndex = mangaDetails.chapters.findIndex(
      chapter => chapter.number === chapterNumber
    );

    if (currentChapterIndex === -1 || currentChapterIndex === 0) return;

    const nextChapter = mangaDetails.chapters[currentChapterIndex - 1];
    if (nextChapter) {
      router.navigate(`/manga/${id}/chapter/${nextChapter.number}`);
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
            decelerationRate={Platform.OS === 'ios' ? 'normal' : 0.98}
            nestedScrollEnabled={true}
          />
          <TouchableOpacity testID="back-button" style={styles.backButton} onPress={handleBackPress}>
            <Ionicons name="chevron-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <TouchableOpacity
            testID="next-chapter-button"
            style={[
              styles.nextChapterButton,
              (!mangaDetails?.chapters || mangaDetails.chapters[0].number === chapterNumber) && styles.disabledButton
            ]}
            onPress={handleNextChapterPress}
            disabled={!mangaDetails?.chapters || mangaDetails.chapters[0].number === chapterNumber}
          >
            <Ionicons name="chevron-forward" size={18} color={colors.text} />
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
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
      backgroundColor: 'rgba(0, 0, 0, 0.3)',
      borderRadius: 20,
      padding: 8,
    },
    nextChapterButton: {
      position: 'absolute',
      top: 50,
      right: 10,
      zIndex: 1000,
      backgroundColor: 'rgba(0, 0, 0, 0.3)',
      borderRadius: 20,
      padding: 8,
    },
    disabledButton: {
      opacity: 0.5,
    },
  });