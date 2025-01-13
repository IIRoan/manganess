import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, useColorScheme, Platform } from 'react-native';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { imageCache } from '@/services/CacheImages';
import Alert from '@/components/Alert';

export default function DebugScreen() {
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme();
  const colorScheme = theme === 'system' ? systemColorScheme : theme;
  const colors = Colors[colorScheme as keyof typeof Colors] || Colors.light;
  const styles = getStyles(colors);
  const router = useRouter();
  const [showAlert, setShowAlert] = React.useState(false);
  const [alertConfig, setAlertConfig] = React.useState({
    title: '',
    message: '',
    options: [] as { text: string; onPress: () => void }[]
  });


  const showAlertWithConfig = (config: {
    title: string;
    message: string;
    options: { text: string; onPress: () => void }[];
  }) => {
    setAlertConfig(config);
    setShowAlert(true);
  };

  const checkExpoStatus = async () => {
    try {
      const status = {
        platform: Platform.OS,
        isExpoGo: !Updates.isEmbeddedLaunch,
        runtimeVersion: Updates.runtimeVersion,
        channel: Updates.channel,
        updateId: Updates.updateId,
      };

      showAlertWithConfig({
        title: "Expo Status",
        message: Object.entries(status)
          .map(([key, value]) => `${key}: ${value || 'Not available'}`)
          .join('\n'),
        options: [{ text: "OK", onPress: () => setShowAlert(false) }]
      });
    } catch (error) {
      showAlertWithConfig({
        title: "Error",
        message: "Failed to get Expo status",
        options: [{ text: "OK", onPress: () => setShowAlert(false) }]
      });
    }
  };

  const checkForUpdates = async () => {
    if (!Updates.isEmbeddedLaunch) {
      showAlertWithConfig({
        title: "Not Available",
        message: "Updates are not available in Expo Go",
        options: [{ text: "OK", onPress: () => setShowAlert(false) }]
      });
      return;
    }

    try {
      showAlertWithConfig({
        title: "Checking",
        message: "Checking for updates...",
        options: [{ text: "OK", onPress: () => setShowAlert(false) }]
      });

      const update = await Updates.checkForUpdateAsync();

      if (!update.isAvailable) {
        showAlertWithConfig({
          title: "No Updates",
          message: "You're on the latest version",
          options: [{ text: "OK", onPress: () => setShowAlert(false) }]
        });
        return;
      }

      showAlertWithConfig({
        title: "Update Available",
        message: "Would you like to download and install the update?",
        options: [
          { text: "Cancel", onPress: () => setShowAlert(false) },
          {
            text: "Update",
            onPress: async () => {
              try {
                await Updates.fetchUpdateAsync();
                showAlertWithConfig({
                  title: "Update Ready",
                  message: "Restart now to apply the update?",
                  options: [
                    { text: "Later", onPress: () => setShowAlert(false) },
                    { text: "Restart", onPress: () => Updates.reloadAsync() }
                  ]
                });
              } catch (error) {
                showAlertWithConfig({
                  title: "Error",
                  message: "Failed to download update",
                  options: [{ text: "OK", onPress: () => setShowAlert(false) }]
                });
              }
            }
          }
        ]
      });
    } catch (error) {
      showAlertWithConfig({
        title: "Error",
        message: "Failed to check for updates",
        options: [{ text: "OK", onPress: () => setShowAlert(false) }]
      });
    }
  };


  const showOnboarding = async () => {
    showAlertWithConfig({
      title: "Show Onboarding",
      message: "Are you sure you want to reset and show the onboarding screen?",
      options: [
        {
          text: "Cancel",
          onPress: () => setShowAlert(false)
        },
        {
          text: "Reset",
          onPress: async () => {
            try {
              await AsyncStorage.removeItem('onboardingCompleted');
              router.replace('/onboarding');
            } catch (error) {
              console.error('Error showing onboarding:', error);
              showAlertWithConfig({
                title: "Error",
                message: "Failed to show onboarding. Please try again.",
                options: [
                  {
                    text: "OK",
                    onPress: () => setShowAlert(false)
                  }
                ]
              });
            }
          }
        }
      ]
    });
  };

  const checkImageCache = async () => {
    try {
      const { size, count } = await imageCache.getCacheSize();
      const sizeInMB = (size / (1024 * 1024)).toFixed(2);

      showAlertWithConfig({
        title: "Image Cache Info",
        message: `Cached Images: ${count}\n` +
          `Total Size: ${sizeInMB} MB`,
        options: [
          {
            text: "OK",
            onPress: () => setShowAlert(false)
          }
        ]
      });
    } catch (error) {
      console.error('Error checking cache:', error);
      showAlertWithConfig({
        title: "Error",
        message: "Failed to get cache information",
        options: [
          {
            text: "OK",
            onPress: () => setShowAlert(false)
          }
        ]
      });
    }
  };

  const clearImageCache = async () => {
    showAlertWithConfig({
      title: "Clear Image Cache",
      message: "Are you sure you want to clear the image cache? All cached images will need to be downloaded again.",
      options: [
        {
          text: "Cancel",
          onPress: () => setShowAlert(false)
        },
        {
          text: "Clear",
          onPress: async () => {
            try {
              await imageCache.clearCache();
              showAlertWithConfig({
                title: "Success",
                message: "Image cache cleared successfully",
                options: [
                  {
                    text: "OK",
                    onPress: () => setShowAlert(false)
                  }
                ]
              });
            } catch (error) {
              console.error('Error clearing cache:', error);
              showAlertWithConfig({
                title: "Error",
                message: "Failed to clear image cache",
                options: [
                  {
                    text: "OK",
                    onPress: () => setShowAlert(false)
                  }
                ]
              });
            }
          }
        }
      ]
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <Text style={styles.title}>Debug Menu</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>System</Text>

          <TouchableOpacity style={styles.option} onPress={checkExpoStatus}>
            <Ionicons name="information-circle-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Check Expo Status</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.option} onPress={checkForUpdates}>
            <Ionicons name="refresh-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Check for Updates</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Debug Actions</Text>

          <TouchableOpacity style={styles.option} onPress={showOnboarding}>
            <Ionicons name="play-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Show Onboarding</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cache Management</Text>

          <TouchableOpacity style={styles.option} onPress={checkImageCache}>
            <Ionicons name="information-circle-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>View Cache Info</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.option} onPress={clearImageCache}>
            <Ionicons name="trash-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Clear Image Cache</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <Alert
        visible={showAlert}
        title={alertConfig.title}
        message={alertConfig.message}
        type="confirm"
        onClose={() => setShowAlert(false)}
        options={alertConfig.options}
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
  optionText: {
    fontSize: 16,
    marginLeft: 15,
    flex: 1,
    color: colors.text,
  }
});