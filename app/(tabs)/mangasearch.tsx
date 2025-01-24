import React, { useState, useCallback, useRef, useEffect } from "react";
import {
  View,
  TextInput,
  StyleSheet,
  Text,
  TouchableOpacity,
  SafeAreaView,
  StatusBar,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  Image,
  Animated,
} from "react-native";
import { Stack, useRouter } from "expo-router";
import { useFocusEffect } from "@react-navigation/native";
import { Ionicons } from "@expo/vector-icons";
import { Colors } from "@/constants/Colors";
import { useTheme } from "@/constants/ThemeContext";
import { searchManga, MangaItem } from "@/services/mangaFireService";
import { useDebounce } from '@/hooks/useDebounce';

export default function MangaSearchScreen() {
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const { width, height } = useWindowDimensions();
  const styles = getStyles(colors, width, height);
  const abortControllerRef = useRef<AbortController | null>(null);

  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  const [searchQuery, setSearchQuery] = useState("");
  const debouncedSearchQuery = useDebounce(searchQuery, 300);
  const [searchResults, setSearchResults] = useState<MangaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useEffect(() => {
    const performSearch = async () => {
      if (debouncedSearchQuery.length > 2) {
        setIsLoading(true);
        
        // Cancel previous request
        if (abortControllerRef.current) {
          abortControllerRef.current.abort();
        }
        
        // Create new abort controller
        abortControllerRef.current = new AbortController();
        
        try {
          const results = await searchManga(debouncedSearchQuery);
          setSearchResults(results);
        } catch (err: unknown) {
          if (err instanceof Error && err.name !== 'AbortError') {
            console.error('Search error:', err);
          }
        } finally {
          setIsLoading(false);
        }
      } else {
        setSearchResults([]);
      }
    };

    performSearch();
    
    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [debouncedSearchQuery]);

  useFocusEffect(
    useCallback(() => {
      if (searchQuery === "") {
        inputRef.current?.focus();
      }
    }, [searchQuery])
  );

  const onChangeSearch = useCallback((query: string) => {
    setSearchQuery(query);
    setIsSearching(query.length > 0);
  }, []);

  const clearSearch = useCallback(() => {
    setSearchQuery("");
    setSearchResults([]);
    setIsSearching(false);
    inputRef.current?.focus();
  }, []);

  const handleBack = useCallback(() => {
    router.back();
  }, [router]);

  const handleMangaPress = useCallback(
    (item: MangaItem) => {
      router.push({
        pathname: "/manga/[id]",
        params: { id: item.id },
      });
    },
    [router]
  );

  const formatDate = (dateString: string) => {
    if (!dateString) return "";
    return dateString;
  };

  const renderSearchResult = useCallback(
    ({ item, index }: { item: MangaItem; index: number }) => {
      const isEven = index % 2 === 0;
      return (
        <TouchableOpacity
          style={[
            styles.gridItem,
            isEven ? styles.gridItemLeft : styles.gridItemRight,
          ]}
          onPress={() => handleMangaPress(item)}
          activeOpacity={0.7}
        >
          <View style={styles.imageContainer}>
            <Image
              source={{ uri: item.imageUrl || "/placeholder.svg" }}
              style={styles.coverImage}
              resizeMode="cover"
            />
          </View>
          <View style={styles.contentContainer}>
            <View style={styles.upperContent}>
              <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
                {item.title}
              </Text>
            </View>
            <View style={styles.lowerContent}>
              {item.latestChapter && (
                <View style={styles.chapterInfo}>
                  <Text style={styles.chapterText} numberOfLines={1}>
                    Ch. {item.latestChapter.number}
                  </Text>
                  <Text style={styles.dateText} numberOfLines={1}>
                    {formatDate(item.latestChapter.date)}
                  </Text>
                </View>
              )}
              <View style={styles.typeBadge}>
                <Text style={styles.typeText}>{item.type}</Text>
              </View>
            </View>
          </View>
        </TouchableOpacity>
      );
    },
    [handleMangaPress, styles]
  );


  const EmptyState = useCallback(
    () => (
      <View style={styles.emptyStateContainer}>
        <View style={styles.emptyStateIcon}>
          <Ionicons name="search" size={32} color={colors.primary} />
        </View>
        <Text style={styles.emptyStateTitle}>Find Your Next Read</Text>
        <Text style={styles.emptyStateText}>
          Search by title to discover your next favorite manga/manhwa
        </Text>
      </View>
    ),
    [styles, colors.primary]
  );

  return (
    <SafeAreaView style={styles.container}>
      <Stack.Screen
        options={{
          headerShown: false,
        }}
      />
      <Animated.View
        style={[
          styles.header,
          {
            shadowOpacity: scrollY.interpolate({
              inputRange: [0, 20],
              outputRange: [0, 0.1],
              extrapolate: "clamp",
            }),
          },
        ]}
      >
        <View style={styles.searchContainer}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.searchInputContainer}>
            <Ionicons
              name="search"
              size={20}
              color={colors.tabIconDefault}
              style={styles.searchIcon}
            />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Search manga..."
              placeholderTextColor={colors.tabIconDefault}
              value={searchQuery}
              onChangeText={onChangeSearch}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
                <Ionicons name="close" size={20} color={colors.tabIconDefault} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Animated.View>

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : (
        <Animated.FlatList
          data={isSearching ? searchResults : []}
          renderItem={renderSearchResult}
          keyExtractor={(item) => item.id}
          numColumns={2}
          contentContainerStyle={styles.gridContainer}
          columnWrapperStyle={styles.columnWrapper}
          onScroll={Animated.event(
            [{ nativeEvent: { contentOffset: { y: scrollY } } }],
            { useNativeDriver: true }
          )}
          ListEmptyComponent={isSearching ? null : EmptyState}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="on-drag"
        />
      )}
    </SafeAreaView>
  );
}

