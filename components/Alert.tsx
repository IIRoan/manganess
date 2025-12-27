import React, { useEffect, useState, useCallback } from 'react';
import {
  View,
  Text,
  Pressable,
  ScrollView,
  StyleSheet,
  Dimensions,
  useColorScheme,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
  interpolate,
  Extrapolation,
} from 'react-native-reanimated';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { CustomAlertProps } from '@/types';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

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

  const [isMounted, setIsMounted] = useState(false);

  const translateY = useSharedValue(100);
  const opacity = useSharedValue(0);
  const backdropOpacity = useSharedValue(0);
  const scale = useSharedValue(0.95);

  const handleUnmount = useCallback(() => {
    setIsMounted(false);
  }, []);

  useEffect(() => {
    if (visible) {
      setIsMounted(true);
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);

      // Animate in with smooth spring
      backdropOpacity.value = withTiming(1, { duration: 250 });
      translateY.value = withSpring(0, {
        damping: 20,
        stiffness: 300,
        mass: 0.5,
      });
      opacity.value = withTiming(1, { duration: 200 });
      scale.value = withSpring(1, {
        damping: 20,
        stiffness: 300,
        mass: 0.5,
      });
    } else if (isMounted) {
      // Animate out
      backdropOpacity.value = withTiming(0, { duration: 200 });
      translateY.value = withTiming(100, { duration: 200 });
      opacity.value = withTiming(0, { duration: 200 }, () => {
        runOnJS(handleUnmount)();
      });
      scale.value = withTiming(0.95, { duration: 200 });
    }
  }, [visible, isMounted, translateY, opacity, backdropOpacity, scale, handleUnmount]);

  const handleDismiss = useCallback(() => {
    Haptics.selectionAsync();
    onClose();
  }, [onClose]);

  const handleOptionPress = useCallback(
    (index: number) => {
      const option = options?.[index];
      if (!option) return;

      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      option.onPress?.();
      onClose();
    },
    [options, onClose]
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [
      { translateY: translateY.value },
      { scale: scale.value },
    ],
    opacity: opacity.value,
  }));

  const backdropAnimatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(
      backdropOpacity.value,
      [0, 1],
      [0, 0.6],
      Extrapolation.CLAMP
    ),
  }));

  if (!isMounted) return null;

  const styles = getStyles(colors);
  const actionOptions = options ?? [];
  const tabBarBottomOffset = insets.bottom + 15;
  const tabBarHeight = 60;
  const sheetBottomSpacing = Math.max(
    tabBarBottomOffset + tabBarHeight + 16,
    insets.bottom + 72
  );

  return (
    <View style={styles.root} pointerEvents="box-none">
      <Pressable style={StyleSheet.absoluteFill} onPress={handleDismiss}>
        <Animated.View style={[styles.backdrop, backdropAnimatedStyle]} />
      </Pressable>

      <Animated.View
        style={[
          styles.sheet,
          { marginBottom: sheetBottomSpacing },
          sheetAnimatedStyle,
        ]}
      >
        <View style={styles.header}>
          <Text style={styles.title} numberOfLines={2}>
            {title}
          </Text>
          {message ? (
            <ScrollView
              style={styles.messageScroll}
              contentContainerStyle={styles.messageScrollContent}
              showsVerticalScrollIndicator={false}
              alwaysBounceVertical={false}
            >
              <Text style={styles.message} selectable>
                {message}
              </Text>
            </ScrollView>
          ) : null}
        </View>

        <View style={styles.optionsContainer}>
          {actionOptions.map((option, index) => {
            const label = option.text || '';
            const isCancel = label.trim().toLowerCase() === 'cancel';
            const isPrimary =
              !isCancel &&
              (index === actionOptions.length - 1 || actionOptions.length === 1);

            return (
              <Pressable
                key={`${label}-${index}`}
                onPress={() => handleOptionPress(index)}
                style={({ pressed }) => [
                  styles.optionButton,
                  index > 0 && styles.optionSpacing,
                  isCancel && styles.cancelButton,
                  isPrimary && styles.primaryButton,
                  pressed && (isPrimary ? styles.primaryButtonPressed : styles.optionButtonPressed),
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
      zIndex: 9999,
    },
    backdrop: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: '#000',
    },
    sheet: {
      marginHorizontal: 16,
      backgroundColor: colors.card,
      borderRadius: 16,
      paddingTop: 20,
      paddingBottom: 20,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 12,
      elevation: 12,
      borderWidth: 1,
      borderColor: colors.border,
      maxWidth: SCREEN_WIDTH - 32,
    },
    header: {
      paddingHorizontal: 20,
      marginBottom: 4,
    },
    title: {
      fontSize: 17,
      fontWeight: '600',
      color: colors.text,
      letterSpacing: -0.2,
    },
    message: {
      fontSize: 14,
      color: colors.tabIconDefault,
      lineHeight: 20,
    },
    messageScroll: {
      marginTop: 8,
      maxHeight: 200,
    },
    messageScrollContent: {
      paddingBottom: 2,
    },
    optionsContainer: {
      paddingHorizontal: 20,
      paddingTop: 16,
    },
    optionButton: {
      borderRadius: 12,
      paddingHorizontal: 16,
      paddingVertical: 14,
      backgroundColor: colors.background,
      borderWidth: 1,
      borderColor: colors.border,
    },
    optionSpacing: {
      marginTop: 8,
    },
    optionButtonPressed: {
      backgroundColor: colors.border,
      opacity: 0.9,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
      shadowColor: colors.primary,
      shadowOffset: { width: 0, height: 2 },
      shadowOpacity: 0.2,
      shadowRadius: 4,
      elevation: 3,
    },
    primaryButtonPressed: {
      opacity: 0.85,
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
      fontSize: 15,
      fontWeight: '500',
      color: colors.text,
    },
    primaryButtonText: {
      color: colors.card,
      fontWeight: '600',
    },
    cancelButton: {
      backgroundColor: 'transparent',
      borderColor: colors.border,
    },
    cancelButtonText: {
      color: colors.tabIconDefault,
      fontWeight: '500',
    },
  });

export default Alert;
