import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Image, Text, TouchableOpacity, Dimensions, FlatList, ActivityIndicator, Alert } from 'react-native';
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
  const [debugInfo, setDebugInfo] = useState<string>('');

  const colors = Colors[actualTheme];
  const styles = getStyles(colors);

  useEffect(() => {
    fetchMostViewedManga();
  }, []);

  const fetchMostViewedManga = async () => {
    try {
      setDebugInfo('Fetching data...');
      const response = await axios.get('https://mangafire.to/home', {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
        },
        timeout: 10000,
      });
      setDebugInfo(debugInfo + '\nResponse received.');
      const html = response.data;
      setDebugInfo(debugInfo + '\nParsing manga data...');
      const parsedManga = parseMostViewedManga(html);
      setMostViewedManga(parsedManga);
      setDebugInfo(debugInfo + `\nParsed ${parsedManga.length} manga items.`);
    } catch (error) {
      let errorMessage = 'An unexpected error occurred';
      if (axios.isAxiosError(error)) {
        if (error.response) {
          errorMessage = `Server error: ${error.response.status}`;
          setDebugInfo(debugInfo + `\nServer responded with status ${error.response.status}`);
        } else if (error.request) {
          errorMessage = 'No response received from server';
          setDebugInfo(debugInfo + '\nNo response received from server');
        } else {
          errorMessage = `Error: ${error.message}`;
          setDebugInfo(debugInfo + `\nError: ${error.message}`);
        }
      }
      setError(errorMessage);
    } finally {
      setIsLoading(false);
      setDebugInfo(debugInfo + '\nFetch operation completed.');
    }
  };

  const parseMostViewedManga = (html: string): MangaItem[] => {
    const regex = /<div class="swiper-slide unit[^>]*>.*?<a href="\/manga\/([^"]+)".*?<b>(\d+)<\/b>.*?<img src="([^"]+)".*?alt="([^"]+)".*?<\/a>/gs;
    const matches = [...html.matchAll(regex)];
    setDebugInfo(debugInfo + `\nFound ${matches.length} matches in HTML.`);
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

  useEffect(() => {
    if (error || debugInfo) {
      Alert.alert(
        "Debug Information",
        `Error: ${error}\n\nDebug Info:\n${debugInfo}`,
        [
          { text: "OK", onPress: () => {
            setError(null);
            setDebugInfo('');
          }}
        ]
      );
    }
  }, [error, debugInfo]);

  return (
    <View style={styles.container}>
      <View style={styles.headerContainer}>
        <Image
          source={require('@/assets/images/nessie.png')}
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
    height: '150%',
    resizeMode: 'cover',
    top: '-15%',
    left: '-25%',
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
});