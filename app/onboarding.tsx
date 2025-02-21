import React, { useState, useEffect } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, useColorScheme, Alert, Image, Platform } from 'react-native';
import { useTheme, Theme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { setOnboardingCompleted } from '@/services/settingsService';
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


  const completeOnboarding = async () => {
    try {
      await setOnboardingCompleted();
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
