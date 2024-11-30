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
} from 'react-native';
import { useTheme, Theme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ColorScheme } from '@/constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as AniListOAuth from '@/services/anilistOAuth';
import { syncAllMangaWithAniList } from '@/services/anilistService';
import { ActivityIndicator } from 'react-native';
import Svg, { Path } from 'react-native-svg';

/* Type Definitions */
interface ThemeOption {
  label: string;
  value: Theme;
  icon: string;
}

export default function SettingsScreen() {
  const { theme, setTheme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme = theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);
  const [user, setUser] = useState<any>(null);
  const [isSyncing, setIsSyncing] = useState(false);

  // Safe area insets
  const insets = useSafeAreaInsets();

  const [enableDebugTab, setEnableDebugTab] = useState<boolean>(false);

  const themeOptions: ThemeOption[] = [
    { label: 'Light', value: 'light', icon: 'sunny-outline' },
    { label: 'Dark', value: 'dark', icon: 'moon-outline' },
    { label: 'System', value: 'system', icon: 'phone-portrait-outline' },
  ];

  useEffect(() => {
    // Load settings when the component mounts
    loadEnableDebugTabSetting();
    checkLoginStatus();

  }, []);

  const loadEnableDebugTabSetting = async () => {
    try {
      const value = await AsyncStorage.getItem('enableDebugTab');
      console.log('Loaded enableDebugTab:', value);
      setEnableDebugTab(value === 'true');
    } catch (error) {
      console.error('Error loading enable debug tab setting:', error);
    }
  };

  const toggleEnableDebugTab = async (value: boolean) => {
    try {
      await AsyncStorage.setItem('enableDebugTab', value.toString());
      console.log('Saved enableDebugTab:', value.toString());
      setEnableDebugTab(value);
    } catch (error) {
      console.error('Error toggling enable debug tab setting:', error);
    }
  };

  const clearAsyncStorage = () => {
    Alert.alert(
      'Clear App Data',
      'Are you sure you want to clear all app data? This action cannot be undone.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'OK',
          onPress: async () => {
            try {
              const keys = await AsyncStorage.getAllKeys();
              await AsyncStorage.multiRemove(keys);
              Alert.alert('Success', 'All app data has been cleared.');
            } catch (error) {
              console.error('Error clearing AsyncStorage:', error);
              Alert.alert('Error', 'Failed to clear app data. Please try again.');
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
        Alert.alert("Success", "Successfully logged in to AniList!");
      }
    } catch (error: unknown) {
      console.error('AniList login error:', error);
      if (error instanceof Error) {
        if (error.message.includes('cancelled')) {
          Alert.alert("Cancelled", "Login was cancelled by user");
        } else {
          Alert.alert("Error", `Failed to login with AniList: ${error.message}`);
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
      Alert.alert("Error", "Failed to logout");
    }
  };

  const handleSyncAllManga = async () => {
    try {
      setIsSyncing(true);
      const results = await syncAllMangaWithAniList();
      Alert.alert("Sync Results", results.join('\n'));
    } catch (error) {
      console.error('Error syncing manga:', error);
      Alert.alert("Error", `Failed to sync manga: ${error instanceof Error ? error.message : 'Unknown error'}`);
    } finally {
      setIsSyncing(false);
    }
  };



  return (
    <View style={[styles.container, { paddingTop: insets.top }]}>
      <ScrollView style={styles.scrollView}>
        <Text style={styles.title}>Settings</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Theme</Text>
          {themeOptions.map((option) => (
            <TouchableOpacity
              key={option.value}
              style={[styles.option, theme === option.value && styles.activeOption]}
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

        </View>
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AniList Integration</Text>
          {user ? (
            <>
              <View style={styles.userInfo}>
                <Image source={{ uri: user.avatar.large }} style={styles.avatar} />
                <Text style={styles.username}>{user.name}</Text>
              </View>
              <TouchableOpacity style={styles.option} onPress={handleAniListLogout}>
                <Ionicons name="log-out-outline" size={24} color={colors.text} />
                <Text style={styles.optionText}>Logout from AniList</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.syncButton, isSyncing && styles.disabledButton]}
                onPress={handleSyncAllManga}
                disabled={isSyncing}
              >
                <View style={styles.buttonContent}>
                  <Ionicons name="sync-outline" size={24} color={colors.card} />
                  <Text style={styles.syncButtonText}>Sync All Manga with AniList</Text>
                  {isSyncing && <ActivityIndicator size="small" color={colors.card} style={styles.spinner} />}
                </View>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity style={styles.loginButton} onPress={handleAniListLogin}>
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
            Note Anilist integration is still W.I.P
          </Text>
        </View>


        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Data Management</Text>
          <TouchableOpacity style={styles.clearDataButton} onPress={clearAsyncStorage}>
            <Ionicons name="trash-outline" size={24} color={colors.notification} />
            <Text style={styles.clearDataText}>Clear App Data</Text>
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
              trackColor={{ false: colors.border, true: colors.tint }}
              thumbColor={enableDebugTab ? colors.primary : colors.text}
            />
          </View>
          <Text style={styles.noteText}>
            You need to restart the app for this setting to take effect.
          </Text>
        </View>
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
    nessieImage: {
      position: 'absolute',
      bottom: 40,
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
  });
