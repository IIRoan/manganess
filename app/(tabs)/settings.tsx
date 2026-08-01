import { useState, useEffect, useCallback, useMemo } from 'react';
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
  LayoutChangeEvent,
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
  getReaderProfile,
  patchReaderProfile,
  getShowReaderSettingsButton,
  setShowReaderSettingsButton,
  DEFAULT_MANGA_READER_PROFILE,
  DEFAULT_MANHWA_READER_PROFILE,
} from '@/services/settingsService';
import type {
  ReadingMode,
  ProgressBarPosition,
  ReaderBackground,
  ReaderImageFit,
  ReaderContentProfile,
  ReaderProfileSettings,
} from '@/types/settings';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useRouter } from 'expo-router';
import { useFocusEffect } from 'expo-router/react-navigation';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import Reanimated, {
  Easing,
  FadeInDown,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useDerivedValue,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as AniListOAuth from '@/services/anilistOAuth';
import { syncAllMangaWithAniList } from '@/services/anilistService';

import Svg, { Path } from 'react-native-svg';
import CustomColorPicker from '@/components/CustomColorPicker';
import { logger } from '@/utils/logger';

const AnimatedView = Reanimated.createAnimatedComponent(View);

/* Type Definitions */
interface ThemeOption {
  label: string;
  value: Theme;
  icon: string;
}

interface ReadingModeOption {
  label: string;
  value: ReadingMode;
  icon: keyof typeof Ionicons.glyphMap;
}

interface ProgressOption {
  label: string;
  value: ProgressBarPosition;
}

const MANGA_READING_MODE_OPTIONS: ReadingModeOption[] = [
  { label: 'Auto', value: 'auto', icon: 'sparkles-outline' },
  { label: 'Vertical', value: 'vertical', icon: 'swap-vertical-outline' },
  { label: 'LTR', value: 'ltr', icon: 'arrow-forward-outline' },
  { label: 'RTL', value: 'rtl', icon: 'arrow-back-outline' },
];

const PROGRESS_BAR_OPTIONS: ProgressOption[] = [
  { label: 'None', value: 'none' },
  { label: 'Top', value: 'top' },
  { label: 'Bottom', value: 'bottom' },
];

const IMAGE_FIT_OPTIONS: Array<{
  label: string;
  value: ReaderImageFit;
  hint: string;
}> = [
  {
    label: 'Width',
    value: 'width',
    hint: 'Scale pages to screen width. Best for long-strip scrolling.',
  },
  {
    label: 'Height',
    value: 'height',
    hint: 'Scale pages to screen height. Useful for page-by-page reading.',
  },
  {
    label: 'Both',
    value: 'both',
    hint: 'Fit the whole page on screen without cropping.',
  },
  {
    label: 'Fill',
    value: 'fill',
    hint: 'Fill the screen and crop edges if needed.',
  },
];

const BACKGROUND_OPTIONS: Array<{
  label: string;
  value: ReaderBackground;
  swatch: string;
  hint: string;
}> = [
  {
    label: 'Theme',
    value: 'default',
    swatch: 'transparent',
    hint: 'Match the app light/dark theme around pages.',
  },
  {
    label: 'Black',
    value: 'black',
    swatch: '#000000',
    hint: 'True black gutters — easiest on eyes in dark rooms.',
  },
  {
    label: 'Gray',
    value: 'gray',
    swatch: '#2A2A2A',
    hint: 'Soft gray gutters with less contrast than black.',
  },
  {
    label: 'White',
    value: 'white',
    swatch: '#FFFFFF',
    hint: 'White gutters — closest to paper manga pages.',
  },
];

const DIM_PRESETS = [0, 15, 30, 45, 60] as const;

const PROGRESS_BAR_HINTS: Record<ProgressBarPosition, string> = {
  none: 'Hide the reading progress indicator.',
  top: 'Show chapter progress along the top edge.',
  bottom: 'Show chapter progress along the bottom edge.',
};

const MANGA_MODE_HINTS: Record<ReadingMode, string> = {
  auto: 'Detect layout from pages. Defaults to left-to-right page mode for manga.',
  vertical: 'Always use continuous vertical scrolling.',
  ltr: 'Page-by-page left to right. Tap right edge for next page.',
  rtl: 'Page-by-page right to left (traditional manga).',
};

const READER_PROFILE_TABS: Array<{
  key: ReaderContentProfile;
  label: string;
}> = [
  { key: 'manga', label: 'Manga' },
  { key: 'manhwa', label: 'Manhwa' },
];

/** Same snap timing as the Saved (bookmarks) section pager. */
const READER_PAGER_TIMING = {
  duration: 250,
  easing: Easing.out(Easing.cubic),
} as const;

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
  const [mangaReaderProfile, setMangaReaderProfile] =
    useState<ReaderProfileSettings>(DEFAULT_MANGA_READER_PROFILE);
  const [manhwaReaderProfile, setManhwaReaderProfile] =
    useState<ReaderProfileSettings>(DEFAULT_MANHWA_READER_PROFILE);
  const [showReaderSettingsButton, setShowReaderSettingsButtonState] =
    useState(true);
  const [readerProfileTab, setReaderProfileTab] =
    useState<ReaderContentProfile>('manga');
  const [readerPagerWidth, setReaderPagerWidth] = useState(0);
  const readerTranslateX = useSharedValue(0);
  const readerPagerWidthSV = useSharedValue(0);
  const readerMangaHeightSV = useSharedValue(0);
  const readerManhwaHeightSV = useSharedValue(0);
  const readerIsAnimating = useSharedValue(false);
  const readerStartX = useSharedValue(0);
  const readerPageIndex = useSharedValue(0);
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

  // Reload reader profiles whenever Settings is focused so changes from the
  // in-reader drawer stay in sync with this screen.
  useFocusEffect(
    useCallback(() => {
      loadReaderProfiles();
      loadDefaultLayoutSetting();
      loadShowReaderSettingsButton();
    }, [])
  );

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

  const loadReaderProfiles = async () => {
    try {
      const [manga, manhwa] = await Promise.all([
        getReaderProfile('manga'),
        getReaderProfile('manhwa'),
      ]);
      setMangaReaderProfile(manga);

      // Manhwa never uses LTR/RTL — normalize any bad persisted value.
      if (manhwa.readingMode === 'ltr' || manhwa.readingMode === 'rtl') {
        const normalized = await patchReaderProfile('manhwa', {
          readingMode: 'vertical',
        });
        setManhwaReaderProfile(normalized);
      } else {
        setManhwaReaderProfile(manhwa);
      }
    } catch (error) {
      logger().error('Service', 'Error loading reader profiles', { error });
    }
  };

  const loadShowReaderSettingsButton = async () => {
    try {
      const show = await getShowReaderSettingsButton();
      setShowReaderSettingsButtonState(show);
    } catch (error) {
      logger().error('Service', 'Error loading reader settings button preference', {
        error,
      });
    }
  };

  const handleShowReaderSettingsButtonChange = async (show: boolean) => {
    try {
      await setShowReaderSettingsButton(show);
      setShowReaderSettingsButtonState(show);
    } catch (error) {
      logger().error('Service', 'Error saving reader settings button preference', {
        error,
      });
      showToast({
        message: 'Failed to update reader settings button',
        type: 'error',
      });
    }
  };

  const updateReaderProfile = async (
    profile: ReaderContentProfile,
    updates: Partial<ReaderProfileSettings>
  ) => {
    try {
      const next = await patchReaderProfile(profile, updates);
      if (profile === 'manga') {
        setMangaReaderProfile(next);
      } else {
        setManhwaReaderProfile(next);
      }
    } catch (error) {
      logger().error('Service', 'Error saving reader profile', {
        error,
        profile,
      });
      showToast({
        message: 'Failed to update reader settings',
        type: 'error',
      });
    }
  };

  const syncReaderProfileTab = useCallback((index: number) => {
    const next: ReaderContentProfile = index === 1 ? 'manhwa' : 'manga';
    setReaderProfileTab((current) => (current === next ? current : next));
  }, []);

  useDerivedValue(() => {
    const width = readerPagerWidthSV.value;
    if (width <= 0) return;
    const idx = Math.max(
      0,
      Math.min(1, Math.round(-readerTranslateX.value / width))
    );
    runOnJS(syncReaderProfileTab)(idx);
  });

  const goToReaderProfileIndex = useCallback(
    (index: number) => {
      const width = readerPagerWidthSV.value;
      if (width <= 0 || index < 0 || index > 1) return;
      if (readerIsAnimating.value) return;
      readerIsAnimating.value = true;
      readerTranslateX.value = withTiming(
        -index * width,
        READER_PAGER_TIMING,
        () => {
          readerPageIndex.value = index;
          readerIsAnimating.value = false;
        }
      );
    },
    [
      readerIsAnimating,
      readerPageIndex,
      readerPagerWidthSV,
      readerTranslateX,
    ]
  );

  const selectReaderProfile = useCallback(
    (profile: ReaderContentProfile) => {
      goToReaderProfileIndex(profile === 'manhwa' ? 1 : 0);
    },
    [goToReaderProfileIndex]
  );

  const handleReaderPagerLayout = useCallback(
    (event: LayoutChangeEvent) => {
      const width = event.nativeEvent.layout.width;
      if (width <= 0) return;
      const previousWidth = readerPagerWidthSV.value;
      readerPagerWidthSV.value = width;
      setReaderPagerWidth((current) => (current === width ? current : width));
      if (previousWidth !== width) {
        readerTranslateX.value = -readerPageIndex.value * width;
      }
    },
    [readerPageIndex, readerPagerWidthSV, readerTranslateX]
  );

  const handleReaderPageHeight = useCallback(
    (profile: ReaderContentProfile, event: LayoutChangeEvent) => {
      const height = Math.ceil(event.nativeEvent.layout.height);
      if (height <= 0) return;
      if (profile === 'manga') {
        if (readerMangaHeightSV.value !== height) {
          readerMangaHeightSV.value = height;
        }
      } else if (readerManhwaHeightSV.value !== height) {
        readerManhwaHeightSV.value = height;
      }
    },
    [readerMangaHeightSV, readerManhwaHeightSV]
  );

  const readerContentAnim = useAnimatedStyle(() => ({
    transform: [{ translateX: readerTranslateX.value }],
  }));

  const readerPagerAnim = useAnimatedStyle(() => {
    const h0 = readerMangaHeightSV.value;
    const h1 = readerManhwaHeightSV.value;
    const width = readerPagerWidthSV.value || 1;
    if (h0 <= 0 && h1 <= 0) {
      return { overflow: 'hidden' as const };
    }
    if (h0 <= 0) {
      return { height: h1, overflow: 'hidden' as const };
    }
    if (h1 <= 0) {
      return { height: h0, overflow: 'hidden' as const };
    }
    const progress = -readerTranslateX.value / width;
    return {
      height: interpolate(progress, [0, 1], [h0, h1], 'clamp'),
      overflow: 'hidden' as const,
    };
  });

  // Same finger-tracking pager as Saved (bookmarks).
  const readerProfilePan = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetX([-10, 10])
        .failOffsetY([-10, 10])
        .onBegin(() => {
          readerStartX.value = readerTranslateX.value;
        })
        .onUpdate((event) => {
          if (readerIsAnimating.value) return;
          const width = readerPagerWidthSV.value;
          if (width <= 0) return;
          const min = -width;
          const max = 0;
          const next = readerStartX.value + event.translationX;
          readerTranslateX.value = Math.max(min, Math.min(max, next));
        })
        .onEnd((event) => {
          if (readerIsAnimating.value) return;
          const width = readerPagerWidthSV.value;
          if (width <= 0) return;
          const progress = -readerTranslateX.value / width;
          let target = Math.round(progress);
          if (Math.abs(event.velocityX) > 600) {
            target =
              event.velocityX < 0
                ? Math.ceil(progress)
                : Math.floor(progress);
          }
          target = Math.max(0, Math.min(1, target));
          readerIsAnimating.value = true;
          readerTranslateX.value = withTiming(
            -target * width,
            READER_PAGER_TIMING,
            () => {
              readerPageIndex.value = target;
              readerIsAnimating.value = false;
            }
          );
        }),
    [
      readerIsAnimating,
      readerPageIndex,
      readerPagerWidthSV,
      readerStartX,
      readerTranslateX,
    ]
  );

  const renderReaderProfilePanel = (profile: ReaderContentProfile) => {
    const settings =
      profile === 'manga' ? mangaReaderProfile : manhwaReaderProfile;
    const primary = accentColor || colors.primary;
    const a11yPrefix = profile === 'manga' ? 'manga' : 'manhwa';
    const fitHint =
      IMAGE_FIT_OPTIONS.find(
        (option) => option.value === settings.readerImageFit
      )?.hint ?? '';
    const backgroundHint =
      BACKGROUND_OPTIONS.find(
        (option) => option.value === settings.readerBackground
      )?.hint ?? '';

    return (
      <View
        style={[
          styles.readerProfilePage,
          readerPagerWidth > 0 && { width: readerPagerWidth },
        ]}
        onLayout={(event) => handleReaderPageHeight(profile, event)}
      >
        {profile === 'manga' ? (
          <>
            <Text style={[styles.readerControlLabel, { marginTop: 0 }]}>
              Page Layout
            </Text>
            <View style={styles.segmentedControl}>
              {MANGA_READING_MODE_OPTIONS.map((option) => {
                const isActive = settings.readingMode === option.value;
                return (
                  <TouchableOpacity
                    key={option.value}
                    style={[
                      styles.readingModeSegment,
                      isActive && { backgroundColor: primary },
                    ]}
                    onPress={() =>
                      updateReaderProfile('manga', {
                        readingMode: option.value,
                      })
                    }
                    accessibilityRole="button"
                    accessibilityLabel={`Set manga reading mode to ${option.label}`}
                    accessibilityState={{ selected: isActive }}
                  >
                    <Ionicons
                      name={option.icon}
                      size={18}
                      color={isActive ? '#FFFFFF' : colors.tabIconDefault}
                    />
                    <Text
                      style={[
                        styles.readingModeSegmentText,
                        {
                          color: isActive ? '#FFFFFF' : colors.tabIconDefault,
                        },
                      ]}
                      numberOfLines={1}
                    >
                      {option.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.settingHint}>
              {MANGA_MODE_HINTS[settings.readingMode]}
            </Text>
          </>
        ) : (
          <Text style={[styles.settingHint, { marginTop: 0 }]}>
            Manhwa always uses a continuous vertical strip. Page layout modes
            like LTR/RTL only apply to manga.
          </Text>
        )}

        <Text
          style={[
            styles.readerControlLabel,
            profile === 'manhwa' && { marginTop: 12 },
          ]}
        >
          Progress Bar
        </Text>
        <View style={styles.segmentedControl}>
          {PROGRESS_BAR_OPTIONS.map((option) => {
            const isActive = settings.progressBarPosition === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.segmentButton,
                  isActive && { backgroundColor: primary },
                ]}
                onPress={() =>
                  updateReaderProfile(profile, {
                    progressBarPosition: option.value,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Set ${a11yPrefix} progress bar to ${option.label}`}
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    styles.segmentText,
                    {
                      color: isActive ? '#FFFFFF' : colors.tabIconDefault,
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.settingHint}>
          {PROGRESS_BAR_HINTS[settings.progressBarPosition]}
        </Text>

        <Text style={styles.readerControlLabel}>Image Fit</Text>
        <View style={styles.segmentedControl}>
          {IMAGE_FIT_OPTIONS.map((option) => {
            const isActive = settings.readerImageFit === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.segmentButton,
                  isActive && { backgroundColor: primary },
                ]}
                onPress={() =>
                  updateReaderProfile(profile, {
                    readerImageFit: option.value,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Set ${a11yPrefix} image fit to ${option.label}`}
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    styles.segmentText,
                    {
                      color: isActive ? '#FFFFFF' : colors.tabIconDefault,
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.settingHint}>{fitHint}</Text>

        <Text style={styles.readerControlLabel}>Dim Pages</Text>
        <View style={styles.segmentedControl}>
          {DIM_PRESETS.map((preset) => {
            const isActive = settings.readerDimPercent === preset;
            return (
              <TouchableOpacity
                key={preset}
                style={[
                  styles.segmentButton,
                  isActive && { backgroundColor: primary },
                ]}
                onPress={() =>
                  updateReaderProfile(profile, { readerDimPercent: preset })
                }
                accessibilityRole="button"
                accessibilityLabel={`Set ${a11yPrefix} page dim to ${preset} percent`}
                accessibilityState={{ selected: isActive }}
              >
                <Text
                  style={[
                    styles.segmentText,
                    {
                      color: isActive ? '#FFFFFF' : colors.tabIconDefault,
                    },
                  ]}
                >
                  {preset === 0 ? 'Off' : `${preset}%`}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.settingHint}>
          {settings.readerDimPercent === 0
            ? 'Show pages at full brightness.'
            : `Darken page images by ${settings.readerDimPercent}% without changing the background.`}
        </Text>

        <Text style={styles.readerControlLabel}>Background</Text>
        <View style={styles.segmentedControl}>
          {BACKGROUND_OPTIONS.map((option) => {
            const isActive = settings.readerBackground === option.value;
            return (
              <TouchableOpacity
                key={option.value}
                style={[
                  styles.backgroundSegment,
                  isActive && { backgroundColor: primary },
                ]}
                onPress={() =>
                  updateReaderProfile(profile, {
                    readerBackground: option.value,
                  })
                }
                accessibilityRole="button"
                accessibilityLabel={`Set ${a11yPrefix} background to ${option.label}`}
                accessibilityState={{ selected: isActive }}
              >
                <View
                  style={[
                    styles.backgroundSwatch,
                    {
                      backgroundColor:
                        option.value === 'default'
                          ? colors.background
                          : option.swatch,
                      borderColor: isActive ? '#FFFFFF' : colors.border,
                    },
                  ]}
                />
                <Text
                  style={[
                    styles.readingModeSegmentText,
                    {
                      color: isActive ? '#FFFFFF' : colors.tabIconDefault,
                    },
                  ]}
                >
                  {option.label}
                </Text>
              </TouchableOpacity>
            );
          })}
        </View>
        <Text style={styles.settingHint}>{backgroundHint}</Text>

        <View style={styles.stickySetting}>
          <View style={styles.toggleRow}>
            <View style={styles.toggleCopy}>
              <Text style={styles.toggleTitle}>Sticky header</Text>
              <Text style={styles.toggleHint}>
                Keep chapter controls visible while scrolling
              </Text>
            </View>
            <Switch
              value={settings.keepHeaderVisible}
              onValueChange={(value) =>
                updateReaderProfile(profile, { keepHeaderVisible: value })
              }
              trackColor={{
                false: colors.border,
                true: primary + '88',
              }}
              thumbColor="#FFFFFF"
              style={styles.toggleSwitch}
              accessibilityLabel={`Toggle sticky header for ${a11yPrefix}`}
            />
          </View>
        </View>
      </View>
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
            <Text style={styles.settingHint}>
              {defaultLayout === 'list'
                ? 'Show manga as a vertical list with titles and details.'
                : 'Show manga as a compact cover grid.'}
            </Text>
          </View>

          <View style={styles.subsection}>
            <Text style={styles.subsectionTitle}>Reading</Text>
            <View style={styles.readerProfileTabs}>
              {READER_PROFILE_TABS.map((tab) => {
                const isActive = readerProfileTab === tab.key;
                return (
                  <TouchableOpacity
                    key={tab.key}
                    style={[
                      styles.readerProfileTab,
                      isActive && {
                        backgroundColor: accentColor || colors.primary,
                      },
                    ]}
                    onPress={() => selectReaderProfile(tab.key)}
                    accessibilityRole="tab"
                    accessibilityLabel={`${tab.label} reading settings`}
                    accessibilityState={{ selected: isActive }}
                  >
                    <Text
                      style={[
                        styles.readerProfileTabText,
                        {
                          color: isActive ? '#FFFFFF' : colors.tabIconDefault,
                        },
                      ]}
                    >
                      {tab.label}
                    </Text>
                  </TouchableOpacity>
                );
              })}
            </View>
            <Text style={styles.settingHint}>
              Swipe or tap to switch profiles. Manga and manhwa defaults are
              saved separately and applied automatically by title type.
            </Text>

            <GestureDetector gesture={readerProfilePan}>
              <AnimatedView
                style={[styles.readerProfilePane, readerPagerAnim]}
                onLayout={handleReaderPagerLayout}
              >
                <AnimatedView
                  style={[
                    styles.readerProfileTrack,
                    readerPagerWidth > 0 && {
                      width: readerPagerWidth * 2,
                    },
                    readerContentAnim,
                  ]}
                >
                  {renderReaderProfilePanel('manga')}
                  {renderReaderProfilePanel('manhwa')}
                </AnimatedView>
              </AnimatedView>
            </GestureDetector>

            <View style={styles.stickySetting}>
              <View style={styles.toggleRow}>
                <View style={styles.toggleCopy}>
                  <Text style={styles.toggleTitle}>Reader settings button</Text>
                  <Text style={styles.toggleHint}>
                    Show the gear icon in the chapter reader. Turn off to
                    declutter; change reading options here instead.
                  </Text>
                </View>
                <Switch
                  value={showReaderSettingsButton}
                  onValueChange={handleShowReaderSettingsButtonChange}
                  trackColor={{
                    false: colors.border,
                    true: (accentColor || colors.primary) + '88',
                  }}
                  thumbColor="#FFFFFF"
                  style={styles.toggleSwitch}
                  accessibilityLabel="Toggle reader settings button"
                />
              </View>
            </View>
          </View>

          <Text style={[styles.sectionTitle, { marginTop: 20 }]}>Theme</Text>
          <Text style={[styles.settingHint, { marginTop: 0, marginBottom: 8 }]}>
            Choose light, dark, or follow your device appearance.
          </Text>
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
          <Text style={[styles.settingHint, { marginTop: 0 }]}>
            Used for buttons, selected tabs, and other highlights across the
            app.
          </Text>

          {/* Reset accent color button */}
          {accentColor && (
            <TouchableOpacity
              style={[styles.option, { borderBottomWidth: 0, marginTop: 4 }]}
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
          <Text style={[styles.settingHint, { marginTop: 0, marginBottom: 8 }]}>
            Clear cached covers, chapters, and other downloaded data to free
            space.
          </Text>
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
          <Text style={styles.settingHint}>
            Adds a Debug tab for network logs and diagnostics. Restart the app
            after changing this.
          </Text>
        </Reanimated.View>
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
    readerProfileTabs: {
      flexDirection: 'row',
      backgroundColor: colors.background,
      borderRadius: 8,
      padding: 4,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 8,
    },
    readerProfileTab: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 6,
    },
    readerProfileTabText: {
      fontSize: 14,
      fontWeight: '600',
    },
    readerProfilePane: {
      marginTop: 8,
      overflow: 'hidden',
    },
    readerProfileTrack: {
      flexDirection: 'row',
      alignItems: 'flex-start',
    },
    readerProfilePage: {
      flexShrink: 0,
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
    readingModeSegment: {
      flex: 1,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 6,
      gap: 4,
    },
    readingModeSegmentText: {
      fontSize: 12,
      fontWeight: '500',
    },
    settingHint: {
      fontSize: 13,
      color: colors.text + '99',
      marginTop: 8,
      lineHeight: 18,
    },
    readerControlLabel: {
      fontSize: 14,
      fontWeight: '600',
      color: colors.text,
      marginTop: 16,
      marginBottom: 8,
    },
    backgroundSegment: {
      flex: 1,
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 8,
      borderRadius: 6,
      gap: 4,
    },
    backgroundSwatch: {
      width: 18,
      height: 18,
      borderRadius: 9,
      borderWidth: 1,
    },
    stickySetting: {
      marginTop: 16,
      paddingVertical: 12,
      paddingHorizontal: 12,
      borderRadius: 10,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
    },
    toggleCopy: {
      flex: 1,
      minWidth: 0,
      paddingRight: 4,
    },
    toggleSwitch: {
      flexShrink: 0,
      alignSelf: 'center',
    },
    toggleTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 2,
    },
    toggleHint: {
      fontSize: 12,
      lineHeight: 16,
      color: colors.text + '99',
    },
    noteText: {
      fontSize: 14,
      color: colors.text,
      marginTop: 10,
    },
    scrollViewContent: {
      paddingBottom: 100,
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
