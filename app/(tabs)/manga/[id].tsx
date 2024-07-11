import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, StyleSheet, Image, Dimensions, useColorScheme } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect } from 'expo-router';
import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons, FontAwesome } from '@expo/vector-icons';
import { BackHandler } from 'react-native';
import { useTheme } from '@/constants/ThemeContext';
import { Colors, ColorScheme } from '@/constants/Colors';
import { decode } from 'html-entities';
import ExpandableText from '@/components/ExpandableText';
import Alert2 from '@/components/Alert';
import { Alert } from 'react-native';

type BookmarkStatus = "To Read" | "Reading" | "Read";

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
    const { theme } = useTheme();
    const systemColorScheme = useColorScheme() as ColorScheme;
    const colorScheme = theme === 'system' ? systemColorScheme : theme as ColorScheme;
    const colors = Colors[colorScheme];
    const [bookmarkStatus, setBookmarkStatus] = useState<string | null>(null);
    const [isAlertVisible, setIsAlertVisible] = useState(false);
    const styles = getStyles(colors);

    useEffect(() => {
        fetchMangaDetails();
        fetchReadChapters();
    }, [id]);

    useFocusEffect(
        React.useCallback(() => {
            const onBackPress = () => {
                router.navigate(`/mangasearch`);
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
        const descriptionMatch = html.match(/<div class="description">(.*?)<\/div>/s);
        const description = descriptionMatch
            ? decode(descriptionMatch[1].replace(/<[^>]*>/g, ''))
            : 'No description available';
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

    useEffect(() => {
        fetchBookmarkStatus();
    }, [id]);

    const fetchBookmarkStatus = async () => {
        const status = await AsyncStorage.getItem(`bookmark_${id}`);
        setBookmarkStatus(status);
    };

    const handleBookmark = () => {
        if (bookmarkStatus) {
            setIsAlertVisible(true);
        } else {
            setIsAlertVisible(true);
        }
    };

    const saveBookmark = async (status: BookmarkStatus) => {
        try {
            await AsyncStorage.setItem(`bookmark_${id}`, status);
            await AsyncStorage.setItem(`title_${id}`, mangaDetails.title);

            // Update the list of bookmark keys
            const keys = await AsyncStorage.getItem('bookmarkKeys');
            const bookmarkKeys = keys ? JSON.parse(keys) : [];
            if (!bookmarkKeys.includes(`bookmark_${id}`)) {
                bookmarkKeys.push(`bookmark_${id}`);
                await AsyncStorage.setItem('bookmarkKeys', JSON.stringify(bookmarkKeys));
            }

            setBookmarkStatus(status);
            setIsAlertVisible(false);

            // If the status is "Read", show an alert to mark all chapters as read
            if (status === "Read") {
                Alert.alert(
                    "Mark All Chapters as Read",
                    "Do you want to mark all chapters as read?",
                    [
                        {
                            text: "No",
                            style: "cancel"
                        },
                        {
                            text: "Yes",
                            onPress: () => markAllChaptersAsRead()
                        }
                    ]
                );
            }
        } catch (error) {
            console.error('Error saving bookmark:', error);
        }
    };





    const removeBookmark = async () => {
        try {
            // Remove the bookmark status
            await AsyncStorage.removeItem(`bookmark_${id}`);
    
            // Remove the title
            await AsyncStorage.removeItem(`title_${id}`);
    
            // Remove from the bookmarkKeys list
            const keys = await AsyncStorage.getItem('bookmarkKeys');
            if (keys) {
                const bookmarkKeys = JSON.parse(keys);
                const updatedKeys = bookmarkKeys.filter(key => key !== `bookmark_${id}`);
                await AsyncStorage.setItem('bookmarkKeys', JSON.stringify(updatedKeys));
            }
    
            setBookmarkStatus(null);
            setIsAlertVisible(false);
        } catch (error) {
            console.error('Error removing bookmark:', error);
        }
    };




    const fetchReadChapters = useCallback(async () => {
        try {
            const key = `manga_${id}_read_chapters`;
            const storedChapters = await AsyncStorage.getItem(key);
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
        router.navigate(`/manga/${id}/chapter/${chapterNumber}`);
    };

    const handleBackPress = () => {
        router.navigate(`/mangasearch`);
    };

    const markAllChaptersAsRead = async () => {
        try {
            const key = `manga_${id}_read_chapters`;
            const allChapterNumbers = mangaDetails.chapters.map(chapter => chapter.number);
            await AsyncStorage.setItem(key, JSON.stringify(allChapterNumbers));
            setReadChapters(allChapterNumbers);
        } catch (error) {
            console.error('Error marking all chapters as read:', error);
        }
    };




    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator size="large" color={colors.primary} />
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
                        <Ionicons name="arrow-back" size={30} color="#FFFFFF" />
                    </TouchableOpacity>
                    <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
                        {mangaDetails.title}
                    </Text>
                    <TouchableOpacity onPress={handleBookmark} style={styles.bookmarkButton}>
                        <Ionicons
                            name={bookmarkStatus ? "bookmark" : "bookmark-outline"}
                            size={30}
                            color={colors.primary}
                        />
                    </TouchableOpacity>

                    <Alert2
                        visible={isAlertVisible}
                        title={bookmarkStatus ? "Update Bookmark" : "Bookmark Manga"}
                        onClose={() => setIsAlertVisible(false)}
                        options={
                            bookmarkStatus
                                ? [
                                    { text: "To Read", onPress: () => saveBookmark("To Read"), icon: "book-outline" },
                                    { text: "Reading", onPress: () => saveBookmark("Reading"), icon: "book" },
                                    {
                                        text: "Read",
                                        onPress: () => {
                                            saveBookmark("Read");
                                            // The option to mark all chapters as read will be shown after this
                                        },
                                        icon: "checkmark-circle-outline"
                                    },
                                    { text: "Unbookmark", onPress: () => removeBookmark(), icon: "close-circle-outline" },
                                ]
                                : [
                                    { text: "To Read", onPress: () => saveBookmark("To Read"), icon: "book-outline" },
                                    { text: "Reading", onPress: () => saveBookmark("Reading"), icon: "book" },
                                    {
                                        text: "Read",
                                        onPress: () => {
                                            saveBookmark("Read");
                                        },
                                        icon: "checkmark-circle-outline"
                                    },
                                ]
                        }
                    />



                    {mangaDetails.alternativeTitle && (
                        <View>
                            <ExpandableText
                                text={mangaDetails.alternativeTitle}
                                initialLines={1}
                                style={styles.alternativeTitle}
                                expandTextStyle={[styles.expandText]}
                            />
                        </View>
                    )}
                    <View style={styles.statusContainer}>
                        <Text style={styles.statusText}>{mangaDetails.status}</Text>
                    </View>
                </View>
            </View>
            <View style={styles.infoContainer}>
                <Text style={styles.sectionTitle}>Description</Text>
                <ExpandableText
                    text={mangaDetails.description}
                    initialLines={3}
                    style={styles.description}
                    expandTextStyle={styles.expandText}
                />
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
                                    <Ionicons name="ellipse-outline" size={24} color={colors.tabIconDefault} />
                                )}
                            </View>
                        </TouchableOpacity>
                    );
                })}
            </View>
        </ScrollView>
    );
}

