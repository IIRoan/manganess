import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import { useImageCache, useMangaImageCache, type CacheContext } from '@/services/CacheImages';
import * as FileSystem from 'expo-file-system';
import { MangaCardProps } from '@/types';

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
  mangaId
}) => {
  const { theme, systemTheme } = useTheme();
  const colorScheme = theme === 'system' ? systemTheme : theme as ColorScheme;
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);

  // Use appropriate caching strategy based on context
  const searchCachedPath = useImageCache(imageUrl, context, mangaId);
  const mangaCachedPath = useMangaImageCache(mangaId || '', imageUrl);
  
  // Choose the right cached path based on context
  const cachedImagePath = context === 'manga' && mangaId ? mangaCachedPath : searchCachedPath;

  const getImageSource = () => {
    if (
      cachedImagePath &&
      typeof cachedImagePath === 'string' &&
      cachedImagePath.startsWith(FileSystem.cacheDirectory || '')
    ) {
      return {
        uri: `file://${cachedImagePath}`
      };
    }

    return {
      uri: cachedImagePath || imageUrl
    };
  };

  return (
    <TouchableOpacity
      testID="manga-card"
      onPress={onPress}
      style={[styles.cardContainer, style]}
    >
      <Image
        source={getImageSource()}
        style={styles.cardImage}
        accessibilityLabel="Manga Image"
      />
      <View style={styles.cardInfo}>
        <Text
          style={styles.cardTitle}
          numberOfLines={2}
          ellipsizeMode="tail"
        >
          {title}
        </Text>
        {lastReadChapter && (
          <Text
            style={styles.lastReadChapter}
            numberOfLines={1}
            ellipsizeMode="tail"
          >
            Last read: {lastReadChapter}
          </Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const getStyles = (colors: typeof Colors.light) => StyleSheet.create({
  cardContainer: {
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.card,
  },
  cardImage: {
    width: '100%',
    aspectRatio: 3 / 4,
    resizeMode: 'cover',
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