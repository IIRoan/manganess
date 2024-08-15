import React, { useEffect, useState } from 'react';
import { View, Button, TextInput, Text } from 'react-native';
import * as MangaUpdateService from '@/services/mangaUpdateService';
import * as Notifications from 'expo-notifications';

export default function DebugScreen() {
  const [mangaId, setMangaId] = useState('chainsaw-man.0w5k');
  const [chapterNumber, setChapterNumber] = useState('176');

  useEffect(() => {
    MangaUpdateService.startUpdateService();
    return () => {
      MangaUpdateService.stopUpdateService();
    };
  }, []);

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
      console.log(`Test notification sent. ID: ${notificationId}`);
    } catch (error) {
      console.error('Error sending test notification:', error);
    }
  };

  return (
    <View style={{ padding: 20 }}>
      <Button
        title="Start Update Service"
        onPress={() => MangaUpdateService.startUpdateService()}
      />
      <Button
        title="Stop Update Service"
        onPress={() => MangaUpdateService.stopUpdateService()}
      />
      <Button
        title="Check for Updates Manually"
        onPress={() => MangaUpdateService.checkForUpdatesManually()}
      />
      <Text>Manga ID:</Text>
      <TextInput
        value={mangaId}
        onChangeText={setMangaId}
        style={{ borderWidth: 1, padding: 5, marginBottom: 10 }}
      />
      <Text>Chapter Number:</Text>
      <TextInput
        value={chapterNumber}
        onChangeText={setChapterNumber}
        style={{ borderWidth: 1, padding: 5, marginBottom: 10 }}
      />
      <Button
        title="Simulate New Chapter"
        onPress={() => MangaUpdateService.simulateNewChapterRelease(mangaId, chapterNumber)}
      />
      <Button
        title="Log Debug State"
        onPress={() => MangaUpdateService.logDebugState()}
      />
      <Button
        title="Send Test Notification"
        onPress={sendTestNotification}
      />
    </View>
  );
}
