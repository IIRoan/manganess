import React, { useState, useEffect } from 'react';
import {
  StyleSheet,
  View,
  Text,
  TouchableOpacity,
  FlatList,
  ActivityIndicator,
  ScrollView,
  Dimensions,
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

/* Type Definitions */
interface MangaItem {
  id: string;
  title: string;
  imageUrl: string;
  rank?: number;
}

export default function HomeScreen() {
  const router = useRouter();
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme = theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const styles = getStyles(colors);

  // Safe area insets
  const insets = useSafeAreaInsets();

  // State variables
  const [mostViewedManga, setMostViewedManga] = useState<MangaItem[]>([]);
  const [newReleases, setNewReleases] = useState<MangaItem[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Dimensions for responsive design
  const { width } = Dimensions.get('window');
  const CARD_WIDTH = (width - 60) / 2;
  const MOST_VIEWED_CARD_WIDTH = 160;
  const MOST_VIEWED_CARD_HEIGHT = 260;

  useEffect(() => {
    fetchMangaData();
  }, []);

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

      if (html.includes('cf-browser-verification') || html.includes('cf_captcha_kind')) {
        throw new Error('Cloudflare WAF detected');
      }

      const parsedMostViewed = parseMostViewedManga(html);
      const parsedNewReleases = parseNewReleases(html);

      setMostViewedManga(parsedMostViewed);
      setNewReleases(parsedNewReleases);
    } catch (error) {
      console.error('Error fetching manga data:', error);
      setError(
        error instanceof Error && error.message === 'Cloudflare WAF detected'
          ? 'Cloudflare protection detected. Please try again later.'
          : 'An error occurred while fetching manga data. Please try again.'
      );
    } finally {
      setIsLoading(false);
    }
  };

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

  return (
    <View style={[styles.safeArea, { paddingTop: insets.top }]}>
      <View style={styles.container}>
        <View style={styles.header}>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>MangaNessie</Text>
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
              <Text style={styles.sectionTitle}>Top 10 Most Viewed Manga</Text>
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
              <Text style={styles.sectionTitle}>New Releases</Text>
              <View style={styles.newReleaseGrid}>
                {newReleases.map((item) => (
                  <View key={item.id} style={styles.newReleaseItemWrapper}>
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

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    safeArea: {
      flex: 1,
      backgroundColor: colors.background,
    },
    container: {
      flex: 1,
    },
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
    newReleaseGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
    },
    newReleaseItemWrapper: {
      width: (Dimensions.get('window').width - 60) / 2,
      marginBottom: 20,
    },
    content: {
      paddingBottom: 100,
    },
    section: {
      marginBottom: 24,
    },
    sectionTitle: {
      fontSize: 22,
      fontWeight: 'bold',
      marginBottom: 16,
      paddingHorizontal: 16,
      color: colors.text,
    },
    cardWrapper: {
      width: '100%',
      marginBottom: 16,
    },
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
    card: {
      width: '100%',
      aspectRatio: 3 / 4,
    },
  });
