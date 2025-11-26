import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
  View,
  TextInput,
  StyleSheet,
  Text,
  TouchableOpacity,
  SafeAreaView,
  useWindowDimensions,
} from 'react-native';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import { Stack, useRouter, useFocusEffect } from 'expo-router'; // Combined imports
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
import { logger } from '@/utils/logger';
import { useCloudflareDetection } from '@/hooks/useCloudflareDetection';
import { useOffline } from '@/contexts/OfflineContext';
import { offlineCacheService } from '@/services/offlineCacheService';
import { getDefaultLayout } from '@/services/settingsService'; // Import settings service
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
  const { isOffline } = useOffline();

  // Router and Input Ref
  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
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

  // Layout State
  const [layoutMode, setLayoutMode] = useState<'grid' | 'list'>('list');

  // Load layout setting on focus
  useFocusEffect(
    useCallback(() => {
      getDefaultLayout().then(setLayoutMode);
    }, [])
  );

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

      // If offline, try to load cached search results
      // If offline, don't allow search
      if (isOffline) {
        setSearchResults([]);
        setError('You are offline. Connect to internet to search for manga.');
        setIsLoading(false);
        return;
      }

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
  }, [debouncedSearchQuery, isOffline]);

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

          // Cache search results for offline use
          await offlineCacheService.cacheSearchResults(
            debouncedSearchQuery,
            items
          );
        } catch (err: any) {
          if (err instanceof CloudflareDetectedError) {
            checkForCloudflare(err.html, '/mangasearch');
            return;
          }
          if (inFlightSeqRef.current !== seq) return; // ignore stale
          setError('Failed to fetch manga. Please try again.');
          logger().error('Service', 'Failed to fetch manga', { error: err });
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
    ({ item, index }: { item: MangaItem; index: number }) => {
      if (layoutMode === 'list') {
        return (
          <Reanimated.View entering={FadeInDown.delay(index * 20).springify()}>
            <TouchableOpacity
              style={styles.resultItem}
              onPress={() => handleMangaPress(item)}
              activeOpacity={0.7}
            >
              <View style={styles.cardWrapperList}>
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
              </View>
              <View style={styles.itemInfo}>
                <Text style={styles.itemTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <View style={styles.itemMetaContainer}>
                  {lastReadChapters[item.id] ? (
                    <View style={styles.lastReadBadge}>
                      <Ionicons name="book" size={12} color={colors.primary} />
                      <Text style={styles.lastReadText}>
                        Ch. {lastReadChapters[item.id]}
                      </Text>
                    </View>
                  ) : (
                    <View style={styles.actionBadge}>
                      <Text style={styles.actionText}>View Details</Text>
                      <Ionicons
                        name="chevron-forward"
                        size={14}
                        color={colors.tabIconDefault}
                      />
                    </View>
                  )}
                </View>
              </View>
            </TouchableOpacity>
          </Reanimated.View>
        );
      }

      // Grid view render
      return (
        <Reanimated.View
          entering={FadeInDown.delay(index * 20).springify()}
          style={styles.cardWrapperGrid}
        >
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
        </Reanimated.View>
      );
    },
    [handleMangaPress, lastReadChapters, styles, colors, layoutMode]
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
    } catch {
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
          <View
            style={[
              styles.emptyStateIcon,
              { backgroundColor: colors.error + '15' },
            ]}
          >
            <Ionicons
              name="cloud-offline-outline"
              size={48}
              color={colors.error}
            />
          </View>
          <Text style={styles.emptyStateTitle}>Connection Issue</Text>
          <Text style={styles.emptyStateText}>
            We couldn&apos;t connect to the search service.
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
            <Text style={styles.retryButtonText}>Try Again</Text>
          </TouchableOpacity>
        </View>
      );
    }

    if (isOffline) {
      return (
        <View style={styles.emptyStateContainer}>
          <View style={styles.emptyStateIcon}>
            <Ionicons
              name="cloud-offline-outline"
              size={48}
              color={colors.primary}
            />
          </View>
          <Text style={styles.emptyStateTitle}>Offline Mode</Text>
          <Text style={styles.emptyStateText}>
            You&apos;re currently offline. Check your bookmarks for downloaded
            content.
          </Text>
          <TouchableOpacity
            style={[styles.offlineButton, { backgroundColor: colors.primary }]}
            onPress={() => router.navigate('/bookmarks')}
          >
            <Ionicons name="bookmark" size={20} color="#FFFFFF" />
            <Text style={styles.offlineButtonText}>Go to Bookmarks</Text>
          </TouchableOpacity>
        </View>
      );
    }

    return (
      <View style={styles.emptyStateContainer}>
        <View style={styles.emptyStateIcon}>
          <Ionicons name="search-outline" size={48} color={colors.primary} />
        </View>
        <Text style={styles.emptyStateTitle}>Discover Manga</Text>
        <Text style={styles.emptyStateText}>
          Find your next favorite series by searching above
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
    isOffline,
    router,
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
                backgroundColor: colors.card,
                borderWidth: 1,
                borderColor: colors.primary,
              },
            ]}
          >
            <Ionicons
              name="search"
              size={20}
              color={isFocused ? colors.primary : colors.tabIconDefault}
              style={styles.searchIcon}
            />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Search by title, author..."
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
                  name="close-circle"
                  size={20}
                  color={colors.tabIconDefault}
                />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <View style={[styles.contentContainer, { marginTop: insets.top }]}>
        <Reanimated.FlatList
          data={searchResults}
          renderItem={renderMangaCard}
          keyExtractor={keyExtractor}
          key={layoutMode} // Forces remount when layout changes
          numColumns={layoutMode === 'grid' ? 2 : 1}
          contentContainerStyle={styles.gridContainer}
          columnWrapperStyle={
            layoutMode === 'grid' ? styles.columnWrapper : undefined
          }
          ListEmptyComponent={EmptyState}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
          showsVerticalScrollIndicator={false}
          bounces={false}
          overScrollMode="never"
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
  const columnGap = 16;
  const containerPadding = 16;
  // Calculate grid card width: (Total width - 2*padding - gap) / 2
  const gridCardWidth = (width - containerPadding * 2 - columnGap) / 2;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerWrapper: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
      backgroundColor: colors.background,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.08,
      shadowRadius: 8,
      elevation: 4,
    },
    contentContainer: {
      flex: 1,
      paddingTop: 10,
    },
    searchContainer: {
      paddingHorizontal: 16,
      paddingTop: 8,
    },
    searchInputContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      borderRadius: 10,
      paddingHorizontal: 12,
      height: 44,
      borderWidth: 1,
      borderColor: colors.border,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 17, // iOS standard size
      color: colors.text,
      paddingVertical: 8,
      height: '100%',
    },
    clearButton: {
      padding: 4,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    gridContainer: {
      paddingHorizontal: containerPadding,
      paddingTop: 16,
      paddingBottom: 100,
    },
    columnWrapper: {
      justifyContent: 'space-between',
      marginBottom: 16,
      gap: columnGap,
    },
    // List View Styling
    resultItem: {
      flexDirection: 'row',
      marginBottom: 16,
      height: 110, // Fixed height for list item
      backgroundColor: colors.card, // Optional: card background for the row
      borderRadius: 12,
      overflow: 'hidden',
      // Elevation/Shadow for the row
      shadowColor: colors.text,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.05,
      shadowRadius: 4,
      elevation: 2,
    },
    cardWrapperList: {
      width: 80, // Fixed width for the cover image part
      height: 110, // Matches item height
      overflow: 'hidden', // CRITICAL: hides the text part of MangaCard
    },
    // Grid View Styling
    cardWrapperGrid: {
      width: gridCardWidth,
      marginBottom: 0, // Handled by columnWrapper/gap
    },
    card: {
      width: '100%',
      // Grid: MangaCard handles aspect ratio (3/4)
      // List: Cropped via cardWrapperList
    },
    itemInfo: {
      flex: 1,
      padding: 12,
      justifyContent: 'space-between',
    },
    itemTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      lineHeight: 22,
    },
    itemMetaContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    lastReadBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.primary + '15',
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 6,
      alignSelf: 'flex-start',
    },
    lastReadText: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: '600',
      marginLeft: 4,
    },
    actionBadge: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    actionText: {
      fontSize: 13,
      color: colors.tabIconDefault,
      marginRight: 2,
    },
    emptyStateContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 24,
      marginTop: height * 0.15,
    },
    emptyStateIcon: {
      marginBottom: 16,
      opacity: 0.8,
    },
    emptyStateTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
      textAlign: 'center',
    },
    emptyStateText: {
      fontSize: 15,
      color: colors.tabIconDefault,
      textAlign: 'center',
      lineHeight: 22,
      maxWidth: 300,
    },
    retryButton: {
      marginTop: 24,
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 8,
      backgroundColor: colors.primary,
    },
    retryButtonText: {
      color: '#ffffff',
      fontSize: 15,
      fontWeight: '600',
    },
    offlineButton: {
      marginTop: 24,
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 24,
      paddingVertical: 12,
      borderRadius: 100,
      backgroundColor: colors.primary,
      gap: 8,
    },
    offlineButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '600',
    },
  });
};
