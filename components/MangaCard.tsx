import React, { useState, useRef } from 'react';
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
import * as FileSystem from 'expo-file-system';
import { MangaCardProps } from '@/types';
import { useHapticFeedback } from '@/utils/haptics';

interface EnhancedMangaCardProps extends MangaCardProps {
  context?: CacheContext;
  mangaId?: string;
}

const MangaCard: React.FC<EnhancedMangaCardProps> = ({
  title,
  imageUrl,
  onPress,
  lastReadChapter,
  style,
  context = 'search',
  mangaId,
}) => {
  const { theme, systemTheme } = useTheme();
  const colorScheme = theme === 'system' ? systemTheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);

  const [isLoading, setIsLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const haptics = useHapticFeedback();

  // Use appropriate caching strategy based on context
  const searchCachedPath = useImageCache(imageUrl, context, mangaId);
  const mangaCachedPath = useMangaImageCache(mangaId || '', imageUrl);

  // Choose the right cached path based on context
  const cachedImagePath =
    context === 'manga' && mangaId ? mangaCachedPath : searchCachedPath;

  const getImageSource = () => {
    if (
      cachedImagePath &&
      typeof cachedImagePath === 'string' &&
      cachedImagePath.startsWith(FileSystem.cacheDirectory || '')
    ) {
      return {
        uri: `file://${cachedImagePath}`,
      };
    }

    return {
      uri: cachedImagePath || imageUrl,
    };
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

  return (
    <Pressable
      testID="manga-card"
      onPress={onPress}
      onPressIn={handlePressIn}
      onPressOut={handlePressOut}
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
  });

export default MangaCard;
