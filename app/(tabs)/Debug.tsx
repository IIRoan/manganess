import React, { useState, useCallback } from 'react';
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
import { useTheme } from '@/hooks/useTheme';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import { setOnboardingCompleted } from '@/services/settingsService';
import { useRouter, useFocusEffect } from 'expo-router';
import * as Updates from 'expo-updates';
import * as Sharing from 'expo-sharing';
import Constants from 'expo-constants';
import { imageCache } from '@/services/CacheImages';
import Alert from '@/components/Alert';
import axios, { isAxiosError } from 'axios';
import { MANGA_API_URL } from '@/constants/Config';
import { useCloudflareDetection } from '@/hooks/useCloudflareDetection';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useAppUpdates } from '@/hooks/useAppUpdates';
import { isExpoGo, isDevelopment } from '@/services/updateService';
import { setMangaData } from '@/services/bookmarkService';
import { errorLogService } from '@/services/errorLogService';
import type { MangaData } from '@/types';
import type { ErrorLogSummary, PersistedErrorEntry } from '@/types/errorLog';

const getExecutionEnvironment = (): string => {
  return Constants.executionEnvironment || 'unknown';
};

const getEnvironmentLabel = (): string => {
  if (isExpoGo()) return 'Expo Go';
  return getExecutionEnvironment();
};

const getEnvironmentColor = (): string => {
  if (isExpoGo()) return '#8B5CF6';
  if (isDevelopment()) return '#EF4444';
  return '#10B981';
};

