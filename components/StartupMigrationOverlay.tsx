import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/hooks/useTheme';
import type { StartupMigrationProgress } from '@/services/startupMigrationService';

interface StartupMigrationOverlayProps {
  progress: StartupMigrationProgress | null;
  visible: boolean;
}

export const StartupMigrationOverlay: React.FC<StartupMigrationOverlayProps> = ({
  progress,
  visible,
}) => {
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme =
    theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();

  const styles = useMemo(() => getStyles(colors), [colors]);

  if (!visible || !progress) {
    return null;
  }

  const showProgress =
    progress.phase === 'migrating_ids' &&
    progress.current != null &&
    progress.total != null &&
    progress.total > 0;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      accessibilityViewIsModal
      accessibilityLabel="Library migration in progress"
    >
      <View style={[styles.backdrop, { paddingTop: insets.top + 24 }]}>
        <View style={styles.card}>
          {progress.phase === 'complete' ? null : (
            <ActivityIndicator
              size="large"
              color={colors.primary}
              style={styles.spinner}
            />
          )}
          <Text style={styles.title}>{progress.title}</Text>
          <Text style={styles.message}>{progress.message}</Text>
          {showProgress ? (
            <Text style={styles.progressText}>
              {progress.current} / {progress.total}
            </Text>
          ) : null}
        </View>
      </View>
    </Modal>
  );
};

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    backdrop: {
      flex: 1,
      backgroundColor: 'rgba(0, 0, 0, 0.55)',
      justifyContent: 'center',
      alignItems: 'center',
      paddingHorizontal: 24,
    },
    card: {
      width: '100%',
      maxWidth: 360,
      borderRadius: 16,
      paddingHorizontal: 24,
      paddingVertical: 28,
      backgroundColor: colors.background,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: colors.border,
      alignItems: 'center',
    },
    spinner: {
      marginBottom: 16,
    },
    title: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '700',
      textAlign: 'center',
      marginBottom: 12,
    },
    message: {
      color: colors.secondaryText,
      fontSize: 15,
      lineHeight: 22,
      textAlign: 'center',
    },
    progressText: {
      color: colors.primary,
      fontSize: 14,
      fontWeight: '600',
      marginTop: 16,
    },
  });
