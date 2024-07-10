import React from 'react';
import { View, Text, Image, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';

interface MangaCardProps {
  title: string;
  imageUrl: string;
  onPress: () => void;
}

const MangaCard: React.FC<MangaCardProps> = ({ title, imageUrl, onPress }) => {
  const { theme, systemTheme } = useTheme();
  const colorScheme = theme === 'system' ? systemTheme : theme as ColorScheme;
  const colors = Colors[colorScheme];

  return (
    <TouchableOpacity 
      onPress={onPress} 
      style={[
        styles.card, 
        { 
          backgroundColor: colors.card,
          borderColor: colors.border,
        }
      ]}
    >
      <Image source={{ uri: imageUrl }} style={styles.image} />
      <View style={styles.titleContainer}>
        <Text 
          style={[
            styles.title, 
            { color: colors.text }
          ]} 
          numberOfLines={2}
        >
          {title}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    width: '48%',
    marginBottom: 10,
    borderRadius: 8,
    overflow: 'hidden',
    borderWidth: 1,
  },
  image: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  titleContainer: {
    padding: 8,
  },
  title: {
    fontSize: 14,
    fontWeight: 'bold',
  },
});

export default MangaCard;