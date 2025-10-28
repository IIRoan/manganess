import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  useColorScheme,
  Switch,
  Platform,
  Alert,
} from 'react-native';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import { chapterStorageService } from '@/services/chapterStorageService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import BackButton from '@/components/BackButton';
import type { DownloadSettings } from '@/types/download';

export default function DownloadSettingsScreen() {
  const { theme, accentColor } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme =
    theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();

  const [settings, setSettings] = useState<DownloadSettings | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    try {
      setIsLoading(true);
      const currentSettings = await chapterStorageService.getDownloadSettings();
      setSettings(currentSettings);
    } catch (error) {
      console.error('Error loading download settings:', error);
      Alert.alert('Error', 'Failed to load settings');
    } finally {
      setIsLoading(false);
    }
  };

  const updateSetting = async (
    key: keyof DownloadSettings,
    value: any
  ): Promise<void> => {
    if (!settings) return;

    try {
      const newSettings = { ...settings, [key]: value };
      setSettings(newSettings);

      await chapterStorageService.updateDownloadSettings({ [key]: value });
    } catch (error) {
      console.error('Error updating setting:', error);
      Alert.alert('Error', 'Failed to update setting');
      // Revert on error
      loadSettings();
    }
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (isLoading || !settings) {
    return (
      <View style={[styles.container, { paddingTop: insets.top }]}>
        <View style={styles.header}>
          <BackButton />
          <Text style={styles.title}>Download Settings</Text>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <View style={styles.header}>
        <BackButton />
        <Text style={styles.title}>Download Settings</Text>
      </View>

      <ScrollView style={styles.scrollView}>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Download Behavior</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Max Concurrent Downloads</Text>
              <Text style={styles.settingDescription}>
                Currently: {settings.maxConcurrentDownloads}
              </Text>
            </View>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Download Quality</Text>
              <Text style={styles.settingDescription}>
                {settings.downloadQuality === 'original'
                  ? 'Original Quality'
                  : 'Compressed'}
              </Text>
            </View>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Background Downloads</Text>
              <Text style={styles.settingDescription}>
                Allow downloads to continue in background
              </Text>
            </View>
            <Switch
              value={settings.enableBackgroundDownloads}
              onValueChange={(value) =>
                updateSetting('enableBackgroundDownloads', value)
              }
              trackColor={{
                false: colors.border,
                true: accentColor || colors.primary,
              }}
              thumbColor={
                settings.enableBackgroundDownloads && Platform.OS === 'android'
                  ? '#FFFFFF'
                  : undefined
              }
            />
          </View>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Storage Management</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Max Storage Size</Text>
              <Text style={styles.settingDescription}>
                {formatFileSize(settings.maxStorageSize)}
              </Text>
            </View>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Storage Warning Threshold</Text>
              <Text style={styles.settingDescription}>
                {settings.storageWarningThreshold}% of max storage
              </Text>
            </View>
          </View>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>Auto Cleanup</Text>
              <Text style={styles.settingDescription}>
                Automatically remove old downloads
              </Text>
            </View>
            <Switch
              value={settings.autoCleanupEnabled}
              onValueChange={(value) =>
                updateSetting('autoCleanupEnabled', value)
              }
              trackColor={{
                false: colors.border,
                true: accentColor || colors.primary,
              }}
              thumbColor={
                settings.autoCleanupEnabled && Platform.OS === 'android'
                  ? '#FFFFFF'
                  : undefined
              }
            />
          </View>

          {settings.autoCleanupEnabled && (
            <View style={styles.settingRow}>
              <View style={styles.settingInfo}>
                <Text style={styles.settingLabel}>Auto Cleanup Days</Text>
                <Text style={styles.settingDescription}>
                  Remove downloads older than {settings.autoCleanupDays} days
                </Text>
              </View>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Automatic Downloads</Text>

          <View style={styles.settingRow}>
            <View style={styles.settingInfo}>
              <Text style={styles.settingLabel}>
                Auto-download Bookmarked Manga
              </Text>
              <Text style={styles.settingDescription}>
                Automatically download new chapters
              </Text>
            </View>
            <Switch
              value={settings.autoDownloadBookmarked}
              onValueChange={(value) =>
                updateSetting('autoDownloadBookmarked', value)
              }
              trackColor={{
                false: colors.border,
                true: accentColor || colors.primary,
              }}
              thumbColor={
                settings.autoDownloadBookmarked && Platform.OS === 'android'
                  ? '#FFFFFF'
                  : undefined
              }
            />
          </View>
        </View>

        <View style={styles.infoBox}>
          <Text style={styles.infoText}>
            Note: Download settings are applied to new downloads. Existing
            downloads are not affected.
          </Text>
        </View>
      </ScrollView>
    </View>
  );
}

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 20,
      paddingVertical: 15,
      backgroundColor: colors.card,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    title: {
      fontSize: 24,
      fontWeight: 'bold',
      color: colors.text,
      marginLeft: 15,
    },
    scrollView: {
      flex: 1,
    },
    section: {
      backgroundColor: colors.card,
      marginTop: 16,
      marginHorizontal: 16,
      borderRadius: 12,
      padding: 16,
      borderWidth: 1,
      borderColor: colors.border,
    },
    sectionTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 16,
    },
    settingRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    settingInfo: {
      flex: 1,
      marginRight: 16,
    },
    settingLabel: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 4,
    },
    settingDescription: {
      fontSize: 14,
      color: colors.tabIconDefault,
    },
    infoBox: {
      backgroundColor: colors.card,
      margin: 16,
      padding: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
    },
    infoText: {
      fontSize: 14,
      color: colors.tabIconDefault,
      lineHeight: 20,
    },
  });
