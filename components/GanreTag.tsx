import React from 'react';
import { View, Text, StyleSheet, useColorScheme } from 'react-native';
import { useTheme } from '@/constants/ThemeContext';
import { Colors, ColorScheme } from '@/constants/Colors';

interface GenreTagProps {
    genre: string;
}

export const GenreTag: React.FC<GenreTagProps> = ({ genre }) => {
    const { theme } = useTheme();
    const colorScheme = theme === 'system' ? (useColorScheme() as ColorScheme) : (theme as ColorScheme);
    const colors = Colors[colorScheme];

    const styles = StyleSheet.create({
        genreTag: {
            backgroundColor: colors.primary,
            borderRadius: 15,
            paddingHorizontal: 10,
            paddingVertical: 5,
            margin: 2,
        },
        genreText: {
            color: colors.card,
            fontSize: 12,
            fontWeight: '600',
        },
    });

    return (
        <View style={styles.genreTag}>
            <Text style={styles.genreText}>{genre}</Text>
        </View>
    );
};
