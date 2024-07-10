import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, StatusBar } from 'react-native';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';

export default function SettingsScreen() {
  const { theme, setTheme, actualTheme } = useTheme();

  const styles = getStyles(actualTheme);

  const themeOptions = [
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
              <Ionicons name={option.icon} size={24} color={theme === option.value ? styles.activeOptionText.color : styles.optionText.color} />
              <Text style={[styles.optionText, theme === option.value && styles.activeOptionText]}>{option.label}</Text>
              {theme === option.value && (
                <Ionicons name="checkmark" size={24} color={styles.activeOptionText.color} />
              )}
            </TouchableOpacity>
          ))}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (theme: 'light' | 'dark') => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: theme === 'dark' ? '#121212' : '#F5F5F5',
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
    color: theme === 'dark' ? '#FFFFFF' : '#000000',
  },
  section: {
    marginBottom: 30,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: '600',
    marginBottom: 10,
    color: theme === 'dark' ? '#E1E1E1' : '#333333',
  },
  option: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 15,
    borderBottomWidth: 1,
    borderBottomColor: theme === 'dark' ? '#2C2C2C' : '#E0E0E0',
  },
  activeOption: {
    backgroundColor: theme === 'dark' ? '#1E1E1E' : '#F0F0F0',
  },
  optionText: {
    fontSize: 16,
    marginLeft: 15,
    flex: 1,
    color: theme === 'dark' ? '#B0B0B0' : '#333333',
  },
  activeOptionText: {
    color: theme === 'dark' ? '#BB86FC' : '#6200EE',
    fontWeight: '600',
  },
});
