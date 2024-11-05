import React, { useState, useCallback, useRef, useEffect } from 'react';
import {
    View,
    Text,
    ActivityIndicator,
    TouchableOpacity,
    StyleSheet,
    Image,
    useColorScheme,
    Animated,
    ViewToken,
} from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import { useLocalSearchParams, useRouter } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/constants/ThemeContext';
import { Colors, ColorScheme } from '@/constants/Colors';
import ExpandableText from '@/components/ExpandableText';
import AlertComponent from '@/components/Alert';
import SwipeableChapterItem from '@/components/SwipeChapterItem';
import BottomPopup, { Option } from '@/components/BottomPopup';
import { FlashList } from '@shopify/flash-list';
import {
    fetchMangaDetails,
    MangaDetails,
} from '@/services/mangaFireService';
import {
    fetchBookmarkStatus,
    saveBookmark,
    removeBookmark,
    BookmarkStatus,
    getBookmarkPopupConfig,
    getChapterLongPressAlertConfig,
} from '@/services/bookmarkService';
import { useNavigationHistory } from '@/hooks/useNavigationHistory';
import { GenreTag } from '@/components/GanreTag';
import { getLastReadChapter } from '@/services/readChapterService';
import { useFocusEffect } from '@react-navigation/native';
import LastReadChapterBar from '@/components/LastReadChapterBar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/* Type Definitions */
type BookmarkPopupConfig = {
    title: string;
    options: Option[];
};

type AlertOption = {
    text: string;
    onPress: () => void;
};

type AlertConfig = {
    type: string;
    title: string;
    message: string;
    options: AlertOption[];
};

