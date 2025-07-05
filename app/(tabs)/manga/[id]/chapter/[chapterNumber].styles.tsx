import { StyleSheet } from 'react-native';
import { Colors, ColorScheme } from '@/constants/Colors';

const CHAPTER_ITEM_HEIGHT = 70;

export default function getStyles(colorScheme: ColorScheme) {
  const colors = Colors[colorScheme];

  const bottomSheetBg = colorScheme === 'dark' ? '#1A1A1A' : '#FFFFFF';
  const chapterItemBg = colorScheme === 'dark' ? '#2A2A2A' : '#F5F5F5';
  const controlsBg =
    colorScheme === 'dark'
      ? 'rgba(0, 0, 0, 0.85)'
      : 'rgba(255, 255, 255, 0.85)';

  return StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
    },
    webViewContainer: {
      flex: 1,
    },
    webView: {
      flex: 1,
    },
    loadingContainer: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      bottom: 0,
      alignItems: 'center',
      justifyContent: 'center',
    },
    errorContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      padding: 20,
    },
    errorText: {
      fontSize: 18,
      textAlign: 'center',
      color: colors.error,
    },

    // Controls styles
    controlsWrapper: {
      position: 'absolute',
      left: 0,
      right: 0,
      top: 0,
      zIndex: 100,
    },
    controls: {
      backgroundColor: controlsBg,
    },
    controlsContent: {
      paddingHorizontal: 16,
      paddingVertical: 12,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    leftControls: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 16,
    },
    backButton: {
      padding: 8,
      borderRadius: 20,
      backgroundColor: colors.text + '10',
    },
    titleContainer: {
      flex: 1,
    },
    chapterRow: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    titleText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      marginTop: 2,
    },
    chapterText: {
      fontSize: 14,
      fontWeight: '500',
      color: colors.text + '99',
    },
    menuIcon: {
      marginLeft: 6,
    },
    rightControls: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.text + '10',
      borderRadius: 20,
      marginLeft: 16,
    },
    navigationButton: {
      padding: 12,
    },
    navigationButtonLeft: {
      borderRightWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border + '20',
    },
    navigationButtonRight: {
      borderLeftWidth: 0,
    },
    disabledButton: {
      opacity: 0.3,
    },

    bottomSheetBackground: {
      backgroundColor: bottomSheetBg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.1,
      shadowRadius: 8,
      elevation: 8,
    },
    bottomSheetIndicator: {
      backgroundColor: colors.text + '40',
      width: 40,
      height: 4,
      borderRadius: 2,
    },
    bottomSheetContent: {
      padding: 24,
      paddingBottom: 120,
    },
    bottomSheetTitle: {
      fontSize: 24,
      fontWeight: '700',
      color: colors.text,
      marginBottom: 8,
    },
    currentChapterTitle: {
      fontSize: 16,
      fontWeight: '500',
      color: colors.primary,
      marginBottom: 24,
      paddingBottom: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border + '40',
    },
    chapterItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      height: CHAPTER_ITEM_HEIGHT,
      paddingVertical: 8,
      paddingHorizontal: 16,
      marginBottom: 8,
      borderRadius: 8,
      backgroundColor: chapterItemBg,
      borderWidth: 1,
      borderColor: colors.border + '20',
    },
    currentChapter: {
      backgroundColor: colors.primary + '15',
      borderColor: colors.primary + '30',
    },
    chapterItemLeft: {
      flex: 1,
      marginRight: 16,
    },
    chapterNumber: {
      fontSize: 18,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 4,
    },
    chapterDate: {
      fontSize: 14,
      color: colors.text + '80',
    },
    chapterProgress: {
      fontSize: 14,
      color: colors.primary,
      fontWeight: '500',
    },
    readIndicator: {
      width: 3,
      height: 40,
      backgroundColor: colors.primary,
      borderRadius: 2,
    },
    unreadIndicator: {
      width: 3,
      height: 40,
      backgroundColor: colors.text + '20',
      borderRadius: 2,
    },
    bottomSheetContainer: {
      flex: 1,
    },
    closeButton: {
      position: 'absolute',
      bottom: 40,
      left: 20,
      right: 20,
      padding: 10,
      alignItems: 'center',
      backgroundColor: Colors[colorScheme].primary,
      borderRadius: 5,
    },
    closeButtonText: {
      color: Colors[colorScheme].card,
      fontWeight: 'bold',
    },
  });
}
