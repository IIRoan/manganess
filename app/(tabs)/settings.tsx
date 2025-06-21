import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  useColorScheme,
  Image,
  Alert,
  Switch,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useTheme, Theme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ColorScheme } from '@/constants/Colors';
import {
  getDebugTabEnabled,
  setDebugTabEnabled,
  exportAppData,
  importAppData,
  clearAppData,
  migrateToNewStorage,
  refreshMangaImages,
} from '@/services/settingsService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AniListOAuth from '@/services/anilistOAuth';
import { syncAllMangaWithAniList } from '@/services/anilistService';

import Svg, { Path } from 'react-native-svg';
import * as FileSystem from 'expo-file-system';
import * as DocumentPicker from 'expo-document-picker';
import * as Sharing from 'expo-sharing';
import CustomColorPicker from '@/components/CustomColorPicker';
import { imageCache } from '@/services/CacheImages';

/* Type Definitions */
interface ThemeOption {
  label: string;
  value: Theme;
  icon: string;
}

export default function SettingsScreen() {
  const { theme, setTheme, accentColor, setAccentColor } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme =
    theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);
  const [user, setUser] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isMigrating, setIsMigrating] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const insets = useSafeAreaInsets();
  const [enableDebugTab, setEnableDebugTab] = useState<boolean>(false);
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [selectedColor, setSelectedColor] = useState<string>(
    accentColor || colors.primary
  );
  const [cacheStats, setCacheStats] = useState<any>(null);
  const [isCacheLoading, setIsCacheLoading] = useState(false);

  const themeOptions: ThemeOption[] = [
    { label: 'Light', value: 'light', icon: 'sunny-outline' },
    { label: 'Dark', value: 'dark', icon: 'moon-outline' },
    { label: 'System', value: 'system', icon: 'phone-portrait-outline' },
  ];

  useEffect(() => {
    loadEnableDebugTabSetting();
    checkLoginStatus();
    loadCacheStats();

    // Update selected color when accentColor changes
    if (accentColor) {
      setSelectedColor(accentColor);
    }
  }, [accentColor]);

  const loadCacheStats = async () => {
    try {
      const stats = await imageCache.getCacheStats();
      setCacheStats(stats);
    } catch (error) {
      console.error('Error loading cache stats:', error);
    }
  };

  const handleClearImageCache = (context?: 'search' | 'manga') => {
    const contextName =
      context === 'search'
        ? 'search cache'
        : context === 'manga'
          ? 'manga cache'
          : 'all image cache';

    Alert.alert(
      'Clear Image Cache',
      `Are you sure you want to clear the ${contextName}? This will free up storage space but images will need to be downloaded again.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear',
          style: 'destructive',
          onPress: async () => {
            try {
              setIsCacheLoading(true);
              await imageCache.clearCache(context);
              // Force reload cache stats immediately
              const newStats = await imageCache.getCacheStats();
              setCacheStats(newStats);
              Alert.alert(
                'Success',
                `${contextName.charAt(0).toUpperCase() + contextName.slice(1)} cleared successfully.`
              );
            } catch (error) {
              console.error('Error clearing cache:', error);
              Alert.alert('Error', `Failed to clear ${contextName}.`);
            } finally {
              setIsCacheLoading(false);
            }
          },
        },
      ]
    );
  };

  const formatFileSize = (bytes: number): string => {
    if (bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const formatDate = (timestamp: number): string => {
    if (!timestamp) return 'Never';
    return new Date(timestamp).toLocaleDateString();
  };

  const loadEnableDebugTabSetting = async () => {
    try {
      const enabled = await getDebugTabEnabled();
      console.log('Loaded enableDebugTab:', enabled);
      setEnableDebugTab(enabled);
    } catch (error) {
      console.error('Error loading enable debug tab setting:', error);
    }
  };

  const toggleEnableDebugTab = async (value: boolean) => {
    try {
      await setDebugTabEnabled(value);
      console.log('Saved enableDebugTab:', value);
      setEnableDebugTab(value);
    } catch (error) {
      console.error('Error toggling enable debug tab setting:', error);
    }
  };

  const handleExportData = async () => {
    try {
      const exportedData = await exportAppData();

      // Create JSON file
      const jsonString = JSON.stringify(exportedData, null, 2);
      const fileName = `manganess_${new Date().toISOString().split('T')[0]}.json`;
      const filePath = `${FileSystem.documentDirectory}${fileName}`;

      // Write file
      await FileSystem.writeAsStringAsync(filePath, jsonString);

      // Share file
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(filePath, {
          mimeType: 'application/json',
          dialogTitle: 'Export App Data',
        });
      }
    } catch (error) {
      console.error('Export error:', error);
      Alert.alert('Error', 'Failed to export data');
    }
  };

  const handleImportData = async () => {
    try {
      const result = await DocumentPicker.getDocumentAsync({
        type: 'application/json',
      });

      if (result.canceled) return;

      const fileContent = await FileSystem.readAsStringAsync(
        result.assets[0].uri
      );
      const importedData = JSON.parse(fileContent);

      Alert.alert(
        'Import Data',
        'This will replace all existing data. Continue?',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Import',
            onPress: async () => {
              await importAppData(importedData);
              Alert.alert('Success', 'Data imported! Please restart the app');
            },
          },
        ]
      );
    } catch (error) {
      console.error('Import error:', error);
      Alert.alert('Error', 'Failed to import data');
    }
  };

  const handleClearData = () => {
    Alert.alert(
      'Clear App Data',
      'Are you sure you want to clear all app data? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'OK',
          onPress: async () => {
            try {
              await clearAppData();
              Alert.alert('Success', 'All app data has been cleared.');
            } catch (error) {
              console.error('Error clearing app data:', error);
              Alert.alert('Error', 'Failed to clear app data.');
            }
          },
        },
      ]
    );
  };

  //Anilist Functions
  const checkLoginStatus = async () => {
    const authData = await AniListOAuth.getAuthData();
    if (authData) {
      try {
        const userData = await AniListOAuth.getCurrentUser();
        setUser(userData.data.Viewer);
      } catch (error) {
        console.error('Error fetching user data:', error);
      }
    }
  };

  const handleAniListLogin = async () => {
    try {
      const authData = await AniListOAuth.loginWithAniList();
      if (authData) {
        const userData = await AniListOAuth.getCurrentUser();
        setUser(userData.data.Viewer);
        Alert.alert('Success', 'Successfully logged in to AniList!');
      }
    } catch (error: unknown) {
      console.error('AniList login error:', error);
      if (error instanceof Error) {
        if (error.message.includes('cancelled')) {
          Alert.alert('Cancelled', 'Login was cancelled by user');
        } else {
          Alert.alert(
            'Error',
            `Failed to login with AniList: ${error.message}`
          );
        }
      }
    }
  };

  const handleAniListLogout = async () => {
    try {
      await AniListOAuth.logout();
      setUser(null);
    } catch (error: unknown) {
      console.error('AniList logout error:', error);
      Alert.alert('Error', 'Failed to logout');
    }
  };

  const handleSyncAllManga = async () => {
    try {
      setIsSyncing(true);
      const results = await syncAllMangaWithAniList();
      Alert.alert('Sync Results', results.join('\n'));
    } catch (error) {
      console.error('Error syncing manga:', error);
      Alert.alert(
        'Error',
        `Failed to sync manga: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    } finally {
      setIsSyncing(false);
    }
  };

  const handleColorSelected = (color: string) => {
    setSelectedColor(color);
    setAccentColor(color);
    setColorPickerVisible(false);
  };

  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      {/* Custom Color Picker */}
      <CustomColorPicker
        visible={colorPickerVisible}
        onClose={() => setColorPickerVisible(false)}
        onColorSelected={handleColorSelected}
        initialColor={selectedColor}
        colors={colors}
      />

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
      >
        <Text style={styles.title}>Settings</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Theme</Text>
          {themeOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.option,
                theme === option.value && styles.activeOption,
              ]}
              onPress={() => setTheme(option.value)}
            >
              <Ionicons
                name={option.icon as keyof typeof Ionicons.glyphMap}
                size={24}
                color={theme === option.value ? colors.primary : colors.text}
              />
              <Text
                style={[
                  styles.optionText,
                  theme === option.value && styles.activeOptionText,
                ]}
              >
                {option.label}
              </Text>
              {theme === option.value && (
                <Ionicons name="checkmark" size={24} color={colors.primary} />
              )}
            </TouchableOpacity>
          ))}

          <TouchableOpacity
            style={[styles.option, { borderBottomWidth: 0 }]}
            onPress={() => setColorPickerVisible(true)}
          >
            <Ionicons
              name="color-palette-outline"
              size={24}
              color={colors.text}
            />
            <Text style={styles.optionText}>Accent Color</Text>
            <View
              style={[styles.colorPreview, { backgroundColor: selectedColor }]}
            />
          </TouchableOpacity>

          {/* Reset accent color button */}
          {accentColor && (
            <TouchableOpacity
              style={[styles.option, { borderBottomWidth: 0, marginTop: -10 }]}
              onPress={() => setAccentColor(undefined)}
            >
              <Ionicons name="refresh-outline" size={24} color={colors.text} />
              <Text style={styles.optionText}>Reset to Default Color</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AniList Integration</Text>
          {user ? (
            <>
              <View style={styles.userInfo}>
                <Image
                  source={{ uri: user.avatar.large }}
                  style={styles.avatar}
                />
                <Text style={styles.username}>{user.name}</Text>
              </View>
              <TouchableOpacity
                style={styles.option}
                onPress={handleAniListLogout}
              >
                <Ionicons
                  name="log-out-outline"
                  size={24}
                  color={colors.text}
                />
                <Text style={styles.optionText}>Logout from AniList</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.syncButton, isSyncing && styles.disabledButton]}
                onPress={handleSyncAllManga}
                disabled={isSyncing}
              >
                <View style={styles.buttonContent}>
                  <Ionicons name="sync-outline" size={24} color={colors.card} />
                  <Text style={styles.syncButtonText}>
                    Sync All Manga with AniList
                  </Text>
                  {isSyncing && (
                    <ActivityIndicator
                      size="small"
                      color={colors.card}
                      style={styles.spinner}
                    />
                  )}
                </View>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.loginButton}
              onPress={handleAniListLogin}
            >
              <View style={styles.buttonContent}>
                <Svg width={24} height={24} viewBox="0 0 24 24">
                  <Path
                    fill={colors.card}
                    d="M6.361 2.943 0 21.056h4.942l1.077-3.133H11.4l1.052 3.133H22.9c.71 0 1.1-.392 1.1-1.101V17.53c0-.71-.39-1.101-1.1-1.101h-6.483V4.045c0-.71-.392-1.102-1.101-1.102h-2.422c-.71 0-1.101.392-1.101 1.102v1.064l-.758-2.166zm2.324 5.948 1.688 5.018H7.144z"
                  />
                </Svg>
                <Text style={styles.loginButtonText}>Login with AniList</Text>
              </View>
            </TouchableOpacity>
          )}
          <Text style={styles.noteText}>
            Note: AniList integration is still W.I.P
          </Text>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Image Cache Management</Text>
          {cacheStats && (
            <View style={styles.cacheStatsContainer}>
              <Text style={styles.cacheStatsTitle}>Cache Statistics</Text>
              <View style={styles.cacheStatsRow}>
                <Text style={styles.cacheStatsLabel}>Total Size:</Text>
                <Text style={styles.cacheStatsValue}>
                  {formatFileSize(cacheStats.totalSize)}
                </Text>
              </View>
              <View style={styles.cacheStatsRow}>
                <Text style={styles.cacheStatsLabel}>Total Files:</Text>
                <Text style={styles.cacheStatsValue}>
                  {cacheStats.totalFiles}
                </Text>
              </View>
              <View style={styles.cacheStatsRow}>
                <Text style={styles.cacheStatsLabel}>Manga Images:</Text>
                <Text style={styles.cacheStatsValue}>
                  {cacheStats.mangaCount}
                </Text>
              </View>
              <View style={styles.cacheStatsRow}>
                <Text style={styles.cacheStatsLabel}>Search Cache:</Text>
                <Text style={styles.cacheStatsValue}>
                  {cacheStats.searchCount}
                </Text>
              </View>
              {cacheStats.oldestEntry > 0 && (
                <View style={styles.cacheStatsRow}>
                  <Text style={styles.cacheStatsLabel}>Oldest Entry:</Text>
                  <Text style={styles.cacheStatsValue}>
                    {formatDate(cacheStats.oldestEntry)}
                  </Text>
                </View>
              )}
            </View>
          )}
          <TouchableOpacity
            style={styles.option}
            onPress={() => handleClearImageCache('search')}
            disabled={isCacheLoading}
          >
            <Ionicons name="images-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Clear Search Cache</Text>
            {isCacheLoading && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.option}
            onPress={() => handleClearImageCache('manga')}
            disabled={isCacheLoading}
          >
            <Ionicons name="library-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Clear Manga Cache</Text>
            {isCacheLoading && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.option}
            onPress={() => handleClearImageCache()}
            disabled={isCacheLoading}
          >
            <Ionicons
              name="trash-outline"
              size={24}
              color={colors.notification}
            />
            <Text style={styles.optionText}>Clear All Image Cache</Text>
            {isCacheLoading && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.option}
            onPress={async () => {
              try {
                setIsCacheLoading(true);
                const newStats = await imageCache.getCacheStats();
                setCacheStats(newStats);
              } catch (error) {
                console.error('Error refreshing cache stats:', error);
              } finally {
                setIsCacheLoading(false);
              }
            }}
            disabled={isCacheLoading}
          >
            <Ionicons name="refresh-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Refresh Cache Stats</Text>
            {isCacheLoading && (
              <ActivityIndicator size="small" color={colors.primary} />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Management</Text>
          <TouchableOpacity style={styles.option} onPress={handleExportData}>
            <Ionicons name="download-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Export App Data</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.option} onPress={handleImportData}>
            <Ionicons name="cloud-upload" size={24} color={colors.text} />
            <Text style={styles.optionText}>Import App Data</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.option} onPress={handleClearData}>
            <Ionicons
              name="trash-outline"
              size={24}
              color={colors.notification}
            />
            <Text style={styles.optionText}>Clear App Data</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.option}
            disabled={isRefreshing}
            onPress={async () => {
              try {
                setIsRefreshing(true);
                const result = await refreshMangaImages();
                Alert.alert(
                  result.success ? 'Success' : 'Error',
                  result.message
                );
              } catch {
                Alert.alert('Error', 'Failed to refresh manga images');
              } finally {
                setIsRefreshing(false);
              }
            }}
          >
            <Ionicons name="refresh-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Refresh Manga Images</Text>
            {isRefreshing && (
              <ActivityIndicator
                size="small"
                color={colors.primary}
                style={styles.spinner}
              />
            )}
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.option, { borderBottomWidth: 0 }]}
            disabled={isMigrating}
            onPress={async () => {
              try {
                setIsMigrating(true);
                const result = await migrateToNewStorage();
                Alert.alert(
                  result.success ? 'Success' : 'Error',
                  result.message
                );
              } catch {
                Alert.alert('Error', 'Failed to migrate data');
              } finally {
                setIsMigrating(false);
              }
            }}
          >
            <Ionicons name="sync-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Migrate to New Storage Format</Text>
            {isMigrating && (
              <ActivityIndicator
                size="small"
                color={colors.primary}
                style={styles.spinner}
              />
            )}
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Developer Options</Text>
          <View style={styles.option}>
            <Ionicons name="bug-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Enable Debug Tab</Text>
            <Switch
              value={enableDebugTab}
              onValueChange={toggleEnableDebugTab}
              trackColor={{
                false: colors.border,
                true: accentColor || colors.primary,
              }}
              thumbColor={
                enableDebugTab && Platform.OS === 'android'
                  ? '#FFFFFF'
                  : undefined
              }
            />
          </View>
          <Text style={styles.noteText}>
            You need to restart the app for this setting to take effect.
          </Text>
        </View>
        {/* Add bottom padding space */}
        <View style={styles.bottomSpacing} />
      </ScrollView>
      <Image
        source={require('@/assets/images/nessie.png')}
        style={styles.nessieImage}
        resizeMode="contain"
      />
    </View>
  );
}

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.card,
    },
    scrollView: {
      flex: 1,
      paddingHorizontal: 20,
    },
    colorPreview: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
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
    activeOption: {},
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
    noteText: {
      fontSize: 14,
      color: colors.text,
      marginTop: 10,
    },
    scrollViewContent: {
      paddingBottom: 120,
    },
    bottomSpacing: {
      height: 80,
    },
    nessieImage: {
      position: 'absolute',
      bottom: 90,
      left: 20,
      width: 80,
      height: 80,
      opacity: 0.8,
      transform: [{ rotate: '-15deg' }],
    },
    clearDataButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      padding: 15,
      borderRadius: 10,
      marginTop: 10,
    },
    clearDataText: {
      fontSize: 16,
      marginLeft: 15,
      color: colors.notification,
      fontWeight: '600',
    },
    userInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 15,
      backgroundColor: colors.background,
      padding: 10,
      borderRadius: 10,
    },
    avatar: {
      width: 50,
      height: 50,
      borderRadius: 25,
      marginRight: 10,
    },
    username: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.text,
    },
    loginButton: {
      backgroundColor: colors.primary,
      padding: 15,
      borderRadius: 10,
      marginTop: 10,
    },
    loginButtonText: {
      color: colors.card,
      fontSize: 16,
      fontWeight: '600',
      marginLeft: 10,
    },
    syncButton: {
      backgroundColor: colors.primary,
      padding: 15,
      borderRadius: 10,
      marginTop: 15,
    },
    syncButtonText: {
      color: colors.card,
      fontSize: 16,
      fontWeight: '600',
      marginLeft: 10,
    },
    buttonContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    disabledButton: {
      opacity: 0.7,
    },
    spinner: {
      marginLeft: 10,
    },
    dataButton: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      padding: 15,
      borderRadius: 10,
      marginTop: 10,
      borderWidth: 1,
      borderColor: colors.border,
    },
    dataButtonText: {
      fontSize: 16,
      marginLeft: 15,
      color: colors.text,
      fontWeight: '600',
    },
    cacheStatsContainer: {
      backgroundColor: colors.background,
      borderRadius: 10,
      padding: 15,
      marginBottom: 15,
    },
    cacheStatsTitle: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 10,
    },
    cacheStatsRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginBottom: 5,
    },
    cacheStatsLabel: {
      fontSize: 14,
      color: colors.text,
    },
    cacheStatsValue: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.primary,
    },
  });
