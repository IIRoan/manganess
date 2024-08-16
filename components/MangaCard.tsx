import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet, Dimensions } from 'react-native';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';

interface MangaCardProps {
  title: string;
  imageUrl: string;
  onPress: () => void;
  lastReadChapter: string | null;
}

const MangaCard: React.FC<MangaCardProps> = ({ title, imageUrl, onPress, lastReadChapter }) => {
    const { theme, systemTheme } = useTheme();
  const colorScheme = theme === 'system' ? systemTheme : theme as ColorScheme;
  const colors = Colors[colorScheme];

  const styles = getStyles(colors);

  return (
    <TouchableOpacity onPress={onPress} style={styles.bookmarkCard}>
      <Image source={{ uri: imageUrl }} style={styles.bookmarkImage} />
      <View style={styles.bookmarkInfo}>
        <Text style={styles.bookmarkTitle} numberOfLines={2} ellipsizeMode="tail">{title}</Text>
        {lastReadChapter && (
          <Text style={styles.lastReadChapter}>Last Read: {lastReadChapter}</Text>
        )}
      </View>
    </TouchableOpacity>
  );
};

const getStyles = (colors: typeof Colors.light) => StyleSheet.create({
  bookmarkCard: {
    width: Dimensions.get('window').width / 2 - 15,
    marginBottom: 15,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.card,
    elevation: 3,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  bookmarkImage: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  bookmarkInfo: {
    padding: 10,
  },
  bookmarkTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  lastReadChapter: {
    fontSize: 12,
    color: colors.tabIconDefault,
    marginTop: 4,
  },
});

export default MangaCard; 
