import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, useColorScheme, Alert, Image, Platform } from 'react-native';
import { useTheme, Theme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

export default function OnboardingScreen() {
  const router = useRouter();
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

  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [notificationsDisabled, setNotificationsDisabled] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const state = await AsyncStorage.getItem('notificationsEnabled');
        setNotificationsEnabled(state !== 'false');
        setNotificationsDisabled(state === 'false');
      } catch (error) {
        console.error('Error loading notification state:', error);
      }
    })();
  }, []);

  const toggleNotificationSettings = async () => {
    try {
      let newState;
      if (notificationsEnabled) {
        // Disable notifications
        newState = false;
        await Notifications.cancelAllScheduledNotificationsAsync();
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MIN,
          vibrationPattern: [0],
          lightColor: Colors.light.text,
        });
      } else {
        // Enable notifications
        newState = true;
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }

      await AsyncStorage.setItem('notificationsEnabled', newState.toString());
      setNotificationsEnabled(newState);
      setNotificationsDisabled(!newState);

    } catch (error) {
      console.error('Error toggling notification settings:', error);
      Alert.alert('Error', 'Failed to toggle notification settings.');
    }
  };

  const requestNotificationPermission = async () => {
    try {
      if (Platform.OS === 'android') {
        // Create a notification channel for Android 13 and above
        await Notifications.setNotificationChannelAsync('default', {
          name: 'default',
          importance: Notifications.AndroidImportance.MAX,
          vibrationPattern: [0, 250, 250, 250],
          lightColor: '#FF231F7C',
        });
      }
  
      const { status } = await Notifications.requestPermissionsAsync();
      const enabled = status === 'granted';
      setNotificationsEnabled(enabled);
      await AsyncStorage.setItem('notificationsEnabled', enabled.toString());
    } catch (error) {
      console.error('Error requesting notification permissions:', error);
    }
  };

  const completeOnboarding = async () => {
    try {
      await AsyncStorage.setItem('onboardingCompleted', 'true');
      // Request notification permission if enabled
      if (notificationsEnabled) {
        await requestNotificationPermission();
      }
      // Navigate to the main app screen
      router.replace('/');
    } catch (error) {
      console.error('Error completing onboarding:', error);
      Alert.alert('Error', 'An error occurred while completing onboarding.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView contentContainerStyle={styles.contentContainer}>
        {/* Reworked Look */}
        <View style={styles.logoContainer}>
          <Image
            source={require('@/assets/images/nessie.png')}
            style={styles.logo}
            resizeMode="contain"
          />
        </View>

        <Text style={styles.title}>Welcome to MangaNess</Text>

        <Text style={styles.description}>
          Explore the world of manga at your fingertips.
        </Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Choose Your Theme</Text>
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
          <Text style={styles.sectionTitle}>Enable Notifications</Text>
          <TouchableOpacity
            style={[styles.option, notificationsEnabled && styles.activeOption]}
            onPress={toggleNotificationSettings}
          >
            <Ionicons
              name="notifications-outline"
              size={24}
              color={colors.primary}
            />
            <Text style={[styles.optionText, notificationsEnabled && styles.activeOptionText]}>
              {notificationsEnabled ? 'Notifications Enabled' : 'Enable Notifications'}
            </Text>
            <Ionicons
              name={notificationsEnabled ? 'checkmark-circle' : 'checkmark-circle-outline'}
              size={24}
              color={colors.primary}
            />
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={styles.completeButton}
          onPress={completeOnboarding}
        >
          <Text style={styles.completeButtonText}>Get Started</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const getStyles = (colors: typeof Colors.light) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.card,
  },
  contentContainer: {
    flexGrow: 1,
    paddingHorizontal: 20,
    justifyContent: 'center',
    paddingVertical: 40,
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: 30,
  },
  logo: {
    width: 120,
    height: 120,
  },
  title: {
    fontSize: 32,
    fontWeight: 'bold',
    color: colors.text,
    textAlign: 'center',
    marginBottom: 10,
  },
  description: {
    fontSize: 16,
    color: colors.text,
    textAlign: 'center',
    marginBottom: 30,
  },
  section: {
    marginBottom: 20,
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
    paddingHorizontal: 10,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 8,
    marginBottom: 10,
  },
  activeOption: {
    backgroundColor: colors.primary + '20',
    borderColor: colors.primary,
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
  completeButton: {
    backgroundColor: colors.primary,
    padding: 15,
    borderRadius: 10,
    alignItems: 'center',
    marginTop: 20,
  },
  completeButtonText: {
    color: colors.card,
    fontSize: 18,
    fontWeight: '600',
  },
});
