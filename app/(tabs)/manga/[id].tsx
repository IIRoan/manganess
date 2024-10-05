// Import statements
import React, { useState, useCallback } from 'react';
import {
    View,
    Text,
    ActivityIndicator,
    TouchableOpacity,
    StyleSheet,
    Image,
    useColorScheme,
    FlatList,
    Alert,
} from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/constants/ThemeContext';
import { Colors, ColorScheme } from '@/constants/Colors';
import ExpandableText from '@/components/ExpandableText';
import AlertComponent from '@/components/Alert';
import BottomPopup from '@/components/BottomPopup'
import {
    fetchMangaDetails,
    MangaDetails,
    getChapterUrl,
} from '@/services/mangaFireService';
import {
    fetchBookmarkStatus,
    saveBookmark,
    removeBookmark,
    BookmarkStatus,
} from '@/services/bookmarkService';
import { useNavigationHistory } from '@/hooks/useNavigationHistory';
import { GenreTag } from '@/components/GanreTag';
import { getLastReadChapter } from '@/services/readChapterService';
import { useFocusEffect } from '@react-navigation/native';
import LastReadChapterBar from '@/components/LastReadChapterBar';

type Option = {
    text: string;
    onPress: () => void;
    icon?: string;
};

export default function MangaDetailScreen() {
    const { id } = useLocalSearchParams();
    const [mangaDetails, setMangaDetails] = useState<MangaDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [readChapters, setReadChapters] = useState<string[]>([]);
    const router = useRouter();
    const { theme } = useTheme();
    const systemColorScheme = useColorScheme() as ColorScheme;
    const colorScheme =
        theme === 'system' ? systemColorScheme : (theme as ColorScheme);
    const colors = Colors[colorScheme];
    const [bookmarkStatus, setBookmarkStatus] = useState<string | null>(null);

    // State for the general alert (e.g., marking chapters as unread)
    const [isAlertVisible, setIsAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState({});

    // State for the bookmark bottom popup
    const [isBookmarkPopupVisible, setIsBookmarkPopupVisible] = useState(false);
    const [bookmarkPopupConfig, setBookmarkPopupConfig] = useState<{
        title: string;
        options: Option[];
    }>({ title: '', options: [] });

    const styles = getStyles(colors);
    const { handleBackPress } = useNavigationHistory();
    const [lastReadChapter, setLastReadChapter] = useState<string | null>(null);

    const fetchMangaDetailsData = async () => {
        try {
            const details = await fetchMangaDetails(id as string);
            setMangaDetails(details);
        } catch (err) {
            console.error(err);
            throw new Error('Failed to load manga details');
        }
    };

    const fetchBookmarkStatusData = async () => {
        try {
            const status = await fetchBookmarkStatus(id as string);
            setBookmarkStatus(status);
        } catch (err) {
            console.error(err);
            throw new Error('Failed to load bookmark status');
        }
    };

    const fetchReadChapters = useCallback(async () => {
        try {
            const key = `manga_${id}_read_chapters`;
            const storedChapters = await AsyncStorage.getItem(key);
            if (storedChapters) {
                const parsedChapters = JSON.parse(storedChapters);
                setReadChapters(parsedChapters);
            } else {
                setReadChapters([]);
            }
        } catch (error) {
            console.error('Error fetching read chapters:', error);
            throw new Error('Failed to load read chapters');
        }
    }, [id]);

    const fetchLastReadChapter = async () => {
        try {
            const lastChapter = await getLastReadChapter(id as string);
            setLastReadChapter(lastChapter);
        } catch (err) {
            console.error(err);
            throw new Error('Failed to load last read chapter');
        }
    };

    useFocusEffect(
        useCallback(() => {
            const fetchData = async () => {
                if (typeof id === 'string') {
                    setIsLoading(true);
                    setError(null);
                    try {
                        await Promise.all([
                            fetchMangaDetailsData(),
                            fetchReadChapters(),
                            fetchBookmarkStatusData(),
                            fetchLastReadChapter(),
                        ]);
                    } catch (error) {
                        console.error('Error fetching data:', error);
                        setError('Failed to load manga details. Please try again.');
                    } finally {
                        setIsLoading(false);
                    }
                }
            };

            fetchData();

            return () => { };
        }, [id, fetchReadChapters])
    );

    const handleBookmark = () => {
        if (!mangaDetails) return;
        setIsBookmarkPopupVisible(true); // Show the new BottomPopup
        setBookmarkPopupConfig({
            title: bookmarkStatus
                ? `Update Bookmark for ${mangaDetails.title}`
                : `Bookmark ${mangaDetails.title}`,
            options: bookmarkStatus
                ? [
                    {
                        text: 'To Read',
                        onPress: () => handleSaveBookmark('To Read'),
                        icon: 'book-outline',
                    },
                    {
                        text: 'Reading',
                        onPress: () => handleSaveBookmark('Reading'),
                        icon: 'book',
                    },
                    {
                        text: 'Read',
                        onPress: () => handleSaveBookmark('Read'),
                        icon: 'checkmark-circle-outline',
                    },
                    {
                        text: 'Unbookmark',
                        onPress: handleRemoveBookmark,
                        icon: 'close-circle-outline',
                    },
                ]
                : [
                    {
                        text: 'To Read',
                        onPress: () => handleSaveBookmark('To Read'),
                        icon: 'book-outline',
                    },
                    {
                        text: 'Reading',
                        onPress: () => handleSaveBookmark('Reading'),
                        icon: 'book',
                    },
                    {
                        text: 'Read',
                        onPress: () => handleSaveBookmark('Read'),
                        icon: 'checkmark-circle-outline',
                    },
                ],
        });
    };

    const handleChapterLongPress = async (chapterNumber: string) => {
        const isRead = readChapters.includes(chapterNumber);
        if (isRead) {
            setIsAlertVisible(true);
            setAlertConfig({
                type: 'confirm',
                title: 'Mark as Unread',
                message: `Do you want to mark chapter ${chapterNumber} as unread?`,
                options: [
                    {
                        text: 'Cancel',
                        onPress: () => { },
                    },
                    {
                        text: 'Yes',
                        onPress: async () => {
                            try {
                                const key = `manga_${id}_read_chapters`;
                                const updatedReadChapters = readChapters.filter(
                                    (ch) => ch !== chapterNumber
                                );
                                await AsyncStorage.setItem(
                                    key,
                                    JSON.stringify(updatedReadChapters)
                                );
                                setReadChapters(updatedReadChapters);
                            } catch (error) {
                                console.error('Error marking chapter as unread:', error);
                            }
                        },
                    },
                ],
            });
        }
    };

    const handleSaveBookmark = async (status: BookmarkStatus) => {
        if (!mangaDetails) return;
        try {
            await saveBookmark(
                id as string,
                status,
                mangaDetails,
                readChapters,
                setBookmarkStatus,
                setIsBookmarkPopupVisible, // Passing setIsBookmarkPopupVisible in place of setIsAlertVisible
                markAllChaptersAsRead
            );
        } catch (error) {
            console.error('Error saving bookmark:', error);
        }

        // No need to setIsBookmarkPopupVisible(false) here as it's handled in saveBookmark
    };

    const handleRemoveBookmark = async () => {
        try {
            await removeBookmark(
                id as string,
                setBookmarkStatus,
                setIsBookmarkPopupVisible // Passing setIsBookmarkPopupVisible in place of setIsAlertVisible
            );
        } catch (error) {
            console.error('Error removing bookmark:', error);
        }

        // No need to setIsBookmarkPopupVisible(false) here as it's handled in removeBookmark
    };

    const markAllChaptersAsRead = async () => {
        try {
            if (mangaDetails && mangaDetails.chapters && mangaDetails.chapters.length > 0) {
                const key = `manga_${id}_read_chapters`;
                const allChapterNumbers = mangaDetails.chapters.map(
                    (chapter) => chapter.number
                );
                await AsyncStorage.setItem(key, JSON.stringify(allChapterNumbers));
                setReadChapters(allChapterNumbers);
            } else {
                console.log('No chapters to mark as read');
            }
        } catch (error) {
            console.error('Error marking all chapters as read:', error);
        }
    };

    const handleChapterPress = (chapterNumber: string | number) => {
        router.navigate(`/manga/${id}/chapter/${chapterNumber}`);
    };

    const handleLastReadChapterPress = () => {
        if (!lastReadChapter || lastReadChapter === 'Not started') {
            // If no chapter has been read, navigate to the first chapter
            if (mangaDetails && mangaDetails.chapters && mangaDetails.chapters.length > 0) {
                // Get the last element of the array, which is the first chapter
                const firstChapter = mangaDetails.chapters[mangaDetails.chapters.length - 1];
                handleChapterPress(firstChapter.number);
            }
        } else {
            const chapterNumber = lastReadChapter.replace('Chapter ', '');
            handleChapterPress(chapterNumber);
        }
    };

    if (isLoading) {
        return (
            <View style={styles.loadingContainer}>
                <ActivityIndicator
                    testID="loading-indicator"
                    size="large"
                    color={colors.primary}
                />
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

            {/* Alert component is used to display alerts */}
            <AlertComponent
                testID="alert-component"
                visible={isAlertVisible}
                title={alertConfig.title}
                type={alertConfig.type}
                onClose={() => setIsAlertVisible(false)}
                {...alertConfig}
            />

            {/* BottomPopup component for bookmarks */}
            <BottomPopup
                visible={isBookmarkPopupVisible}
                title={bookmarkPopupConfig.title}
                onClose={() => setIsBookmarkPopupVisible(false)}
                options={bookmarkPopupConfig.options}
            />

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
                                <View style={styles.headerButtons}>
                                    <TouchableOpacity onPress={handleBackPress} style={styles.headerButton}>
                                        <Ionicons name="arrow-back" size={30} color="#FFFFFF" />
                                    </TouchableOpacity>
                                    <TouchableOpacity testID="bookmark-button" onPress={handleBookmark} style={styles.headerButton}>
                                        <Ionicons
                                            name={bookmarkStatus ? "bookmark" : "bookmark-outline"}
                                            size={30}
                                            color={colors.primary}
                                        />
                                    </TouchableOpacity>
                                </View>
                                <Text style={styles.title} numberOfLines={2} ellipsizeMode="tail">
                                    {mangaDetails.title}
                                </Text>
                                {mangaDetails.alternativeTitle && (
                                    <ExpandableText
                                        text={mangaDetails.alternativeTitle}
                                        initialLines={1}
                                        style={styles.alternativeTitle}
                                    />
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
                                    <LastReadChapterBar
                                        lastReadChapter={lastReadChapter}
                                        onPress={handleLastReadChapterPress}
                                        colors={colors}
                                    />

                                </View>
                                <View style={styles.detailsContainer}>
                                    <Text style={styles.sectionTitle}>Details</Text>
                                    <View style={styles.detailRow}>
                                        <Text style={styles.detailLabel}>Author</Text>
                                        <Text style={styles.detailValue}>{(mangaDetails.author || []).join(', ')}</Text>
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
                                        {(mangaDetails.genres || []).map((genre, index) => (
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
                            testID="chapter-item"
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
                                    <Ionicons name="checkmark-circle" size={24} color={colors.primary} />
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
        height: 325,
        position: 'relative',
        overflow: 'hidden',
    },
    bannerImage: {
        width: '100%',
        height: '200%',
        resizeMode: 'cover',
        position: 'absolute',
        top: 0,
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
    headerButtons: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        marginBottom: 10,
    },
    headerButton: {
        padding: 10,
        backgroundColor: 'rgba(0, 0, 0, 0.5)',
        borderRadius: 20,
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
        marginTop: -50,
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
        marginTop: 10,
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

});