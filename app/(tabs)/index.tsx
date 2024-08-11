import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Image, Text, TouchableOpacity, Dimensions, FlatList, ActivityIndicator, SafeAreaView, ScrollView, StatusBar } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import axios from 'axios';
import { LinearGradient } from 'expo-linear-gradient';

const { width } = Dimensions.get('window');

interface MangaItem {
  id: string;
  title: string;
  imageUrl: string;
  rank: number;
}

export default function HomeScreen() {
  const router = useRouter();
  const { actualTheme } = useTheme();
  const [mostViewedManga, setMostViewedManga] = useState<MangaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const colors = Colors[actualTheme];
  const styles = getStyles(colors);

  useEffect(() => {
    fetchMostViewedManga();
  }, []);

  const fetchMostViewedManga = async () => {
    try {
      setIsLoading(true);
      setError(null);

      const response = await axios.get('https://mangafire.to/home', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_6 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/14.0 Mobile/15E148 Safari/604.1',
        },
        timeout: 10000,
      });

      const html = response.data as string;

      // Check if the response contains Cloudflare WAF challenge
      if (html.includes('cf-browser-verification') || html.includes('cf_captcha_kind')) {
        throw new Error('Cloudflare WAF detected');
      }

      const parsedManga = parseMostViewedManga(html);
      setMostViewedManga(parsedManga);
    } catch (error) {
      console.error('Error fetching most viewed manga:', error);
      if (error instanceof Error && error.message === 'Cloudflare WAF detected') {
        setError('Cloudflare protection detected. Please try again later.');
      } else {
        setError('An error occurred while fetching manga data. Please try again.');
      }
    } finally {
      setIsLoading(false);
    }
  };


  const parseMostViewedManga = (html: string): MangaItem[] => {
    const regex = /<div class="swiper-slide unit[^>]*>.*?<a href="\/manga\/([^"]+)".*?<b>(\d+)<\/b>.*?<img src="([^"]+)".*?alt="([^"]+)".*?<\/a>/gs;
    const matches = [...html.matchAll(regex)];
    return matches.slice(0, 10).map(match => ({
      id: match[1],
      rank: parseInt(match[2]),
      imageUrl: match[3],
      title: match[4],
    }));
  };

  const handleMangaPress = (item: MangaItem) => {
    router.navigate(`/manga/${item.id}`);
  };


  const renderMangaItem = ({ item }: { item: MangaItem }) => (
    <TouchableOpacity style={styles.mangaItem} onPress={() => handleMangaPress(item)}>
      <Image source={{ uri: item.imageUrl }} style={styles.mangaImage} />
      <LinearGradient
        colors={['transparent', 'rgba(0,0,0,0.8)']}
        style={styles.mangaGradient}
      >
        <Text style={styles.mangaRank}>#{item.rank}</Text>
        <Text style={styles.mangaTitle} numberOfLines={2}>{item.title}</Text>
      </LinearGradient>
    </TouchableOpacity>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollViewContent}>
        <LinearGradient
          colors={[colors.primary, colors.background]}
          style={styles.headerContainer}
        >
          <Image
            source={require('@/assets/images/nessiehigh.png')}
            style={styles.bannerImage}
          />
          <View style={styles.headerContent}>
            <Text style={styles.title}>MangaNess</Text>
            <Text style={styles.subtitle}>Discover and read your favorite manga</Text>
          </View>
        </LinearGradient>
        <View style={styles.contentContainer}>
          <Text style={styles.sectionTitle}>Top 10 Most Viewed Manga</Text>
          {isLoading ? (
            <ActivityIndicator size="large" color={colors.primary} />
          ) : error ? (
            <View style={styles.errorContainer}>
              <Text style={styles.errorText}>{error}</Text>
              <TouchableOpacity style={styles.retryButton} onPress={fetchMostViewedManga}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <FlatList
              data={mostViewedManga}
              renderItem={renderMangaItem}
              keyExtractor={(item) => item.id}
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.mangaList}
            />
          )}
        </View>
      </ScrollView>
      <TouchableOpacity style={styles.exploreButton} onPress={() => router.navigate('/mangasearch')}>
        <Text style={styles.exploreButtonText}>Explore More</Text>
        <Ionicons name="arrow-forward" size={24} color="#fff" />
      </TouchableOpacity>
    </SafeAreaView>
  );
}


const getStyles = (colors: typeof Colors.light) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  scrollView: {
    flex: 1,
  },
  scrollViewContent: {
    flexGrow: 1,
  },
  headerContainer: {
    height: 250,
    justifyContent: 'flex-end',
    padding: 20,
  },
  bannerImage: {
    position: 'absolute',
    width: '100%',
    height: '100%',
    opacity: 0.6,
  },
  headerContent: {
    marginBottom: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 5,
  },
  subtitle: {
    fontSize: 16,
    color: '#fff',
    opacity: 0.8,
  },
  contentContainer: {
    padding: 20,
    backgroundColor: colors.background,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
    color: colors.text,
  },
  mangaList: {
    paddingRight: 20,
  },
  mangaItem: {
    width: 140,
    height: 210,
    marginRight: 15,
    borderRadius: 10,
    overflow: 'hidden',
  },
  mangaImage: {
    width: '100%',
    height: '100%',
    resizeMode: 'cover',
  },
  mangaGradient: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: '50%',
    justifyContent: 'flex-end',
    padding: 10,
  },
  mangaRank: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 5,
  },
  mangaTitle: {
    color: '#fff',
    fontSize: 14,
    fontWeight: 'bold',
  },
  exploreButton: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    marginHorizontal: 20,
    marginBottom: 120,
    borderRadius: 10,
  },
  exploreButtonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 10,
  },
  errorContainer: {
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
    color: '#fff',
    fontSize: 16,
    fontWeight: 'bold',
  },
});