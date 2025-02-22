import React, { useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, useColorScheme, Platform, ActivityIndicator } from 'react-native';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { setOnboardingCompleted } from '@/services/settingsService';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import { imageCache } from '@/services/CacheImages';
import Alert from '@/components/Alert';
import axios from 'axios';
import { MANGA_API_URL } from '@/constants/Config';
import { useCloudflareDetection } from '@/hooks/useCloudflareDetection';


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
  const [isTriggering, setIsTriggering] = useState(false);
  const [log, setLog] = useState<string[]>([]);

  const addLog = (message: string) => {
    console.log(message); // Console logging for development
    setLog(prev => [...prev, `[${new Date().toISOString()}] ${message}`]);
  };


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
    try {
      showAlertWithConfig({
        title: "Checking",
        message: "Checking for updates...",
        options: [{ text: "OK", onPress: () => setShowAlert(false) }]
      });

      // Instead of checking isEmbeddedLaunch, check if the update functionality is available
      let updateAvailable = false;
      try {
        const update = await Updates.checkForUpdateAsync();
        updateAvailable = update.isAvailable;
      } catch (error) {
        // If the check fails, it might mean we're in development or the update API is not available
        console.log('Update check error:', error);
        showAlertWithConfig({
          title: "Update Check Failed",
          message: Platform.select({
            android: "Updates are only available in release builds downloaded from app stores or custom distribution.",
            ios: "Updates are only available in release builds downloaded from the App Store or TestFlight.",
            default: "Updates are not available in this environment."
          }),
          options: [{ text: "OK", onPress: () => setShowAlert(false) }]
        });
        return;
      }

      if (!updateAvailable) {
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
                  message: Platform.select({
                    android: "Failed to download update. Please check your internet connection and try again.",
                    ios: "Failed to download update. Please check your internet connection and try again.",
                    default: "Failed to download update."
                  }),
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
        message: "Failed to check for updates. Please try again later.",
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
              await setOnboardingCompleted(false); // This will reset onboarding status
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

  const showLog = () => {
    showAlertWithConfig({
      title: "Debug Log",
      message: log.join('\n'),
      options: [
        {
          text: "Clear Log",
          onPress: () => {
            setLog([]);
            setShowAlert(false);
          }
        },
        {
          text: "Close",
          onPress: () => setShowAlert(false)
        }
      ]
    });
  };

  // Generate random IP-like X-Forwarded-For header
  const generateRandomIP = () => {
    return Array(4).fill(0).map(() => Math.floor(Math.random() * 256)).join('.');
  };

  const generateSuspiciousHeaders = () => {
    // Create headers that might trigger Cloudflare's suspicion
    return {
      'Accept': '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      'Connection': 'keep-alive',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'X-Forwarded-For': generateRandomIP(),
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      'Via': '1.1 chrome-compression-proxy',
      'CF-IPCountry': 'XX',
      'CF-Connecting-IP': generateRandomIP(),
      'X-Real-IP': generateRandomIP()
    };
  };

  const sendSuspiciousRequest = async (endpoint: string) => {
    const headers = generateSuspiciousHeaders();
    addLog(`Sending request to ${endpoint} with suspicious headers`);
    try {
      const response = await axios.get(`${MANGA_API_URL}${endpoint}`, {
        headers,
        timeout: 5000,
        validateStatus: status => status < 500 // Accept any status < 500
      });

      addLog(`Response status: ${response.status}`);
      if (response.data?.includes('cf-browser-verification')) {
        addLog('Cloudflare verification detected in response!');
        return true;
      }
      return false;
    } catch (error) {
      if (axios.isAxiosError(error)) {
        if (error.response?.data?.includes('cf-browser-verification')) {
          addLog('Cloudflare verification detected in error response!');
          return true;
        }
        addLog(`Request failed: ${error.response?.status || error.message}`);
      }
      return false;
    }
  };

  const triggerCloudflare = async () => {
    showAlertWithConfig({
      title: "Trigger Cloudflare",
      message: "This will attempt to trigger Cloudflare's browser verification using suspicious request patterns. Continue?",
      options: [
        {
          text: "Cancel",
          onPress: () => setShowAlert(false)
        },
        {
          text: "Continue",
          onPress: async () => {
            setIsTriggering(true);
            setShowAlert(false);
            setLog([]);

            try {
              addLog('Starting Cloudflare trigger attempt using suspicious patterns');

              const endpoints = [
                '/home',
                '/search?q=test',
                '/manga/random',
                '/latest'
              ];

              // Try different suspicious patterns
              for (let i = 0; i < 3; i++) {
                addLog(`\nAttempt ${i + 1}:`);

                for (const endpoint of endpoints) {
                  const triggered = await sendSuspiciousRequest(endpoint);
                  if (triggered) {
                    setIsTriggering(false);
                    showAlertWithConfig({
                      title: "Success",
                      message: "Cloudflare protection triggered! Would you like to view the debug log?",
                      options: [
                        {
                          text: "View Log",
                          onPress: showLog
                        },
                        {
                          text: "Close",
                          onPress: () => setShowAlert(false)
                        }
                      ]
                    });
                    return;
                  }

                  // Add a delay between requests
                  await new Promise(resolve => setTimeout(resolve, 500));
                }

                // Send a request with a known crawler User-Agent
                const crawlerAgents = [
                  'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
                  'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)',
                  'Mozilla/5.0 (compatible; AhrefsBot/7.0; +http://ahrefs.com/robot/)',
                ];

                for (const agent of crawlerAgents) {
                  addLog(`Trying crawler User-Agent: ${agent}`);
                  const triggered = await sendSuspiciousRequest('/home');
                  if (triggered) {
                    setIsTriggering(false);
                    showAlertWithConfig({
                      title: "Success",
                      message: "Cloudflare protection triggered! Would you like to view the debug log?",
                      options: [
                        {
                          text: "View Log",
                          onPress: showLog
                        },
                        {
                          text: "Close",
                          onPress: () => setShowAlert(false)
                        }
                      ]
                    });
                    return;
                  }
                }
              }

              setIsTriggering(false);
              showAlertWithConfig({
                title: "Completed",
                message: "All attempts completed. Would you like to view the debug log?",
                options: [
                  {
                    text: "View Log",
                    onPress: showLog
                  },
                  {
                    text: "Close",
                    onPress: () => setShowAlert(false)
                  }
                ]
              });
            } catch (error: unknown) {
              addLog(`Unexpected error: ${error instanceof Error ? error.message : String(error)}`);
              setIsTriggering(false);
              showAlertWithConfig({
                title: "Error",
                message: "An unexpected error occurred. Would you like to view the debug log?",
                options: [
                  {
                    text: "View Log",
                    onPress: showLog
                  },
                  {
                    text: "Close",
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

  const { checkForCloudflare } = useCloudflareDetection();

  const simulateCloudflare = () => {
    showAlertWithConfig({
      title: "Simulate Cloudflare",
      message: "This will simulate a Cloudflare detection. Continue?",
      options: [
        {
          text: "Cancel",
          onPress: () => setShowAlert(false)
        },
        {
          text: "Continue",
          onPress: () => {
            // Simulate Cloudflare by passing HTML with the verification string
            checkForCloudflare('<div class="cf-browser-verification">test</div>', '/debug');
            setShowAlert(false);
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

          

          <TouchableOpacity
            style={[styles.option, isTriggering && styles.optionDisabled]}
            onPress={isTriggering ? undefined : triggerCloudflare}
          >
            <Ionicons name="shield-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Trigger Cloudflare Check</Text>
            {isTriggering && <ActivityIndicator size="small" color={colors.primary} style={styles.spinner} />}
          </TouchableOpacity>

          <TouchableOpacity style={styles.option} onPress={simulateCloudflare}>
            <Ionicons name="shield-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Simulate Cloudflare</Text>
          </TouchableOpacity>
          
          {log.length > 0 && (
            <TouchableOpacity style={styles.option} onPress={showLog}>
              <Ionicons name="document-text-outline" size={24} color={colors.text} />
              <Text style={styles.optionText}>View Debug Log</Text>
            </TouchableOpacity>
          )}
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
  optionDisabled: {
    opacity: 0.7,
  },
  spinner: {
    marginLeft: 10,
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
