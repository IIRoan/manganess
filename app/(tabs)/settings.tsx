import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useColorScheme,
  Image,
  Alert,
  Switch,
} from 'react-native';
import { useTheme, Theme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ColorScheme } from '@/constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/* Type Definitions */
interface ThemeOption {
  label: string;
  value: Theme;
  icon: string;
}

export default function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme = theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);

  // Safe area insets
  const insets = useSafeAreaInsets();

  const [enableDebugTab, setEnableDebugTab] = useState<boolean>(false);

  const themeOptions: ThemeOption[] = [
    { label: 'Light', value: 'light', icon: 'sunny-outline' },
    { label: 'Dark', value: 'dark', icon: 'moon-outline' },
    { label: 'System', value: 'system', icon: 'phone-portrait-outline' },
  ];

  useEffect(() => {
    // Load settings when the component mounts
    loadEnableDebugTabSetting();
  }, []);

  const loadEnableDebugTabSetting = async () => {
    try {
      const value = await AsyncStorage.getItem('enableDebugTab');
      console.log('Loaded enableDebugTab:', value);
      setEnableDebugTab(value === 'true');
    } catch (error) {
      console.error('Error loading enable debug tab setting:', error);
    }
  };

  const toggleEnableDebugTab = async (value: boolean) => {
    try {
      await AsyncStorage.setItem('enableDebugTab', value.toString());
      console.log('Saved enableDebugTab:', value.toString());
      setEnableDebugTab(value);
    } catch (error) {
      console.error('Error toggling enable debug tab setting:', error);
    }
  };

  const clearAsyncStorage = () => {
    Alert.alert(
      'Clear App Data',
      'Are you sure you want to clear all app data? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'OK',
          onPress: async () => {
            try {
              const keys = await AsyncStorage.getAllKeys();
              await AsyncStorage.multiRemove(keys);
              Alert.alert('Success', 'All app data has been cleared.');
            } catch (error) {
              console.error('Error clearing AsyncStorage:', error);
              Alert.alert('Error', 'Failed to clear app data. Please try again.');
            }
          },
        },
      ]
    );
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
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
                name={option.icon as keyof typeof Ionicons.glyphMap}
                size={24}
                color={theme === option.value ? colors.primary : colors.text}
              />
              <Text
                style={[
                  styles.optionText,
                  theme === option.value && styles.activeOptionText,
                ]}
              >
                {option.label}
              </Text>
              {theme === option.value && (
                <Ionicons name="checkmark" size={24} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Management</Text>
          <TouchableOpacity style={styles.clearDataButton} onPress={clearAsyncStorage}>
            <Ionicons name="trash-outline" size={24} color={colors.notification} />
            <Text style={styles.clearDataText}>Clear App Data</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Developer Options</Text>
          <View style={styles.option}>
            <Ionicons name="bug-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Enable Debug Tab</Text>
            <Switch
              value={enableDebugTab}
              onValueChange={toggleEnableDebugTab}
              trackColor={{ false: colors.border, true: colors.tint }}
              thumbColor={enableDebugTab ? colors.primary : colors.text}
            />
          </View>
          <Text style={styles.noteText}>
            You need to restart the app for this setting to take effect.
          </Text>
        </View>
      </ScrollView>
      <Image
        source={require('@/assets/images/nessie.png')}
        style={styles.nessieImage}
        resizeMode="contain"
      />
    </View>
  );
}

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.card,
    },
    scrollView: {
      flex: 1,
      paddingHorizontal: 20,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
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
    activeOption: {},
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
    noteText: {
      fontSize: 14,
      color: colors.text,
      marginTop: 10,
    },
    nessieImage: {
      position: 'absolute',
      bottom: 40,
      left: 20,
      width: 80,
      height: 80,
      opacity: 0.8,
      transform: [{ rotate: '-15deg' }],
    },
    clearDataButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      padding: 15,
      borderRadius: 10,
      marginTop: 10,
    },
    clearDataText: {
      fontSize: 16,
      marginLeft: 15,
      color: colors.notification,
      fontWeight: '600',
    },
  });
