import React, { useRef, useState } from 'react';
import {
  View,
  TouchableOpacity,
  Animated,
  StyleSheet,
  ViewStyle,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useTheme } from '@/constants/ThemeContext';
import { Colors } from '@/constants/Colors';
import { useHapticFeedback } from '@/utils/haptics';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

interface FloatingActionButtonProps {
  onPress?: () => void;
  onScrollToTop?: () => void;
  onRefresh?: () => void;
  style?: ViewStyle;
  visible?: boolean;
}

export const FloatingActionButton: React.FC<FloatingActionButtonProps> = ({
  onPress,
  onScrollToTop,
  onRefresh,
  style,
  visible = true,
}) => {
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const haptics = useHapticFeedback();
  const insets = useSafeAreaInsets();
  const [expanded, setExpanded] = useState(false);

  const scaleAnim = useRef(new Animated.Value(1)).current;
  const rotateAnim = useRef(new Animated.Value(0)).current;
  const actionScale1 = useRef(new Animated.Value(0)).current;
  const actionScale2 = useRef(new Animated.Value(0)).current;

  const toggleExpanded = () => {
    haptics.onPress();
    setExpanded(!expanded);

    Animated.parallel([
      Animated.spring(rotateAnim, {
        toValue: expanded ? 0 : 1,
        useNativeDriver: true,
      }),
      Animated.stagger(50, [
        Animated.spring(actionScale1, {
          toValue: expanded ? 0 : 1,
          useNativeDriver: true,
        }),
        Animated.spring(actionScale2, {
          toValue: expanded ? 0 : 1,
          useNativeDriver: true,
        }),
      ]),
    ]).start();
  };

  const handleActionPress = (action: () => void) => {
    haptics.onSelection();
    action();
    toggleExpanded();
  };

  const handleMainPress = () => {
    if (expanded) {
      toggleExpanded();
    } else {
      haptics.onPress();
      onPress?.();
    }
  };

  const rotation = rotateAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '45deg'],
  });

  if (!visible) return null;

  return (
    <View style={[styles.container, { bottom: insets.bottom + 100 }, style]}>
      {/* Action Buttons */}
      {onScrollToTop && (
        <Animated.View
          style={[
            styles.actionButton,
            {
              transform: [{ scale: actionScale1 }],
              backgroundColor: colors.card,
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => handleActionPress(onScrollToTop)}
            style={styles.actionTouchable}
          >
            <Ionicons name="arrow-up" size={20} color={colors.primary} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {onRefresh && (
        <Animated.View
          style={[
            styles.actionButton,
            {
              transform: [{ scale: actionScale2 }],
              backgroundColor: colors.card,
            },
          ]}
        >
          <TouchableOpacity
            onPress={() => handleActionPress(onRefresh)}
            style={styles.actionTouchable}
          >
            <Ionicons name="refresh" size={20} color={colors.primary} />
          </TouchableOpacity>
        </Animated.View>
      )}

      {/* Main Button */}
      <Animated.View
        style={[
          styles.mainButton,
          {
            backgroundColor: colors.primary,
            transform: [{ scale: scaleAnim }],
          },
        ]}
      >
        <TouchableOpacity
          onPress={handleMainPress}
          onPressIn={() => {
            Animated.spring(scaleAnim, {
              toValue: 0.9,
              useNativeDriver: true,
            }).start();
          }}
          onPressOut={() => {
            Animated.spring(scaleAnim, {
              toValue: 1,
              useNativeDriver: true,
            }).start();
          }}
          style={styles.mainTouchable}
        >
          <Animated.View style={{ transform: [{ rotate: rotation }] }}>
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    right: 20,
    alignItems: 'center',
  },
  mainButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 4,
    },
    shadowOpacity: 0.3,
    shadowRadius: 8,
  },
  mainTouchable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  actionButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    marginBottom: 12,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.2,
    shadowRadius: 4,
  },
  actionTouchable: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
