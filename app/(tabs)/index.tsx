import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
  Image,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ColorScheme } from '@/constants/Colors';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';
import { NessieAnimation } from '@/components/NessieAnimation';
import { MANGA_API_URL } from '@/constants/Config';
import MangaCard from '@/components/MangaCard';
import { parseMostViewedManga, parseNewReleases } from '@/services/mangaFireService';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useCloudflareDetection } from '@/hooks/useCloudflareDetection';

// Types
interface MangaItem {
  id: string;
  title: string;
  imageUrl: string;
  rank?: number;
}

export default function HomeScreen() {
  // Hooks
  const router = useRouter();
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme = theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);
  const { checkForCloudflare, resetCloudflareDetection } = useCloudflareDetection();
  const insets = useSafeAreaInsets();

  // State
  const [mostViewedManga, setMostViewedManga] = useState<MangaItem[]>([]);
  const [newReleases, setNewReleases] = useState<MangaItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Effects
  useEffect(() => {
    fetchMangaData();
    return () => {
      resetCloudflareDetection();
    };
  }, []);

  // Data Fetching
  const fetchMangaData = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await axios.get(`${MANGA_API_URL}/home`, {
        headers: {
          'User-Agent':
            'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        },
        timeout: 10000,
      });

      const html = response.data as string;

      if (checkForCloudflare(html)) {
        return;
      }

      const parsedMostViewed = parseMostViewedManga(html);
      const parsedNewReleases = parseNewReleases(html);

      setMostViewedManga(parsedMostViewed);
      setNewReleases(parsedNewReleases);
    } catch (error) {
      console.error('Error fetching manga data:', error);
      setError('An error occurred while fetching manga data. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  // Render Helpers
  const renderSectionTitle = (title: string, iconName: keyof typeof Ionicons.glyphMap) => (
    <View style={styles.sectionTitleContainer}>
      <Ionicons name={iconName} size={24} color={colors.primary} style={styles.sectionIcon} />
      <Text style={styles.sectionTitle}>{title}</Text>
    </View>
  );

  const renderMostViewedItem = ({ item }: { item: MangaItem }) => (
    <TouchableOpacity
      style={styles.mostViewedItem}
      onPress={() => router.navigate(`/manga/${item.id}`)}
    >
      <Image source={{ uri: item.imageUrl }} style={styles.mostViewedImage} />
      <LinearGradient
        colors={['transparent', `${colors.background}E6`]}
        style={styles.infoContainer}
      >
        <View style={styles.titleContainer}>
          <Text style={styles.mangaTitle} numberOfLines={2}>
            {item.title}
          </Text>
        </View>
        {item.rank && <Text style={styles.rankText}>#{item.rank}</Text>}
      </LinearGradient>
    </TouchableOpacity>
  );

  const renderNewReleaseItem = ({ item }: { item: MangaItem }) => (
    <View style={styles.cardWrapper}>
      <MangaCard
        title={item.title}
        imageUrl={item.imageUrl}
        onPress={() => router.navigate(`/manga/${item.id}`)}
        lastReadChapter={null}
        style={styles.card}
      />
      <View style={styles.titleContainer}>
        <Text style={styles.mangaTitle} numberOfLines={2}>
          {item.title}
        </Text>
      </View>
    </View>
  );

  // Main Render
  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>MangaNess</Text>
            <View style={styles.nessieContainer}>
              <NessieAnimation />
            </View>
          </View>
          <TouchableOpacity onPress={() => router.navigate('/mangasearch')}>
            <Ionicons name="search" size={24} color={colors.text} />
          </TouchableOpacity>
        </View>
        {isLoading ? (
          <ActivityIndicator size="large" color={colors.primary} style={styles.loader} />
        ) : error ? (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity style={styles.retryButton} onPress={fetchMangaData}>
              <Text style={styles.retryButtonText}>Retry</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={styles.content}>
            <View style={styles.section}>
              {renderSectionTitle('Trending Now', 'trophy')}
              <FlatList
                data={mostViewedManga}
                renderItem={renderMostViewedItem}
                keyExtractor={(item) => item.id}
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.mostViewedList}
              />
            </View>
            <View style={styles.section}>
              {renderSectionTitle('New Releases', 'sparkles')}
              <View style={styles.newReleaseGrid}>
                {newReleases.map((item) => (
                  <View key={item.id} style={styles.newReleaseWrapper}>
                    {renderNewReleaseItem({ item })}
                  </View>
                ))}
              </View>
            </View>
          </ScrollView>
        )}
      </View>
    </View>
  );
}


// Styles
const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    // Layout
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
    },
    content: {
      paddingBottom: 100,
    },
    section: {
      marginBottom: 24,
    },

    // Header
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      paddingHorizontal: 15,
      paddingBottom: 10,
      backgroundColor: colors.background,
    },
    headerTitleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    headerTitle: {
      fontSize: 28,
      fontWeight: 'bold',
      color: colors.text,
      marginRight: 10,
    },
    nessieContainer: {
      justifyContent: 'center',
      alignItems: 'center',
    },

    // Section Titles
    sectionTitleContainer: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: 16,
      marginBottom: 16,
    },
    sectionIcon: {
      marginRight: 8,
    },
    sectionTitle: {
      fontSize: 22,
      fontWeight: 'bold',
      color: colors.text,
    },

    // Most Viewed Section
    mostViewedList: {
      paddingLeft: 16,
      paddingRight: 8,
    },
    mostViewedItem: {
      width: 160,
      height: 260,
      marginRight: 15,
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: colors.card,
    },
    mostViewedImage: {
      width: '100%',
      height: '100%',
      resizeMode: 'cover',
    },
    infoContainer: {
      position: 'absolute',
      bottom: 0,
      left: 0,
      right: 0,
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-end',
      padding: 10,
      backgroundColor: `${colors.background}CC`,
    },

    // New Releases Section
    newReleaseGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 16,
    },
    newReleaseWrapper: {
      width: '50%',
      padding: 4,
    },
    cardWrapper: {
      width: '100%',
      marginBottom: 16,
    },
    card: {
      width: '100%',
      aspectRatio: 3 / 4,
    },

    // Common Components
    titleContainer: {
      flex: 1,
      marginRight: 10,
    },
    mangaTitle: {
      color: colors.text,
      fontSize: 14,
      fontWeight: 'bold',
    },
    rankText: {
      color: colors.primary,
      fontSize: 16,
      fontWeight: 'bold',
    },

    // Loading & Error States
    loader: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    errorContainer: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      padding: 20,
    },
    errorText: {
      fontSize: 16,
      color: colors.error,
      textAlign: 'center',
      marginBottom: 15,
    },
    retryButton: {
      backgroundColor: colors.primary,
      paddingHorizontal: 20,
      paddingVertical: 10,
      borderRadius: 5,
    },
    retryButtonText: {
      color: colors.card,
      fontSize: 16,
      fontWeight: 'bold',
    },
  });
