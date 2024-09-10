import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, ScrollView, ActivityIndicator, TouchableOpacity, StyleSheet, Image, Dimensions, useColorScheme, FlatList } from 'react-native';
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
import { decode } from 'html-entities';
import { updateMangaStatus, searchAnilistMangaByName } from '@/services/anilistService';
import { isLoggedInToAniList } from '@/services/anilistService';


type IconName = 'options' | 'key' | 'search' | 'repeat' | 'link' | 'at' | 'push' | 'map' | 'filter' | 'scale' | 'body' | 'code' | 'menu' | 'time' | 'ellipse' | 'image' | 'stop' | 'text' | 'alert';
type BookmarkStatus = "To Read" | "Reading" | "Read";
const MAX_HISTORY_LENGTH = 10;

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

            // Decode the title before saving
            const decodedTitle = decode(mangaDetails?.title || '');
            await AsyncStorage.setItem(`title_${id}`, decodedTitle);

            await AsyncStorage.setItem(`image_${id}`, mangaDetails?.bannerImage || '');

            const keys = await AsyncStorage.getItem('bookmarkKeys');
            const bookmarkKeys = keys ? JSON.parse(keys) : [];
            if (!bookmarkKeys.includes(`bookmark_${id}`)) {
                bookmarkKeys.push(`bookmark_${id}`);
                await AsyncStorage.setItem('bookmarkKeys', JSON.stringify(bookmarkKeys));
            }

            setBookmarkStatus(status);
            setIsAlertVisible(false);

            if (status === "Reading" && mangaDetails && mangaDetails.chapters && mangaDetails.chapters.length > 0) {
                const lastReleasedChapter = mangaDetails.chapters[0].number;
                await AsyncStorage.setItem(`last_notified_chapter_${id}`, lastReleasedChapter);
                console.log(`Set last notified chapter for ${id} to ${lastReleasedChapter}`);
            }

            if (status === "Read") {
                Alert.alert(
                    "Mark All Chapters as Read",
                    "Do you want to mark all chapters as read?",
                    [
                        {
                            text: "No",
                            style: "cancel",
                            onPress: () => updateAniListStatus(status)
                        },
                        {
                            text: "Yes",
                            onPress: async () => {
                                await markAllChaptersAsRead();
                                await updateAniListStatus(status);
                            }
                        }
                    ]
                );
            } else {
                await updateAniListStatus(status);
            }
        } catch (error) {
            console.error('Error saving bookmark:', error);
        }
    };

    const updateAniListStatus = async (status: BookmarkStatus) => {
        try {
            const isLoggedIn = await isLoggedInToAniList();
            if (!isLoggedIn) {
                console.log('User is not logged in to AniList. Skipping update.');
                return;
            }

            const anilistManga = await searchAnilistMangaByName(mangaDetails?.title || '');
            if (anilistManga) {
                let anilistStatus: string;
                let progress: number = 0;

                switch (status) {
                    case "To Read":
                        anilistStatus = "PLANNING";
                        break;
                    case "Reading":
                        anilistStatus = "CURRENT";
                        progress = readChapters.length;
                        break;
                    case "Read":
                        anilistStatus = "COMPLETED";
                        progress = mangaDetails?.chapters.length || 0;
                        break;
                    default:
                        anilistStatus = "PLANNING";
                }

                await updateMangaStatus(anilistManga.id, anilistStatus, progress);
                console.log(`Updated AniList status for ${mangaDetails?.title} to ${anilistStatus}`);
                Alert.alert("Success", `Updated AniList status for "${mangaDetails?.title}" to ${status}`);
            } else {
                console.log(`Manga ${mangaDetails?.title} not found on AniList`);
                Alert.alert("Not Found", `"${mangaDetails?.title}" was not found on AniList. Only local status was updated.`);
            }
        } catch (error) {
            console.error('Error updating AniList status:', error);
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

    const handleChapterLongPress = async (chapterNumber: string) => {
        const isRead = readChapters.includes(chapterNumber);
        if (isRead) {
            Alert.alert(
                "Mark as Unread",
                `Do you want to mark chapter ${chapterNumber} as unread?`,
                [
                    {
                        text: "Cancel",
                        style: "cancel"
                    },
                    {
                        text: "Yes",
                        onPress: async () => {
                            try {
                                const key = `manga_${id}_read_chapters`;
                                const updatedReadChapters = readChapters.filter(ch => ch !== chapterNumber);
                                await AsyncStorage.setItem(key, JSON.stringify(updatedReadChapters));
                                setReadChapters(updatedReadChapters);
                            } catch (error) {
                                console.error('Error marking chapter as unread:', error);
                            }
                        }
                    }
                ]
            );
        }
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
            if (mangaDetails && mangaDetails.chapters && mangaDetails.chapters.length > 0) {
                const key = `manga_${id}_read_chapters`;
                const allChapterNumbers = mangaDetails.chapters.map(chapter => chapter.number);
                await AsyncStorage.setItem(key, JSON.stringify(allChapterNumbers));
                setReadChapters(allChapterNumbers);
            } else {
                console.log('No chapters to mark as read');
            }
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
        <View style={styles.container}>
            <FlatList
                ListHeaderComponent={() => (
                    <>
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
                                    title={bookmarkStatus ? "Update Bookmark for \n" + mangaDetails.title :  "Bookmark\n" + mangaDetails.title}
                                    onClose={() => setIsAlertVisible(false)}
                                    options={
                                        bookmarkStatus
                                            ? [
                                                { text: "To Read", onPress: () => saveBookmark("To Read"), icon: "book-outline" as IconName },
                                                { text: "Reading", onPress: () => saveBookmark("Reading"), icon: "book" as IconName },
                                                { text: "Read", onPress: () => saveBookmark("Read"), icon: "checkmark-circle-outline" as IconName },
                                                { text: "Unbookmark", onPress: removeBookmark, icon: "close-circle-outline" as IconName },
                                            ]
                                            : [
                                                { text: "To Read", onPress: () => saveBookmark("To Read"), icon: "book-outline" as IconName},
                                                { text: "Reading", onPress: () => saveBookmark("Reading"), icon: "book" as IconName},
                                                { text: "Read", onPress: () => saveBookmark("Read"), icon: "checkmark-circle-outline" as IconName},
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
                        </View>
                        <View style={styles.chaptersContainer}>
                            <Text style={styles.sectionTitle}>Chapters</Text>
                        </View>
                    </>
                )}
                data={mangaDetails.chapters}
                keyExtractor={(item, index) => `chapter-${item.number}-${index}`}
                renderItem={({ item: chapter, index }) => {
                    const isRead = readChapters.includes(chapter.number);
                    const isLastItem = index === mangaDetails.chapters.length - 1;
                    return (
                        <TouchableOpacity
                            style={[
                                styles.chapterItem,
                                isLastItem && styles.lastChapterItem
                            ]}
                            onPress={() => handleChapterPress(chapter.number)}
                            onLongPress={() => handleChapterLongPress(chapter.number)}
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
                }}
                ListFooterComponent={<View style={{ height: 70 }} />}
            />
        </View>
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
        textAlign: 'left',
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
        paddingHorizontal: 20,
        paddingTop: 20,
        backgroundColor: colors.card,
    },
    chapterItem: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingVertical: 15,
        paddingHorizontal: 20,
        borderBottomWidth: 1,
        borderBottomColor: colors.border,
        backgroundColor: colors.card,
    },
    chapterItemContainer: {
        paddingHorizontal: 20,
        backgroundColor: colors.card,
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
        color: colors.primary,
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
