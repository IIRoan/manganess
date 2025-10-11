import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  useWindowDimensions,
  Platform,
  Animated,
} from 'react-native';
import { Stack, useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import MangaCard from '@/components/MangaCard';
import { Colors } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import { MANGA_API_URL } from '@/constants/Config';
import CustomWebView from '@/components/CustomWebView';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  type MangaItem,
  CloudflareDetectedError,
  searchManga,
  setVrfToken as setServiceVrfToken,
} from '@/services/mangaFireService';
import { getLastReadChapter } from '@/services/readChapterService';
import { useDebounce } from '@/hooks/useDebounce';
import { useCloudflareDetection } from '@/hooks/useCloudflareDetection';
import type { WebViewMessageEvent } from 'react-native-webview';

/* Type Definitions */
interface LastReadChapters {
  [key: string]: string | null;
}

export default function MangaSearchScreen() {
  // Theme and layout settings
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const { width, height } = useWindowDimensions();
  const styles = getStyles(colors, width, height);
  const insets = useSafeAreaInsets();

  // Router and Input Ref
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const scrollY = useRef(new Animated.Value(0)).current;
  const [isFocused, setIsFocused] = useState(false);

  // State variables
  const [searchQuery, setSearchQuery] = useState('');
  const debouncedSearchQuery = useDebounce(searchQuery, 500);
  const [searchResults, setSearchResults] = useState<MangaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [, /* error */ setError] = useState<string | null>(null);
  const inFlightSeqRef = useRef(0);
  const vrfCacheRef = useRef<Map<string, string>>(new Map());
  const [lastReadChapters, setLastReadChapters] = useState<LastReadChapters>(
    {}
  );
  const [vrfToken, setVrfToken] = useState<string | null>(null);
  const [tokenError, setTokenError] = useState(false);
  const [vrfWebViewKey, setVrfWebViewKey] = useState(0);
  const currentQueryRef = useRef<string | null>(null);
  const vrfTokenQueryRef = useRef<string | null>(null);

  // Focus input field on screen focus
  useFocusEffect(
    useCallback(() => {
      if (searchQuery === '') {
        inputRef.current?.focus();
      }
    }, [searchQuery])
  );

  const { checkForCloudflare } = useCloudflareDetection();

  // For each query, derive VRF via WebView (or cache) then search
  useEffect(() => {
    const q = debouncedSearchQuery.trim();
    if (q.length > 2) {
      setIsLoading(true);
      setError(null);
      currentQueryRef.current = q;
      const key = q.toLowerCase();
      const cached = vrfCacheRef.current.get(key);
      if (cached) {
        // Use cached VRF immediately
        setVrfToken(cached);
        vrfTokenQueryRef.current = q;
      } else {
        // Derive VRF via WebView
        setVrfToken(null);
        vrfTokenQueryRef.current = null;
        setVrfWebViewKey((k) => k + 1);
      }
    } else if (q.length === 0) {
      setSearchResults([]);
      setIsLoading(false);
      currentQueryRef.current = null;
    }
  }, [debouncedSearchQuery]);

  useEffect(() => {
    const performSearch = async () => {
      const normalizedCurrent = (currentQueryRef.current || '')
        .trim()
        .toLowerCase();
      const normalizedDebounced = (debouncedSearchQuery || '')
        .trim()
        .toLowerCase();
      const normalizedTokenQuery = (vrfTokenQueryRef.current || '')
        .trim()
        .toLowerCase();
      if (
        vrfToken &&
        normalizedCurrent &&
        normalizedCurrent === normalizedDebounced &&
        normalizedTokenQuery === normalizedDebounced
      ) {
        const seq = ++inFlightSeqRef.current;
        try {
          const items = await searchManga(debouncedSearchQuery, vrfToken);
          if (inFlightSeqRef.current !== seq) return; // ignore stale
          setSearchResults(items);
        } catch (err: any) {
          if (err instanceof CloudflareDetectedError) {
            checkForCloudflare(err.html, '/mangasearch');
            return;
          }
          if (inFlightSeqRef.current !== seq) return; // ignore stale
          setError('Failed to fetch manga. Please try again.');
          console.error(err);
        } finally {
          if (inFlightSeqRef.current === seq) setIsLoading(false);
        }
      }
    };
    performSearch();
  }, [vrfToken, debouncedSearchQuery, checkForCloudflare]);

  // Clear search
  const clearSearch = useCallback(() => {
    setSearchQuery('');
    setSearchResults([]);
    currentQueryRef.current = null;
    inFlightSeqRef.current++;
    inputRef.current?.focus();
  }, []);

  // Handle manga item press
  const handleMangaPress = useCallback(
    (item: MangaItem) => {
      router.navigate({
        pathname: '/manga/[id]',
        params: { id: item.id, title: item.title, bannerImage: item.banner },
      });
    },
    [router]
  );

  // Fetch last read chapters without blocking the UI; parallelize and cancel on changes
  useEffect(() => {
    let cancelled = false;
    const run = async () => {
      const ids = searchResults.map((it) => it.id);
      try {
        const results = await Promise.all(
          ids.map((id) => getLastReadChapter(id))
        );
        if (cancelled) return;
        const chapters: LastReadChapters = {};
        for (let i = 0; i < ids.length; i++) {
          const id = ids[i];
          if (!id) continue;
          chapters[id] = results[i] ?? null;
        }
        setLastReadChapters(chapters);
      } catch {
        // ignore errors here; UI can render without last-read badges
      }
    };

    if (searchResults.length > 0) {
      run();
    }

    return () => {
      cancelled = true;
    };
  }, [searchResults]);

  // Render function for MangaCard component
  const renderMangaCard = useCallback(
    ({ item }: { item: MangaItem }) => (
      <View style={styles.cardWrapper}>
        <MangaCard
          key={item.id}
          title={item.title}
          imageUrl={item.banner}
          onPress={() => handleMangaPress(item)}
          lastReadChapter={lastReadChapters[item.id] || null}
          style={styles.card}
          context="search"
          mangaId={item.id}
        />
        <View style={styles.titleContainer}>
          <Text style={styles.mangaTitle} numberOfLines={2}>
            {item.title}
          </Text>
        </View>
      </View>
    ),
    [handleMangaPress, lastReadChapters, styles]
  );

  // Key extractor for FlatList
  const keyExtractor = useCallback((item: MangaItem) => item.id, []);

  // WebView message handler to get VRF token
  const handleWebViewMessage = useCallback((event: WebViewMessageEvent) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'VRF_TOKEN' && data.token) {
        const token: string = data.token;
        const msgQuery: string = (data.query || '').trim();
        const current = (currentQueryRef.current || '').trim();
        // Ensure token belongs to the current query
        if (!msgQuery || msgQuery.toLowerCase() !== current.toLowerCase())
          return;
        // Validate token format: must contain at least one hyphen and be reasonably long
        const looksValid = /-/.test(token) && token.length >= 30;
        if (!looksValid) return;
        // Cache VRF for this query (simple LRU of size 15)
        const key = msgQuery.toLowerCase();
        const cache = vrfCacheRef.current;
        cache.set(key, token);
        if (cache.size > 15) {
          const iter = cache.keys().next();
          if (!iter.done && typeof iter.value === 'string') {
            cache.delete(iter.value);
          }
        }
        // Mark that VRF is ready and tie it to the originating query
        setVrfToken(token);
        vrfTokenQueryRef.current = msgQuery;
        setServiceVrfToken(token);
        setTokenError(false);
      } else if (data.type === 'VRF_ERROR') {
        // Ignore stale VRF_ERROR if query changed
        const msgQuery: string = (data.query || '').trim();
        const current = (currentQueryRef.current || '').trim();
        if (msgQuery && msgQuery.toLowerCase() !== current.toLowerCase())
          return;
        setTokenError(true);
        setIsLoading(false);
      }
    } catch (e) {
      // Ignore non-JSON messages
    }
  }, []);

  // Build injected JS for a given query: set the keyword and wait until VRF hidden input stabilizes to a full token
  const getVrfForQueryJs = (query: string) => `
    (function(){
      var TARGET = ${JSON.stringify(query)};
      var last = '';
      var stableCount = 0;
      var attempts = 0;
      function q(sel){ try { return document.querySelector(sel); } catch(e){ return null; } }
      function get(){
        var form = q('#nav-search form') || q('form[action="filter"]') || q('form[action*="/filter"]');
        var kw = form ? form.querySelector('input[name="keyword"]') : q('input[name="keyword"]');
        var vrf = form ? form.querySelector('input[name="vrf"]') : q('input[name="vrf"]');
        return {kw:kw, vrf:vrf};
      }
      function tick(){
        attempts++;
        var els = get();
        if(els.kw){
          if(els.kw.value !== TARGET){
            els.kw.value = TARGET;
            ['input','keyup','change'].forEach(function(evt){ try{ els.kw.dispatchEvent(new Event(evt,{bubbles:true})) }catch(e){} });
          }
        }
        var val = els.vrf && els.vrf.value ? String(els.vrf.value) : '';
        // Require at least one hyphen and minimum length, and stability over two ticks
        if(/-/.test(val) && val.length >= 30){
          if(val === last){
            stableCount++;
          } else {
            stableCount = 0;
            last = val;
          }
          if(stableCount >= 2){
            try{ window.ReactNativeWebView.postMessage(JSON.stringify({type:'VRF_TOKEN', token: val, query: TARGET})); }catch(e){}
            return;
          }
        }
        if(attempts < 120){ setTimeout(tick, 120); } else { try{ window.ReactNativeWebView.postMessage(JSON.stringify({type:'VRF_ERROR', query: TARGET})); }catch(e){} }
      }
      if(document.readyState === 'complete' || document.readyState === 'interactive') setTimeout(tick, 80);
      else { window.addEventListener('DOMContentLoaded', function(){ setTimeout(tick, 80); }); window.addEventListener('load', function(){ setTimeout(tick, 80); }); }
      true;
    })();
  `;

  const EmptyState = useCallback(() => {
    // While loading, let the FlatList's built-in refreshing control display the spinner
    if (isLoading) {
      return null;
    }

    if (tokenError) {
      return (
        <View style={styles.emptyStateContainer}>
          <View style={styles.emptyStateIcon}>
            <Ionicons
              name="alert-circle-outline"
              size={48}
              color={colors.error}
            />
          </View>
          <Text style={styles.emptyStateTitle}>Connection Error</Text>
          <Text style={styles.emptyStateText}>
            Unable to initialize search. Please try again.
          </Text>
          <TouchableOpacity
            style={[styles.retryButton, { backgroundColor: colors.primary }]}
            onPress={() => {
              setVrfToken(null);
              vrfTokenQueryRef.current = null;
              currentQueryRef.current = searchQuery.trim();
              if ((currentQueryRef.current || '').length > 2) {
                setVrfWebViewKey((k) => k + 1);
                setIsLoading(true);
              } else {
                setTokenError(false);
              }
            }}
          >
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.emptyStateContainer}>
        <View style={styles.emptyStateIcon}>
          <Ionicons name="book-outline" size={48} color={colors.primary} />
        </View>
        <Text style={styles.emptyStateTitle}>Discover New Stories</Text>
        <Text style={styles.emptyStateText}>
          Search for manga, manhwa, and more
        </Text>
      </View>
    );
  }, [
    styles,
    colors.primary,
    colors.error,
    tokenError,
    searchQuery,
    isLoading,
  ]);

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          title: 'Search',
          headerTintColor: colors.text,
          headerShown: false,
        }}
      />
      <View style={[styles.headerWrapper, { paddingTop: insets.top }]}>
        <View style={styles.searchContainer}>
          <View
            style={[
              styles.searchInputContainer,
              isFocused && {
                borderColor: colors.primary + '60',
                borderWidth: 1.25,
                shadowOpacity: 0.15,
                elevation: 3,
              },
            ]}
          >
            <Ionicons
              name="search"
              size={20}
              color={colors.tabIconDefault}
              style={styles.searchIcon}
            />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Search manga or manhwa..."
              placeholderTextColor={colors.tabIconDefault}
              value={searchQuery}
              onChangeText={(query) => setSearchQuery(query)}
              returnKeyType="search"
              onFocus={() => setIsFocused(true)}
              onBlur={() => setIsFocused(false)}
              onSubmitEditing={() => {
                const q = searchQuery.trim();
                if (q.length > 2) {
                  setSearchQuery(q);
                }
              }}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity
                onPress={clearSearch}
                style={styles.clearButton}
                hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
              >
                <Ionicons
                  name="close-circle-outline"
                  size={20}
                  color={colors.tabIconDefault}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <View style={[styles.contentContainer, { marginTop: insets.top }]}>
        <Animated.FlatList
          data={searchResults}
          renderItem={renderMangaCard}
          keyExtractor={keyExtractor}
          numColumns={2}
          contentContainerStyle={styles.gridContainer}
          columnWrapperStyle={styles.columnWrapper}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          ListEmptyComponent={EmptyState}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          refreshing={isLoading}
          onRefresh={() => {
            const q = (debouncedSearchQuery || '').trim();
            if (q.length > 2) {
              setVrfToken(null);
              vrfTokenQueryRef.current = null;
              currentQueryRef.current = q;
              setVrfWebViewKey((k) => k + 1);
              setIsLoading(true);
            }
          }}
        />

        {/* Hidden WebView for per-query VRF token acquisition */}
        {debouncedSearchQuery.length > 2 && !vrfToken && (
          <CustomWebView
            key={vrfWebViewKey}
            source={{ uri: `${MANGA_API_URL}/filter` }}
            style={{ position: 'absolute', width: 1, height: 1, opacity: 0 }}
            injectedJavaScript={getVrfForQueryJs(
              (debouncedSearchQuery || '').trim()
            )}
            onMessage={handleWebViewMessage}
            javaScriptEnabled={true}
            domStorageEnabled={true}
            allowedHosts={['mangafire.to']}
          />
        )}
      </View>
    </SafeAreaView>
  );
}

