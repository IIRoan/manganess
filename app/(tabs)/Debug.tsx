import React, { useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  SafeAreaView,
  ScrollView,
  useColorScheme,
  Platform,
  ActivityIndicator,
  Clipboard,
} from 'react-native';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { setOnboardingCompleted } from '@/services/settingsService';
import { useRouter } from 'expo-router';
import * as Updates from 'expo-updates';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { imageCache } from '@/services/CacheImages';
import Alert from '@/components/Alert';
import axios, { isAxiosError } from 'axios';
import { MANGA_API_URL } from '@/constants/Config';
import { useCloudflareDetection } from '@/hooks/useCloudflareDetection';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppUpdates } from '@/hooks/useAppUpdates';
import { isExpoGo, isDevelopment } from '@/services/updateService';

// Environment detection helpers
const getExecutionEnvironment = (): string => {
  return Constants.executionEnvironment || 'unknown';
};

const isDevBuild = (): boolean => {
  return (
    Constants.executionEnvironment === ExecutionEnvironment.Standalone ||
    Constants.executionEnvironment === ExecutionEnvironment.Bare
  );
};

const getEnvironmentLabel = (): string => {
  if (isExpoGo()) return 'Expo Go';
  if (isDevelopment()) return 'Development Mode';
  if (isDevBuild()) return 'Development Build (used in prod)';
  return 'Production Build';
};

const getEnvironmentColor = (): string => {
  if (isExpoGo()) return '#8B5CF6'; // Purple for Expo Go
  if (isDevelopment()) return '#EF4444'; // Red for dev mode
  if (isDevBuild()) return '#F59E0B'; // Amber for dev builds
  return '#10B981'; // Green for production
};