export default function MangaDetailScreen() {
    const insets = useSafeAreaInsets();
    const router = useRouter();

    // Bookmark/chapters handling
    const { id } = useLocalSearchParams();
    const [mangaDetails, setMangaDetails] = useState<MangaDetails | null>(null);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [readChapters, setReadChapters] = useState<string[]>([]);
    const [bookmarkStatus, setBookmarkStatus] = useState<string | null>(null);
    const [currentlyOpenSwipeable, setCurrentlyOpenSwipeable] = useState<Swipeable | null>(null);

    // State for the general alert (e.g., marking chapters as unread)
    const [isAlertVisible, setIsAlertVisible] = useState(false);
    const [alertConfig, setAlertConfig] = useState<AlertConfig | null>(null);

    // State for the bookmark bottom popup
    const [isBookmarkPopupVisible, setIsBookmarkPopupVisible] = useState(false);
    const [bookmarkPopupConfig, setBookmarkPopupConfig] = useState<BookmarkPopupConfig>({
        title: '',
        options: [],
    });

    // Handle sending user back up
    const [showScrollToTopButton, setShowScrollToTopButton] = useState(false);
    const flashListRef = useRef<FlashList<any>>(null);

    // Animated value for the scroll to top button opacity
    const scrollButtonOpacity = useRef(new Animated.Value(0)).current;

    // Theming Settings
    const { theme } = useTheme();
    const systemColorScheme = useColorScheme() as ColorScheme;
    const colorScheme = theme === 'system' ? systemColorScheme : (theme as ColorScheme);
    const colors = Colors[colorScheme];
    const styles = getStyles(colors);

    // Back button
    const { handleBackPress } = useNavigationHistory();

    // Last chapter
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

            return () => {};
        }, [id, fetchReadChapters])
    );

    const handleBookmark = () => {
        if (!mangaDetails) return;
        const config = getBookmarkPopupConfig(
            bookmarkStatus,
            mangaDetails.title,
            handleSaveBookmark,
            handleRemoveBookmark
        );

        setBookmarkPopupConfig(config as BookmarkPopupConfig); // Cast to BookmarkPopupConfig
        setIsBookmarkPopupVisible(true);
    };

    const handleChapterLongPress = (chapterNumber: string) => {
        const isRead = readChapters.includes(chapterNumber);
        const config = getChapterLongPressAlertConfig(
            isRead,
            chapterNumber,
            mangaDetails,
            id as string,
            readChapters,
            setReadChapters
        );
        if (config) {
            setAlertConfig(config);
            setIsAlertVisible(true);
        }
    };

    const handleMarkAsUnread = useCallback(
        async (chapterNumber: string) => {
            try {
                const key = `manga_${id}_read_chapters`;
                const updatedReadChapters = readChapters.filter((ch) => ch !== chapterNumber);
                await AsyncStorage.setItem(key, JSON.stringify(updatedReadChapters));
                setReadChapters(updatedReadChapters);
            } catch (error) {
                console.error('Error marking chapter as unread:', error);
            }
        },
        [id, readChapters]
    );

    const handleSaveBookmark = async (status: BookmarkStatus) => {
        if (!mangaDetails) return;
        try {
            await saveBookmark(
                id as string,
                status,
                mangaDetails,
                readChapters,
                setBookmarkStatus,
                setIsBookmarkPopupVisible,
                setReadChapters
            );
        } catch (error) {
            console.error('Error saving bookmark:', error);
        }
    };

    const handleRemoveBookmark = async () => {
        try {
            await removeBookmark(id as string, setBookmarkStatus, setIsBookmarkPopupVisible);
        } catch (error) {
            console.error('Error removing bookmark:', error);
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

    // Checks for showing the scroll to top button
    const viewabilityConfig = {
        itemVisiblePercentThreshold: 50,
    };

    const onViewableItemsChanged = useCallback(
        ({ viewableItems }: { viewableItems: ViewToken[] }) => {
            if (viewableItems && viewableItems.length > 0) {
                const firstVisibleItem = viewableItems[0];
                const index = firstVisibleItem.index ?? 0;
                if (index >= 10) {
                    setShowScrollToTopButton(true);
                } else {
                    setShowScrollToTopButton(false);
                }
            }
        },
        []
    );

    // Use useEffect to animate the opacity of the scroll button
    useEffect(() => {
        Animated.timing(scrollButtonOpacity, {
            toValue: showScrollToTopButton ? 1 : 0,
            duration: 300,
            useNativeDriver: true,
        }).start();
    }, [showScrollToTopButton]);

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
            {alertConfig && (
                <AlertComponent
                    visible={isAlertVisible}
                    onClose={() => setIsAlertVisible(false)}
                    type={alertConfig.type as 'bookmarks' | 'confirm'}
                    title={alertConfig.title}
                    message={alertConfig.message}
                    options={alertConfig.options}
                />
            )}

            {/* BottomPopup component for bookmarks */}
            <BottomPopup
                visible={isBookmarkPopupVisible}
                title={bookmarkPopupConfig.title}
                onClose={() => setIsBookmarkPopupVisible(false)}
                options={bookmarkPopupConfig.options}
            />

            <View style={{ flex: 1 }}>
                <FlashList
                    ref={flashListRef}
                    estimatedItemSize={100}
                    ListHeaderComponent={() => (
                        <>
                            <View style={styles.headerContainer}>
                                <Image
                                    source={{ uri: mangaDetails.bannerImage }}
                                    style={styles.bannerImage}
                                    onError={(error) =>
                                        console.error('Error loading banner image:', error)
                                    }
                                />
                                <View style={styles.overlay} />
                                <View style={styles.headerContent}>
                                    <View style={styles.headerButtons}>
                                        <TouchableOpacity
                                            testID="back-button"
                                            onPress={handleBackPress}
                                            style={styles.headerButton}
                                        >
                                            <Ionicons name="arrow-back" size={30} color="#FFFFFF" />
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            testID="bookmark-button"
                                            onPress={handleBookmark}
                                            style={styles.headerButton}
                                        >
                                            <Ionicons
                                                name={
                                                    bookmarkStatus ? 'bookmark' : 'bookmark-outline'
                                                }
                                                size={30}
                                                color={colors.primary}
                                            />
                                        </TouchableOpacity>
                                    </View>
                                    <Text
                                        style={styles.title}
                                        numberOfLines={2}
                                        ellipsizeMode="tail"
                                    >
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
                                            readChapters={readChapters}
                                        />
                                    </View>
                                    <View style={styles.detailsContainer}>
                                        <Text style={styles.sectionTitle}>Details</Text>
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>Author</Text>
                                            <Text style={styles.detailValue}>
                                                {(mangaDetails.author || []).join(', ')}
                                            </Text>
                                        </View>
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>Published</Text>
                                            <Text style={styles.detailValue}>
                                                {mangaDetails.published}
                                            </Text>
                                        </View>
                                        <View style={styles.detailRow}>
                                            <Text style={styles.detailLabel}>Rating</Text>
                                            <View style={styles.ratingContainer}>
                                                <Text style={styles.rating}>
                                                    {mangaDetails.rating}
                                                </Text>
                                                <Text style={styles.ratingText}>
                                                    /10 ({mangaDetails.reviewCount} reviews)
                                                </Text>
                                            </View>
                                        </View>
                                        <Text style={[styles.detailLabel, { marginTop: 10 }]}>
                                            Genres
                                        </Text>
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
                    extraData={readChapters}
                    keyExtractor={(item, index) => `chapter-${item.number}-${index}`}
                    renderItem={({ item: chapter, index }) => {
                        const isRead = readChapters.includes(chapter.number);
                        const isLastItem = index === mangaDetails.chapters.length - 1;
                        return (
                            <SwipeableChapterItem
                                chapter={chapter}
                                isRead={isRead}
                                isLastItem={isLastItem}
                                onPress={() => handleChapterPress(chapter.number)}
                                onLongPress={() => handleChapterLongPress(chapter.number)}
                                onUnread={() => handleMarkAsUnread(chapter.number)}
                                colors={colors}
                                styles={styles}
                                currentlyOpenSwipeable={currentlyOpenSwipeable}
                                setCurrentlyOpenSwipeable={setCurrentlyOpenSwipeable}
                            />
                        );
                    }}
                    ListFooterComponent={<View style={{ height: 70 }} />}
                    onViewableItemsChanged={onViewableItemsChanged}
                    viewabilityConfig={viewabilityConfig}
                />

                {/* Scroll to Top Button */}
                <Animated.View
                    style={[
                        styles.scrollToTopButton,
                        {
                            opacity: scrollButtonOpacity,
                            bottom: insets.bottom + 100, // Adjusts the bottom position
                        },
                    ]}
                    pointerEvents={showScrollToTopButton ? 'auto' : 'none'}
                >
                    <TouchableOpacity
                        onPress={() => {
                            flashListRef.current?.scrollToOffset({ offset: 0, animated: true });
                        }}
                        style={styles.scrollToTopButtonTouchable}
                    >
                        <Ionicons name="arrow-up" size={20} color="white" />
                    </TouchableOpacity>
                </Animated.View>
            </View>
        </View>
    );
}

const getStyles = (colors: typeof Colors.light) =>
    StyleSheet.create({
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
            shadowColor: '#000',
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
        scrollToTopButton: {
            position: 'absolute',
            right: 20,
            width: 40,
            height: 40,
            borderRadius: 20,
            backgroundColor: colors.primary,
            justifyContent: 'center',
            alignItems: 'center',
            elevation: 5,
            shadowColor: '#000',
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.3,
            shadowRadius: 3,
        },
        scrollToTopButtonTouchable: {
            width: '100%',
            height: '100%',
            justifyContent: 'center',
            alignItems: 'center',
        },
    });