// Styles with responsiveness adjustments
const getStyles = (
  colors: typeof Colors.light,
  width: number,
  height: number
) => {
  const isLandscape = width > height;
  const cardWidth = isLandscape ? (width - 60) / 4 : (width - 48) / 2;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
    },
    headerWrapper: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      backgroundColor: colors.card,
      borderBottomColor: colors.border,
      borderBottomWidth: StyleSheet.hairlineWidth,
    },
    contentContainer: {
      flex: 1,
      marginTop: 46,
    },
    searchContainer: {
      paddingHorizontal: 20,
      paddingTop: 6,
      paddingBottom: 6,
    },
    searchInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 8,
      paddingHorizontal: 12,
      height: 36,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.1,
      shadowRadius: 1.5,
      elevation: 2,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchIcon: {
      marginRight: 5,
    },
    searchInput: {
      flex: 1,
      fontSize: 15,
      color: colors.text,
      paddingVertical: Platform.OS === 'ios' ? 5 : 3,
    },
    clearButton: {
      padding: 3,
      marginLeft: 3,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    gridContainer: {
      padding: 16,
      paddingBottom: 150,
    },
    columnWrapper: {
      justifyContent: 'space-between',
    },
    cardWrapper: {
      width: cardWidth,
      marginBottom: 16,
    },
    card: {
      width: '100%',
      aspectRatio: 3 / 4,
    },
    titleContainer: {
      marginTop: 8,
    },
    mangaTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: 'bold',
      textAlign: 'center',
    },
    emptyStateContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      marginTop: height * 0.2,
    },
    emptyStateIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.primary + '20',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyStateTitle: {
      fontSize: 24,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    emptyStateText: {
      fontSize: 16,
      color: colors.tabIconDefault,
      textAlign: 'center',
      maxWidth: 250,
    },
    retryButton: {
      marginTop: 20,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
    },
    retryButtonText: {
      color: '#ffffff',
      fontSize: 16,
      fontWeight: '600',
    },
    resultCount: {
      paddingHorizontal: 4,
      paddingTop: 8,
      fontSize: 13,
      color: colors.tabIconDefault,
      alignSelf: 'flex-start',
    },
  });
};
