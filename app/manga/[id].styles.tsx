import { StyleSheet } from 'react-native';
import type { Colors } from '@/constants/Colors';

const BANNER_HEIGHT = 325;

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
      paddingHorizontal: 24,
    },
    migrationStatusContainer: {
      marginTop: 20,
      gap: 8,
    },
    migrationStatusTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      textAlign: 'center',
    },
    migrationStatusMessage: {
      fontSize: 15,
      lineHeight: 22,
      color: colors.secondaryText,
      textAlign: 'center',
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
    fixedHeader: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      zIndex: 100,
      flexDirection: 'row',
      justifyContent: 'space-between',
      paddingHorizontal: 20,
    },
    bannerContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      height: BANNER_HEIGHT,
      overflow: 'hidden',
      zIndex: 0,
    },
    headerContainer: {
      height: BANNER_HEIGHT,
      position: 'relative',
      overflow: 'hidden',
    },
    bannerImage: {
      ...StyleSheet.absoluteFill,
    },
    overlay: {
      ...StyleSheet.absoluteFill,
      backgroundColor: 'rgba(0, 0, 0, 0.65)',
    },
    headerContent: {
      position: 'absolute',
      bottom: 20,
      left: 20,
      right: 20,
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

    // Chapter item visual styles are now self-contained in SwipeChapterItem
    // These are kept as pass-through for backward compat (component ignores them)
    chapterItem: {},
    lastChapterItem: {},
    chapterInfo: {},
    chapterTitle: {},
    chapterDate: {},
    chapterStatus: {},
    readChapterTitle: {},
    smartScrollButton: {
      position: 'absolute',
      right: 20,
      width: 44,
      height: 44,
      borderRadius: 22,
      overflow: 'hidden',
      elevation: 5,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.25,
      shadowRadius: 3.84,
      zIndex: 100,
    },
    smartScrollButtonTouchable: {
      width: '100%',
      height: '100%',
    },
    blurContainer: {
      width: '100%',
      height: '100%',
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(255, 255, 255, 0.1)',
    },
    progressRingContainer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
    },
    fabIcon: {
      zIndex: 2,
    },
    fabIconLayer: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      justifyContent: 'center',
      alignItems: 'center',
    },
    progressContainer: {
      backgroundColor: colors.card,
      borderRadius: 15,
      padding: 15,
      marginBottom: 20,
    },
    progressHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 8,
    },
    progressTitle: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.text,
    },
    progressPercentage: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.primary,
    },
    progressBarContainer: {
      height: 8,
      backgroundColor: colors.border,
      borderRadius: 4,
      overflow: 'hidden',
      marginBottom: 10,
    },
    progressBar: {
      height: '100%',
      backgroundColor: colors.primary,
      borderRadius: 4,
    },
    progressStats: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      marginTop: 5,
    },
    progressStat: {
      fontSize: 12,
      color: colors.tabIconDefault,
    },

    // Chapter item status styles are now self-contained in SwipeChapterItem
    readChapterItem: {},
    currentlyLastReadItem: {},
    chapterContent: {},
    chapterActions: {},
    downloadingWrapper: {},
    downloadingIndicator: {},
    downloadingText: {},
    downloadStatusSlot: {},
    downloadedIndicator: {},
    readIndicator: {},
    readIndicatorOffset: {},

    // Swipe action styles are now internal to SwipeChapterItem
  });

export default getStyles;
