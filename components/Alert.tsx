import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  Pressable,
  TouchableWithoutFeedback,
  StyleSheet,
  Animated,
  useColorScheme,
  Easing,
} from 'react-native';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { CustomAlertProps } from '@/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

const Alert: React.FC<CustomAlertProps> = ({
  visible,
  title,
  onClose,
  options,
  message,
}) => {
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme =
    theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();

  const overlayOpacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(80)).current;
  const scaleAnim = useRef(new Animated.Value(0.9)).current;
  const [pressedIndex, setPressedIndex] = useState<number | null>(null);
  const [isMounted, setIsMounted] = useState(visible);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 1,
          duration: 200,
          easing: Easing.bezier(0.25, 0.1, 0.25, 1),
          useNativeDriver: true,
        }),
        Animated.spring(translateY, {
          toValue: 0,
          useNativeDriver: true,
          tension: 100,
          friction: 10,
        }),
        Animated.spring(scaleAnim, {
          toValue: 1,
          useNativeDriver: true,
          tension: 100,
          friction: 10,
        }),
      ]).start();
    } else if (isMounted) {
      Animated.parallel([
        Animated.timing(overlayOpacity, {
          toValue: 0,
          duration: 180,
          easing: Easing.bezier(0.4, 0, 0.6, 1),
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 80,
          duration: 180,
          easing: Easing.bezier(0.4, 0, 0.6, 1),
          useNativeDriver: true,
        }),
        Animated.timing(scaleAnim, {
          toValue: 0.9,
          duration: 180,
          easing: Easing.bezier(0.4, 0, 0.6, 1),
          useNativeDriver: true,
        }),
      ]).start(() => {
        setIsMounted(false);
        setPressedIndex(null);
      });
    }
  }, [visible, isMounted, overlayOpacity, translateY, scaleAnim]);

  const handleDismiss = () => {
    Haptics.selectionAsync();
    onClose();
  };

  const handleOptionPress = (index: number) => {
    const option = options?.[index];
    if (!option) return;

    setPressedIndex(index);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

    setTimeout(() => {
      option.onPress?.();
      onClose();
      setPressedIndex(null);
    }, 120);
  };

  if (!isMounted) return null;

  const styles = getStyles(colors);
  const actionOptions = options ?? [];
  const tabBarBottomOffset = insets.bottom + 15;
  const tabBarHeight = 60;
  const sheetBottomSpacing = Math.max(
    tabBarBottomOffset + tabBarHeight + 20,
    insets.bottom + 72
  );

  return (
    <View style={styles.root} pointerEvents="box-none">
      <TouchableWithoutFeedback onPress={handleDismiss}>
        <Animated.View style={[styles.backdrop, { opacity: overlayOpacity }]} />
      </TouchableWithoutFeedback>

      <Animated.View
        style={[
          styles.sheet,
          {
            marginBottom: sheetBottomSpacing,
            transform: [{ translateY }, { scale: scaleAnim }],
          },
        ]}
      >
        <View style={styles.grabber} />

        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text style={styles.title} numberOfLines={2}>
              {title}
            </Text>
            {message ? (
              <Text style={styles.message} numberOfLines={3}>
                {message}
              </Text>
            ) : null}
          </View>
        </View>

        <View style={styles.optionsContainer}>
          {actionOptions.map((option, index) => {
            const label = option.text || '';
            const isCancel = label.trim().toLowerCase() === 'cancel';
            const isPrimary =
              !isCancel &&
              (index === actionOptions.length - 1 ||
                actionOptions.length === 1);
            const forcedPressed = pressedIndex === index;

            return (
              <Pressable
                key={`${label}-${index}`}
                onPress={() => handleOptionPress(index)}
                style={({ pressed }) => [
                  styles.optionButton,
                  index > 0 && styles.optionSpacing,
                  isCancel && styles.cancelButton,
                  isPrimary && styles.primaryButton,
                  (pressed || forcedPressed) &&
                    (isPrimary
                      ? styles.primaryButtonPressed
                      : styles.optionButtonPressed),
                ]}
                accessibilityRole="button"
                accessibilityLabel={label}
              >
                <View style={styles.optionContent}>
                  {option.icon ? (
                    <Ionicons
                      name={option.icon}
                      size={18}
                      color={isPrimary ? colors.card : colors.primary}
                      style={styles.optionIcon}
                    />
                  ) : null}
                  <Text
                    style={[
                      styles.optionText,
                      isPrimary && styles.primaryButtonText,
                      isCancel && styles.cancelButtonText,
                    ]}
                    numberOfLines={1}
                  >
                    {label}
                  </Text>
                </View>
              </Pressable>
            );
          })}
        </View>
      </Animated.View>
    </View>
  );
};

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    root: {
      position: 'absolute',
      top: 0,
      bottom: 0,
      left: 0,
      right: 0,
      justifyContent: 'flex-end',
      zIndex: 1000,
    },
    backdrop: {
      flex: 1,
      backgroundColor: colors.background + 'DD',
    },
    sheet: {
      marginHorizontal: 16,
      backgroundColor: colors.card,
      borderRadius: 28,
      paddingBottom: 24,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 16 },
      shadowOpacity: 0.35,
      shadowRadius: 28,
      elevation: 24,
      borderWidth: 1.5,
      borderColor: colors.border + '40',
    },
    grabber: {
      width: 40,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.border + '60',
      alignSelf: 'center',
      marginTop: 10,
      marginBottom: 16,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      paddingHorizontal: 24,
      marginBottom: 4,
    },
    headerIcon: {
      width: 38,
      height: 38,
      borderRadius: 19,
      backgroundColor: colors.primary + '18',
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 14,
    },
    headerText: {
      flex: 1,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
      letterSpacing: -0.3,
    },
    message: {
      fontSize: 14,
      color: colors.tabIconDefault,
      lineHeight: 21,
      marginTop: 6,
      opacity: 0.9,
    },
    optionsContainer: {
      paddingHorizontal: 24,
      paddingTop: 24,
    },
    optionButton: {
      borderRadius: 14,
      paddingHorizontal: 20,
      paddingVertical: 16,
      borderWidth: 1.5,
      borderColor: colors.border + '50',
      backgroundColor: colors.background,
    },
    optionSpacing: {
      marginTop: 10,
    },
    optionButtonPressed: {
      backgroundColor: colors.border + '30',
      transform: [{ scale: 0.98 }],
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.3,
      shadowRadius: 8,
      elevation: 4,
    },
    primaryButtonPressed: {
      backgroundColor: colors.primary + 'DD',
      transform: [{ scale: 0.98 }],
    },
    optionContent: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
    },
    optionIcon: {
      marginRight: 8,
    },
    optionText: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.text,
      letterSpacing: -0.2,
    },
    primaryButtonText: {
      color: colors.card,
      fontWeight: '700',
      letterSpacing: -0.3,
    },
    cancelButton: {
      backgroundColor: colors.card,
      borderColor: colors.primary,
      borderWidth: 1,
    },
    cancelButtonText: {
      color: colors.primary,
      fontWeight: '600',
    },
  });

export default Alert;
