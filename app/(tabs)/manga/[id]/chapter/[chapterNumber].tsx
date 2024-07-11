import React, { useState, useEffect, useRef, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, BackHandler, Platform, TouchableOpacity } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import { WebView, WebViewNavigation } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';

export default function ReadChapterScreen() {
  const { id, chapterNumber } = useLocalSearchParams();
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [webViewKey, setWebViewKey] = useState(0);
  const webViewRef = useRef<WebView>(null);
  const [currentUrl, setCurrentUrl] = useState('');

  const chapterUrl = `https://mangafire.to/read/${id}/en/chapter-${chapterNumber}`;

  useEffect(() => {
    setWebViewKey(prevKey => prevKey + 1);
    markChapterAsRead();
  }, [id, chapterNumber]);

  useFocusEffect(
    useCallback(() => {
      const onBackPress = () => {
        router.navigate(`/manga/${id}`);
        return true;
      };

      BackHandler.addEventListener('hardwareBackPress', onBackPress);

      return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
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

  const markChapterAsRead = async () => {
    try {
      const key = `manga_${id}_read_chapters`;
      const readChapters = await AsyncStorage.getItem(key) || '[]';
      const chaptersArray = JSON.parse(readChapters);
      if (!chaptersArray.includes(chapterNumber)) {
        chaptersArray.push(chapterNumber);
        await AsyncStorage.setItem(key, JSON.stringify(chaptersArray));
        console.log(`Marked chapter ${chapterNumber} as read for manga ${id}`);
      }
    } catch (error) {
      console.error('Error marking chapter as read:', error);
    }
  };

  const handleNavigationStateChange = async (navState: WebViewNavigation) => {
    console.log('Current URL:', navState.url);
    setCurrentUrl(navState.url);

    if (navState.url !== chapterUrl) {
      const newChapterMatch = navState.url.match(/\/chapter-(\d+)/);
      if (newChapterMatch) {
        const newChapterNumber = newChapterMatch[1];
        console.log('Navigating to new chapter:', newChapterNumber);
        await markChapterAsRead(); // Mark current chapter as read before navigating
        router.replace(`/manga/${id}/chapter/${newChapterNumber}`);
      }
    }
  };


  const injectedJavaScript = `
  (function() {
    // Function to remove elements
    function removeElements(selectors) {
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => el.remove());
      });
    }
  
    // Function to hide elements
    function hideElements(selectors) {
      selectors.forEach(selector => {
        const elements = document.querySelectorAll(selector);
        elements.forEach(el => {
          el.style.display = 'none';
          el.style.visibility = 'hidden';
          el.style.opacity = '0';
          el.style.pointerEvents = 'none';
        });
      });
    }
  
    // Hide header, footer, and other unwanted elements
    removeElements(['header', 'footer', '.ad-container', '[id^="google_ads_"]', '[id^="adsbygoogle"]', 'iframe[src*="googleads"]', 'iframe[src*="doubleclick"]', '.navbar', '.nav-bar', '#navbar', '#nav-bar', '.top-bar', '#top-bar']);
  
    // Hide toast and other dynamic elements
    hideElements(['#toast', '.toast', '.popup', '.modal', '#overlay', '.overlay', '.banner']);
  
    // Adjust main content
    const main = document.querySelector('main');
    if (main) {
      main.style.paddingTop = '0';
      main.style.marginTop = '0';
    }
  
    // Remove ads and unwanted elements
    function cleanPage() {
      removeElements(['.ad-container', '[id^="google_ads_"]', '[id^="adsbygoogle"]', 'iframe[src*="googleads"]', 'iframe[src*="doubleclick"]']);
      hideElements(['#toast', '.toast', '.popup', '.modal', '#overlay', '.overlay', '.banner']);
    }
  
    // Initial cleaning
    cleanPage();

    

    
  // Function to force vertical layout
  function forceVerticalLayout() {
    // Reset body and html styles
    document.body.style.width = '100%';
    document.body.style.height = 'auto';
    document.body.style.overflow = 'auto';
    document.documentElement.style.overflow = 'auto';

    // Force vertical layout on all potential container elements
    const containers = document.querySelectorAll('body > *, .content-container, .page-container, .image-container');
    containers.forEach(container => {
      container.style.width = '100%';
      container.style.height = 'auto';
      container.style.display = 'block';
      container.style.overflowX = 'hidden';
      container.style.overflowY = 'auto';
      container.style.whiteSpace = 'normal';
      container.style.flexDirection = 'column';
      container.style.alignItems = 'center';
    });

    // Adjust all images
    const images = document.querySelectorAll('img');
    images.forEach(img => {
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      img.style.objectFit = 'contain';
      img.style.display = 'block';
      img.style.marginBottom = '10px';
    });

    // Force any horizontal scrollers to be vertical
    const scrollers = document.querySelectorAll('[class*="scroller"], [id*="scroller"]');
    scrollers.forEach(scroller => {
      scroller.style.overflowX = 'hidden';
      scroller.style.overflowY = 'auto';
      scroller.style.whiteSpace = 'normal';
      scroller.style.display = 'block';
      scroller.style.width = '100%';
      scroller.style.height = 'auto';
    });
  }

  // Initial layout adjustment
  forceVerticalLayout();
  
  
    // Set up a MutationObserver to remove ads and popups that might be dynamically added
    const observer = new MutationObserver(cleanPage);
    observer.observe(document.body, { childList: true, subtree: true });
  
    // Prevent popups and new window opening
    window.open = function() { return null; };
    window.alert = function() { return null; };
    window.confirm = function() { return null; };
    window.prompt = function() { return null; };
  
    // Function to handle navigation
    function handleNavigation(e) {
      const target = e.target.closest('.number-nav a');
      if (target) {
        e.stopPropagation();
        // Allow the default action for these buttons
        return true;
      }
      // Prevent default for all other clicks
      e.preventDefault();
      e.stopPropagation();
      return false;
    }
  
    // Prevent default zoom behavior
    document.addEventListener('gesturestart', function(e) {
      e.preventDefault();
    });
  
    // Disable text selection
    document.body.style.webkitTouchCallout = 'none';
    document.body.style.webkitUserSelect = 'none';
    document.body.style.khtmlUserSelect = 'none';
    document.body.style.mozUserSelect = 'none';
    document.body.style.msUserSelect = 'none';
    document.body.style.userSelect = 'none';
  
    // Block common tracking and ad scripts
    const scriptBlocker = {
      apply: function(target, thisArg, argumentsList) {
        const src = argumentsList[0].src || '';
        if (src.includes('ads') || src.includes('analytics') || src.includes('tracker')) {
          return null;
        }
        return target.apply(thisArg, argumentsList);
      }
    };
    document.createElement = new Proxy(document.createElement, scriptBlocker);
  
    true; // This is required for the injected JavaScript to work
  })();
  `;

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
            injectedJavaScript={injectedJavaScript}
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
  currentUrlText: {
    padding: 10,
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
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
  navigationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 10,
    backgroundColor: '#fff',
  },
  navigationButton: {
    padding: 10,
    backgroundColor: '#007AFF',
    borderRadius: 5,
  },
  navigationText: {
    color: '#fff',
    fontWeight: 'bold',
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
