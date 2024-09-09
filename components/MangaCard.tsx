import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, ViewStyle } from 'react-native';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';

interface MangaCardProps {
  title: string;
  imageUrl: string;
  onPress: () => void;
  lastReadChapter: string | null;
  style?: ViewStyle;
}

const MangaCard: React.FC<MangaCardProps> = ({ title, imageUrl, onPress, lastReadChapter, style }) => {
  const { theme, systemTheme } = useTheme();
  const colorScheme = theme === 'system' ? systemTheme : theme as ColorScheme;
  const colors = Colors[colorScheme];

  const styles = getStyles(colors);

  return (
    <TouchableOpacity onPress={onPress} style={[styles.cardContainer, style]}>
      <Image source={{ uri: imageUrl }} style={styles.cardImage} />
      <View style={styles.cardInfo}>
        <Text style={styles.cardTitle} numberOfLines={2} ellipsizeMode="tail">{title}</Text>
        {lastReadChapter && (
          <Text style={styles.lastReadChapter} numberOfLines={1} ellipsizeMode="tail">Last read: {lastReadChapter}</Text>
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
