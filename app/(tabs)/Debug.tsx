import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, useColorScheme, TextInput, Alert, Image } from 'react-native';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import * as MangaUpdateService from '@/services/mangaUpdateService';
import * as Notifications from 'expo-notifications';
import * as AniListOAuth from '@/services/anilistOAuth';
import { searchAnilistMangaByName, updateMangaStatus } from '@/services/anilistService';

export default function DebugScreen() {
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme();
  const colorScheme = theme === 'system' ? systemColorScheme : theme;
  const colors = Colors[colorScheme as keyof typeof Colors] || Colors.light;
  const styles = getStyles(colors);
  const [user, setUser] = useState<any>(null);
  const [mangaId, setMangaId] = useState('chainsaw-man.0w5k');
  const [chapterNumber, setChapterNumber] = useState('176');

  const [mangaName, setMangaName] = useState('');
  const [anilistResult, setAnilistResult] = useState<null | { id: number; title: string }>(null);
  const [markAsReadMangaName, setMarkAsReadMangaName] = useState('');

  useEffect(() => {
    MangaUpdateService.startUpdateService();
    checkLoginStatus();
    return () => {
      MangaUpdateService.stopUpdateService();
    };
  }, []);

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
      await AniListOAuth.loginWithAniList();
      const userData = await AniListOAuth.getCurrentUser();
      setUser(userData.data.Viewer);
      Alert.alert("Success", `Logged in as: ${userData.data.Viewer.name}`);
    } catch (error: unknown) {
      console.error('AniList login error:', error);
      if (error instanceof Error && error.message === 'Login was cancelled') {
        Alert.alert("Cancelled", "Login was cancelled");
      } else {
        const errorMessage = error instanceof Error ? error.message : 'An unknown error occurred';
        Alert.alert("Error", `Failed to login with AniList: ${errorMessage}`);
      }
    }
  };


  const handleAniListLogout = async () => {
    try {
      await AniListOAuth.logout();
      setUser(null);
      Alert.alert("Success", "Logged out successfully");
    } catch (error: unknown) {
      console.error('AniList logout error:', error);
      if (error instanceof Error) {
        Alert.alert("Error", `Failed to logout: ${error.message}`);
      } else {
        Alert.alert("Error", "Failed to logout: An unknown error occurred");
      }
    }
  };

  const searchAnilistManga = async () => {
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


  const markMangaAsRead = async () => {
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

  const sendTestNotification = async () => {
    try {
      const notificationId = await Notifications.scheduleNotificationAsync({
        content: {
          title: "Test Notification",
          body: "This is a test notification",
          data: { testData: 'test' },
        },
        trigger: null,
      });
      Alert.alert("Success", `Test notification sent. ID: ${notificationId}`);
    } catch (error) {
      console.error('Error sending test notification:', error);
      Alert.alert("Error", "Failed to send test notification. Please try again.");
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <ScrollView style={styles.scrollView}>
        <Text style={styles.title}>Debug</Text>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Update Service</Text>
          <TouchableOpacity
            style={styles.option}
            onPress={() => MangaUpdateService.startUpdateService()}
          >
            <Ionicons name="play-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Start Update Service</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.option}
            onPress={() => MangaUpdateService.stopUpdateService()}
          >
            <Ionicons name="stop-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Stop Update Service</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.option}
            onPress={() => MangaUpdateService.checkForUpdatesManually()}
          >
            <Ionicons name="refresh-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Check for Updates Manually</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Simulate New Chapter</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Manga ID:</Text>
            <TextInput
              value={mangaId}
              onChangeText={setMangaId}
              style={styles.input}
              placeholderTextColor={colors.text}
            />
          </View>
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Chapter Number:</Text>
            <TextInput
              value={chapterNumber}
              onChangeText={setChapterNumber}
              style={styles.input}
              placeholderTextColor={colors.text}
            />
          </View>
          <TouchableOpacity
            style={styles.button}
            onPress={() => MangaUpdateService.simulateNewChapterRelease(mangaId, chapterNumber)}
          >
            <Text style={styles.buttonText}>Simulate New Chapter</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AniList OAuth</Text>
          {user ? (
            <>
              <View style={styles.userInfo}>
                <Image source={{ uri: user.avatar.large }} style={styles.avatar} />
                <Text style={styles.username}>{user.name}</Text>
              </View>
              <TouchableOpacity
                style={styles.option}
                onPress={handleAniListLogout}
              >
                <Ionicons name="log-out-outline" size={24} color={colors.text} />
                <Text style={styles.optionText}>Logout from AniList</Text>
              </TouchableOpacity>
            </>
          ) : (
            <TouchableOpacity
              style={styles.option}
              onPress={handleAniListLogin}
            >
              <Ionicons name="log-in-outline" size={24} color={colors.text} />
              <Text style={styles.optionText}>Login with AniList</Text>
            </TouchableOpacity>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>AniList Manga Search</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Manga Name:</Text>
            <TextInput
              value={mangaName}
              onChangeText={setMangaName}
              style={styles.input}
              placeholderTextColor={colors.text}
              placeholder="Enter manga name"
            />
          </View>
          <TouchableOpacity
            style={styles.button}
            onPress={searchAnilistManga}
          >
            <Text style={styles.buttonText}>Search AniList</Text>
          </TouchableOpacity>
          {anilistResult && (
            <View style={styles.resultContainer}>
              <Text style={styles.resultText}>AniList ID: {anilistResult.id}</Text>
              <Text style={styles.resultText}>Title: {anilistResult.title}</Text>
            </View>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Mark Manga as Read on AniList</Text>
          <View style={styles.inputContainer}>
            <Text style={styles.inputLabel}>Manga Name:</Text>
            <TextInput
              value={markAsReadMangaName}
              onChangeText={setMarkAsReadMangaName}
              style={styles.input}
              placeholderTextColor={colors.text}
              placeholder="Enter manga name to mark as read"
            />
          </View>
          <TouchableOpacity
            style={styles.button}
            onPress={markMangaAsRead}
          >
            <Text style={styles.buttonText}>Mark as Read on AniList</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Debug Actions</Text>
          <TouchableOpacity
            style={styles.option}
            onPress={() => MangaUpdateService.logDebugState()}
          >
            <Ionicons name="bug-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Log Debug State</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={styles.option}
            onPress={sendTestNotification}
          >
            <Ionicons name="notifications-outline" size={24} color={colors.text} />
            <Text style={styles.optionText}>Send Test Notification</Text>
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
  resultContainer: {
    marginTop: 20,
    padding: 10,
    backgroundColor: colors.background,
    borderRadius: 5,
  },
  resultText: {
    fontSize: 16,
    color: colors.text,
    marginBottom: 5,
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
  optionText: {
    fontSize: 16,
    marginLeft: 15,
    flex: 1,
    color: colors.text,
  },
  inputContainer: {
    marginBottom: 10,
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
  },
  button: {
    backgroundColor: colors.primary,
    padding: 15,
    borderRadius: 5,
    alignItems: 'center',
    marginTop: 10,
  },
  buttonText: {
    color: colors.card,
    fontSize: 16,
    fontWeight: '600',
  },
});
