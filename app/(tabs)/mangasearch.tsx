import React, { useState, useCallback, useRef } from "react";
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

export default function MangaSearchScreen() {
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const { width, height } = useWindowDimensions();
  const styles = getStyles(colors, width, height);

  const router = useRouter();
  const inputRef = useRef<TextInput>(null);
  const scrollY = useRef(new Animated.Value(0)).current;

  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<MangaItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSearching, setIsSearching] = useState(false);

  useFocusEffect(
    useCallback(() => {
      if (searchQuery === "") {
        inputRef.current?.focus();
      }
    }, [searchQuery])
  );

  const onChangeSearch = useCallback(async (query: string) => {
    setSearchQuery(query);
    setIsSearching(query.length > 0);

    if (query.length > 2) {
      setIsLoading(true);
      try {
        const results = await searchManga(query);
        setSearchResults(results);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    } else {
      setSearchResults([]);
    }
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
            <Text style={styles.title} numberOfLines={2}>
              {item.title}
            </Text>
            <View style={styles.bottomRow}>
              {item.latestChapter && (
                <View style={styles.chapterInfo}>
                  <Text style={styles.chapterText}>
                    Ch. {item.latestChapter.number}
                  </Text>
                  <Text style={styles.dateText}>
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
          Search by title to discover your next favorite manga series
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
              <TouchableOpacity
                onPress={clearSearch}
                style={styles.clearButton}
              >
                <Ionicons
                  name="close"
                  size={20}
                  color={colors.tabIconDefault}
                />
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

const getStyles = (colors: typeof Colors.light, width: number, height: number) => {
  const cardWidth = (width - 48) / 2; // 48 = padding (16) * 2 + gap between cards (16)
  const imageHeight = (cardWidth * 3) / 2; // 3:2 aspect ratio

  return StyleSheet.create({
    // Main container
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },

    // Header styles
    header: {
      backgroundColor: colors.background,
      paddingTop: Platform.OS === 'android' ? StatusBar.currentHeight : 0,
      shadowColor: colors.text,
      shadowOffset: { width: 0, height: 2 },
      shadowRadius: 4,
      zIndex: 1,
    },
    searchContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      padding: 16,
      gap: 12,
    },
    backButton: {
      padding: 4,
    },
    searchInputContainer: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
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
      padding: 4,
    },

    // Grid layout styles
    gridContainer: {
      padding: 16,
      paddingBottom: 32,
    },
    columnWrapper: {
      justifyContent: 'space-between',
    },
    gridItem: {
      width: cardWidth,
      marginBottom: 16,
      backgroundColor: colors.card,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
    },
    gridItemLeft: {
      marginRight: 8,
    },
    gridItemRight: {
      marginLeft: 8,
    },

    // Image container styles
    imageContainer: {
      width: '100%',
      height: imageHeight,
      position: 'relative',
    },
    coverImage: {
      width: '100%',
      height: '100%',
    },

    // Content container styles
    contentContainer: {
      padding: 8,
      flex: 1,
    },
    title: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
      lineHeight: 20,
    },
    bottomRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      marginTop: 'auto',
    },
    chapterInfo: {
      flex: 1,
      marginRight: 8,
    },
    chapterText: {
      fontSize: 12,
      color: colors.text,
      fontWeight: '500',
    },
    dateText: {
      fontSize: 10,
      color: colors.tabIconDefault,
      marginTop: 2,
    },
    typeBadge: {
      backgroundColor: colors.primary + '20',
      paddingHorizontal: 6,
      paddingVertical: 3,
      borderRadius: 8,
    },
    typeText: {
      fontSize: 10,
      color: colors.primary,
      fontWeight: '600',
    },

    // Loading and empty state styles
    loadingContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    emptyStateContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 16,
      marginTop: height * 0.2,
    },
    emptyStateIcon: {
      width: 64,
      height: 64,
      borderRadius: 32,
      backgroundColor: colors.primary + '20',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 16,
    },
    emptyStateTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 8,
    },
    emptyStateText: {
      fontSize: 14,
      color: colors.tabIconDefault,
      textAlign: 'center',
      maxWidth: 250,
    },
  });
};