const getStyles = (
  colors: typeof Colors.light,
  width: number,
  height: number
) => {
  const cardWidth = (width - 48) / 2;
  const imageHeight = (cardWidth * 3) / 2;

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      backgroundColor: colors.background,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
      paddingTop: Platform.OS === "android" ? StatusBar.currentHeight : 0,
      zIndex: 1,
    },
    searchContainer: {
      flexDirection: "row",
      alignItems: "center",
      padding: 12,
      paddingTop: 0,
      gap: 12,
    },
    backButton: {
      padding: 8,
      marginLeft: 4,
    },
    searchInputContainer: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 16,
      height: 48,
    },
    searchIcon: {
      marginRight: 8,
    },
    searchInput: {
      flex: 1,
      fontSize: 16,
      color: colors.text,
      paddingVertical: 8,
    },
    clearButton: {
      padding: 8,
    },
    loadingContainer: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
    },
    gridContainer: {
      padding: 16,
      paddingBottom: 32,
    },
    columnWrapper: {
      justifyContent: "space-between",
    },
    gridItem: {
      width: cardWidth,
      marginBottom: 16,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: "hidden",
    },
    gridItemLeft: {
      marginRight: 8,
    },
    gridItemRight: {
      marginLeft: 8,
    },
    imageContainer: {
      width: "100%",
      height: imageHeight,
    },
    coverImage: {
      width: "100%",
      height: "100%",
      backgroundColor: colors.border,
    },
    contentContainer: {
      padding: 12,
      height: 120,
      justifyContent: "space-between",
    },
    upperContent: {
      flex: 1.2,
      marginBottom: 2,
      justifyContent: "flex-start",
    },
    lowerContent: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
      minHeight: 40,
    },
    title: {
      fontSize: 14,
      fontWeight: "600",
      color: colors.text,
      lineHeight: 20,
    },
    chapterInfo: {
      flex: 1,
      marginRight: 8,
      justifyContent: "flex-end",
    },
    typeBadge: {
      backgroundColor: colors.primary + "20",
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.primary + "40",
      alignSelf: "flex-end",
    },
    typeText: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: "600",
      textTransform: "uppercase",
    },
    chapterText: {
      fontSize: 12,
      color: colors.text,
      fontWeight: "500",
    },
    dateText: {
      fontSize: 10,
      color: colors.tabIconDefault,
      marginTop: 2,
    },
    emptyStateContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      marginTop: height * 0.2,
    },
    emptyStateIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.primary + "20",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    emptyStateTitle: {
      fontSize: 18,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 8,
    },
    emptyStateText: {
      fontSize: 14,
      color: colors.tabIconDefault,
      textAlign: "center",
      maxWidth: 250,
    },
  });
};