import React, { useState, useCallback, useRef, useEffect } from "react"
import {
  View,
  TextInput,
  StyleSheet,
  Text,
  TouchableOpacity,
  StatusBar,
  ActivityIndicator,
  useWindowDimensions,
  Platform,
  Image,
  Animated,
} from "react-native"
import { Stack, useRouter } from "expo-router"
import { useFocusEffect } from "@react-navigation/native"
import { Ionicons } from "@expo/vector-icons"
import { Colors } from "@/constants/Colors"
import { useTheme } from "@/constants/ThemeContext"
import { searchManga, type MangaItem } from "@/services/mangaFireService"
import { useDebounce } from "@/hooks/useDebounce"
import { BlurView } from "expo-blur"
import { LinearGradient } from "expo-linear-gradient"
import { useSafeAreaInsets } from "react-native-safe-area-context"

export default function MangaSearchScreen() {
  const { actualTheme } = useTheme()
  const colors = Colors[actualTheme]
  const { width, height } = useWindowDimensions()
  const insets = useSafeAreaInsets()
  const styles = getStyles(colors, width, height, insets)
  const abortControllerRef = useRef<AbortController | null>(null)

  const router = useRouter()
  const inputRef = useRef<TextInput>(null)
  const scrollY = useRef(new Animated.Value(0)).current

  const [searchQuery, setSearchQuery] = useState("")
  const debouncedSearchQuery = useDebounce(searchQuery, 300)
  const [searchResults, setSearchResults] = useState<MangaItem[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [isSearching, setIsSearching] = useState(false)

  useEffect(() => {
    const performSearch = async () => {
      if (debouncedSearchQuery.length > 2) {
        setIsLoading(true)

        if (abortControllerRef.current) {
          abortControllerRef.current.abort()
        }

        abortControllerRef.current = new AbortController()

        try {
          const results = await searchManga(debouncedSearchQuery)
          setSearchResults(results)
        } catch (err: unknown) {
          if (err instanceof Error && err.name !== "AbortError") {
            console.error("Search error:", err)
          }
        } finally {
          setIsLoading(false)
        }
      } else {
        setSearchResults([])
      }
    }

    performSearch()

    return () => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort()
      }
    }
  }, [debouncedSearchQuery])

  useFocusEffect(
    useCallback(() => {
      if (searchQuery === "") {
        inputRef.current?.focus()
      }
    }, [searchQuery]),
  )

  const onChangeSearch = useCallback((query: string) => {
    setSearchQuery(query)
    setIsSearching(query.length > 0)
  }, [])

  const clearSearch = useCallback(() => {
    setSearchQuery("")
    setSearchResults([])
    setIsSearching(false)
    inputRef.current?.focus()
  }, [])

  const handleBack = useCallback(() => {
    router.back()
  }, [router])

  const handleMangaPress = useCallback(
    (item: MangaItem) => {
      router.push({
        pathname: "/manga/[id]",
        params: { id: item.id },
      })
    },
    [router],
  )

  const formatDate = useCallback((dateString: string) => {
    if (!dateString) return ""
    return dateString
  }, [])

  const renderSearchResult = useCallback(
    ({ item, index }: { item: MangaItem; index: number }) => {
      return (
        <Animated.View
          style={[
            styles.cardContainer,
            {
              transform: [
                {
                  translateY: scrollY.interpolate({
                    inputRange: [0, 100],
                    outputRange: [0, index % 2 === 0 ? 50 : 25],
                    extrapolate: "clamp",
                  }),
                },
              ],
            },
          ]}
        >
          <TouchableOpacity style={styles.card} onPress={() => handleMangaPress(item)} activeOpacity={0.9}>
            <Image source={{ uri: item.imageUrl || "/placeholder.svg" }} style={styles.cardImage} resizeMode="cover" />
            <LinearGradient
              colors={["transparent", actualTheme === "dark" ? "rgba(0,0,0,0.9)" : "rgba(255,255,255,0.9)"]}
              style={styles.cardGradient}
            >
              <View style={styles.cardContent}>
                <Text style={styles.cardTitle} numberOfLines={2}>
                  {item.title}
                </Text>
                <View style={styles.cardFooter}>
                  {item.latestChapter && (
                    <View style={styles.chapterBadge}>
                      <Text style={styles.chapterText}>Ch. {item.latestChapter.number}</Text>
                      <Text style={styles.dateText}>{formatDate(item.latestChapter.date)}</Text>
                    </View>
                  )}
                  <View style={styles.typeBadge}>
                    <Text style={styles.typeText}>{item.type}</Text>
                  </View>
                </View>
              </View>
            </LinearGradient>
          </TouchableOpacity>
        </Animated.View>
      )
    },
    [handleMangaPress, styles, actualTheme, scrollY, formatDate],
  )

  const EmptyState = useCallback(
    () => (
      <View style={styles.emptyStateContainer}>
        <View style={styles.emptyStateIcon}>
          <Ionicons name="book-outline" size={48} color={colors.primary} />
        </View>
        <Text style={styles.emptyStateTitle}>Discover New Stories</Text>
        <Text style={styles.emptyStateText}>Search for manga, manhwa, and more from our vast collection</Text>
      </View>
    ),
    [styles, colors.primary],
  )

  return (
    <View style={styles.rootContainer}>
      <StatusBar barStyle={actualTheme === "dark" ? "light-content" : "dark-content"} />
      <Stack.Screen options={{ headerShown: false }} />
      
      <View style={[styles.headerWrapper, { backgroundColor: colors.card }]}>
        <View style={{ height: insets.top * 0.5, backgroundColor: colors.card }} />
        <View style={styles.searchContainer}>
          <TouchableOpacity onPress={handleBack} style={styles.backButton}>
            <Ionicons name="arrow-back" size={24} color={colors.text} />
          </TouchableOpacity>
          <View style={styles.searchInputContainer}>
            <Ionicons name="search" size={20} color={colors.tabIconDefault} style={styles.searchIcon} />
            <TextInput
              ref={inputRef}
              style={styles.searchInput}
              placeholder="Search manga or manhwa..."
              placeholderTextColor={colors.tabIconDefault}
              value={searchQuery}
              onChangeText={onChangeSearch}
            />
            {searchQuery.length > 0 && (
              <TouchableOpacity onPress={clearSearch} style={styles.clearButton}>
                <Ionicons name="close-circle-outline" size={20} color={colors.tabIconDefault} />
              </TouchableOpacity>
            )}
          </View>
        </View>
      </View>

      <View style={styles.contentContainer}>
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
            onScroll={Animated.event([{ nativeEvent: { contentOffset: { y: scrollY } } }], { useNativeDriver: true })}
            ListEmptyComponent={isSearching ? null : EmptyState}
            keyboardShouldPersistTaps="handled"
            keyboardDismissMode="on-drag"
          />
        )}
      </View>
    </View>
  )
}