const displayValue = (value: string | null | undefined): string => {
  if (value == null || value === '') return 'none';
  return value;
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
    'errors'
  );
  const [errorLogSummary, setErrorLogSummary] = useState<ErrorLogSummary | null>(
    null
  );
  const [errorLogEntries, setErrorLogEntries] = useState<PersistedErrorEntry[]>(
    []
  );
  const [isErrorLogLoading, setIsErrorLogLoading] = useState(false);

  // Extended update info with manifest (from expo-updates directly)
  const extendedUpdateInfo = {
    ...hookUpdateInfo,
    manifest: Updates.manifest,
  };

  const formatDate = (date: Date | null): string => {
    if (!date) return 'none';
    return date.toISOString();
  };

  const getChannelColor = (
    channel: string | null
  ): { bg: string; text: string } => {
    switch (channel) {
      case 'preview':
        return { bg: '#F97316', text: '#FFFFFF' };
      case 'development':
        return { bg: '#EF4444', text: '#FFFFFF' };
      case 'main':
        return { bg: '#10B981', text: '#FFFFFF' };
      default:
        return { bg: colors.border, text: colors.text };
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
      title: 'Update channel',
      message: [
        `channel: ${displayValue(extendedUpdateInfo?.channel)}`,
        `Updates.isEnabled: ${String(Updates.isEnabled)}`,
        `runtimeVersion: ${displayValue(extendedUpdateInfo?.runtimeVersion)}`,
        `isEmbeddedLaunch: ${String(extendedUpdateInfo?.isEmbeddedLaunch)}`,
        `isEmergencyLaunch: ${String(extendedUpdateInfo?.isEmergencyLaunch)}`,
      ].join('\n'),
      options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
    });
  };

  const handleReloadApp = async () => {
    try {
      await Updates.reloadAsync();
    } catch (error) {
      const errorMessage =
        error instanceof Error ? error.message : String(error);
      showAlertWithConfig({
        title: 'reloadAsync failed',
        message: errorMessage,
        options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
      });
    }
  };

  const handleRefreshInfo = () => {
    refreshUpdateInfo();
  };

  const toggleSection = (section: string) => {
    setExpandedSection(expandedSection === section ? null : section);
  };

  const refreshErrorLog = useCallback(async () => {
    setIsErrorLogLoading(true);
    try {
      const [summary, entries] = await Promise.all([
        errorLogService.getSummary(),
        errorLogService.getEntries(),
      ]);
      setErrorLogSummary(summary);
      setErrorLogEntries(entries.slice().reverse());
    } catch (error) {
      showAlertWithConfig({
        title: 'Error Log',
        message:
          'Failed to read the error log: ' +
          (error instanceof Error ? error.message : String(error)),
        options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
      });
    } finally {
      setIsErrorLogLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void refreshErrorLog();
    }, [refreshErrorLog])
  );

  const formatErrorPreview = (entry: PersistedErrorEntry): string => {
    const time = new Date(entry.ts).toLocaleString();
    const scope = entry.scope ? `/${entry.scope}` : '';
    const lines = [
      time,
      `${entry.level.toUpperCase()} (${entry.source}${scope})`,
      entry.message,
    ];
    if (typeof entry.data !== 'undefined') {
      try {
        lines.push(JSON.stringify(entry.data, null, 2));
      } catch {
        lines.push(String(entry.data));
      }
    }
    if (entry.stack) {
      lines.push(entry.stack);
    }
    lines.push(
      `platform=${entry.platform} ${entry.platformVersion} app=${entry.appVersion ?? 'unknown'}`
    );
    lines.push(
      `channel=${entry.channel ?? 'none'} updateId=${entry.updateId ?? 'none'}`
    );
    return lines.join('\n');
  };

  const showErrorLogContents = async () => {
    try {
      const text = await errorLogService.getText();
      showAlertWithConfig({
        title: `Error Log (${errorLogSummary?.count ?? 0})`,
        message: text,
        options: [
          {
            text: 'Copy',
            onPress: () => {
              Clipboard.setString(text);
              setShowAlert(false);
            },
          },
          { text: 'Close', onPress: () => setShowAlert(false) },
        ],
      });
    } catch (error) {
      showAlertWithConfig({
        title: 'Error Log',
        message:
          'Failed to open the error log: ' +
          (error instanceof Error ? error.message : String(error)),
        options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
      });
    }
  };

  const copyErrorLog = async () => {
    try {
      const text = await errorLogService.getText();
      Clipboard.setString(text);
      showAlertWithConfig({
        title: 'Copied',
        message: 'Error log copied to clipboard.',
        options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
      });
    } catch (error) {
      showAlertWithConfig({
        title: 'Copy Failed',
        message: error instanceof Error ? error.message : String(error),
        options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
      });
    }
  };

  const shareErrorLog = async () => {
    try {
      const fileUri = await errorLogService.getPersistedFileUri();
      if (!(await Sharing.isAvailableAsync())) {
        await copyErrorLog();
        return;
      }
      await Sharing.shareAsync(fileUri, {
        mimeType: 'application/json',
        dialogTitle: 'Share MangaNess error log',
      });
    } catch (error) {
      showAlertWithConfig({
        title: 'Share Failed',
        message: error instanceof Error ? error.message : String(error),
        options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
      });
    }
  };

  const clearErrorLog = () => {
    showAlertWithConfig({
      title: 'Clear Error Log',
      message: 'Delete all saved errors from this device?',
      options: [
        { text: 'Cancel', onPress: () => setShowAlert(false) },
        {
          text: 'Clear',
          onPress: async () => {
            try {
              await errorLogService.clear();
              await refreshErrorLog();
              showAlertWithConfig({
                title: 'Cleared',
                message: 'Error log file has been cleared.',
                options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
              });
            } catch (error) {
              showAlertWithConfig({
                title: 'Clear Failed',
                message: error instanceof Error ? error.message : String(error),
                options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
              });
            }
          },
        },
      ],
    });
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

  const addMissingSoloLevelingBookmark = async () => {
    const debugBookmark: MangaData = {
      id: 'solo-leveling-missing-debug',
      title: 'Solo Leveling',
      bannerImage: '',
      bookmarkStatus: 'Reading',
      readChapters: ['1', '2'],
      lastReadChapter: '2',
      lastNotifiedChapter: '2',
      lastUpdated: Date.now(),
    };

    await setMangaData(debugBookmark);

    showAlertWithConfig({
      title: 'Test Bookmark Added',
      message:
        'A missing "Solo Leveling" bookmark was added to your library with sample reading progress so you can test the replacement flow from Bookmarks.',
      options: [{ text: 'OK', onPress: () => setShowAlert(false) }],
    });
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
      >
        <Text style={styles.title}>Debug Menu</Text>

        <View style={styles.section}>
          <TouchableOpacity
            style={styles.sectionHeader}
            onPress={() => toggleSection('errors')}
            accessibilityRole="button"
            accessibilityLabel="Error log section"
          >
            <View style={styles.sectionHeaderLeft}>
              <Ionicons
                name="warning-outline"
                size={24}
                color={accentColor || colors.primary}
              />
              <Text style={styles.sectionTitle}>Error Log</Text>
              {errorLogSummary && errorLogSummary.count > 0 ? (
                <View style={styles.errorCountBadge}>
                  <Text style={styles.errorCountBadgeText}>
                    {errorLogSummary.count}
                  </Text>
                </View>
              ) : null}
            </View>
            <Ionicons
              name={
                expandedSection === 'errors' ? 'chevron-up' : 'chevron-down'
              }
              size={20}
              color={colors.text}
            />
          </TouchableOpacity>

          {expandedSection === 'errors' && (
            <View style={styles.errorLogContainer}>
              <Text style={styles.errorLogHint}>
                Manga load and other failures are saved to a file on this
                device so you can copy or share them after a user hits the
                issue.
              </Text>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>saved errors</Text>
                <Text style={styles.infoValue}>
                  {errorLogSummary?.count ?? 0}
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>file</Text>
                <Text
                  style={[styles.infoValue, styles.infoValueWrap]}
                  selectable
                >
                  {errorLogSummary?.fileUri ?? 'none'}
                </Text>
              </View>

              {errorLogEntries.length === 0 ? (
                <Text style={styles.errorLogEmpty}>
                  No errors recorded yet. Reproduce the manga loading issue,
                  then reopen this section.
                </Text>
              ) : (
                <ScrollView
                  style={styles.errorLogList}
                  nestedScrollEnabled
                >
                  {errorLogEntries.slice(0, 20).map((entry) => (
                    <TouchableOpacity
                      key={entry.id}
                      style={styles.errorLogItem}
                      onPress={() =>
                        showAlertWithConfig({
                          title: `${entry.level.toUpperCase()} ${entry.source}`,
                          message: formatErrorPreview(entry),
                          options: [
                            {
                              text: 'Copy',
                              onPress: () => {
                                Clipboard.setString(formatErrorPreview(entry));
                                setShowAlert(false);
                              },
                            },
                            {
                              text: 'Close',
                              onPress: () => setShowAlert(false),
                            },
                          ],
                        })
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Error ${entry.message}`}
                    >
                      <Text style={styles.errorLogItemLevel}>
                        {entry.level.toUpperCase()}
                        {entry.scope ? ` · ${entry.scope}` : ''}
                      </Text>
                      <Text style={styles.errorLogItemMessage} numberOfLines={3}>
                        {entry.message}
                      </Text>
                      <Text style={styles.errorLogItemMeta}>
                        {new Date(entry.ts).toLocaleString()} · {entry.platform}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              )}

              <View style={styles.errorLogActions}>
                <TouchableOpacity
                  style={[
                    styles.updateButton,
                    { backgroundColor: accentColor || colors.primary },
                  ]}
                  onPress={showErrorLogContents}
                  accessibilityRole="button"
                  accessibilityLabel="View full error log"
                >
                  {isErrorLogLoading ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Ionicons
                      name="document-text-outline"
                      size={20}
                      color="#FFFFFF"
                    />
                  )}
                  <Text style={styles.updateButtonText}>View Full Log</Text>
                </TouchableOpacity>

                <View style={styles.smallButtonsRow}>
                  <TouchableOpacity
                    style={styles.smallButton}
                    onPress={copyErrorLog}
                    accessibilityRole="button"
                    accessibilityLabel="Copy error log"
                  >
                    <Ionicons
                      name="copy-outline"
                      size={18}
                      color={colors.text}
                    />
                    <Text style={styles.smallButtonText}>Copy</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.smallButton}
                    onPress={shareErrorLog}
                    accessibilityRole="button"
                    accessibilityLabel="Share error log file"
                  >
                    <Ionicons
                      name="share-outline"
                      size={18}
                      color={colors.text}
                    />
                    <Text style={styles.smallButtonText}>Share</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.smallButton}
                    onPress={() => void refreshErrorLog()}
                    accessibilityRole="button"
                    accessibilityLabel="Refresh error log"
                  >
                    <Ionicons
                      name="sync-outline"
                      size={18}
                      color={colors.text}
                    />
                    <Text style={styles.smallButtonText}>Refresh</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={styles.smallButton}
                    onPress={clearErrorLog}
                    accessibilityRole="button"
                    accessibilityLabel="Clear error log"
                  >
                    <Ionicons
                      name="trash-outline"
                      size={18}
                      color={colors.text}
                    />
                    <Text style={styles.smallButtonText}>Clear</Text>
                  </TouchableOpacity>
                </View>
              </View>
            </View>
          )}
        </View>

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
                <View style={styles.environmentFacts}>
                  <View style={styles.environmentDetails}>
                    <Text style={styles.environmentLabel}>
                      executionEnvironment
                    </Text>
                    <Text style={styles.environmentValue}>
                      {getExecutionEnvironment()}
                    </Text>
                  </View>
                  <View style={styles.environmentDetails}>
                    <Text style={styles.environmentLabel}>__DEV__</Text>
                    <Text style={styles.environmentValue}>
                      {String(__DEV__)}
                    </Text>
                  </View>
                  <View style={styles.environmentDetails}>
                    <Text style={styles.environmentLabel}>Updates.isEnabled</Text>
                    <Text style={styles.environmentValue}>
                      {String(Updates.isEnabled)}
                    </Text>
                  </View>
                </View>
              </View>

              {unavailableReason ? (
                <View style={styles.expoGoWarning}>
                  <Ionicons
                    name="information-circle"
                    size={20}
                    color="#8B5CF6"
                  />
                  <Text style={styles.expoGoWarningText}>
                    {unavailableReason}
                  </Text>
                </View>
              ) : null}

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
                    {`channel: ${displayValue(extendedUpdateInfo.channel)}`}
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
                      backgroundColor: extendedUpdateInfo.isEmbeddedLaunch
                        ? '#F9731620'
                        : '#22C55E20',
                      borderColor: extendedUpdateInfo.isEmbeddedLaunch
                        ? '#F97316'
                        : '#22C55E',
                    },
                  ]}
                >
                  <Ionicons
                    name={
                      extendedUpdateInfo.isEmbeddedLaunch
                        ? 'cube-outline'
                        : 'cloud-done-outline'
                    }
                    size={14}
                    color={
                      extendedUpdateInfo.isEmbeddedLaunch
                        ? '#F97316'
                        : '#22C55E'
                    }
                  />
                  <Text
                    style={[
                      styles.statusBadgeText,
                      {
                        color: extendedUpdateInfo.isEmbeddedLaunch
                          ? '#F97316'
                          : '#22C55E',
                      },
                    ]}
                  >
                    {`isEmbeddedLaunch: ${String(extendedUpdateInfo.isEmbeddedLaunch)}`}
                  </Text>
                </View>

                {extendedUpdateInfo.isEmergencyLaunch ? (
                  <View style={[styles.statusBadge, styles.emergencyBadge]}>
                    <Ionicons name="warning" size={14} color="#EF4444" />
                    <Text
                      style={[styles.statusBadgeText, { color: '#EF4444' }]}
                    >
                      isEmergencyLaunch: true
                    </Text>
                  </View>
                ) : null}
              </View>

              {/* Info Cards */}
              <View style={styles.infoCardsContainer}>
                {/* Update ID Card */}
                <TouchableOpacity
                  style={styles.infoCard}
                  onPress={() =>
                    extendedUpdateInfo.updateId &&
                    copyToClipboard(extendedUpdateInfo.updateId, 'updateId')
                  }
                  disabled={!extendedUpdateInfo.updateId}
                >
                  <View style={styles.infoCardHeader}>
                    <Ionicons
                      name="finger-print-outline"
                      size={18}
                      color={colors.text}
                    />
                    <Text style={styles.infoCardTitle}>updateId</Text>
                  </View>
                  <Text style={styles.infoCardValue} selectable>
                    {displayValue(extendedUpdateInfo.updateId)}
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
                      'runtimeVersion'
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
                    <Text style={styles.infoCardTitle}>runtimeVersion</Text>
                  </View>
                  <Text style={styles.infoCardValue} selectable>
                    {displayValue(extendedUpdateInfo.runtimeVersion)}
                  </Text>
                  {extendedUpdateInfo.runtimeVersion && (
                    <Text style={styles.infoCardHint}>Tap to copy</Text>
                  )}
                </TouchableOpacity>
              </View>

              {/* Additional Info */}
              <View style={styles.additionalInfo}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>createdAt</Text>
                  <Text style={styles.infoValue} selectable>
                    {formatDate(extendedUpdateInfo.createdAt)}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>checkAutomatically</Text>
                  <Text style={styles.infoValue} selectable>
                    {displayValue(Updates.checkAutomatically)}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>isEmergencyLaunch</Text>
                  <Text style={styles.infoValue}>
                    {String(extendedUpdateInfo.isEmergencyLaunch)}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Platform.OS</Text>
                  <Text style={styles.infoValue}>{Platform.OS}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>sdkVersion</Text>
                  <Text style={styles.infoValue} selectable>
                    {displayValue(Constants.expoConfig?.sdkVersion)}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>version</Text>
                  <Text style={styles.infoValue} selectable>
                    {displayValue(Constants.expoConfig?.version)}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>eas.projectId</Text>
                  <Text
                    style={[styles.infoValue, styles.infoValueWrap]}
                    selectable
                    onPress={() => {
                      const projectId =
                        Constants.expoConfig?.extra?.eas?.projectId;
                      if (projectId) {
                        copyToClipboard(projectId, 'eas.projectId');
                      }
                    }}
                  >
                    {displayValue(Constants.expoConfig?.extra?.eas?.projectId)}
                  </Text>
                </View>
              </View>

              {/* Last Check Result */}
              {lastCheckResult && (
                <View style={styles.lastCheckContainer}>
                  <Text style={styles.lastCheckLabel}>lastCheckResult</Text>
                  <Text style={styles.lastCheckValue}>{lastCheckResult}</Text>
                </View>
              )}

              {/* Action Buttons */}
              <View style={styles.updateActions}>
                <TouchableOpacity
                  style={[
                    styles.updateButton,
                    { backgroundColor: accentColor || colors.primary },
                    (updateStatus.isChecking || !updatesAvailable) &&
                      styles.buttonDisabled,
                  ]}
                  onPress={checkForUpdateDetailed}
                  disabled={
                    updateStatus.isChecking ||
                    updateStatus.isDownloading ||
                    !updatesAvailable
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
                    {!updatesAvailable
                      ? 'Updates unavailable'
                      : updateStatus.isChecking
                        ? 'Checking...'
                        : 'Check for Updates'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[
                    styles.updateButtonSecondary,
                    { borderColor: accentColor || colors.primary },
                    (updateStatus.isDownloading || !updatesAvailable) &&
                      styles.buttonDisabled,
                  ]}
                  onPress={fetchAndApplyUpdate}
                  disabled={
                    updateStatus.isChecking ||
                    updateStatus.isDownloading ||
                    !updatesAvailable
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
                      !updatesAvailable && styles.smallButtonDisabled,
                    ]}
                    onPress={handleReloadApp}
                  >
                    <Ionicons
                      name="reload-outline"
                      size={18}
                      color={
                        !updatesAvailable ? colors.secondaryText : colors.text
                      }
                    />
                    <Text
                      style={[
                        styles.smallButtonText,
                        !updatesAvailable && styles.smallButtonTextDisabled,
                      ]}
                    >
                      Reload App
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.smallButton}
                    onPress={handleRefreshInfo}
                  >
                    <Ionicons
                      name="sync-outline"
                      size={18}
                      color={colors.text}
                    />
                    <Text style={styles.smallButtonText}>Refresh</Text>
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

          <TouchableOpacity
            style={styles.option}
            onPress={addMissingSoloLevelingBookmark}
          >
            <Ionicons name="bug-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>
              Add Missing Solo Leveling Bookmark
            </Text>
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
    environmentFacts: {
      gap: 8,
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
      lineHeight: 18,
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
      alignItems: 'flex-start',
      gap: 12,
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
      flexShrink: 1,
      textAlign: 'right',
    },
    infoValueWrap: {
      flex: 1,
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
    errorCountBadge: {
      backgroundColor: '#EF4444',
      borderRadius: 10,
      minWidth: 20,
      paddingHorizontal: 6,
      paddingVertical: 2,
      alignItems: 'center',
    },
    errorCountBadgeText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
    },
    errorLogContainer: {
      marginTop: 16,
      gap: 12,
    },
    errorLogHint: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.secondaryText,
    },
    errorLogEmpty: {
      fontSize: 13,
      lineHeight: 18,
      color: colors.secondaryText,
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 14,
      borderWidth: 1,
      borderColor: colors.border,
    },
    errorLogList: {
      maxHeight: 280,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.background,
    },
    errorLogItem: {
      paddingHorizontal: 14,
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    errorLogItemLevel: {
      fontSize: 11,
      fontWeight: '700',
      color: '#EF4444',
      letterSpacing: 0.4,
      marginBottom: 4,
    },
    errorLogItemMessage: {
      fontSize: 13,
      color: colors.text,
      lineHeight: 18,
    },
    errorLogItemMeta: {
      fontSize: 11,
      color: colors.secondaryText,
      marginTop: 6,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    errorLogActions: {
      gap: 12,
    },
  });
