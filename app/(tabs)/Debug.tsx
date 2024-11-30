import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, useColorScheme, Alert } from 'react-native';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';

export default function DebugScreen() {
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme();
  const colorScheme = theme === 'system' ? systemColorScheme : theme;
  const colors = Colors[colorScheme as keyof typeof Colors] || Colors.light;
  const styles = getStyles(colors);
  const router = useRouter();

  const checkForUpdates = async () => {
    try {
      Alert.alert("Checking", "Checking for updates...");
      
      const update = await Updates.checkForUpdateAsync();
      
      if (update.isAvailable) {
        Alert.alert("Update Found", "Downloading update...");
        
        try {
          await Updates.fetchUpdateAsync();
          
          Alert.alert(
            "Update Ready",
            "An update has been downloaded. Restart now to apply it?",
            [
              {
                text: "Later",
                style: "cancel"
              },
              {
                text: "Restart",
                onPress: async () => {
                  await Updates.reloadAsync();
                }
              }
            ]
          );
        } catch (fetchError) {
          Alert.alert(
            "Download Failed",
            "Failed to download the update. Please try again later."
          );
          console.error('Error fetching update:', fetchError);
        }
      } else {
        // Using the correct properties from Updates
        Alert.alert(
          "No Update Available", 
          `You're running the latest version!\n\n` +
          `Update ID: ${Updates.updateId || 'None'}\n` +
          `Is Embedded: ${Updates.isEmbeddedLaunch}\n` +
          `Channel: ${Updates.channel || 'None'}\n` +
          `Runtime Version: ${Updates.runtimeVersion || 'None'}`
        );
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      Alert.alert(
        "Error",
        `Failed to check for updates: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
        `Please ensure you're connected to the internet.`
      );
    }
  };

  const showOnboarding = async () => {
    try {
      await AsyncStorage.removeItem('onboardingCompleted');
      router.replace('/onboarding');
    } catch (error) {
      console.error('Error showing onboarding:', error);
      Alert.alert('Error', 'Failed to show onboarding. Please try again.');
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <Text style={styles.title}>Debug</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Debug Actions</Text>
          
          <TouchableOpacity style={styles.option} onPress={checkForUpdates}>
            <Ionicons name="refresh-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Check for Updates</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.option} onPress={showOnboarding}>
            <Ionicons name="play-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Show Onboarding</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  optionText: {
    fontSize: 16,
    marginLeft: 15,
    flex: 1,
    color: colors.text,
  }
});