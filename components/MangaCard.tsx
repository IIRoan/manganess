import React, { useState, useRef, useEffect } from 'react';
import {
  View,
  Text,
  Image,
  StyleSheet,
  ActivityIndicator,
  Animated,
  Pressable,
} from 'react-native';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import {
  useImageCache,
  useMangaImageCache,
  type CacheContext,
} from '@/services/CacheImages';
import { useOffline } from '@/contexts/OfflineContext';
import { MangaCardProps, BookmarkStatus } from '@/types';
import { useHapticFeedback } from '@/utils/haptics';
import { useRouter } from 'expo-router';
import BottomPopup from './BottomPopup';
import {
  getBookmarkPopupConfig,
  getMangaData,
  saveBookmark,
  removeBookmark,
} from '@/services/bookmarkService';
import { Ionicons } from '@expo/vector-icons';

interface EnhancedMangaCardProps extends MangaCardProps {
  context?: CacheContext;
  onLongPress?: () => void;
}

const MangaCard: React.FC<EnhancedMangaCardProps> = ({
  title,
  imageUrl,
  onPress,
  lastReadChapter,
  style,
  context = 'search',
  mangaId,
  onLongPress,
  onBookmarkChange,
}) => {
  const { theme, systemTheme } = useTheme();
  const colorScheme = theme === 'system' ? systemTheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);
  const router = useRouter();

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [showBookmarkPopup, setShowBookmarkPopup] = useState(false);
  const [bookmarkStatus, setBookmarkStatus] = useState<BookmarkStatus | null>(
    null
  );
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const haptics = useHapticFeedback();
  const { isOffline } = useOffline();

  // Load bookmark status when component mounts or mangaId changes
  useEffect(() => {
    const loadBookmarkStatus = async () => {
      if (mangaId) {
        try {
          const mangaData = await getMangaData(mangaId);
          setBookmarkStatus(mangaData?.bookmarkStatus || null);
        } catch (error) {
          console.error('Error loading bookmark status:', error);
        }
      }
    };

    loadBookmarkStatus();
  }, [mangaId]);

  // Use appropriate caching strategy based on context
  const searchCachedPath = useImageCache(imageUrl, context, mangaId);
  const mangaCachedPath = useMangaImageCache(mangaId || '', imageUrl, {
    enabled: !isOffline,
  });

  // Choose the right cached path based on context
  const cachedImagePath =
    context === 'manga' && mangaId ? mangaCachedPath : searchCachedPath;

  const getImageSource = () => {
    const uri = (() => {
      const v = cachedImagePath || imageUrl;
      if (!v) return v;
      if (typeof v !== 'string') return v as any;
      if (v.startsWith('http://') || v.startsWith('https://')) return v;
      if (v.startsWith('file://') || v.startsWith('content://')) return v;
      return `file://${v}`;
    })();
    return { uri } as const;
  };

  const handleImageLoad = () => {
    setIsLoading(false);
    setHasError(false);
  };

  const handleImageError = () => {
    setIsLoading(false);
    setHasError(true);
  };

  const handlePressIn = () => {
    haptics.onPress();
    Animated.spring(scaleAnim, {
      toValue: 0.95,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(scaleAnim, {
      toValue: 1,
      useNativeDriver: true,
      tension: 300,
      friction: 10,
    }).start();
  };

  const handleLongPress = async () => {
    if (onLongPress) {
      onLongPress();
      return;
    }

    if (!mangaId) return;

    haptics.onLongPress();

    try {
      const mangaData = await getMangaData(mangaId);
      setBookmarkStatus(mangaData?.bookmarkStatus || null);
      setShowBookmarkPopup(true);
    } catch (error) {
      console.error('Error fetching manga data for long press:', error);
    }
  };

  const handleSaveBookmark = async (status: BookmarkStatus) => {
    if (!mangaId) return;

    try {
      // Update local state immediately for instant feedback
      setBookmarkStatus(status);
      setShowBookmarkPopup(false);

      const mangaData = await getMangaData(mangaId);
      const mockMangaDetails = {
        title: title,
        bannerImage: imageUrl,
        chapters: [],
      };

      await saveBookmark(
        mangaId,
        status,
        mockMangaDetails,
        mangaData?.readChapters || [],
        (newStatus) => setBookmarkStatus(newStatus as BookmarkStatus | null),
        () => {},
        () => {}
      );

      // Notify parent component about bookmark change
      if (onBookmarkChange) {
        onBookmarkChange(mangaId, status);
      }
    } catch (error) {
      console.error('Error saving bookmark:', error);
      // Revert local state if there was an error
      const mangaData = await getMangaData(mangaId);
      setBookmarkStatus(mangaData?.bookmarkStatus || null);
    }
  };

  const handleRemoveBookmark = async () => {
    if (!mangaId) return;

    try {
      // Update local state immediately for instant feedback
      setBookmarkStatus(null);
      setShowBookmarkPopup(false);

      await removeBookmark(
        mangaId,
        (newStatus) => setBookmarkStatus(newStatus as BookmarkStatus | null),
        () => {}
      );

      // Notify parent component about bookmark change
      if (onBookmarkChange) {
        onBookmarkChange(mangaId, null);
      }
    } catch (error) {
      console.error('Error removing bookmark:', error);
      // Revert local state if there was an error
      const mangaData = await getMangaData(mangaId);
      setBookmarkStatus(mangaData?.bookmarkStatus || null);
    }
  };

  const bookmarkPopupConfig = getBookmarkPopupConfig(
    bookmarkStatus,
    title,
    handleSaveBookmark,
    handleRemoveBookmark
  );

  return (
    <>
      <Pressable
        testID="manga-card"
        onPress={() => {
          if (onPress) {
            onPress();
          } else if (mangaId) {
            // @ts-ignore - router.push accepts params
            router.push({
              pathname: '/(tabs)/manga/[id]',
              params: { id: mangaId, title, imageUrl },
            });
          }
        }}
        onPressIn={handlePressIn}
        onPressOut={handlePressOut}
        onLongPress={handleLongPress}
        style={[styles.cardContainer, style]}
        accessibilityRole="button"
        accessibilityLabel={`Open ${title} manga details`}
        accessibilityHint={
          lastReadChapter
            ? `Last read: ${lastReadChapter}`
            : 'Tap to view manga details'
        }
      >
        <Animated.View style={{ transform: [{ scale: scaleAnim }] }}>
          <View style={styles.imageContainer}>
            <Image
              source={getImageSource()}
              style={styles.cardImage}
              onLoad={handleImageLoad}
              onError={handleImageError}
              accessibilityLabel={`Cover image for ${title}`}
            />
            {isLoading && (
              <View style={styles.loadingOverlay}>
                <ActivityIndicator size="small" color={colors.primary} />
              </View>
            )}
            {hasError && (
              <View style={styles.errorOverlay}>
                <Text style={styles.errorText}>Failed to load image</Text>
              </View>
            )}
            {bookmarkStatus && context !== 'bookmark' && (
              <View style={styles.bookmarkIndicator}>
                <Ionicons name="bookmark" size={16} color={colors.primary} />
              </View>
            )}
          </View>
          <View style={styles.cardInfo}>
            <Text
              style={styles.cardTitle}
              numberOfLines={2}
              ellipsizeMode="tail"
              accessibilityRole="header"
            >
              {title}
            </Text>
            {lastReadChapter && (
              <Text
                style={styles.lastReadChapter}
                numberOfLines={1}
                ellipsizeMode="tail"
                accessibilityLabel={`Last read chapter: ${lastReadChapter}`}
              >
                Last read: {lastReadChapter}
              </Text>
            )}
          </View>
        </Animated.View>
      </Pressable>

      <BottomPopup
        visible={showBookmarkPopup}
        title={bookmarkPopupConfig.title}
        onClose={() => setShowBookmarkPopup(false)}
        options={bookmarkPopupConfig.options}
      />
    </>
  );
};

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    cardContainer: {
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: colors.card,
    },
    imageContainer: {
      position: 'relative',
    },
    cardImage: {
      width: '100%',
      aspectRatio: 3 / 4,
      resizeMode: 'cover',
    },
    loadingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.card,
      justifyContent: 'center',
      alignItems: 'center',
    },
    errorOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.card,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 8,
    },
    errorText: {
      fontSize: 12,
      color: colors.tabIconDefault,
      textAlign: 'center',
    },
    cardInfo: {
      padding: 8,
    },
    cardTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    lastReadChapter: {
      fontSize: 12,
      color: colors.tabIconDefault,
    },
    bookmarkIndicator: {
      position: 'absolute',
      top: 8,
      right: 8,
      backgroundColor: colors.background,
      borderRadius: 12,
      width: 24,
      height: 24,
      justifyContent: 'center',
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.2,
      shadowRadius: 2,
      elevation: 2,
    },
  });

export default MangaCard;
