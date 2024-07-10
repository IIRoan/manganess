import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, StyleSheet, Image, Dimensions, Switch } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import { Ionicons } from '@expo/vector-icons';
import { BackHandler } from 'react-native';
import { useTheme } from '@/constants/ThemeContext';

interface MangaDetails {
    title: string;
    alternativeTitle: string;
    status: string;
    description: string;
    author: string[];
    published: string;
    genres: string[];
    rating: string;
    reviewCount: string;
    bannerImage: string;
    chapters: Array<{ number: string; title: string; date: string; url: string }>;
}

const { width } = Dimensions.get('window');

export default function MangaDetailScreen() {
    const { id } = useLocalSearchParams();
    const [mangaDetails, setMangaDetails] = useState<MangaDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [readChapters, setReadChapters] = useState<string[]>([]);
    const router = useRouter();
    const { theme, toggleTheme, actualTheme } = useTheme();

    const styles = getStyles(actualTheme);

    useEffect(() => {
        fetchMangaDetails();
        fetchReadChapters();
    }, [id]);

    useFocusEffect(
        React.useCallback(() => {
            const onBackPress = () => {
                router.push(`/mangasearch`);
                return true;
            };

            BackHandler.addEventListener('hardwareBackPress', onBackPress);

            return () => BackHandler.removeEventListener('hardwareBackPress', onBackPress);
        }, [router])
    );

    const fetchMangaDetails = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`https://mangafire.to/manga/${id}`, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:127.0) Gecko/20100101 Firefox/127.0',
                    'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
                },
            });

            if (!response.ok) {
                throw new Error('Failed to fetch manga details');
            }

            const html = await response.text();
            const details = parseMangaDetails(html);
            setMangaDetails(details);
        } catch (err) {
            setError('Failed to load manga details. Please try again.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };

    const parseMangaDetails = (html: string): MangaDetails => {
        const title = html.match(/<h1 itemprop="name">(.*?)<\/h1>/)?.[1] || 'Unknown Title';
        const alternativeTitle = html.match(/<h6>(.*?)<\/h6>/)?.[1] || '';
        const status = html.match(/<p>(.*?)<\/p>/)?.[1] || 'Unknown Status';
        const description = html.match(/<div class="description">(.*?)<\/div>/s)?.[1]?.replace(/<[^>]*>/g, '') || 'No description available';

        const authorMatch = html.match(/<span>Author:<\/span>.*?<span>(.*?)<\/span>/s);
        const authors = authorMatch ? authorMatch[1].match(/<a[^>]*>(.*?)<\/a>/g)?.map(a => a.replace(/<[^>]*>/g, '')) || [] : [];

        const published = html.match(/<span>Published:<\/span>.*?<span>(.*?)<\/span>/s)?.[1] || 'Unknown';

        const genresMatch = html.match(/<span>Genres:<\/span>.*?<span>(.*?)<\/span>/s);
        const genres = genresMatch ? genresMatch[1].match(/<a[^>]*>(.*?)<\/a>/g)?.map(a => a.replace(/<[^>]*>/g, '')) || [] : [];

        const rating = html.match(/<span class="live-score" itemprop="ratingValue">(.*?)<\/span>/)?.[1] || 'N/A';
        const reviewCount = html.match(/<span itemprop="reviewCount".*?>(.*?)<\/span>/)?.[1] || '0';
        const bannerImageMatch = html.match(/<div class="poster">.*?<img src="(.*?)" itemprop="image"/s);
        const bannerImage = bannerImageMatch ? bannerImageMatch[1] : '';

        const chaptersRegex = /<li class="item".*?<a href="(.*?)".*?<span>Chapter (\d+):.*?<\/span>.*?<span>(.*?)<\/span>/g;
        const chapters = [];
        let match;
        while ((match = chaptersRegex.exec(html)) !== null) {
            chapters.push({
                url: match[1],
                number: match[2],
                title: `Chapter ${match[2]}`,
                date: match[3],
            });
        }

        return {
            title,
            alternativeTitle,
            status,
            description,
            author: authors,
            published,
            genres,
            rating,
            reviewCount,
            bannerImage,
            chapters,
        };
    };



    const fetchReadChapters = useCallback(async () => {
        try {
            const key = `manga_${id}_read_chapters`;
            const storedChapters = await SecureStore.getItemAsync(key);
            if (storedChapters) {
                const parsedChapters = JSON.parse(storedChapters);
                setReadChapters(parsedChapters);
            }
        } catch (error) {
            console.error('Error fetching read chapters:', error);
        }
    }, [id]);

    useEffect(() => {
        setMangaDetails(null);
        setIsLoading(true);
        fetchMangaDetails();
    }, [id]);

    useFocusEffect(
        useCallback(() => {
            fetchReadChapters();
        }, [fetchReadChapters])
    );

    const handleChapterPress = (chapterNumber: string) => {
        router.push(`/manga/${id}/chapter/${chapterNumber}`);
    };

    const handleBackPress = () => {
        router.push(`/mangasearch`);
    };

    

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={theme === 'dark' ? '#FFFFFF' : '#0000FF'} />
            </View>
        );
    }

    if (error) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>{error}</Text>
            </View>
        );
    }

    if (!mangaDetails) {
        return (
            <View style={styles.errorContainer}>
                <Text style={styles.errorText}>No manga details found.</Text>
            </View>
        );
    }

    return (
        <ScrollView style={styles.container}>
            <View style={styles.headerContainer}>
                <Image
                    source={{ uri: mangaDetails.bannerImage }}
                    style={styles.bannerImage}
                    onError={(error) => console.error('Error loading banner image:', error)}
                />
                <View style={styles.overlay} />
                <View style={styles.headerContent}>
                <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
                    <Ionicons name="arrow-back" size={28} color={theme === 'dark' ? '#FFFFFF' : '#FFFFFF'} />
                </TouchableOpacity>
                    <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
                        {mangaDetails.title}
                    </Text>
                    {mangaDetails.alternativeTitle && (
                        <Text style={styles.alternativeTitle} numberOfLines={1} ellipsizeMode="tail">
                            {mangaDetails.alternativeTitle}
                        </Text>
                    )}
                    <View style={styles.statusContainer}>
                        <Text style={styles.statusText}>{mangaDetails.status}</Text>
                    </View>
                </View>
            </View>
            <View style={styles.infoContainer}>
                <Text style={styles.sectionTitle}>Description</Text>
                <Text style={styles.description}>{mangaDetails.description}</Text>
                <Text style={styles.sectionTitle}>Details</Text>
                <Text style={styles.infoText}>Author: {mangaDetails.author.join(', ')}</Text>
                <Text style={styles.infoText}>Published: {mangaDetails.published}</Text>
                <Text style={styles.infoText}>Genres: {mangaDetails.genres.join(', ')}</Text>
                <View style={styles.ratingContainer}>
                    <Text style={styles.rating}>{mangaDetails.rating}</Text>
                    <Text style={styles.ratingText}>/10 ({mangaDetails.reviewCount} reviews)</Text>
                </View>
            </View>
            <View style={styles.chaptersContainer}>
                <Text style={styles.sectionTitle}>Chapters</Text>
                {mangaDetails.chapters.map((chapter, index) => {
                    const isRead = readChapters.includes(chapter.number);
                    return (
                        <TouchableOpacity
                            key={index}
                            style={styles.chapterItem}
                            onPress={() => handleChapterPress(chapter.number)}
                        >
                            <View style={styles.chapterInfo}>
                                <Text style={[styles.chapterTitle, isRead && styles.readChapterTitle]}>
                                    {chapter.title}
                                </Text>
                                <Text style={styles.chapterDate}>{chapter.date}</Text>
                            </View>
                            <View style={styles.chapterStatus}>
                                {isRead ? (
                                    <Ionicons name="checkmark-circle" size={24} color="#4CAF50" />
                                ) : (
                                    <Ionicons name="ellipse-outline" size={24} color={theme === 'dark' ? '#BDBDBD' : '#757575'} />
                                )}
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </ScrollView>
    );
}

const getStyles = (theme: 'light' | 'dark') => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: theme === 'dark' ? '#121212' : '#f5f5f5',
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: theme === 'dark' ? '#121212' : '#f5f5f5',
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: theme === 'dark' ? '#121212' : '#f5f5f5',
    },
    errorText: {
        fontSize: 18,
        color: theme === 'dark' ? '#FF6B6B' : '#B00020',
        textAlign: 'center',
    },
    headerContainer: {
        height: 300,
        position: 'relative',
    },
    bannerImage: {
        width: '100%',
        height: '100%',
        resizeMode: 'cover',
    },
    overlay: {
        ...StyleSheet.absoluteFillObject,
        backgroundColor: 'rgba(0, 0, 0, 0.65)',
    },
    headerContent: {
        position: 'absolute',
        bottom: 20,
        left: 20,
        right: 20,
    },
    title: {
        fontSize: 28,
        fontWeight: 'bold',
        color: '#fff',
        marginBottom: 5,
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: -1, height: 1 },
        textShadowRadius: 10,
    },
    alternativeTitle: {
        fontSize: 18,
        color: '#e0e0e0',
        marginBottom: 10,
        textShadowColor: 'rgba(0, 0, 0, 0.75)',
        textShadowOffset: { width: -1, height: 1 },
        textShadowRadius: 10,
    },
    statusContainer: {
        backgroundColor: theme === 'dark' ? '#BB86FC' : '#6200ee',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        alignSelf: 'flex-start',
        marginTop: 10,
    },
    statusText: {
        color: theme === 'dark' ? '#000' : '#fff',
        fontWeight: 'bold',
    },
    infoContainer: {
        padding: 20,
        backgroundColor: theme === 'dark' ? '#1E1E1E' : '#fff',
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        marginTop: -20,
    },
    sectionTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 10,
        color: theme === 'dark' ? '#E1E1E1' : '#333',
    },
    description: {
        fontSize: 16,
        marginBottom: 20,
        lineHeight: 24,
        color: theme === 'dark' ? '#B0B0B0' : '#444',
    },
    infoText: {
        fontSize: 16,
        marginBottom: 10,
        color: theme === 'dark' ? '#B0B0B0' : '#555',
    },
    ratingContainer: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginTop: 10,
    },
    rating: {
        fontSize: 24,
        fontWeight: 'bold',
        color: theme === 'dark' ? '#BB86FC' : '#6200ee',
    },
    ratingText: {
        fontSize: 16,
        marginLeft: 5,
        color: theme === 'dark' ? '#B0B0B0' : '#666',
    },
    chaptersContainer: {
        padding: 20,
        backgroundColor: theme === 'dark' ? '#1E1E1E' : '#fff',
    },
    chapterInfo: {
        flex: 1,
    },
    chapterItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: theme === 'dark' ? '#333' : '#e0e0e0',
    },
    backButton: {
        padding: 10,
    },
    chapterTitle: {
        fontSize: 16,
        fontWeight: '500',
        color: theme === 'dark' ? '#E1E1E1' : '#333',
    },
    chapterDate: {
        fontSize: 14,
        color: theme === 'dark' ? '#B0B0B0' : '#666',
        marginTop: 5,
    },
    chapterStatus: {
        marginLeft: 10,
    },
    readChapterTitle: {
        color: '#4CAF50',
        fontWeight: '600',
    },
    readIndicator: {
        backgroundColor: '#4CAF50',
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 15,
    },
    readIndicatorText: {
        color: '#fff',
        fontSize: 12,
        fontWeight: 'bold',
    },

});