import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  View,
  useColorScheme,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/hooks/useTheme';
import type { AppUpdatePhase } from '@/atoms/appUpdateAtom';

interface AppUpdatePromptProps {
  visible: boolean;
  phase: AppUpdatePhase;
  error: string | null;
  isDownloaded: boolean;
  onInstall: () => void;
  onRestart: () => void;
  onLater: () => void;
}

export const AppUpdatePrompt: React.FC<AppUpdatePromptProps> = ({
  visible,
  phase,
  error,
  isDownloaded,
  onInstall,
  onRestart,
  onLater,
}) => {
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme =
    theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const styles = useMemo(() => getStyles(colors), [colors]);

  const busy = phase === 'downloading' || phase === 'restarting';
  const canDismiss = phase === 'available' || phase === 'error';

  const title =
    phase === 'error'
      ? 'Update failed'
      : phase === 'downloading'
        ? 'Downloading update'
        : phase === 'restarting'
          ? 'Restarting'
          : isDownloaded
            ? 'Update ready'
            : 'Update available';

  const message =
    phase === 'error'
      ? error || 'The update could not be installed. You can try again later.'
      : phase === 'downloading'
        ? 'Keep MangaNess open while the new version downloads.'
        : phase === 'restarting'
          ? 'Restarting to apply the update.'
          : isDownloaded
            ? 'A new version is downloaded. Restart to start using it.'
            : 'A new version of MangaNess is ready. Install it now or keep reading and install later.';

  const primaryLabel =
    isDownloaded || phase === 'restarting' ? 'Restart' : 'Install';
  const onPrimary =
    isDownloaded || phase === 'restarting' ? onRestart : onInstall;

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={canDismiss ? onLater : undefined}
      accessibilityViewIsModal
      accessibilityLabel={title}
    >
      <View style={[styles.backdrop, { paddingTop: insets.top + 24 }]}>
        <View style={styles.card}>
          {busy ? (
            <ActivityIndicator
              size="large"
              color={colors.primary}
              style={styles.spinner}
            />
          ) : (
            <Ionicons
              name={
                phase === 'error'
                  ? 'alert-circle-outline'
                  : 'cloud-download-outline'
              }
              size={48}
              color={phase === 'error' ? colors.error : colors.primary}
              style={styles.icon}
            />
          )}
          <Text style={styles.title}>{title}</Text>
          <Text style={styles.message}>{message}</Text>
          {phase === 'error' || phase === 'available' ? (
            <View style={styles.actions}>
              {phase === 'available' ? (
                <Pressable
                  style={styles.primaryButton}
                  onPress={onPrimary}
                  accessibilityRole="button"
                  accessibilityLabel={primaryLabel}
                >
                  <Text style={styles.primaryButtonText}>{primaryLabel}</Text>
                </Pressable>
              ) : null}
              <Pressable
                style={styles.laterButton}
                onPress={onLater}
                accessibilityRole="button"
                accessibilityLabel="Later"
              >
                <Text style={styles.laterButtonText}>Later</Text>
              </Pressable>
            </View>
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
    icon: {
      marginBottom: 16,
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
    actions: {
      width: '100%',
      marginTop: 24,
      gap: 10,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 14,
      alignItems: 'center',
    },
    primaryButtonText: {
      color: colors.card,
      fontSize: 16,
      fontWeight: '600',
    },
    laterButton: {
      paddingVertical: 12,
      alignItems: 'center',
    },
    laterButtonText: {
      color: colors.secondaryText,
      fontSize: 16,
      fontWeight: '600',
    },
  });
