import React, {
  createContext,
  useContext,
  useState,
  useCallback,
  useRef,
} from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
} from 'react-native';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  runOnJS,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/constants/ThemeContext';
import { Colors, ColorScheme } from '@/constants/Colors';
import { IconName } from '@/types';

interface ToastConfig {
  message: string;
  icon?: IconName;
  duration?: number;
  type?: 'success' | 'info' | 'warning' | 'error';
}

interface ToastContextType {
  showToast: (config: ToastConfig) => void;
}

const ToastContext = createContext<ToastContextType | undefined>(undefined);

export const useToast = () => {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error('useToast must be used within a ToastProvider');
  }
  return context;
};

interface ToastProviderProps {
  children: React.ReactNode;
}

export const ToastProvider: React.FC<ToastProviderProps> = ({ children }) => {
  const { theme, systemTheme } = useTheme();
  const colorScheme = theme === 'system' ? systemTheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();
  const styles = getStyles(colors, insets);

  const [toastConfig, setToastConfig] = useState<ToastConfig | null>(null);
  const [isVisible, setIsVisible] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  const translateY = useSharedValue(100);
  const opacity = useSharedValue(0);

  const hideToast = useCallback(() => {
    translateY.value = withTiming(100, { duration: 200 });
    opacity.value = withTiming(0, { duration: 200 }, () => {
      runOnJS(setIsVisible)(false);
      runOnJS(setToastConfig)(null);
    });
  }, [translateY, opacity]);

  const showToast = useCallback(
    (config: ToastConfig) => {
      // Clear any existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      setToastConfig(config);
      setIsVisible(true);

      // Animate in
      translateY.value = withSpring(0, {
        damping: 20,
        stiffness: 300,
        mass: 0.5,
      });
      opacity.value = withTiming(1, { duration: 200 });

      // Auto-hide after duration
      const duration = config.duration || 2500;
      timeoutRef.current = setTimeout(() => {
        hideToast();
      }, duration);
    },
    [translateY, opacity, hideToast]
  );

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
    opacity: opacity.value,
  }));

  const getIconName = (): IconName => {
    if (toastConfig?.icon) return toastConfig.icon;
    switch (toastConfig?.type) {
      case 'success':
        return 'checkmark-circle';
      case 'warning':
        return 'warning';
      case 'error':
        return 'close-circle';
      default:
        return 'information-circle';
    }
  };

  const getIconColor = () => {
    switch (toastConfig?.type) {
      case 'success':
        return colors.primary;
      case 'warning':
        return '#F59E0B';
      case 'error':
        return '#EF4444';
      default:
        return colors.primary;
    }
  };

  return (
    <ToastContext.Provider value={{ showToast }}>
      {children}
      {isVisible && toastConfig && (
        <Animated.View style={[styles.container, animatedStyle]}>
          <View style={styles.content}>
            <Ionicons
              name={getIconName()}
              size={20}
              color={getIconColor()}
              style={styles.icon}
            />
            <Text style={styles.message}>{toastConfig.message}</Text>
          </View>
        </Animated.View>
      )}
    </ToastContext.Provider>
  );
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const getStyles = (colors: typeof Colors.light, insets: { bottom: number }) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      bottom: insets.bottom + 80,
      left: 16,
      right: 16,
      alignItems: 'center',
      zIndex: 9999,
      elevation: 9999,
    },
    content: {
      flexDirection: 'row',
      alignItems: 'center',
      backgroundColor: colors.card,
      paddingHorizontal: 16,
      paddingVertical: 12,
      borderRadius: 12,
      maxWidth: SCREEN_WIDTH - 32,
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 8,
      elevation: 8,
      borderWidth: 1,
      borderColor: colors.border,
    },
    icon: {
      marginRight: 10,
    },
    message: {
      fontSize: 15,
      color: colors.text,
      fontWeight: '500',
      flexShrink: 1,
    },
  });
