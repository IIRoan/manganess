import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, useColorScheme, Image } from 'react-native';
import { useTheme, Theme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';

export default function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const systemColorScheme = useColorScheme();
  const colorScheme = theme === 'system' ? systemColorScheme : theme;
  const colors = Colors[colorScheme as keyof typeof Colors] || Colors.light;

  const styles = getStyles(colors);

  const themeOptions: Array<{ label: string; value: Theme; icon: string }> = [
    { label: 'Light', value: 'light', icon: 'sunny-outline' },
    { label: 'Dark', value: 'dark', icon: 'moon-outline' },
    { label: 'System', value: 'system', icon: 'phone-portrait-outline' },
  ];

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <Text style={styles.title}>Settings</Text>
        
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Theme</Text>
          {themeOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[styles.option, theme === option.value && styles.activeOption]}
              onPress={() => setTheme(option.value)}
            >
              <Ionicons 
                size={24} 
                color={theme === option.value ? colors.primary : colors.text} 
              />
              <Text style={[styles.optionText, theme === option.value && styles.activeOptionText]}>
                {option.label}
              </Text>
              {theme === option.value && (
                <Ionicons name="checkmark" size={24} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
      <Image
        source={require('@/assets/images/nessie.png')}
        style={styles.nessieImage}
        resizeMode="contain"
      />
    </SafeAreaView>
  );
}

const getStyles = (colors: typeof Colors.light) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 20,
  },
  title: {
    fontSize: 34,
    fontWeight: 'bold',
    marginTop: 40,
    marginBottom: 20,
    color: colors.text,
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 10,
    color: colors.text,
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: colors.border,
  },
  activeOption: {
    backgroundColor: colors.card,
  },
  optionText: {
    fontSize: 16,
    marginLeft: 15,
    flex: 1,
    color: colors.text,
  },
  activeOptionText: {
    color: colors.primary,
    fontWeight: '600',
  },
  nessieImage: {
    position: 'absolute',
    bottom: -20,
    left: 20,
    width: 80,
    height: 80,
    opacity: 0.8,
    transform: [{ rotate: '-15deg' }],
  },
});
