import React, { useEffect, useState } from 'react';
import { View, Text, TouchableOpacity, StyleSheet, SafeAreaView, ScrollView, useColorScheme, TextInput, Alert, Image } from 'react-native';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import * as MangaUpdateService from '@/services/mangaUpdateService';
import * as Notifications from 'expo-notifications';
import * as AniListOAuth from '@/services/anilistOAuth';

export default function DebugScreen() {
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme();
  const colorScheme = theme === 'system' ? systemColorScheme : theme;
  const colors = Colors[colorScheme as keyof typeof Colors] || Colors.light;
  const styles = getStyles(colors);
  const [user, setUser] = useState<any>(null);
  const [mangaId, setMangaId] = useState('chainsaw-man.0w5k');
  const [chapterNumber, setChapterNumber] = useState('176');

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
    } catch (error) {
      console.error('AniList login error:', error);
      if (error.message === 'Login was cancelled') {
        Alert.alert("Cancelled", "Login was cancelled");
      } else {
        Alert.alert("Error", `Failed to login with AniList: ${error.message}`);
      }
    }
  };
  

  const handleAniListLogout = async () => {
    try {
      await AniListOAuth.logout();
      setUser(null);
      Alert.alert("Success", "Logged out successfully");
    } catch (error) {
      console.error('AniList logout error:', error);
      Alert.alert("Error", `Failed to logout: ${error.message}`);
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
