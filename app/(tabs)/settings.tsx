import React, { useState, useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  useColorScheme,
  Image,
  Switch,
  Platform,
  ActivityIndicator,
} from 'react-native';
import { useTheme, Theme } from '@/hooks/useTheme';
import { useToast } from '@/hooks/useToast';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ColorScheme } from '@/constants/Colors';
import {
  getDebugTabEnabled,
  setDebugTabEnabled,
  getDefaultLayout,
  setDefaultLayout,
} from '@/services/settingsService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import Reanimated, { FadeInDown } from 'react-native-reanimated';
import * as AniListOAuth from '@/services/anilistOAuth';
import { syncAllMangaWithAniList } from '@/services/anilistService';

import Svg, { Path } from 'react-native-svg';
import CustomColorPicker from '@/components/CustomColorPicker';
import { logger } from '@/utils/logger';

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
  const router = useRouter();
  const { showToast } = useToast();
  const [user, setUser] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);
  const insets = useSafeAreaInsets();
  const [enableDebugTab, setEnableDebugTab] = useState<boolean>(false);
  const [colorPickerVisible, setColorPickerVisible] = useState(false);
  const [defaultLayout, setDefaultLayoutState] = useState<'grid' | 'list'>(
    'list'
  );
  const [selectedColor, setSelectedColor] = useState<string>(
    accentColor || colors.primary
  );

  const themeOptions: ThemeOption[] = [
    { label: 'Light', value: 'light', icon: 'sunny-outline' },
    { label: 'Dark', value: 'dark', icon: 'moon-outline' },
    { label: 'System', value: 'system', icon: 'phone-portrait-outline' },
  ];

  useEffect(() => {
    loadEnableDebugTabSetting();
    loadDefaultLayoutSetting();
    checkLoginStatus();

    // Update selected color when accentColor changes
    if (accentColor) {
      setSelectedColor(accentColor);
    }
  }, [accentColor]);

  const loadEnableDebugTabSetting = async () => {
    try {
      const enabled = await getDebugTabEnabled();
      logger().debug('Service', 'Loaded enableDebugTab', { enabled });
      setEnableDebugTab(enabled);
    } catch (error) {
      logger().error('Service', 'Error loading enable debug tab setting', {
        error,
      });
    }
  };

  const loadDefaultLayoutSetting = async () => {
    try {
      const layout = await getDefaultLayout();
      setDefaultLayoutState(layout);
    } catch (error) {
      logger().error('Service', 'Error loading default layout setting', {
        error,
      });
    }
  };

  const toggleEnableDebugTab = async (value: boolean) => {
    try {
      await setDebugTabEnabled(value);
      logger().debug('Service', 'Saved enableDebugTab', { value });
      setEnableDebugTab(value);
      showToast({
        message: `Debug tab ${value ? 'enabled' : 'disabled'} please restart`,
        type: 'success',
        icon: value ? 'bug' : 'close-circle',
        duration: 2000,
      });
    } catch (error) {
      logger().error('Service', 'Error toggling enable debug tab setting', {
        error,
      });
      showToast({
        message: 'Failed to update debug tab setting',
        type: 'error',
      });
    }
  };

  const handleLayoutChange = async (layout: 'grid' | 'list') => {
    try {
      await setDefaultLayout(layout);
      setDefaultLayoutState(layout);
    } catch (error) {
      logger().error('Service', 'Error saving default layout setting', {
        error,
      });
    }
  };

  //Anilist Functions
  const checkLoginStatus = async () => {
    const authData = await AniListOAuth.getAuthData();
    if (authData) {
      try {
        const userData = await AniListOAuth.getCurrentUser();
        setUser(userData.data.Viewer);
      } catch (error) {
        logger().error('Service', 'Error fetching user data', { error });
      }
    }
  };

  const handleAniListLogin = async () => {
    try {
      const authData = await AniListOAuth.loginWithAniList();
      if (authData) {
        const userData = await AniListOAuth.getCurrentUser();
        setUser(userData.data.Viewer);
        showToast({
          message: 'Successfully logged in to AniList!',
          type: 'success',
          icon: 'checkmark-circle',
          duration: 2500,
        });
      }
    } catch (error: unknown) {
      logger().error('Service', 'AniList login error', { error });
      if (error instanceof Error) {
        if (error.message.includes('cancelled')) {
          showToast({
            message: 'Login cancelled by user',
            type: 'info',
            duration: 2000,
          });
        } else {
          showToast({
            message: `Failed to login with AniList: ${error.message}`,
            type: 'error',
            duration: 3000,
          });
        }
      }
    }
  };

  const handleAniListLogout = async () => {
    try {
      await AniListOAuth.logout();
      setUser(null);
      showToast({
        message: 'Successfully logged out from AniList',
        type: 'success',
        icon: 'log-out-outline',
        duration: 2000,
      });
    } catch (error: unknown) {
      logger().error('Service', 'AniList logout error', { error });
      showToast({
        message: 'Failed to logout from AniList',
        type: 'error',
      });
    }
  };

  const handleSyncAllManga = async () => {
    try {
      setIsSyncing(true);
      await syncAllMangaWithAniList();
      showToast({
        message: 'Manga synced with AniList successfully!',
        type: 'success',
        icon: 'checkmark-circle',
        duration: 2500,
      });
    } catch (error) {
      logger().error('Service', 'Error syncing manga', { error });
      showToast({
        message: `Failed to sync manga: ${error instanceof Error ? error.message : 'Unknown error'}`,
        type: 'error',
        duration: 3000,
      });
    } finally {
      setIsSyncing(false);
    }
  };

  const handleColorSelected = (color: string) => {
    setSelectedColor(color);
    setAccentColor(color);
    setColorPickerVisible(false);
  };

  const handleThemeChange = (newTheme: Theme) => {
    setTheme(newTheme);
  };

  const handleResetAccentColor = () => {
    setAccentColor(undefined);
    setSelectedColor(colors.primary);
    showToast({
      message: 'Accent color reset to default',
      type: 'success',
      icon: 'checkmark',
      duration: 2000,
    });
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

      <Reanimated.ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollViewContent}
        showsVerticalScrollIndicator={false}
      >
        <Reanimated.Text
          entering={FadeInDown.delay(100).springify()}
          style={styles.title}
        >
          Settings
        </Reanimated.Text>

        <Reanimated.View
          entering={FadeInDown.delay(200).springify()}
          style={styles.section}
        >
          <Text style={styles.sectionTitle}>Appearance</Text>
          <View style={styles.subsection}>
            <Text style={styles.subsectionTitle}>Default Layout</Text>
            <View style={styles.segmentedControl}>
              <TouchableOpacity
                style={[
                  styles.segmentButton,
                  defaultLayout === 'list' && {
                    backgroundColor: accentColor || colors.primary,
                  },
                ]}
                onPress={() => handleLayoutChange('list')}
              >
                <Ionicons
                  name="list"
                  size={20}
                  color={
                    defaultLayout === 'list' ? '#FFFFFF' : colors.tabIconDefault
                  }
                />
                <Text
                  style={[
                    styles.segmentText,
                    defaultLayout === 'list' && styles.activeSegmentText,
                    {
                      color:
                        defaultLayout === 'list'
                          ? '#FFFFFF'
                          : colors.tabIconDefault,
                    },
                  ]}
                >
                  List
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.segmentButton,
                  defaultLayout === 'grid' && {
                    backgroundColor: accentColor || colors.primary,
                  },
                ]}
                onPress={() => handleLayoutChange('grid')}
              >
                <Ionicons
                  name="grid"
                  size={20}
                  color={
                    defaultLayout === 'grid' ? '#FFFFFF' : colors.tabIconDefault
                  }
                />
                <Text
                  style={[
                    styles.segmentText,
                    defaultLayout === 'grid' && styles.activeSegmentText,
                    {
                      color:
                        defaultLayout === 'grid'
                          ? '#FFFFFF'
                          : colors.tabIconDefault,
                    },
                  ]}
                >
                  Grid
                </Text>
              </TouchableOpacity>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Theme</Text>
          {themeOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[
                styles.option,
                theme === option.value && styles.activeOption,
              ]}
              onPress={() => handleThemeChange(option.value)}
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
              onPress={handleResetAccentColor}
            >
              <Ionicons name="refresh-outline" size={24} color={colors.text} />
              <Text style={styles.optionText}>Reset to Default Color</Text>
            </TouchableOpacity>
          )}
        </Reanimated.View>

        <Reanimated.View
          entering={FadeInDown.delay(300).springify()}
          style={styles.section}
        >
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
        </Reanimated.View>

        <Reanimated.View
          entering={FadeInDown.delay(400).springify()}
          style={styles.section}
        >
          <Text style={styles.sectionTitle}>Storage Management</Text>
          <TouchableOpacity
            style={styles.option}
            onPress={() => router.push('/downloads')}
          >
            <Ionicons name="download" size={24} color={colors.text} />
            <Text style={styles.optionText}>Manage Stored Data</Text>
            <Ionicons name="chevron-forward" size={24} color={colors.text} />
          </TouchableOpacity>
        </Reanimated.View>

        <Reanimated.View
          entering={FadeInDown.delay(500).springify()}
          style={styles.section}
        >
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
        </Reanimated.View>
        {/* Add bottom padding space */}
        <View style={styles.bottomSpacing} />
      </Reanimated.ScrollView>
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
      paddingHorizontal: 16,
    },
    colorPreview: {
      width: 30,
      height: 30,
      borderRadius: 15,
      borderWidth: 1,
      borderColor: colors.border,
    },
    title: {
      fontSize: 26,
      fontWeight: 'bold',
      marginBottom: 24,
      color: colors.text,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 20,
      fontWeight: '600',
      marginBottom: 16,
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
    subsection: {
      marginBottom: 16,
    },
    subsectionTitle: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.text,
      marginBottom: 12,
    },
    segmentedControl: {
      flexDirection: 'row',
      backgroundColor: colors.background,
      borderRadius: 8,
      padding: 4,
      borderWidth: 1,
      borderColor: colors.border,
    },
    segmentButton: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 6,
      gap: 8,
    },
    segmentText: {
      fontSize: 14,
      fontWeight: '500',
    },
    activeSegmentText: {
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
    userInfo: {
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 16,
      backgroundColor: colors.background,
      padding: 12,
      borderRadius: 12,
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
      borderRadius: 12,
      marginTop: 12,
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
      borderRadius: 12,
      marginTop: 16,
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
  });
