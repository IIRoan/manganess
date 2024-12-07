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

  const isExpoGo = !Updates.isEmbeddedLaunch;

  const showAlertWithConfig = (config: {
    title: string;
    message: string;
    options: { text: string; onPress: () => void }[];
  }) => {
    setAlertConfig(config);
    setShowAlert(true);
  };

  const checkForUpdates = async () => {
    try {
      if (isExpoGo) {
        showAlertWithConfig({
          title: "Expo Go Detected",
          message: "You're running in Expo Go, which automatically handles updates when you reload the app.\n\n" +
                  "Current Environment Info:\n" +
                  `Platform: ${Platform.OS}\n` +
                  `Expo Go: Yes\n` +
                  `Runtime Version: ${Updates.runtimeVersion || 'None'}\n` +
                  `Update Channel: ${Updates.channel || 'development'}`,
          options: [
            {
              text: "OK",
              onPress: () => setShowAlert(false)
            }
          ]
        });
        return;
      }

      showAlertWithConfig({
        title: "Checking",
        message: "Checking for updates...",
        options: [
          {
            text: "OK",
            onPress: () => setShowAlert(false)
          }
        ]
      });
      
      const update = await Updates.checkForUpdateAsync();
      
      if (update.isAvailable) {
        showAlertWithConfig({
          title: "Update Found",
          message: "Downloading update...",
          options: [
            {
              text: "OK",
              onPress: () => setShowAlert(false)
            }
          ]
        });
        
        try {
          await Updates.fetchUpdateAsync();
          
          showAlertWithConfig({
            title: "Update Ready",
            message: "An update has been downloaded. Restart now to apply it?",
            options: [
              {
                text: "Later",
                onPress: () => setShowAlert(false)
              },
              {
                text: "Restart",
                onPress: async () => {
                  await Updates.reloadAsync();
                }
              }
            ]
          });
        } catch (fetchError) {
          showAlertWithConfig({
            title: "Download Failed",
            message: "Failed to download the update. Please try again later.",
            options: [
              {
                text: "OK",
                onPress: () => setShowAlert(false)
              }
            ]
          });
          console.error('Error fetching update:', fetchError);
        }
      } else {
        showAlertWithConfig({
          title: "No Update Available",
          message: `You're running the latest version!\n\n` +
                  `Update ID: ${Updates.updateId || 'None'}\n` +
                  `Is Embedded: ${Updates.isEmbeddedLaunch}\n` +
                  `Channel: ${Updates.channel || 'None'}\n` +
                  `Runtime Version: ${Updates.runtimeVersion || 'None'}`,
          options: [
            {
              text: "OK",
              onPress: () => setShowAlert(false)
            }
          ]
        });
      }
    } catch (error) {
      console.error('Error checking for updates:', error);
      showAlertWithConfig({
        title: "Error",
        message: `Failed to check for updates: ${error instanceof Error ? error.message : 'Unknown error'}\n\n` +
                `Please ensure you're connected to the internet.`,
        options: [
          {
            text: "OK",
            onPress: () => setShowAlert(false)
          }
        ]
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
        <Text style={styles.title}>Debug</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Debug Actions</Text>
          
          <TouchableOpacity 
            style={styles.option} 
            onPress={checkForUpdates}
          >
            <Ionicons name="refresh-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>
              {isExpoGo ? "Check Expo Go Status" : "Check for Updates"}
            </Text>
          </TouchableOpacity>

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