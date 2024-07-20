import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@/constants/ThemeContext';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';

interface BookmarkItem {
  id: string;
  title: string;
  status: string;
  lastReadChapter: string;
}

export default function BookmarksScreen() {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const router = useRouter();
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const styles = getStyles(colors);

  const fetchBookmarks = useCallback(async () => {
    setIsLoading(true);
    try {
      const keys = await AsyncStorage.getItem('bookmarkKeys');
      const bookmarkKeys = keys ? JSON.parse(keys) : [];
      const bookmarkPromises = bookmarkKeys.map(async (key: string) => {
        const status = await AsyncStorage.getItem(key);
        const id = key.split('_')[1];
        const title = await AsyncStorage.getItem(`title_${id}`);
        const lastReadChapter = await getLastReadChapter(id);
        return { id, title, status, lastReadChapter };
      });
      const bookmarkItems = await Promise.all(bookmarkPromises);
      setBookmarks(bookmarkItems.filter((item): item is BookmarkItem => item.title !== null));
    } catch (error) {
      console.error('Error fetching bookmarks:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  const getLastReadChapter = async (mangaId: string): Promise<string> => {
    try {
      const key = `manga_${mangaId}_read_chapters`;
      const readChapters = await AsyncStorage.getItem(key) || '[]';
      const chaptersArray = JSON.parse(readChapters);
      
      // Sort chapters numerically
      const sortedChapters = chaptersArray.sort((a, b) => parseFloat(a) - parseFloat(b));
      
      // Find the last continuously read chapter
      let lastContinuousChapter = 0;
      for (let i = 0; i < sortedChapters.length; i++) {
        if (parseFloat(sortedChapters[i]) === lastContinuousChapter + 1) {
          lastContinuousChapter = parseFloat(sortedChapters[i]);
        } else {
          break;
        }
      }

      return lastContinuousChapter > 0 ? `Chapter ${lastContinuousChapter}` : 'Not started';
    } catch (error) {
      console.error('Error getting last read chapter:', error);
      return 'Unknown';
    }
  };

  useFocusEffect(
    useCallback(() => {
      fetchBookmarks();
    }, [fetchBookmarks])
  );

  const handleBookmarkPress = (id: string) => {
    router.push(`/manga/${id}`);
  };

  const renderBookmarkItem = ({ item }: { item: BookmarkItem }) => (
    <TouchableOpacity style={styles.bookmarkCard} onPress={() => handleBookmarkPress(item.id)}>
      <View style={styles.bookmarkInfo}>
        <Text style={styles.bookmarkTitle}>{item.title}</Text>
        <Text style={styles.lastReadChapter}>Last Read: {item.lastReadChapter}</Text>
      </View>
      <Ionicons
        name={
          item.status === 'To Read'
            ? 'book-outline'
            : item.status === 'Reading'
            ? 'book'
            : 'checkmark-circle-outline'
        }
        size={24}
        color={colors.primary}
      />
    </TouchableOpacity>
  );

  const renderBookmarkSection = (title: string, data: BookmarkItem[]) => (
    <View style={styles.sectionContainer}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <FlatList
        data={data}
        renderItem={renderBookmarkItem}
        keyExtractor={(item) => item.id}
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.bookmarkList}
      />
    </View>
  );

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }

  const toReadBookmarks = bookmarks.filter((item) => item.status === 'To Read');
  const readingBookmarks = bookmarks.filter((item) => item.status === 'Reading');
  const readBookmarks = bookmarks.filter((item) => item.status === 'Read');

  return (
    <View style={styles.container}>
      <Text style={styles.header}>My Bookmarks</Text>
      {bookmarks.length === 0 ? (
        <Text style={styles.emptyText}>No bookmarks found.</Text>
      ) : (
        <FlatList
          data={[
            { title: 'To Read', data: toReadBookmarks },
            { title: 'Reading', data: readingBookmarks },
            { title: 'Read', data: readBookmarks },
          ]}
          renderItem={({ item }) => renderBookmarkSection(item.title, item.data)}
          keyExtractor={(item) => item.title}
          showsVerticalScrollIndicator={false}
        />
      )}
    </View>
  );
}

const getStyles = (colors: typeof Colors.light) => StyleSheet.create({
  container: {
    flex: 1,
    padding: 16,
    backgroundColor: colors.card,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.card,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    marginBottom: 24,
    color: colors.text,
    marginTop: 40,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 20,
    color: colors.text,
  },
  sectionContainer: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 12,
    color: colors.text,
  },
  bookmarkList: {
    paddingRight: 16,
  },
  bookmarkCard: {
    borderRadius: 12,
    padding: 16,
    marginRight: 12,
    width: 220,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: colors.border,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 }, 

  },
  bookmarkInfo: {
    flex: 1,
    marginRight: 8,
  },
  bookmarkTitle: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 4,
  },
  lastReadChapter: {
    fontSize: 12,
    color: colors.tabIconDefault,
  },
});
