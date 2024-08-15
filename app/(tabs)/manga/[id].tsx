import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, StyleSheet, Image, Dimensions, useColorScheme } from 'react-native';
import { useLocalSearchParams, useRouter, useFocusEffect, useNavigation, usePathname } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { BackHandler } from 'react-native';
import { useTheme } from '@/constants/ThemeContext';
import { Colors, ColorScheme } from '@/constants/Colors';
import ExpandableText from '@/components/ExpandableText';
import Alert2 from '@/components/Alert';
import { Alert } from 'react-native';
import { fetchMangaDetails, MangaDetails, getChapterUrl } from '@/services/mangaFireService';

type BookmarkStatus = "To Read" | "Reading" | "Read";
const MAX_HISTORY_LENGTH = 10; // Adjust as needed

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
    const navigation = useNavigation();
    const pathname = usePathname();


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

    const fetchMangaDetailsData = async () => {
        setIsLoading(true);
        try {
            const details = await fetchMangaDetails(id as string);
            setMangaDetails(details);
        } catch (err) {
            setError('Failed to load manga details. Please try again.');
            console.error(err);
        } finally {
            setIsLoading(false);
        }
    };


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
            await AsyncStorage.setItem(`title_${id}`, mangaDetails?.title || '');
            await AsyncStorage.setItem(`image_${id}`, mangaDetails?.bannerImage || '');


            const keys = await AsyncStorage.getItem('bookmarkKeys');
            const bookmarkKeys = keys ? JSON.parse(keys) : [];
            if (!bookmarkKeys.includes(`bookmark_${id}`)) {
                bookmarkKeys.push(`bookmark_${id}`);
                await AsyncStorage.setItem('bookmarkKeys', JSON.stringify(bookmarkKeys));
            }

            setBookmarkStatus(status);
            setIsAlertVisible(false);

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
            await AsyncStorage.removeItem(`bookmark_${id}`);
            await AsyncStorage.removeItem(`title_${id}`);

            const keys = await AsyncStorage.getItem('bookmarkKeys');
            if (keys) {
                const bookmarkKeys = JSON.parse(keys);
                const updatedKeys = bookmarkKeys.filter((key: string) => key !== `bookmark_${id}`);
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
          setReadChapters([]); // Clear previous read chapters
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
      

    useFocusEffect(
        useCallback(() => {
            fetchReadChapters();
        }, [fetchReadChapters])
    );

    const handleChapterPress = (chapterNumber: string) => {
        const chapterUrl = getChapterUrl(id as string, chapterNumber);
        router.navigate(`/manga/${id}/chapter/${chapterNumber}`);
    };

    const isExcludedRoute = (path: string) => {
        return path.match(/^\/manga\/[^\/]+$/) || path.match(/^\/manga\/.*\/chapter\/.*$/);
    };

    const updateHistory = useCallback(async (newPath: string) => {
        try {
            const historyString = await AsyncStorage.getItem('navigationHistory');
            let history = historyString ? JSON.parse(historyString) : [];

            // Filter out manga detail and chapter routes
            history = history.filter((path: string) => !isExcludedRoute(path));
            
            if (!isExcludedRoute(newPath)) {
                history.push(newPath);
            }

            // Keep only the last MAX_HISTORY_LENGTH items
            if (history.length > MAX_HISTORY_LENGTH) {
                history = history.slice(-MAX_HISTORY_LENGTH);
            }

            await AsyncStorage.setItem('navigationHistory', JSON.stringify(history));
        } catch (error) {
            console.error('Error updating navigation history:', error);
        }
    }, []);

    useEffect(() => {
        updateHistory(pathname);
    }, [pathname, updateHistory]);

    useEffect(() => {
        fetchMangaDetailsData();
        fetchReadChapters();
        fetchBookmarkStatus();
      }, [id, fetchReadChapters]);
      

    const handleBackPress = useCallback(async () => {
        try {
            const historyString = await AsyncStorage.getItem('navigationHistory');
            let history = historyString ? JSON.parse(historyString) : [];

            let previousRoute = '/mangasearch';

            while (history.length > 0) {
                const lastRoute = history.pop();
                if (!isExcludedRoute(lastRoute)) {
                    previousRoute = lastRoute;
                    break;
                }
            }

            await AsyncStorage.setItem('navigationHistory', JSON.stringify(history));
            
            router.replace(previousRoute as any);

        } catch (error) {
            router.replace('/mangasearch');
        }
    }, [router]);

    const markAllChaptersAsRead = async () => {
        try {
            const key = `manga_${id}_read_chapters`;
            const allChapterNumbers = mangaDetails?.chapters.map(chapter => chapter.number) || [];
            await AsyncStorage.setItem(key, JSON.stringify(allChapterNumbers));
            setReadChapters(allChapterNumbers);
        } catch (error) {
            console.error('Error marking all chapters as read:', error);
        }
    };


    const GenreTag = ({ genre }: { genre: string }) => (
        <View style={styles.genreTag}>
            <Text style={styles.genreText}>{genre}</Text>
        </View>
    );


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
                        // @ts-ignore
                        options={
                            bookmarkStatus
                                ? [
                                    { text: "To Read", onPress: () => saveBookmark("To Read"), icon: "book-outline" },
                                    { text: "Reading", onPress: () => saveBookmark("Reading"), icon: "book" },
                                    {
                                        text: "Read",
                                        onPress: () => saveBookmark("Read"),
                                        icon: "checkmark-circle-outline"
                                    },
                                    { text: "Unbookmark", onPress: removeBookmark, icon: "close-circle-outline" },
                                ]
                                : [
                                    { text: "To Read", onPress: () => saveBookmark("To Read"), icon: "book-outline" },
                                    { text: "Reading", onPress: () => saveBookmark("Reading"), icon: "book" },
                                    {
                                        text: "Read",
                                        onPress: () => saveBookmark("Read"),
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
                            />
                        </View>
                    )}
                    <View style={styles.statusContainer}>
                        <Text style={styles.statusText}>{mangaDetails.status}</Text>
                    </View>
                </View>
            </View>
            <View style={styles.contentContainer}>
                <View style={styles.infoContainer}>
                    <View style={styles.descriptionContainer}>
                        <Text style={styles.sectionTitle}>Description</Text>
                        <ExpandableText
                            text={mangaDetails.description}
                            initialLines={3}
                            style={styles.description}
                        />

                    </View>
                    <View style={styles.detailsContainer}>
                        <Text style={styles.sectionTitle}>Details</Text>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Author</Text>
                            <Text style={styles.detailValue}>{mangaDetails.author.join(', ')}</Text>
                        </View>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Published</Text>
                            <Text style={styles.detailValue}>{mangaDetails.published}</Text>
                        </View>
                        <View style={styles.detailRow}>
                            <Text style={styles.detailLabel}>Rating</Text>
                            <View style={styles.ratingContainer}>
                                <Text style={styles.rating}>{mangaDetails.rating}</Text>
                                <Text style={styles.ratingText}>/10 ({mangaDetails.reviewCount} reviews)</Text>
                            </View>
                        </View>
                        <Text style={[styles.detailLabel, { marginTop: 10 }]}>Genres</Text>
                        <View style={styles.genresContainer}>
                            {mangaDetails.genres.map((genre, index) => (
                                <GenreTag key={index} genre={genre} />
                            ))}
                        </View>
                    </View>

                </View>
                <View style={styles.chaptersContainer}>
                    <Text style={styles.sectionTitle}>Chapters</Text>
                    {mangaDetails.chapters.map((chapter, index) => {
                        const isRead = readChapters.includes(chapter.number);
                        const isLastItem = index === mangaDetails.chapters.length - 1;
                        return (
                            <TouchableOpacity
                                key={index}
                                style={[
                                    styles.chapterItem,
                                    isLastItem && styles.lastChapterItem
                                ]}
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
            </View>
        </ScrollView>
    );
}
const getStyles = (colors: typeof Colors.light) => StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: colors.card,
    },
    loadingContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: colors.card,
    },
    errorContainer: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 20,
        backgroundColor: colors.card,
    },
    errorText: {
        fontSize: 18,
        color: colors.notification,
        textAlign: 'center',
    },
    headerContainer: {
        height: 300,
        position: 'relative',
        overflow: 'hidden',
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
        marginBottom: 20,
    },
    statusText: {
        color: '#fff',
        fontWeight: 'bold',
    },
    bookmarkButton: {
        position: 'absolute',
        top: 40,
        right: 10,
        zIndex: 1000,
        borderRadius: 20,
        padding: 8,
    },
    contentContainer: {
        backgroundColor: colors.card,
        borderTopLeftRadius: 40,
        borderTopRightRadius: 40,
        paddingTop: 20,
    },
    infoContainer: {
        padding: 20,
        backgroundColor: colors.card,
        borderTopLeftRadius: 40,
        borderTopRightRadius: 40,
        marginTop: -40,
        shadowColor: "#000",
        shadowOffset: {
            width: 0,
            height: -5,
        },
        shadowOpacity: 0.1,
        shadowRadius: 6,
        elevation: 5,
    },
    descriptionContainer: {
        backgroundColor: colors.card,
        borderRadius: 15,
        padding: 15,
        marginBottom: 20,
    },
    detailsContainer: {
        backgroundColor: colors.card,
        borderRadius: 15,
        padding: 15,
    },
    detailRow: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    detailLabel: {
        fontSize: 14,
        color: colors.text,
        opacity: 0.7,
    },
    detailValue: {
        fontSize: 14,
        color: colors.text,
        fontWeight: '600',
        textAlign: 'right',
    },
    sectionTitle: {
        fontSize: 22,
        fontWeight: 'bold',
        marginBottom: 10,
        color: colors.text,
    },
    description: {
        fontSize: 16,
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
        alignItems: 'center',
    },
    rating: {
        fontSize: 18,
        fontWeight: 'bold',
        color: colors.primary,
        marginRight: 5,
    },
    ratingText: {
        fontSize: 14,
        color: colors.text,
    },
    genresContainer: {
        flexDirection: 'row',
        flexWrap: 'wrap',
        marginTop: 5,
    },
    genreTag: {
        backgroundColor: colors.primary,
        borderRadius: 15,
        paddingHorizontal: 10,
        paddingVertical: 5,
        margin: 2,
    },
    genreText: {
        color: colors.card,
        fontSize: 12,
        fontWeight: '600',
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
    lastChapterItem: {
        borderBottomWidth: 0,
        marginBottom: 70,
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