const getStyles = (colors: typeof Colors.light) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.background,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.background,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: colors.background,
    },
    errorText: {
        fontSize: 18,
        color: colors.notification,
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
    backButton: {
        padding: 10,
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
        backgroundColor: colors.primary,
        paddingHorizontal: 10,
        paddingVertical: 5,
        borderRadius: 20,
        alignSelf: 'flex-start',
        marginTop: 10,
    },
    statusText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    infoContainer: {
        padding: 20,
        backgroundColor: colors.card,
        borderTopLeftRadius: 20,
        borderTopRightRadius: 20,
        marginTop: -20,
    },
    sectionTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 10,
        color: colors.text,
    },
    description: {
        fontSize: 16,
        marginBottom: 20,
        lineHeight: 24,
        color: colors.text,
    },
    infoText: {
        fontSize: 16,
        marginBottom: 10,
        color: colors.text,
    },
    ratingContainer: {
        flexDirection: 'row',
        alignItems: 'baseline',
        marginTop: 10,
    },
    rating: {
        fontSize: 24,
        fontWeight: 'bold',
        color: colors.primary,
    },
    ratingText: {
        fontSize: 16,
        marginLeft: 5,
        color: colors.text,
    },
    chaptersContainer: {
        padding: 20,
        backgroundColor: colors.card,
    },
    chapterItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
    },
    chapterInfo: {
        flex: 1,
    },
    chapterTitle: {
        fontSize: 16,
        fontWeight: '500',
        color: colors.text,
    },
    chapterDate: {
        fontSize: 14,
        color: colors.tabIconDefault,
        marginTop: 5,
    },
    chapterStatus: {
        marginLeft: 10,
    },
    readChapterTitle: {
        color: '#4CAF50',
        fontWeight: '600',
    },
    expandText: {
        color: colors.primary,
    },
    bookmarkButton: {
        position: 'absolute',
        top: 40,
        right: 10,
        zIndex: 1000,
        borderRadius: 20,
        padding: 8,
    },
    actionButtonsContainer: {
        flexDirection: 'row',
        justifyContent: 'space-around',
        marginBottom: 20,
    },
    actionButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: colors.card,
        padding: 10,
        borderRadius: 8,
    },
    actionButtonText: {
        marginLeft: 8,
        color: colors.text,
        fontSize: 16,
    },

});
