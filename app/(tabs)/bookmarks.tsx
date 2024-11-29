import React, { useCallback, useState, useEffect } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@/constants/ThemeContext';
import { Colors, ColorScheme } from '@/constants/Colors';
import { Image } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MangaCard from '@/components/MangaCard';
import { getLastReadChapter } from '@/services/readChapterService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/* Type Definitions */
interface BookmarkItem {
  id: string;
  title: string;
  status: string;
  lastReadChapter: string;
  imageUrl: string;
}

export default function BookmarksScreen() {
  const [bookmarks, setBookmarks] = useState<BookmarkItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [activeSection, setActiveSection] = useState<'Reading' | 'To Read' | 'Read'>('Reading');
  const router = useRouter();

  // Theme and styling
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const styles = getStyles(colors);

  // Safe area insets
  const insets = useSafeAreaInsets();

  // Fetch bookmarks from AsyncStorage
  const fetchBookmarks = useCallback(async () => {
    setIsLoading(true);
    try {
      const keys = await AsyncStorage.getItem('bookmarkKeys');
      const bookmarkKeys = keys ? JSON.parse(keys) : [];
      const bookmarkPromises = bookmarkKeys.map(async (key: string) => {
        const status = (await AsyncStorage.getItem(key)) || '';
        const id = key.split('_')[1];
        const title = (await AsyncStorage.getItem(`title_${id}`)) || '';
        const lastReadChapter = await getLastReadChapter(id);
        const imageUrl = (await AsyncStorage.getItem(`image_${id}`)) || '';
        return { id, title, status, lastReadChapter, imageUrl };
      });
      const bookmarkItems = await Promise.all(bookmarkPromises);
      setBookmarks(
        bookmarkItems.filter(
          (item): item is BookmarkItem => item.title !== '' && item.imageUrl !== ''
        )
      );
    } catch (error) {
      console.error('Error fetching bookmarks:', error);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    // Fetch bookmarks on initial load
    fetchBookmarks();
  }, [fetchBookmarks]);

  useFocusEffect(
    useCallback(() => {
      const checkAndFetchBookmarks = async () => {
        try {
          const bookmarkChanged = await AsyncStorage.getItem('bookmarkChanged');
          if (bookmarkChanged === 'true') {
            await fetchBookmarks();
            await AsyncStorage.setItem('bookmarkChanged', 'false'); // Reset the flag
          }
        } catch (error) {
          console.error('Error checking bookmark changed flag:', error);
        }
      };

      checkAndFetchBookmarks();
    }, [fetchBookmarks])
  );

  const handleBookmarkPress = (id: string) => {
    router.push(`/manga/${id}`);
  };

  const renderBookmarkItem = ({ item }: { item: BookmarkItem }) => (
    <View style={styles.bookmarkCardWrapper}>
      <MangaCard
        title={item.title}
        imageUrl={item.imageUrl}
        onPress={() => handleBookmarkPress(item.id)}
        lastReadChapter={item.lastReadChapter}
        style={styles.bookmarkCard}
      />
    </View>
  );

  const renderSectionButton = (title: 'Reading' | 'To Read' | 'Read') => {
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
        style={[
          styles.sectionButton,
          activeSection === title && styles.activeSectionButton,
        ]}
        onPress={() => setActiveSection(title)}
      >
        <Ionicons
          name={iconName}
          size={20}
          color={activeSection === title ? colors.card : colors.text}
          style={styles.sectionButtonIcon}
        />
        <Text
          style={[
            styles.sectionButtonText,
            activeSection === title && styles.activeSectionButtonText,
          ]}
        >
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
    <SafeAreaView style={[styles.container, { paddingTop: insets.top }]}>
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

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.text,
      paddingHorizontal: 20,
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
      paddingHorizontal: 15,
      paddingBottom: 80,
    },
    columnWrapper: {
      justifyContent: 'space-between',
    },
    bookmarkCardWrapper: {
      width: '48%',
      marginBottom: 15,
    },
    bookmarkCard: {
      flex: 1,
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
  });

