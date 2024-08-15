import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, useColorScheme, Image, Alert, Switch } from 'react-native';
import { useTheme, Theme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';

export default function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const systemColorScheme = useColorScheme();
  const colorScheme = theme === 'system' ? systemColorScheme : theme;
  const colors = Colors[colorScheme as keyof typeof Colors] || Colors.light;
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [enableDebugTab, setEnableDebugTab] = useState(false);
  const styles = getStyles(colors);

  const themeOptions: Array<{ label: string; value: Theme; icon: string }> = [
    { label: 'Light', value: 'light', icon: 'sunny-outline' },
    { label: 'Dark', value: 'dark', icon: 'moon-outline' },
    { label: 'System', value: 'system', icon: 'phone-portrait-outline' },
  ];

  useEffect(() => {
    // Load the current notification state when the component mounts
    loadNotificationState();
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
  


  const loadNotificationState = async () => {
    try {
      const state = await AsyncStorage.getItem('notificationsEnabled');
      setNotificationsEnabled(state !== 'false');
    } catch (error) {
      console.error('Error loading notification state:', error);
    }
  };

  const toggleNotifications = async (value: boolean) => {
    try {
      await AsyncStorage.setItem('notificationsEnabled', value.toString());
      setNotificationsEnabled(value);
      if (value) {
        // Re-enable notifications
        await Notifications.requestPermissionsAsync();
      } else {
        // Disable notifications
        await Notifications.cancelAllScheduledNotificationsAsync();
      }
    } catch (error) {
      console.error('Error toggling notifications:', error);
    }
  };

  const clearAsyncStorage = async () => {
    Alert.alert(
      "Clear App Data",
      "Are you sure you want to clear all app data? This action cannot be undone.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "OK",
          onPress: async () => {
            try {
              const keys = await AsyncStorage.getAllKeys();
              await AsyncStorage.multiRemove(keys);
              Alert.alert("Success", "All app data has been cleared.");
            } catch (error) {
              console.error('Error clearing AsyncStorage:', error);
              Alert.alert("Error", "Failed to clear app data. Please try again.");
            }
          }
        }
      ]
    );
  };

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
                name={option.icon as any}
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

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notifications</Text>
          <View style={styles.option}>
            <Ionicons
              name="notifications-outline"
              size={24}
              color={colors.text}
            />
            <Text style={styles.optionText}>Enable Notifications</Text>
            <Switch
              value={notificationsEnabled}
              onValueChange={toggleNotifications}
              trackColor={{ false: colors.border, true: colors.border }}
              thumbColor={notificationsEnabled ? colors.primary : colors.primary}
            />
          </View>
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
            <Ionicons
              name="bug-outline"
              size={24}
              color={colors.text}
            />
            <Text style={styles.optionText}>Enable Debug Tab</Text>
            <Switch
              value={enableDebugTab}
              onValueChange={toggleEnableDebugTab}
              trackColor={{ false: colors.border, true: colors.primary }}
              thumbColor={enableDebugTab ? colors.card : colors.text}
            />
          </View>
          <Text style={styles.optionText}>You need to restart the app for this setting to take effect.</Text>

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
    backgroundColor: colors.card,
    paddingBottom: 80,
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
