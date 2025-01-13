import React, { useCallback, useState, useEffect, useRef } from 'react';
import {
  View,
  Text,
  FlatList,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
  SafeAreaView,
  Animated,
  Dimensions,
  PanResponder,
} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { useRouter } from 'expo-router';
import { useFocusEffect } from '@react-navigation/native';
import { useTheme } from '@/constants/ThemeContext';
import { Colors } from '@/constants/Colors';
import { Ionicons } from '@expo/vector-icons';
import MangaCard from '@/components/MangaCard';
import { getLastReadChapter } from '@/services/readChapterService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SECTIONS = ['Reading', 'To Read', 'Read'] as const;
type Section = typeof SECTIONS[number];

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
  const [activeSection, setActiveSection] = useState<Section>('Reading');
  const translateX = useRef(new Animated.Value(0)).current;
  const currentIndexRef = useRef(0);
  const router = useRouter();

  // Theme and styling
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const styles = getStyles(colors);
  const insets = useSafeAreaInsets();

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponderCapture: (_, gestureState) => {
        return Math.abs(gestureState.dx) > Math.abs(gestureState.dy);
      },
      onPanResponderMove: (_, gestureState) => {
        const newTranslateX = -currentIndexRef.current * SCREEN_WIDTH + gestureState.dx;
        translateX.setValue(newTranslateX);
      },
      onPanResponderRelease: (_, gestureState) => {
        const currentIndex = currentIndexRef.current;
        let newIndex = currentIndex;

        if (Math.abs(gestureState.dx) > SCREEN_WIDTH * 0.14) {
          if (gestureState.dx > 0 && currentIndex > 0) {
            newIndex = currentIndex - 1;
          } else if (gestureState.dx < 0 && currentIndex < SECTIONS.length - 1) {
            newIndex = currentIndex + 1;
          }
        }

        animateToSection(newIndex);
        setActiveSection(SECTIONS[newIndex]);
        currentIndexRef.current = newIndex;
      },
    })
  ).current;

  const animateToSection = (index: number) => {
    Animated.spring(translateX, {
      toValue: -index * SCREEN_WIDTH,
      useNativeDriver: true,
      friction: 8,
      tension: 40,
    }).start();
  };

  const handleSectionPress = (section: Section) => {
    const newIndex = SECTIONS.indexOf(section);
    animateToSection(newIndex);
    setActiveSection(section);
    currentIndexRef.current = newIndex;
  };

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
    fetchBookmarks();
  }, [fetchBookmarks]);

  useFocusEffect(
    useCallback(() => {
      const checkAndFetchBookmarks = async () => {
        try {
          const bookmarkChanged = await AsyncStorage.getItem('bookmarkChanged');
          if (bookmarkChanged === 'true') {
            await fetchBookmarks();
            await AsyncStorage.setItem('bookmarkChanged', 'false');
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

  const renderSectionButton = (title: Section) => {
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
        key={title}
        style={[
          styles.sectionButton,
          activeSection === title && styles.activeSectionButton,
        ]}
        onPress={() => handleSectionPress(title)}
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

  const renderSection = (section: Section) => {
    const filteredBookmarks = bookmarks.filter((item) => item.status === section);
    
    return (
      <View style={styles.sectionContainer}>
        {filteredBookmarks.length === 0 ? (
          <Text style={styles.emptyText}>No {section.toLowerCase()} manga found.</Text>
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
      </View>
    );
  };

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
        {SECTIONS.map((section) => renderSectionButton(section))}
      </View>
      <Animated.View
        style={[
          styles.sectionsContainer,
          {
            transform: [{ translateX }],
          },
        ]}
        {...panResponder.panHandlers}
      >
        {SECTIONS.map((section) => (
          <View key={section} style={styles.sectionWrapper}>
            {renderSection(section)}
          </View>
        ))}
      </Animated.View>
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
      zIndex: 1,
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
    sectionsContainer: {
      flex: 1,
      flexDirection: 'row',
      width: SCREEN_WIDTH * 3,
    },
    sectionWrapper: {
      width: SCREEN_WIDTH,
    },
    sectionContainer: {
      flex: 1,
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