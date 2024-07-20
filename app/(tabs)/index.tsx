import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Image, Text, TouchableOpacity, Dimensions, FlatList, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import axios from 'axios';

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

      const html = response.data;

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
      <View style={styles.mangaRankContainer}>
        <Text style={styles.mangaRank}>#{item.rank}</Text>
      </View>
      <Text style={styles.mangaTitle} numberOfLines={2}>{item.title}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Image
          source={require('@/assets/images/nessiehigh.png')}
          style={styles.bannerImage}
        />
        <View style={styles.overlay} />
        <View style={styles.headerContent}>
          <Text style={styles.title}>MangaNess</Text>
          <Text style={styles.subtitle}>Discover and read your favorite manga</Text>
        </View>
      </View>
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
        <TouchableOpacity style={styles.button} onPress={() => router.navigate('/mangasearch')}>
          <Text style={styles.buttonText}>Explore More</Text>
          <Ionicons name="arrow-forward" size={24} color="#fff" style={styles.buttonIcon} />
        </TouchableOpacity>
      </View>
    </View>
  );
}

const getStyles = (colors: typeof Colors.light) => StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: colors.background,
  },
  headerContainer: {
    height: 350,
    position: 'relative',
    overflow: 'hidden',
  },
  bannerImage: {
    position: 'absolute',
    width: '150%',
    height: '160%',
    resizeMode: 'cover',
    top: '15%',
    left: '-5%',
    transform: [
      { rotate: '40deg' },
      { translateX: -150 },
      { translateY: 50 },
    ],
  },
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0, 0, 0, 0.3)',
  },
  headerContent: {
    position: 'absolute',
    bottom: 20,
    left: 20,
    right: 20,
  },
  title: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#fff',
    marginBottom: 10,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  subtitle: {
    fontSize: 18,
    color: '#e0e0e0',
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: -1, height: 1 },
    textShadowRadius: 10,
  },
  contentContainer: {
    padding: 20,
    backgroundColor: colors.background,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    marginTop: -20,
    flex: 1,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
    color: colors.text,
  },
  mangaList: {
    paddingBottom: 10,
  },
  mangaItem: {
    width: 120,
    marginRight: 15,
  },
  mangaImage: {
    width: 120,
    height: 180,
    borderRadius: 8,
  },
  mangaRankContainer: {
    position: 'absolute',
    top: 5,
    left: 5,
    backgroundColor: 'rgba(0,0,0,0.7)',
    borderRadius: 12,
    padding: 5,
  },
  mangaRank: {
    color: '#fff',
    fontWeight: 'bold',
    fontSize: 12,
  },
  mangaTitle: {
    marginTop: 8,
    fontSize: 14,
    color: colors.text,
    textAlign: 'center',
  },
  button: {
    backgroundColor: colors.primary,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 15,
    borderRadius: 10,
    marginTop: 20,
  },
  buttonText: {
    color: '#fff',
    fontSize: 18,
    fontWeight: 'bold',
    marginRight: 10,
  },
  buttonIcon: {
    marginLeft: 5,
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