export default function DebugScreen() {
  const { theme, accentColor } = useTheme();
  const systemColorScheme = useColorScheme();
  const colorScheme = theme === 'system' ? systemColorScheme : theme;
  const colors = Colors[colorScheme as keyof typeof Colors] || Colors.light;
  const styles = getStyles(colors, accentColor);
  const router = useRouter();
  const [showAlert, setShowAlert] = React.useState(false);
  const [alertConfig, setAlertConfig] = React.useState({
    title: '',
    message: '',
    options: [] as { text: string; onPress: () => void }[],
  });
  const [isTriggering, setIsTriggering] = useState(false);
  const [log, setLog] = useState<string[]>([]);
  const CHAPTER_GUIDE_KEY = 'chapter_guide_seen';

  // Use the shared update hook and service
  const {
    updateStatus,
    updateInfo: hookUpdateInfo,
    checkForUpdate,
    checkAndDownload,
    applyReadyUpdate,
    refreshUpdateInfo,
    areUpdatesAvailable: updatesAvailable,
    unavailableReason,
  } = useAppUpdates();

  const [lastCheckResult, setLastCheckResult] = useState<string | null>(null);
  const [expandedSection, setExpandedSection] = useState<string | null>(
    'updates'
  );

  // Extended update info with manifest (from expo-updates directly)
  const extendedUpdateInfo = {
    ...hookUpdateInfo,
    manifest: Updates.manifest,
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return 'N/A';
    return date.toLocaleString();
  };

  const getChannelDisplayName = (channel: string | null): string => {
    if (!channel) return 'Unknown';
    switch (channel) {
      case 'main':
        return 'Production (main)';
      case 'preview':
        return 'Preview';
      case 'testing':
        return 'Testing (Internal)';
      default:
        return channel;
    }
  };

  const getChannelColor = (
    channel: string | null
  ): { bg: string; text: string } => {
    switch (channel) {
      case 'main':
        return { bg: '#22C55E', text: '#FFFFFF' }; // Green for production
      case 'preview':
        return { bg: '#F97316', text: '#FFFFFF' }; // Orange for preview
      case 'testing':
        return { bg: '#3B82F6', text: '#FFFFFF' }; // Blue for testing
      default:
        return { bg: colors.border, text: colors.text }; // Neutral for unknown
    }
  };

  const checkForUpdateDetailed = async () => {
    setLastCheckResult(null);

    // Check if updates are available in this environment
    if (!updatesAvailable) {
      setLastCheckResult(unavailableReason || 'Updates not available');
      showAlertWithConfig({
        title: 'Updates Not Available',
        message:
          unavailableReason || 'Updates are not available in this environment.',
        options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
      });
      return;
    }

    const result = await checkForUpdate();

    if (result.success) {
      setLastCheckResult(
        `Update available!\nUpdate ID: ${result.updateId || 'Unknown'}`
      );
      showAlertWithConfig({
        title: 'Update Available',
        message: `A new update is available.\n\nUpdate ID: ${result.updateId || 'Unknown'}\n\nWould you like to download it?`,
        options: [
          { text: 'Later', onPress: () => setShowAlert(false) },
          {
            text: 'Download',
            onPress: () => {
              setShowAlert(false);
              fetchAndApplyUpdate();
            },
          },
        ],
      });
    } else {
      setLastCheckResult(result.message);
      showAlertWithConfig({
        title: result.message.includes('Error') ? 'Check Failed' : 'Up to Date',
        message: result.message,
        options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
      });
    }
  };

  const fetchAndApplyUpdate = async () => {
    // Check if updates are available in this environment
    if (!updatesAvailable) {
      showAlertWithConfig({
        title: 'Updates Not Available',
        message:
          unavailableReason || 'Updates are not available in this environment.',
        options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
      });
      return;
    }

    const result = await checkAndDownload({ forceReload: false });

    if (result.success) {
      showAlertWithConfig({
        title: 'Update Downloaded',
        message:
          'The update has been downloaded. Restart the app to apply the changes?',
        options: [
          { text: 'Later', onPress: () => setShowAlert(false) },
          {
            text: 'Restart Now',
            onPress: async () => {
              setShowAlert(false);
              await applyReadyUpdate();
            },
          },
        ],
      });
    } else {
      showAlertWithConfig({
        title: result.message.includes('Error') ? 'Fetch Failed' : 'No Update',
        message: result.message,
        options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
      });
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    Clipboard.setString(text);
    showAlertWithConfig({
      title: 'Copied',
      message: `${label} copied to clipboard.`,
      options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
    });
  };

  const showManifestDetails = () => {
    if (!extendedUpdateInfo?.manifest) {
      showAlertWithConfig({
        title: 'No Manifest',
        message: 'No manifest information available.',
        options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
      });
      return;
    }

    const manifest = extendedUpdateInfo.manifest;
    const details = JSON.stringify(manifest, null, 2);
    showAlertWithConfig({
      title: 'Manifest Details',
      message: details,
      options: [
        {
          text: 'Copy Full',
          onPress: () => {
            Clipboard.setString(details);
            setShowAlert(false);
          },
        },
        { text: 'Close', onPress: () => setShowAlert(false) },
      ],
    });
  };

  const showChannelInfo = () => {
    showAlertWithConfig({
      title: 'Channel Information',
      message: `Current Channel: ${getChannelDisplayName(extendedUpdateInfo?.channel ?? null)}\n\nAvailable Channels:\n\u2022 main - Production releases\n\u2022 preview - Preview/beta releases\n\u2022 testing - Internal testing builds\n\nNote: Channel switching requires a new app build. Updates are automatically delivered to your current channel.`,
      options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
    });
  };

  const handleReloadApp = async () => {
    if (isExpoGo()) {
      showAlertWithConfig({
        title: 'Not Available',
        message:
          'App reload is not available in Expo Go.\n\nTo reload the app in Expo Go, shake your device to open the developer menu and select "Reload", or press R in the terminal.',
        options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
      });
      return;
    }

    try {
      await Updates.reloadAsync();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : 'Unknown error';
      showAlertWithConfig({
        title: 'Reload Failed',
        message: `Failed to reload the app: ${errorMessage}\n\nThis may happen if no update is currently running. Try using "Check for Updates" first.`,
        options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
      });
    }
  };

  const handleRefreshInfo = () => {
    if (isExpoGo()) {
      showAlertWithConfig({
        title: 'Limited Functionality',
        message:
          'Update information is limited in Expo Go. Some values may not be available or accurate.',
        options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
      });
    }
    refreshUpdateInfo();
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const addLog = (message: string) => {
    console.log(message); // Console logging for development
    setLog((prev) => [...prev, `[${new Date().toISOString()}] ${message}`]);
  };

  const showAlertWithConfig = (config: {
    title: string;
    message: string;
    options: { text: string; onPress: () => void }[];
  }) => {
    setAlertConfig(config);
    setShowAlert(true);
  };

  const showOnboarding = async () => {
    showAlertWithConfig({
      title: 'Show Onboarding',
      message: 'Are you sure you want to reset and show the onboarding screen?',
      options: [
        {
          text: 'Cancel',
          onPress: () => setShowAlert(false),
        },
        {
          text: 'Reset',
          onPress: async () => {
            try {
              await setOnboardingCompleted(false); // This will reset onboarding status
              router.replace('/onboarding');
            } catch (error) {
              console.error('Error showing onboarding:', error);
              showAlertWithConfig({
                title: 'Error',
                message: 'Failed to show onboarding. Please try again.',
                options: [
                  {
                    text: 'OK',
                    onPress: () => setShowAlert(false),
                  },
                ],
              });
            }
          },
        },
      ],
    });
  };

  const checkImageCache = async () => {
    try {
      const { size, count } = (await (imageCache as any).getCacheSize?.()) || {
        size: 0,
        count: 0,
      };
      const sizeInMB = (size / (1024 * 1024)).toFixed(2);

      showAlertWithConfig({
        title: 'Image Cache Info',
        message: `Cached Images: ${count}\n` + `Total Size: ${sizeInMB} MB`,
        options: [
          {
            text: 'OK',
            onPress: () => setShowAlert(false),
          },
        ],
      });
    } catch (error) {
      console.error('Error checking cache:', error);
      showAlertWithConfig({
        title: 'Error',
        message: 'Failed to get cache information',
        options: [
          {
            text: 'OK',
            onPress: () => setShowAlert(false),
          },
        ],
      });
    }
  };

  const clearImageCache = async () => {
    showAlertWithConfig({
      title: 'Clear Image Cache',
      message:
        'Are you sure you want to clear the image cache? All cached images will need to be downloaded again.',
      options: [
        {
          text: 'Cancel',
          onPress: () => setShowAlert(false),
        },
        {
          text: 'Clear',
          onPress: async () => {
            try {
              await imageCache.clearCache();
              showAlertWithConfig({
                title: 'Success',
                message: 'Image cache cleared successfully',
                options: [
                  {
                    text: 'OK',
                    onPress: () => setShowAlert(false),
                  },
                ],
              });
            } catch (error) {
              console.error('Error clearing cache:', error);
              showAlertWithConfig({
                title: 'Error',
                message: 'Failed to clear image cache',
                options: [
                  {
                    text: 'OK',
                    onPress: () => setShowAlert(false),
                  },
                ],
              });
            }
          },
        },
      ],
    });
  };

  const showLog = () => {
    showAlertWithConfig({
      title: 'Debug Log',
      message: log.join('\n'),
      options: [
        {
          text: 'Clear Log',
          onPress: () => {
            setLog([]);
            setShowAlert(false);
          },
        },
        {
          text: 'Close',
          onPress: () => setShowAlert(false),
        },
      ],
    });
  };

  // Generate random IP-like X-Forwarded-For header
  const generateRandomIP = () => {
    return Array(4)
      .fill(0)
      .map(() => Math.floor(Math.random() * 256))
      .join('.');
  };

  const generateSuspiciousHeaders = () => {
    // Create headers that might trigger Cloudflare's suspicion
    return {
      Accept: '*/*',
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept-Encoding': 'gzip, deflate, br',
      Connection: 'keep-alive',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
      'Sec-Fetch-Dest': 'document',
      'Sec-Fetch-Mode': 'navigate',
      'Sec-Fetch-Site': 'none',
      'Sec-Fetch-User': '?1',
      'X-Forwarded-For': generateRandomIP(),
      'X-Requested-With': 'XMLHttpRequest',
      'User-Agent':
        'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
      Via: '1.1 chrome-compression-proxy',
      'CF-IPCountry': 'XX',
      'CF-Connecting-IP': generateRandomIP(),
      'X-Real-IP': generateRandomIP(),
    };
  };

  const sendSuspiciousRequest = async (endpoint: string) => {
    const headers = generateSuspiciousHeaders();
    addLog(`Sending request to ${endpoint} with suspicious headers`);
    try {
      const response = await axios.get(`${MANGA_API_URL}${endpoint}`, {
        headers,
        timeout: 5000,
        validateStatus: (status) => status < 500, // Accept any status < 500
      });

      addLog(`Response status: ${response.status}`);
      if (response.data?.includes('cf-browser-verification')) {
        addLog('Cloudflare verification detected in response!');
        return true;
      }
      return false;
    } catch (error) {
      if (isAxiosError(error)) {
        if (error.response?.data?.includes('cf-browser-verification')) {
          addLog('Cloudflare verification detected in error response!');
          return true;
        }
        addLog(`Request failed: ${error.response?.status || error.message}`);
      }
      return false;
    }
  };

  const resetChapterGuide = async () => {
    try {
      await AsyncStorage.removeItem(CHAPTER_GUIDE_KEY);
      showAlertWithConfig({
        title: 'Success',
        message:
          'Chapter reading guide has been reset. The tutorial will show next time you open a chapter.',
        options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
      });
    } catch (error) {
      showAlertWithConfig({
        title: 'Error',
        message:
          'Failed to reset chapter guide: ' +
          (error instanceof Error ? error.message : String(error)),
        options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
      });
    }
  };

  const triggerCloudflare = async () => {
    showAlertWithConfig({
      title: 'Trigger Cloudflare',
      message:
        "This will attempt to trigger Cloudflare's browser verification using suspicious request patterns. Continue?",
      options: [
        {
          text: 'Cancel',
          onPress: () => setShowAlert(false),
        },
        {
          text: 'Continue',
          onPress: async () => {
            setIsTriggering(true);
            setShowAlert(false);
            setLog([]);

            try {
              addLog(
                'Starting Cloudflare trigger attempt using suspicious patterns'
              );

              const endpoints = [
                '/home',
                '/search?q=test',
                '/manga/random',
                '/latest',
              ];

              // Try different suspicious patterns
              for (let i = 0; i < 3; i++) {
                addLog(`\nAttempt ${i + 1}:`);

                for (const endpoint of endpoints) {
                  const triggered = await sendSuspiciousRequest(endpoint);
                  if (triggered) {
                    setIsTriggering(false);
                    showAlertWithConfig({
                      title: 'Success',
                      message:
                        'Cloudflare protection triggered! Would you like to view the debug log?',
                      options: [
                        {
                          text: 'View Log',
                          onPress: showLog,
                        },
                        {
                          text: 'Close',
                          onPress: () => setShowAlert(false),
                        },
                      ],
                    });
                    return;
                  }

                  // Add a delay between requests
                  await new Promise((resolve) => setTimeout(resolve, 500));
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
                      title: 'Success',
                      message:
                        'Cloudflare protection triggered! Would you like to view the debug log?',
                      options: [
                        {
                          text: 'View Log',
                          onPress: showLog,
                        },
                        {
                          text: 'Close',
                          onPress: () => setShowAlert(false),
                        },
                      ],
                    });
                    return;
                  }
                }
              }

              setIsTriggering(false);
              showAlertWithConfig({
                title: 'Completed',
                message:
                  'All attempts completed. Would you like to view the debug log?',
                options: [
                  {
                    text: 'View Log',
                    onPress: showLog,
                  },
                  {
                    text: 'Close',
                    onPress: () => setShowAlert(false),
                  },
                ],
              });
            } catch (error: unknown) {
              addLog(
                `Unexpected error: ${
                  error instanceof Error ? error.message : String(error)
                }`
              );
              setIsTriggering(false);
              showAlertWithConfig({
                title: 'Error',
                message:
                  'An unexpected error occurred. Would you like to view the debug log?',
                options: [
                  {
                    text: 'View Log',
                    onPress: showLog,
                  },
                  {
                    text: 'Close',
                    onPress: () => setShowAlert(false),
                  },
                ],
              });
            }
          },
        },
      ],
    });
  };

  const { checkForCloudflare } = useCloudflareDetection();

  const simulateCloudflare = () => {
    showAlertWithConfig({
      title: 'Simulate Cloudflare',
      message: 'This will simulate a Cloudflare detection. Continue?',
      options: [
        {
          text: 'Cancel',
          onPress: () => setShowAlert(false),
        },
        {
          text: 'Continue',
          onPress: () => {
            // Simulate Cloudflare by passing HTML with the verification string
            checkForCloudflare(
              '<div class="cf-browser-verification">test</div>',
              '/debug'
            );
            setShowAlert(false);
          },
        },
      ],
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
      >
        <Text style={styles.title}>Debug Menu</Text>

        {/* Expo Updates Section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => toggleSection('updates')}
          >
            <View style={styles.sectionHeaderLeft}>
              <Ionicons
                name="cloud-download-outline"
                size={24}
                color={accentColor || colors.primary}
              />
              <Text style={styles.sectionTitle}>Expo Updates</Text>
            </View>
            <Ionicons
              name={
                expandedSection === 'updates' ? 'chevron-up' : 'chevron-down'
              }
              size={20}
              color={colors.text}
            />
          </TouchableOpacity>

          {expandedSection === 'updates' && extendedUpdateInfo && (
            <View style={styles.updateInfoContainer}>
              {/* Environment Card */}
              <View style={styles.environmentCard}>
                <View style={styles.environmentCardHeader}>
                  <View
                    style={[
                      styles.environmentBadge,
                      { backgroundColor: getEnvironmentColor() },
                    ]}
                  >
                    <Ionicons
                      name={
                        isExpoGo() ? 'phone-portrait-outline' : 'rocket-outline'
                      }
                      size={16}
                      color="#FFFFFF"
                    />
                    <Text style={styles.environmentBadgeText}>
                      {getEnvironmentLabel()}
                    </Text>
                  </View>
                </View>
                <View style={styles.environmentDetails}>
                  <Text style={styles.environmentLabel}>
                    Execution Environment
                  </Text>
                  <Text style={styles.environmentValue}>
                    {getExecutionEnvironment()}
                  </Text>
                </View>
              </View>

              {/* Expo Go Warning */}
              {isExpoGo() && (
                <View style={styles.expoGoWarning}>
                  <Ionicons
                    name="information-circle"
                    size={20}
                    color="#8B5CF6"
                  />
                  <Text style={styles.expoGoWarningText}>
                    Running in Expo Go. OTA updates are not available in this
                    environment. Build a development or production build to
                    enable updates.
                  </Text>
                </View>
              )}

              {/* Channel & Status Row */}
              <View style={styles.badgesRow}>
                {/* Channel Badge */}
                <TouchableOpacity
                  style={[
                    styles.channelBadge,
                    {
                      backgroundColor: getChannelColor(
                        extendedUpdateInfo.channel
                      ).bg,
                    },
                  ]}
                  onPress={showChannelInfo}
                  activeOpacity={0.8}
                >
                  <Ionicons
                    name="git-branch-outline"
                    size={14}
                    color={getChannelColor(extendedUpdateInfo.channel).text}
                  />
                  <Text
                    style={[
                      styles.channelBadgeText,
                      {
                        color: getChannelColor(extendedUpdateInfo.channel).text,
                      },
                    ]}
                  >
                    {getChannelDisplayName(extendedUpdateInfo.channel)}
                  </Text>
                  <Ionicons
                    name="chevron-forward"
                    size={12}
                    color={getChannelColor(extendedUpdateInfo.channel).text}
                    style={{ opacity: 0.7 }}
                  />
                </TouchableOpacity>

                {/* Update Source Badge */}
                <View
                  style={[
                    styles.statusBadge,
                    {
                      backgroundColor: isExpoGo()
                        ? '#8B5CF620'
                        : extendedUpdateInfo.isEmbeddedLaunch
                          ? '#F9731620'
                          : '#22C55E20',
                      borderColor: isExpoGo()
                        ? '#8B5CF6'
                        : extendedUpdateInfo.isEmbeddedLaunch
                          ? '#F97316'
                          : '#22C55E',
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      isExpoGo()
                        ? 'phone-portrait-outline'
                        : extendedUpdateInfo.isEmbeddedLaunch
                          ? 'cube-outline'
                          : 'cloud-done-outline'
                    }
                    size={14}
                    color={
                      isExpoGo()
                        ? '#8B5CF6'
                        : extendedUpdateInfo.isEmbeddedLaunch
                          ? '#F97316'
                          : '#22C55E'
                    }
                  />
                  <Text
                    style={[
                      styles.statusBadgeText,
                      {
                        color: isExpoGo()
                          ? '#8B5CF6'
                          : extendedUpdateInfo.isEmbeddedLaunch
                            ? '#F97316'
                            : '#22C55E',
                      },
                    ]}
                  >
                    {isExpoGo()
                      ? 'Expo Go'
                      : extendedUpdateInfo.isEmbeddedLaunch
                        ? 'Embedded'
                        : 'OTA Update'}
                  </Text>
                </View>

                {/* Emergency Badge */}
                {extendedUpdateInfo.isEmergencyLaunch && (
                  <View style={[styles.statusBadge, styles.emergencyBadge]}>
                    <Ionicons name="warning" size={14} color="#EF4444" />
                    <Text
                      style={[styles.statusBadgeText, { color: '#EF4444' }]}
                    >
                      Emergency
                    </Text>
                  </View>
                )}
              </View>

              {/* Info Cards */}
              <View style={styles.infoCardsContainer}>
                {/* Update ID Card */}
                <TouchableOpacity
                  style={styles.infoCard}
                  onPress={() =>
                    extendedUpdateInfo.updateId &&
                    copyToClipboard(extendedUpdateInfo.updateId, 'Update ID')
                  }
                  disabled={!extendedUpdateInfo.updateId}
                >
                  <View style={styles.infoCardHeader}>
                    <Ionicons
                      name="finger-print-outline"
                      size={18}
                      color={colors.text}
                    />
                    <Text style={styles.infoCardTitle}>Update ID</Text>
                  </View>
                  <Text style={styles.infoCardValue} numberOfLines={1}>
                    {extendedUpdateInfo.updateId
                      ? extendedUpdateInfo.updateId.substring(0, 20) + '...'
                      : 'N/A'}
                  </Text>
                  {extendedUpdateInfo.updateId && (
                    <Text style={styles.infoCardHint}>Tap to copy</Text>
                  )}
                </TouchableOpacity>

                {/* Runtime Version Card */}
                <TouchableOpacity
                  style={styles.infoCard}
                  onPress={() =>
                    extendedUpdateInfo.runtimeVersion &&
                    copyToClipboard(
                      extendedUpdateInfo.runtimeVersion,
                      'Runtime Version'
                    )
                  }
                  disabled={!extendedUpdateInfo.runtimeVersion}
                >
                  <View style={styles.infoCardHeader}>
                    <Ionicons
                      name="code-slash-outline"
                      size={18}
                      color={colors.text}
                    />
                    <Text style={styles.infoCardTitle}>Runtime Version</Text>
                  </View>
                  <Text style={styles.infoCardValue} numberOfLines={1}>
                    {extendedUpdateInfo.runtimeVersion
                      ? extendedUpdateInfo.runtimeVersion.substring(0, 16) +
                        '...'
                      : 'N/A'}
                  </Text>
                  {extendedUpdateInfo.runtimeVersion && (
                    <Text style={styles.infoCardHint}>Tap to copy</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Additional Info */}
              <View style={styles.additionalInfo}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Created At:</Text>
                  <Text style={styles.infoValue}>
                    {formatDate(extendedUpdateInfo.createdAt)}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Auto Check:</Text>
                  <Text style={styles.infoValue}>
                    {extendedUpdateInfo.checkAutomatically}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Platform:</Text>
                  <Text style={styles.infoValue}>{Platform.OS}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Expo SDK:</Text>
                  <Text style={styles.infoValue}>
                    {Constants.expoConfig?.sdkVersion || 'N/A'}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>App Version:</Text>
                  <Text style={styles.infoValue}>
                    {Constants.expoConfig?.version || 'N/A'}
                  </Text>
                </View>
                {Constants.expoConfig?.extra?.eas?.projectId && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>Project ID:</Text>
                    <Text style={styles.infoValue} numberOfLines={1}>
                      {Constants.expoConfig.extra.eas.projectId.substring(
                        0,
                        12
                      )}
                      ...
                    </Text>
                  </View>
                )}
              </View>

              {/* Last Check Result */}
              {lastCheckResult && (
                <View style={styles.lastCheckContainer}>
                  <Text style={styles.lastCheckLabel}>Last Check Result:</Text>
                  <Text style={styles.lastCheckValue}>{lastCheckResult}</Text>
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.updateActions}>
                <TouchableOpacity
                  style={[
                    styles.updateButton,
                    { backgroundColor: accentColor || colors.primary },
                    (updateStatus.isChecking || isExpoGo()) &&
                      styles.buttonDisabled,
                  ]}
                  onPress={checkForUpdateDetailed}
                  disabled={
                    updateStatus.isChecking ||
                    updateStatus.isDownloading ||
                    isExpoGo()
                  }
                >
                  {updateStatus.isChecking ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons
                      name="refresh-outline"
                      size={20}
                      color="#FFFFFF"
                    />
                  )}
                  <Text style={styles.updateButtonText}>
                    {isExpoGo()
                      ? 'Not Available in Expo Go'
                      : updateStatus.isChecking
                        ? 'Checking...'
                        : 'Check for Updates'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.updateButtonSecondary,
                    { borderColor: accentColor || colors.primary },
                    (updateStatus.isDownloading || isExpoGo()) &&
                      styles.buttonDisabled,
                  ]}
                  onPress={fetchAndApplyUpdate}
                  disabled={
                    updateStatus.isChecking ||
                    updateStatus.isDownloading ||
                    isExpoGo()
                  }
                >
                  {updateStatus.isDownloading ? (
                    <ActivityIndicator
                      size="small"
                      color={accentColor || colors.primary}
                    />
                  ) : (
                    <Ionicons
                      name="download-outline"
                      size={20}
                      color={accentColor || colors.primary}
                    />
                  )}
                  <Text
                    style={[
                      styles.updateButtonSecondaryText,
                      { color: accentColor || colors.primary },
                    ]}
                  >
                    {updateStatus.isDownloading
                      ? 'Fetching...'
                      : 'Force Fetch Update'}
                  </Text>
                </TouchableOpacity>

                <View style={styles.smallButtonsRow}>
                  <TouchableOpacity
                    style={styles.smallButton}
                    onPress={showManifestDetails}
                  >
                    <Ionicons
                      name="document-text-outline"
                      size={18}
                      color={colors.text}
                    />
                    <Text style={styles.smallButtonText}>Manifest</Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.smallButton,
                      isExpoGo() && styles.smallButtonDisabled,
                    ]}
                    onPress={handleReloadApp}
                  >
                    <Ionicons
                      name="reload-outline"
                      size={18}
                      color={isExpoGo() ? colors.secondaryText : colors.text}
                    />
                    <Text
                      style={[
                        styles.smallButtonText,
                        isExpoGo() && styles.smallButtonTextDisabled,
                      ]}
                    >
                      Reload App
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={[
                      styles.smallButton,
                      isExpoGo() && styles.smallButtonDisabled,
                    ]}
                    onPress={handleRefreshInfo}
                  >
                    <Ionicons
                      name="sync-outline"
                      size={18}
                      color={isExpoGo() ? colors.secondaryText : colors.text}
                    />
                    <Text
                      style={[
                        styles.smallButtonText,
                        isExpoGo() && styles.smallButtonTextDisabled,
                      ]}
                    >
                      Refresh
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Debug Actions</Text>

          <TouchableOpacity style={styles.option} onPress={showOnboarding}>
            <Ionicons name="play-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Show Onboarding</Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.option} onPress={resetChapterGuide}>
            <Ionicons name="book-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Reset Chapter Reading Guide</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.option, isTriggering && styles.optionDisabled]}
            onPress={isTriggering ? undefined : triggerCloudflare}
          >
            <Ionicons name="shield-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Trigger Cloudflare Check</Text>
            {isTriggering && (
              <ActivityIndicator
                size="small"
                color={colors.primary}
                style={styles.spinner}
              />
            )}
          </TouchableOpacity>

          <TouchableOpacity style={styles.option} onPress={simulateCloudflare}>
            <Ionicons name="shield-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Simulate Cloudflare</Text>
          </TouchableOpacity>

          {log.length > 0 && (
            <TouchableOpacity style={styles.option} onPress={showLog}>
              <Ionicons
                name="document-text-outline"
                size={24}
                color={colors.text}
              />
              <Text style={styles.optionText}>View Debug Log</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Cache Management</Text>

          <TouchableOpacity style={styles.option} onPress={checkImageCache}>
            <Ionicons
              name="information-circle-outline"
              size={24}
              color={colors.text}
            />
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
const getStyles = (colors: typeof Colors.light, accentColor?: string) =>
  StyleSheet.create({
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
    sectionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    sectionHeaderLeft: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '600',
      marginBottom: 0,
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
    },
    scrollViewContent: {
      paddingBottom: 40,
    },

    // Expo Updates Section Styles
    updateInfoContainer: {
      marginTop: 16,
      gap: 16,
    },
    environmentCard: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    environmentCardHeader: {
      marginBottom: 12,
    },
    environmentBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      gap: 7,
    },
    environmentBadgeText: {
      color: '#FFFFFF',
      fontSize: 14,
      fontWeight: '700',
    },
    environmentDetails: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
    },
    environmentLabel: {
      fontSize: 12,
      color: colors.secondaryText,
    },
    environmentValue: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    expoGoWarning: {
      flexDirection: 'row',
      backgroundColor: '#8B5CF620',
      borderRadius: 12,
      padding: 12,
      gap: 10,
      alignItems: 'flex-start',
      borderWidth: 1,
      borderColor: '#8B5CF640',
    },
    expoGoWarningText: {
      flex: 1,
      fontSize: 13,
      color: colors.text,
      lineHeight: 18,
    },
    badgesRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      alignItems: 'center',
      gap: 8,
    },
    channelBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 12,
      paddingVertical: 7,
      borderRadius: 8,
      gap: 6,
    },
    channelBadgeText: {
      fontSize: 13,
      fontWeight: '600',
    },
    statusBadge: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 10,
      paddingVertical: 6,
      borderRadius: 8,
      gap: 5,
      borderWidth: 1,
    },
    statusBadgeText: {
      fontSize: 12,
      fontWeight: '600',
    },
    emergencyBadge: {
      backgroundColor: '#EF444420',
      borderColor: '#EF4444',
    },
    infoCardsContainer: {
      flexDirection: 'row',
      gap: 10,
    },
    infoCard: {
      flex: 1,
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    infoCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 10,
    },
    infoCardTitle: {
      fontSize: 11,
      fontWeight: '600',
      color: colors.secondaryText,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
    },
    infoCardValue: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 6,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    infoCardHint: {
      fontSize: 10,
      color: accentColor || colors.primary,
      fontWeight: '500',
    },
    additionalInfo: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 14,
      gap: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    infoRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingVertical: 2,
    },
    infoLabel: {
      fontSize: 13,
      color: colors.secondaryText,
    },
    infoValue: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    lastCheckContainer: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 14,
      borderLeftWidth: 4,
      borderLeftColor: accentColor || colors.primary,
      borderWidth: 1,
      borderColor: colors.border,
    },
    lastCheckLabel: {
      fontSize: 11,
      color: colors.secondaryText,
      marginBottom: 6,
      textTransform: 'uppercase',
      letterSpacing: 0.5,
      fontWeight: '600',
    },
    lastCheckValue: {
      fontSize: 13,
      color: colors.text,
      lineHeight: 18,
    },
    updateActions: {
      gap: 12,
    },
    updateButton: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 15,
      borderRadius: 12,
      gap: 10,
    },
    updateButtonText: {
      color: '#FFFFFF',
      fontSize: 15,
      fontWeight: '700',
    },
    updateButtonSecondary: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 14,
      borderRadius: 12,
      borderWidth: 2,
      gap: 10,
      backgroundColor: 'transparent',
    },
    updateButtonSecondaryText: {
      fontSize: 15,
      fontWeight: '600',
    },
    buttonDisabled: {
      opacity: 0.5,
    },
    smallButtonsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      gap: 10,
    },
    smallButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 12,
      backgroundColor: colors.background,
      borderRadius: 10,
      gap: 6,
      borderWidth: 1,
      borderColor: colors.border,
    },
    smallButtonText: {
      fontSize: 12,
      fontWeight: '500',
      color: colors.text,
    },
    smallButtonDisabled: {
      opacity: 0.5,
      borderColor: colors.border,
    },
    smallButtonTextDisabled: {
      color: colors.secondaryText,
    },
  });
