import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, useColorScheme, TextInput, Alert, Image, ActivityIndicator } from 'react-native';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import * as AniListOAuth from '@/services/anilistOAuth';
import { searchAnilistMangaByName, updateMangaStatus, syncAllMangaWithAniList } from '@/services/anilistService';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';

export default function DebugScreen() {
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme();
  const colorScheme = theme === 'system' ? systemColorScheme : theme;
  const colors = Colors[colorScheme as keyof typeof Colors] || Colors.light;
  const styles = getStyles(colors);
  const router = useRouter();

  // AniList States
  const [user, setUser] = useState<any>(null);
  const [mangaName, setMangaName] = useState('');
  const [anilistResult, setAnilistResult] = useState<null | { id: number; title: string }>(null);
  const [markAsReadMangaName, setMarkAsReadMangaName] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);

  useEffect(() => {
    checkLoginStatus();
  }, []);

  // AniList Functions
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
        } else if (error.message.includes('access_denied')) {
          Alert.alert("Access Denied", "AniList login was denied. Please try again and accept the permissions.");
        } else {
          Alert.alert("Error", `Failed to login with AniList: ${error.message}`);
        }
      } else {
        Alert.alert("Error", "An unknown error occurred during login");
      }
    }
  };

  const handleAniListLogout = async () => {
    try {
      await AniListOAuth.logout();
      setUser(null);
    } catch (error: unknown) {
      console.error('AniList logout error:', error);
      if (error instanceof Error) {
        Alert.alert("Error", `Failed to logout: ${error.message}`);
      } else {
        Alert.alert("Error", "Failed to logout: An unknown error occurred");
      }
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

  const handleSearchAnilist = async () => {
    if (!mangaName.trim()) {
      Alert.alert("Error", "Please enter a manga name");
      return;
    }

    try {
      const result = await searchAnilistMangaByName(mangaName);
      if (result) {
        setAnilistResult({
          id: result.id,
          title: result.title.english || result.title.romaji || result.title.native
        });
      } else {
        setAnilistResult(null);
        Alert.alert("Not Found", "No manga found with that name on AniList");
      }
    } catch (error) {
      console.error('Error searching AniList:', error);
      Alert.alert("Error", "Failed to search AniList. Please try again.");
    }
  };

  const handleMarkAsRead = async () => {
    if (!markAsReadMangaName.trim()) {
      Alert.alert("Error", "Please enter a manga name");
      return;
    }

    try {
      const authData = await AniListOAuth.getAuthData();
      if (!authData) {
        Alert.alert("Error", "You are not logged in to AniList. Please log in first.");
        return;
      }

      const result = await searchAnilistMangaByName(markAsReadMangaName);
      if (result) {
        await updateMangaStatus(result.id, 'COMPLETED', 0);
        Alert.alert("Success", `Marked "${result.title.english || result.title.romaji}" as read on AniList`);
      } else {
        Alert.alert("Not Found", "No manga found with that name on AniList");
      }
    } catch (error: unknown) {
      console.error('Error marking manga as read:', error);
      Alert.alert("Error", `Failed to mark manga as read: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  };

  const showOnboarding = async () => {
    try {
      await AsyncStorage.removeItem('onboardingCompleted');
      router.replace('/onboarding');
    } catch (error) {
      console.error('Error showing onboarding:', error);
      Alert.alert('Error', 'Failed to show onboarding. Please try again.');
    }
  };

  const renderAniListSection = () => (
    <>
      <View style={styles.section}>
        <Text style={styles.sectionTitle}>AniList Authentication</Text>
        {user ? (
          <View>
            <View style={styles.userInfo}>
              <Image source={{ uri: user.avatar.large }} style={styles.avatar} />
              <Text style={styles.username}>{user.name}</Text>
            </View>
            <TouchableOpacity style={styles.option} onPress={handleAniListLogout}>
              <Ionicons name="log-out-outline" size={24} color={colors.text} />
              <Text style={styles.optionText}>Logout from AniList</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <TouchableOpacity style={styles.button} onPress={handleAniListLogin}>
            <Text style={styles.buttonText}>Login with AniList</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Manga Management</Text>
        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Search Manga:</Text>
          <TextInput
            value={mangaName}
            onChangeText={setMangaName}
            style={styles.input}
            placeholderTextColor={colors.text}
            placeholder="Enter manga name"
          />
          <TouchableOpacity style={styles.button} onPress={handleSearchAnilist}>
            <Text style={styles.buttonText}>Search AniList</Text>
          </TouchableOpacity>
        </View>
        {anilistResult && (
          <View style={styles.resultContainer}>
            <Text style={styles.resultText}>AniList ID: {anilistResult.id}</Text>
            <Text style={styles.resultText}>Title: {anilistResult.title}</Text>
          </View>
        )}

        <View style={styles.inputContainer}>
          <Text style={styles.inputLabel}>Mark as Read:</Text>
          <TextInput
            value={markAsReadMangaName}
            onChangeText={setMarkAsReadMangaName}
            style={styles.input}
            placeholderTextColor={colors.text}
            placeholder="Enter manga name to mark as read"
          />
          <TouchableOpacity style={styles.button} onPress={handleMarkAsRead}>
            <Text style={styles.buttonText}>Mark as Read on AniList</Text>
          </TouchableOpacity>
        </View>

        <TouchableOpacity
          style={[styles.button, isSyncing && styles.disabledButton]}
          onPress={handleSyncAllManga}
          disabled={isSyncing}
        >
          <View style={styles.buttonContent}>
            <Text style={styles.buttonText}>Sync All Manga with AniList</Text>
            {isSyncing && <ActivityIndicator size="small" color={colors.card} style={styles.spinner} />}
          </View>
        </TouchableOpacity>
      </View>
    </>
  );

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <Text style={styles.title}>Debug</Text>
        {renderAniListSection()}

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Debug Actions</Text>
          <TouchableOpacity style={styles.option} onPress={showOnboarding}>
            <Ionicons name="play-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Show Onboarding</Text>
          </TouchableOpacity>
        </View>
      </ScrollView>
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
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
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
  inputContainer: {
    marginBottom: 15,
  },
  inputLabel: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 5,
  },
  input: {
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 5,
    padding: 10,
    fontSize: 16,
    color: colors.text,
    marginBottom: 10,
  },
  button: {
    backgroundColor: colors.primary,
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonText: {
    color: colors.card,
    fontSize: 16,
    fontWeight: '600',
  },
  optionText: {
    fontSize: 16,
    marginLeft: 15,
    flex: 1,
    color: colors.text,
  },
  resultContainer: {
    marginTop: 10,
    marginBottom: 15,
    padding: 10,
    backgroundColor: colors.background,
    borderRadius: 5,
  },
  resultText: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 5,
  },
  disabledButton: {
    opacity: 0.7,
  },
  spinner: {
    marginLeft: 8,
  },
});