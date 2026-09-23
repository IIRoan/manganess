import React, { useEffect, useMemo, useRef } from 'react';
import { Animated, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { usePathname } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useToast } from '@/hooks/useToast';
import { useTheme } from '@/hooks/useTheme';
import { Colors } from '@/constants/Colors';
import type { ToastConfig } from '@/types/atoms';

const TAB_BAR_BOTTOM_GAP = 15; // matches app/(tabs)/_layout.tsx
const TAB_BAR_HEIGHT = 60; // matches app/(tabs)/_layout.tsx
const TOAST_ABOVE_TAB_GAP = 10;

const ACCENT: Record<NonNullable<ToastConfig['type']>, string> = {
  success: '#2E8B57',
  info: '#5B8DEF',
  warning: '#C9850C',
  error: '#E15B5B',
};

function needsTabBarClearance(pathname: string | null | undefined): boolean {
  if (!pathname) return true;
  return !(
    pathname.includes('/manga/') ||
    pathname.includes('/downloads') ||
    pathname.includes('/cloudflare')
  );
}

function defaultIcon(
  type: ToastConfig['type']
): keyof typeof Ionicons.glyphMap {
  switch (type) {
    case 'success':
      return 'checkmark-circle-outline';
    case 'warning':
      return 'alert-circle-outline';
    case 'error':
      return 'close-circle-outline';
    default:
      return 'information-circle-outline';
  }
}

export const ToastHost: React.FC = () => {
  const { isVisible, config } = useToast();
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const insets = useSafeAreaInsets();
  const pathname = usePathname();
  const opacity = useRef(new Animated.Value(0)).current;
  const translateY = useRef(new Animated.Value(10)).current;

  const bottomOffset = useMemo(() => {
    if (!needsTabBarClearance(pathname)) {
      return Math.max(insets.bottom, 8) + 12;
    }
    // Sit just above the floating tab bar: inset + bar bottom gap + bar height + toast gap
    return insets.bottom + TAB_BAR_BOTTOM_GAP + TAB_BAR_HEIGHT + TOAST_ABOVE_TAB_GAP;
  }, [insets.bottom, pathname]);

  useEffect(() => {
    if (isVisible && config) {
      opacity.setValue(0);
      translateY.setValue(10);
      Animated.parallel([
        Animated.timing(opacity, {
          toValue: 1,
          duration: 180,
          useNativeDriver: true,
        }),
        Animated.timing(translateY, {
          toValue: 0,
          duration: 180,
          useNativeDriver: true,
        }),
      ]).start();
      return;
    }

    Animated.parallel([
      Animated.timing(opacity, {
        toValue: 0,
        duration: 140,
        useNativeDriver: true,
      }),
      Animated.timing(translateY, {
        toValue: 6,
        duration: 140,
        useNativeDriver: true,
      }),
    ]).start();
  }, [isVisible, config, opacity, translateY]);

  if (!config) {
    return null;
  }

  const accent = ACCENT[config.type ?? 'info'];
  const iconName = (config.icon ||
    defaultIcon(config.type)) as keyof typeof Ionicons.glyphMap;

  return (
    <View
      pointerEvents="none"
      style={[styles.host, { bottom: bottomOffset }]}
      accessibilityElementsHidden={!isVisible}
      importantForAccessibility={isVisible ? 'yes' : 'no-hide-descendants'}
    >
      <Animated.View
        style={[
          styles.toast,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
            opacity,
            transform: [{ translateY }],
            marginHorizontal: Math.max(insets.left, insets.right, 20),
          },
        ]}
        accessibilityRole="alert"
        accessibilityLiveRegion="polite"
        accessibilityLabel={config.message}
      >
        <Ionicons name={iconName} size={18} color={accent} />
        <Text
          style={[styles.message, { color: colors.text }]}
          numberOfLines={2}
        >
          {config.message}
        </Text>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: 0,
    right: 0,
    zIndex: 1100,
    elevation: 1100,
    alignItems: 'center',
  },
  toast: {
    maxWidth: 400,
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    paddingHorizontal: 14,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
  },
  message: {
    flex: 1,
    fontSize: 14,
    lineHeight: 19,
    fontWeight: '500',
  },
});
