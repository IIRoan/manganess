import React, { useCallback, useState } from 'react';
import { View, Text, FlatList, TouchableOpacity, StyleSheet, ActivityIndicator, SafeAreaView, Dimensions } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@/constants/ThemeContext';
import { Colors } from '@/constants/Colors';
import { Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MangaCard from '@/components/MangaCard';

// Types
interface BookmarkItem {
  id: string;
  title: string;
  status: string;
  lastReadChapter: string;
  imageUrl: string;
}

interface BookmarkSection {
  title: string;
  data: BookmarkItem[];
}

// Helper functions
const getLastReadChapter = async (mangaId: string): Promise<string> => {
  try {
    const key = `manga_${mangaId}_read_chapters`;
    const readChapters = await AsyncStorage.getItem(key) || '[]';
    const chaptersArray = JSON.parse(readChapters);

    if (chaptersArray.length === 0) {
      return 'Not started';
    }

    const numericChapters = chaptersArray.map((chapter: string) => parseFloat(chapter));
    const lastReadChapter = Math.max(...numericChapters);

    return `Chapter ${lastReadChapter}`;
  } catch (error) {
    console.error('Error getting last read chapter:', error);
    return 'Unknown';
  }
};


// Main component
export default function BookmarksScreen() {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSection, setActiveSection] = useState('Reading');
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
        const imageUrl = await AsyncStorage.getItem(`image_${id}`);
        return { id, title, status, lastReadChapter, imageUrl };
      });
      const bookmarkItems = await Promise.all(bookmarkPromises);
      setBookmarks(bookmarkItems.filter((item): item is BookmarkItem => item.title !== null && item.imageUrl !== null));
    } catch (error) {
      console.error('Error fetching bookmarks:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);
  useFocusEffect(useCallback(() => { fetchBookmarks(); }, [fetchBookmarks]));

  const handleBookmarkPress = (id: string) => {
    router.push(`/manga/${id}`);
  };

  const renderBookmarkItem = ({ item }: { item: BookmarkItem }) => (
    <MangaCard
      title={item.title}
      imageUrl={item.imageUrl}
      onPress={() => handleBookmarkPress(item.id)}
      lastReadChapter={item.lastReadChapter} 
    />
  );


  const renderSectionButton = (title: string) => {
    let iconName: keyof typeof Ionicons.glyphMap;
    switch (title) {
      case 'To Read':
        iconName = 'book-outline';
        break;
      case 'Reading':
        iconName = 'book';
        break;
      case 'Read':
        iconName = 'checkmark-circle-outline';
        break;
      default:
        iconName = 'book-outline';
    }

    return (
      <TouchableOpacity
        style={[styles.sectionButton, activeSection === title && styles.activeSectionButton]}
        onPress={() => setActiveSection(title)}
      >
        <Ionicons
          name={iconName}
          size={20}
          color={activeSection === title ? colors.card : colors.text}
          style={styles.sectionButtonIcon}
        />
        <Text style={[
          styles.sectionButtonText,
          activeSection === title && styles.activeSectionButtonText
        ]}>
          {title}
        </Text>
      </TouchableOpacity>
    );
  };

  const filteredBookmarks = bookmarks.filter((item) => item.status === activeSection);

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.primary} />
      </View>
    );
  }
  return (
    <SafeAreaView style={styles.container}>
      <Text style={styles.header}>My Bookmarks</Text>
      <View style={styles.sectionButtonsContainer}>
        {renderSectionButton('Reading')}
        {renderSectionButton('To Read')}
        {renderSectionButton('Read')}
      </View>
      {bookmarks.length === 0 ? (
        <Text style={styles.emptyText}>No bookmarks found.</Text>
      ) : (
        <FlatList
          data={filteredBookmarks}
          renderItem={renderBookmarkItem}
          keyExtractor={(item) => item.id}
          numColumns={2}
          columnWrapperStyle={styles.columnWrapper}
          showsVerticalScrollIndicator={false}
          contentContainerStyle={styles.contentContainer}
        />
      )}
    </SafeAreaView>
  );
}
const getStyles = (colors: typeof Colors.light) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  header: {
    fontSize: 28,
    fontWeight: 'bold',
    color: colors.text,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  sectionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    marginBottom: 20,
  },
  sectionButton: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 20,
    backgroundColor: colors.card,
  },
  activeSectionButton: {
    backgroundColor: colors.primary,
  },
  sectionButtonIcon: {
    marginRight: 8,
  },
  sectionButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
  },
  activeSectionButtonText: {
    color: colors.card,
  },
  contentContainer: {
    paddingHorizontal: 10,
    paddingBottom: 80,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: colors.background,
  },
  emptyText: {
    fontSize: 18,
    textAlign: 'center',
    marginTop: 40,
    color: colors.text,
  },
  columnWrapper: {
    justifyContent: 'space-between',
  },
  bookmarkCard: {
    width: Dimensions.get('window').width / 2 - 15,
    marginBottom: 15,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.card,
    elevation: 3,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  bookmarkImage: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  bookmarkInfo: {
    padding: 10,
  },
  bookmarkTitle: {
    fontSize: 14,
    fontWeight: '600',
    color: colors.text,
    marginBottom: 4,
  },
  lastReadChapter: {
    fontSize: 12,
    color: colors.tabIconDefault,
  },

});
