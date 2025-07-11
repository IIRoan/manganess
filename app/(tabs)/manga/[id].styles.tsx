import { StyleSheet } from 'react-native';
import type { Colors } from '@/constants/Colors';

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
    scrollToBottomButton: {
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
    scrollToBottomButtonTouchable: {
      width: '100%',
      height: '100%',
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
  });

export default getStyles;
