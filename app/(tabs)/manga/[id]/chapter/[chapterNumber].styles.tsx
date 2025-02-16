import { StyleSheet } from 'react-native';
import { Colors, ColorScheme } from '@/constants/Colors';

const HEADER_HEIGHT = 56;

export default function getStyles(colorScheme: ColorScheme) {
  const colors = Colors[colorScheme];
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
    controls: {
      position: 'absolute',
      left: 0,
      right: 0,
      height: HEADER_HEIGHT,
      backgroundColor: colors.card + 'F0',
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    controlsRow: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 8,
    },
    leftControls: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
    },
    rightControls: {
      flexDirection: 'row',
      alignItems: 'center',
    },
    controlButton: {
      padding: 8,
      borderRadius: 8,
    },
    disabledButton: {
      opacity: 0.5,
    },
    titleButton: {
      marginLeft: 8,
      flex: 1,
    },
    titleText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
    },
    chapterText: {
      fontSize: 14,
      color: colors.text + '99',
    },
    bottomSheetBackground: {
      backgroundColor: colors.card,
    },
    bottomSheetIndicator: {
      backgroundColor: colors.text,
    },
    bottomSheetContent: {
      padding: 16,
    },
    bottomSheetTitle: {
      fontSize: 20,
      fontWeight: 'bold',
      color: colors.text,
      marginBottom: 16,
    },
    currentChapterTitle: {
      fontSize: 16,
      color: colors.text,
      marginBottom: 16,
    },
    chapterItem: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingVertical: 12,
      paddingHorizontal: 16,
      borderBottomWidth: 1,
      borderBottomColor: colors.border,
    },
    currentChapter: {
      backgroundColor: colors.primary + '20',
    },
  });
}
