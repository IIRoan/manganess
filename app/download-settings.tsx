import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useColorScheme,
  Switch,
  Alert,
  ActivityIndicator,
} from 'react-native';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import {
  getDownloadSettings,
  updateDownloadSettings,
  resetDownloadSettings,
  formatFileSize,
  getStorageSizeOptions,
} from '@/services/settingsService';
import { chapterStorageService } from '@/services/chapterStorageService';
import { DownloadSettings, StorageStats } from '@/types/settings';

export default function DownloadSettingsScreen() {
  const { theme, accentColor } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme =
    theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();
  const router = useRouter();

  const [settings, setSettings] = useState<DownloadSettings | null>(null);
  const [storageStats, setStorageStats] = useState<StorageStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [storageLoading, setStorageLoading] = useState(false);

  const storageOptions = getStorageSizeOptions();
  const concurrentOptions = [1, 2, 3, 4, 5];
  const qualityOptions = [
    { label: 'Original Quality', value: 'original' as const },
    { label: 'Compressed', value: 'compressed' as const },
  ];
  const thresholdOptions = [70, 75, 80, 85, 90, 95];
  const cleanupDaysOptions = [7, 14, 30, 60, 90];

  useEffect(() => {
    loadSettings();
    loadStorageStats();
  }, []);

  const loadSettings = async () => {
    try {
      const downloadSettings = await getDownloadSettings();
      setSettings(downloadSettings);
    } catch (error) {
      console.error('Error loading download settings:', error);
      Alert.alert('Error', 'Failed to load download settings');
    } finally {
      setLoading(false);
    }
  };

  const loadStorageStats = async () => {
    try {
      setStorageLoading(true);
      const stats = await chapterStorageService.getStorageStats();
      setStorageStats(stats);
    } catch (error) {
      console.error('Error loading storage stats:', error);
    } finally {
      setStorageLoading(false);
    }
  };

  const saveSettings = async (newSettings: Partial<DownloadSettings>) => {
    if (!settings) return;

    try {
      setSaving(true);
      const updatedSettings = { ...settings, ...newSettings };
      await updateDownloadSettings(newSettings);
      setSettings(updatedSettings);
    } catch (error) {
      console.error('Error saving download settings:', error);
      Alert.alert('Error', 'Failed to save settings');
    } finally {
      setSaving(false);
    }
  };

  const handleResetSettings = () => {
    Alert.alert(
      'Reset Download Settings',
      'Are you sure you want to reset all download settings to default values?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              setSaving(true);
              await resetDownloadSettings();
              await loadSettings();
              Alert.alert('Success', 'Download settings have been reset');
            } catch (error) {
              Alert.alert('Error', 'Failed to reset settings');
            } finally {
              setSaving(false);
            }
          },
        },
      ]
    );
  };

  const handleClearAllDownloads = () => {
    Alert.alert(
      'Clear All Downloads',
      'Are you sure you want to delete all downloaded chapters? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete All',
          style: 'destructive',
          onPress: async () => {
            try {
              setStorageLoading(true);
              await chapterStorageService.clearAllDownloads();
              await loadStorageStats();
              Alert.alert('Success', 'All downloads have been cleared');
            } catch (error) {
              Alert.alert('Error', 'Failed to clear downloads');
            } finally {
              setStorageLoading(false);
            }
          },
        },
      ]
    );
  };

  const handleCleanupOldDownloads = () => {
    if (!settings) return;

    Alert.alert(
      'Cleanup Old Downloads',
      `Delete downloads older than ${settings.autoCleanupDays} days?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Cleanup',
          onPress: async () => {
            try {
              setStorageLoading(true);
              const result = await chapterStorageService.performManualCleanup({
                olderThanDays: settings.autoCleanupDays,
              });
              await loadStorageStats();
              Alert.alert(
                'Cleanup Complete',
                `Deleted ${result.deletedChapters} chapters and freed ${formatFileSize(result.freedSpace)}`
              );
            } catch (error) {
              Alert.alert('Error', 'Failed to cleanup downloads');
            } finally {
              setStorageLoading(false);
            }
          },
        },
      ]
    );
  };

  const getStorageUsagePercent = (): number => {
    if (!settings || !storageStats) return 0;
    return Math.round((storageStats.totalSize / settings.maxStorageSize) * 100);
  };

  const getStorageUsageColor = (): string => {
    const percent = getStorageUsagePercent();
    if (percent >= 90) return colors.notification;
    if (percent >= (settings?.storageWarningThreshold || 85)) return '#FF9500';
    return colors.primary;
  };

  if (loading || !settings) {
    return (
      <View
        style={[styles.container, styles.centered, { paddingTop: insets.top }]}
      >
        <ActivityIndicator size="large" color={colors.primary} />
        <Text style={styles.loadingText}>Loading settings...</Text>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => router.back()}
        >
          <Ionicons name="arrow-back" size={24} color={colors.text} />
        </TouchableOpacity>
        <Text style={styles.title}>Download Settings</Text>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        {/* Storage Management Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Storage Management</Text>

          {storageStats && (
            <View style={styles.storageStatsContainer}>
              <View style={styles.storageStatsHeader}>
                <Text style={styles.storageStatsTitle}>Storage Usage</Text>
                {storageLoading && (
                  <ActivityIndicator size="small" color={colors.primary} />
                )}
              </View>

              <View style={styles.storageBar}>
                <View
                  style={[
                    styles.storageBarFill,
                    {
                      width: `${Math.min(getStorageUsagePercent(), 100)}%`,
                      backgroundColor: getStorageUsageColor(),
                    },
                  ]}
                />
              </View>

              <View style={styles.storageStatsRow}>
                <Text style={styles.storageStatsLabel}>Used:</Text>
                <Text
                  style={[
                    styles.storageStatsValue,
                    { color: getStorageUsageColor() },
                  ]}
                >
                  {formatFileSize(storageStats.totalSize)} (
                  {getStorageUsagePercent()}%)
                </Text>
              </View>

              <View style={styles.storageStatsRow}>
                <Text style={styles.storageStatsLabel}>Limit:</Text>
                <Text style={styles.storageStatsValue}>
                  {formatFileSize(settings.maxStorageSize)}
                </Text>
              </View>

              <View style={styles.storageStatsRow}>
                <Text style={styles.storageStatsLabel}>Available:</Text>
                <Text style={styles.storageStatsValue}>
                  {formatFileSize(storageStats.availableSpace)}
                </Text>
              </View>

              <View style={styles.storageStatsRow}>
                <Text style={styles.storageStatsLabel}>Chapters:</Text>
                <Text style={styles.storageStatsValue}>
                  {storageStats.totalChapters} ({storageStats.mangaCount} manga)
                </Text>
              </View>
            </View>
          )}

          {/* Storage Limit Setting */}
          <Text style={styles.optionLabel}>Storage Limit</Text>
          <View style={styles.optionGrid}>
            {storageOptions.map((option) => (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.gridOption,
                  settings.maxStorageSize === option.value &&
                    styles.activeGridOption,
                ]}
                onPress={() => saveSettings({ maxStorageSize: option.value })}
                disabled={saving}
              >
                <Text
                  style={[
                    styles.gridOptionText,
                    settings.maxStorageSize === option.value &&
                      styles.activeGridOptionText,
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Storage Warning Threshold */}
          <Text style={styles.optionLabel}>Storage Warning Threshold</Text>
          <View style={styles.optionGrid}>
            {thresholdOptions.map((threshold) => (
              <TouchableOpacity
                key={threshold}
                style={[
                  styles.gridOption,
                  settings.storageWarningThreshold === threshold &&
                    styles.activeGridOption,
                ]}
                onPress={() =>
                  saveSettings({ storageWarningThreshold: threshold })
                }
                disabled={saving}
              >
                <Text
                  style={[
                    styles.gridOptionText,
                    settings.storageWarningThreshold === threshold &&
                      styles.activeGridOptionText,
                  ]}
                >
                  {threshold}%
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        </View>

        {/* Download Quality Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Download Quality</Text>
          {qualityOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.option,
                settings.downloadQuality === option.value &&
                  styles.activeOption,
              ]}
              onPress={() => saveSettings({ downloadQuality: option.value })}
              disabled={saving}
            >
              <Ionicons
                name={
                  settings.downloadQuality === option.value
                    ? 'radio-button-on'
                    : 'radio-button-off'
                }
                size={24}
                color={
                  settings.downloadQuality === option.value
                    ? accentColor || colors.primary
                    : colors.text
                }
              />
              <Text
                style={[
                  styles.optionText,
                  settings.downloadQuality === option.value &&
                    styles.activeOptionText,
                ]}
              >
                {option.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Download Behavior Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Download Behavior</Text>

          {/* Max Concurrent Downloads */}
          <Text style={styles.optionLabel}>Max Concurrent Downloads</Text>
          <View style={styles.optionGrid}>
            {concurrentOptions.map((count) => (
              <TouchableOpacity
                key={count}
                style={[
                  styles.gridOption,
                  settings.maxConcurrentDownloads === count &&
                    styles.activeGridOption,
                ]}
                onPress={() => saveSettings({ maxConcurrentDownloads: count })}
                disabled={saving}
              >
                <Text
                  style={[
                    styles.gridOptionText,
                    settings.maxConcurrentDownloads === count &&
                      styles.activeGridOptionText,
                  ]}
                >
                  {count}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {/* Auto Download Bookmarked */}
          <View style={styles.option}>
            <Ionicons name="bookmark-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>
              Auto-download bookmarked manga
            </Text>
            <Switch
              value={settings.autoDownloadBookmarked}
              onValueChange={(value) =>
                saveSettings({ autoDownloadBookmarked: value })
              }
              trackColor={{
                false: colors.border,
                true: accentColor || colors.primary,
              }}
              thumbColor={
                settings.autoDownloadBookmarked ? '#FFFFFF' : undefined
              }
              disabled={saving}
            />
          </View>

          {/* Enable Background Downloads */}
          <View style={styles.option}>
            <Ionicons
              name="cloud-download-outline"
              size={24}
              color={colors.text}
            />
            <Text style={styles.optionText}>Enable background downloads</Text>
            <Switch
              value={settings.enableBackgroundDownloads}
              onValueChange={(value) =>
                saveSettings({ enableBackgroundDownloads: value })
              }
              trackColor={{
                false: colors.border,
                true: accentColor || colors.primary,
              }}
              thumbColor={
                settings.enableBackgroundDownloads ? '#FFFFFF' : undefined
              }
              disabled={saving}
            />
          </View>
        </View>

        {/* Auto Cleanup Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Auto Cleanup</Text>

          {/* Enable Auto Cleanup */}
          <View style={styles.option}>
            <Ionicons name="trash-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Enable auto cleanup</Text>
            <Switch
              value={settings.autoCleanupEnabled}
              onValueChange={(value) =>
                saveSettings({ autoCleanupEnabled: value })
              }
              trackColor={{
                false: colors.border,
                true: accentColor || colors.primary,
              }}
              thumbColor={settings.autoCleanupEnabled ? '#FFFFFF' : undefined}
              disabled={saving}
            />
          </View>

          {/* Auto Cleanup Days */}
          {settings.autoCleanupEnabled && (
            <>
              <Text style={styles.optionLabel}>
                Delete downloads older than
              </Text>
              <View style={styles.optionGrid}>
                {cleanupDaysOptions.map((days) => (
                  <TouchableOpacity
                    key={days}
                    style={[
                      styles.gridOption,
                      settings.autoCleanupDays === days &&
                        styles.activeGridOption,
                    ]}
                    onPress={() => saveSettings({ autoCleanupDays: days })}
                    disabled={saving}
                  >
                    <Text
                      style={[
                        styles.gridOptionText,
                        settings.autoCleanupDays === days &&
                          styles.activeGridOptionText,
                      ]}
                    >
                      {days}d
                    </Text>
                  </TouchableOpacity>
                ))}
              </View>
            </>
          )}
        </View>

        {/* Storage Actions Section */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Storage Actions</Text>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={() => loadStorageStats()}
            disabled={storageLoading}
          >
            <Ionicons name="refresh-outline" size={24} color={colors.text} />
            <Text style={styles.actionButtonText}>Refresh Storage Stats</Text>
            {storageLoading && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
          </TouchableOpacity>

          <TouchableOpacity
            style={styles.actionButton}
            onPress={handleCleanupOldDownloads}
            disabled={
              storageLoading ||
              !storageStats ||
              storageStats.totalChapters === 0
            }
          >
            <Ionicons name="trash-outline" size={24} color={colors.text} />
            <Text style={styles.actionButtonText}>Cleanup Old Downloads</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[styles.actionButton, styles.dangerButton]}
            onPress={handleClearAllDownloads}
            disabled={
              storageLoading ||
              !storageStats ||
              storageStats.totalChapters === 0
            }
          >
            <Ionicons name="trash" size={24} color={colors.notification} />
            <Text style={[styles.actionButtonText, styles.dangerButtonText]}>
              Clear All Downloads
            </Text>
          </TouchableOpacity>
        </View>

        {/* Reset Section */}
        <View style={styles.section}>
          <TouchableOpacity
            style={[styles.actionButton, styles.dangerButton]}
            onPress={handleResetSettings}
            disabled={saving}
          >
            <Ionicons name="refresh" size={24} color={colors.notification} />
            <Text style={[styles.actionButtonText, styles.dangerButtonText]}>
              Reset to Defaults
            </Text>
          </TouchableOpacity>
        </View>

        {/* Bottom spacing */}
        <View style={styles.bottomSpacing} />
      </ScrollView>

      {saving && (
        <View style={styles.savingOverlay}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={styles.savingText}>Saving...</Text>
        </View>
      )}
    </View>
  );
}

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.card,
    },
    centered: {
      justifyContent: 'center',
      alignItems: 'center',
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 15,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    backButton: {
      marginRight: 15,
    },
    title: {
      fontSize: 20,
      fontWeight: '600',
      color: colors.text,
    },
    loadingText: {
      marginTop: 10,
      fontSize: 16,
      color: colors.text,
    },
    scrollView: {
      flex: 1,
    },
    scrollViewContent: {
      paddingHorizontal: 20,
      paddingVertical: 20,
    },
    section: {
      marginBottom: 30,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      marginBottom: 15,
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
      fontWeight: '500',
    },
    optionLabel: {
      fontSize: 16,
      fontWeight: '500',
      marginBottom: 10,
      color: colors.text,
    },
    optionGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      marginBottom: 15,
      gap: 10,
    },
    gridOption: {
      paddingHorizontal: 16,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      minWidth: 60,
      alignItems: 'center',
    },
    activeGridOption: {
      borderColor: colors.primary,
      backgroundColor: colors.primary + '20',
    },
    gridOptionText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text,
    },
    activeGridOptionText: {
      color: colors.primary,
    },
    storageStatsContainer: {
      backgroundColor: colors.background,
      borderRadius: 12,
      padding: 16,
      marginBottom: 20,
    },
    storageStatsHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 12,
    },
    storageStatsTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    storageBar: {
      height: 8,
      backgroundColor: colors.border,
      borderRadius: 4,
      marginBottom: 12,
      overflow: 'hidden',
    },
    storageBarFill: {
      height: '100%',
      borderRadius: 4,
    },
    storageStatsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 6,
    },
    storageStatsLabel: {
      fontSize: 14,
      color: colors.text,
    },
    storageStatsValue: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.primary,
    },
    actionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 15,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    actionButtonText: {
      fontSize: 16,
      marginLeft: 15,
      flex: 1,
      color: colors.text,
    },
    dangerButton: {},
    dangerButtonText: {
      color: colors.notification,
    },
    bottomSpacing: {
      height: 50,
    },
    savingOverlay: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      backgroundColor: colors.card + 'CC',
      justifyContent: 'center',
      alignItems: 'center',
    },
    savingText: {
      marginTop: 10,
      fontSize: 16,
      color: colors.text,
    },
    noteText: {
      fontSize: 14,
      color: colors.text,
      marginTop: 10,
      opacity: 0.7,
    },
  });
