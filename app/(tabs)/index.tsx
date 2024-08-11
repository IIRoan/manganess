import React, { useState, useEffect } from 'react';
import { StyleSheet, View, Image, Text, TouchableOpacity, FlatList, ActivityIndicator, SafeAreaView, StatusBar, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { Colors } from '@/constants/Colors';
import axios from 'axios';


interface MangaItem {
  id: string;
  title: string;
  imageUrl: string;
  rank?: number;
}



export default function HomeScreen() {
  const router = useRouter();
  const { actualTheme } = useTheme();
  const [mostViewedManga, setMostViewedManga] = useState<MangaItem[]>([]);
  const [newReleases, setNewReleases] = useState<MangaItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const colors = Colors[actualTheme];
  const styles = getStyles(colors);

  useEffect(() => {
    fetchMangaData();
  }, []);

  const fetchMangaData = async () => {
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
  
      if (html.includes('cf-browser-verification') || html.includes('cf_captcha_kind')) {
        throw new Error('Cloudflare WAF detected');
      }
  
      const parsedMostViewed = parseMostViewedManga(html);
      const parsedNewReleases = parseNewReleases(html);
      
      setMostViewedManga(parsedMostViewed);
      setNewReleases(parsedNewReleases);
    } catch (error) {
      console.error('Error fetching manga data:', error);
      setError(error instanceof Error && error.message === 'Cloudflare WAF detected'
        ? 'Cloudflare protection detected. Please try again later.'
        : 'An error occurred while fetching manga data. Please try again.');
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

  const parseNewReleases = (html: string): MangaItem[] => {
    // Find all home-swiper sections
    const homeSwiperRegex = /<section class="home-swiper">([\s\S]*?)<\/section>/g;
    const homeSwiperMatches = Array.from(html.matchAll(homeSwiperRegex));
  
    for (const match of homeSwiperMatches) {
      const swiperContent = match[1];
      
      // Check if this home-swiper contains the "New Release" heading
      if (swiperContent.includes('<h2>New Release</h2>')) {
  
        // Extract individual manga items
        const itemRegex = /<div class="swiper-slide unit[^"]*">\s*<a href="\/manga\/([^"]+)">\s*<div class="poster">\s*<div><img src="([^"]+)" alt="([^"]+)"><\/div>\s*<\/div>\s*<span>([^<]+)<\/span>\s*<\/a>\s*<\/div>/g;
        const matches = Array.from(swiperContent.matchAll(itemRegex));
    
        const mangaItems = matches.map(match => ({
          id: match[1],
          imageUrl: match[2],
          title: match[4].trim(), 
        }));
  
  
        return mangaItems;
      }
    }
  
    console.log('Could not find "New Release" section');
    return [];
  };


  const renderMangaItem = ({ item }: { item: MangaItem }) => (
    <TouchableOpacity style={styles.mangaItem} onPress={() => router.navigate(`/manga/${item.id}`)}>
      <Image source={{ uri: item.imageUrl }} style={styles.mangaImage} />
      <View style={styles.mangaInfo}>
        {item.rank && <Text style={styles.mangaRank}>#{item.rank}</Text>}
        <Text style={styles.mangaTitle} numberOfLines={2}>{item.title}</Text>
      </View>
    </TouchableOpacity>
  );

  const renderSection = (title: string, data: MangaItem[] , renderItem: any) => (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      {title === 'Latest Updates' ? (
        <FlatList
          data={data}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          showsVerticalScrollIndicator={false}
          scrollEnabled={false}
          contentContainerStyle={styles.latestUpdatesList}
        />
      ) : (
        <FlatList
          data={data}
          renderItem={renderItem}
          keyExtractor={(item) => item.id}
          horizontal
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.mangaList}
        />
      )}
    </View>
  );

  return (
    <SafeAreaView style={styles.safeArea}>
      <StatusBar barStyle="light-content" />
      <View style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.headerTitle}>MangaNess</Text>
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
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.content}
          >
            {renderSection('Top 10 Most Viewed Manga', mostViewedManga, renderMangaItem)}
            {renderSection('New Releases', newReleases, renderMangaItem)}
          </ScrollView>
        )}
      </View>
    </SafeAreaView>
  );
}
const getStyles = (colors: typeof Colors.light) => StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.background,
  },
  container: {
    flex: 1,
    paddingTop: StatusBar.currentHeight || 0,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 15,
    backgroundColor: colors.card,
  },
  headerTitle: {
    fontSize: 24,
    fontWeight: 'bold',
    color: colors.text,
  },
  content: {
    paddingBottom: 100,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    marginBottom: 15,
    paddingHorizontal: 20,
    color: colors.text,
  },
  mangaList: {
    paddingLeft: 20,
  },
  mangaItem: {
    width: 140,
    marginRight: 15,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: colors.card,
    elevation: 3,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  mangaImage: {
    width: '100%',
    height: 200,
    resizeMode: 'cover',
  },
  mangaInfo: {
    padding: 10,
  },
  mangaRank: {
    color: colors.primary,
    fontWeight: 'bold',
    fontSize: 14,
    marginBottom: 5,
  },
  mangaTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
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
  latestUpdatesList: {
    paddingHorizontal: 20,
  },
  latestUpdateItem: {
    flexDirection: 'row',
    marginBottom: 15,
    backgroundColor: colors.card,
    borderRadius: 10,
    overflow: 'hidden',
    elevation: 3,
    shadowColor: colors.text,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
  latestUpdateImage: {
    width: 80,
    height: 120,
    resizeMode: 'cover',
  },
  latestUpdateInfo: {
    flex: 1,
    padding: 10,
    justifyContent: 'space-between',
  },
  latestUpdateTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 5,
  },
  latestUpdateType: {
    color: colors.primary,
    fontSize: 14,
    marginBottom: 5,
  },
  latestUpdateChapter: {
    color: colors.text,
    fontSize: 14,
  },
});