const getStyles = (colors: typeof Colors.light, width: number, height: number, insets: any) => {
  const cardWidth = (width - 48) / 2
  const cardHeight = cardWidth * 1.5

  return StyleSheet.create({
    rootContainer: {
      flex: 1,
      backgroundColor: colors.background,
    },
    headerWrapper: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 10,
    },
    searchContainer: {
      flexDirection: "row",
      alignItems: "center",
      padding: 16,
      gap: 12,
      backgroundColor: colors.card,
    },
    contentContainer: {
      flex: 1,
      marginTop: insets.top * 0.3 + 76,
    },
    backButton: {
      padding: 8,
    },
    searchInputContainer: {
      flex: 1,
      flexDirection: "row",
      alignItems: "center",
      backgroundColor: colors.card,
      borderRadius: 12,
      paddingHorizontal: 16,
      height: 44,
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
      paddingBottom: 150,
    },
    
    columnWrapper: {
      justifyContent: "space-between",
    },
    cardContainer: {
      width: cardWidth,
      height: cardHeight,
      marginBottom: 16,
    },
    card: {
      width: "100%",
      height: "100%",
      borderRadius: 16,
      overflow: "hidden",
      backgroundColor: colors.card,
    },
    cardImage: {
      width: "100%",
      height: "100%",
      position: "absolute",
    },
    cardGradient: {
      position: "absolute",
      bottom: 0,
      left: 0,
      right: 0,
      height: "70%",
      justifyContent: "flex-end",
      padding: 12,
    },
    cardContent: {
      gap: 8,
    },
    cardTitle: {
      fontSize: 16,
      fontWeight: "600",
      color: colors.text,
      textShadowColor: "rgba(0,0,0,0.3)",
      textShadowOffset: { width: 0, height: 1 },
      textShadowRadius: 2,
    },
    cardFooter: {
      flexDirection: "row",
      justifyContent: "space-between",
      alignItems: "flex-end",
    },
    chapterBadge: {
      flex: 1,
      marginRight: 8,
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
    typeBadge: {
      backgroundColor: colors.primary + "20",
      paddingHorizontal: 8,
      paddingVertical: 4,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.primary + "40",
    },
    typeText: {
      fontSize: 12,
      color: colors.primary,
      fontWeight: "600",
      textTransform: "uppercase",
    },
    emptyStateContainer: {
      flex: 1,
      alignItems: "center",
      justifyContent: "center",
      padding: 16,
      marginTop: height * 0.2,
    },
    emptyStateIcon: {
      width: 80,
      height: 80,
      borderRadius: 40,
      backgroundColor: colors.primary + "20",
      alignItems: "center",
      justifyContent: "center",
      marginBottom: 16,
    },
    emptyStateTitle: {
      fontSize: 24,
      fontWeight: "600",
      color: colors.text,
      marginBottom: 8,
    },
    emptyStateText: {
      fontSize: 16,
      color: colors.tabIconDefault,
      textAlign: "center",
      maxWidth: 250,
    },
  })
}