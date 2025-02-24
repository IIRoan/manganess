import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import { useImageCache } from '@/services/CacheImages';
import * as FileSystem from 'expo-file-system';
import { MangaCardProps } from '@/types';

const MangaCard: React.FC<MangaCardProps> = ({
  title,
  imageUrl,
  onPress,
  lastReadChapter,
  style
}) => {
  const { theme, systemTheme } = useTheme();
  const colorScheme = theme === 'system' ? systemTheme : theme as ColorScheme;
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);

  const cachedImagePath = useImageCache(imageUrl);

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