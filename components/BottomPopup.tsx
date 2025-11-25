import React, { useEffect } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  Modal,
  Dimensions,
  TouchableWithoutFeedback,
  useColorScheme,
  StatusBar,
  Platform,
} from 'react-native';
import { Colors, ColorScheme } from '@/constants/Colors';
import { useTheme } from '@/constants/ThemeContext';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, {
  useSharedValue,
  useAnimatedStyle,
  withSpring,
  withTiming,
  Easing,
} from 'react-native-reanimated';
import { PanGestureHandler } from 'react-native-gesture-handler';
import { BottomPopupProps } from '@/types';

const BottomPopup: React.FC<BottomPopupProps> = ({
  visible,
  title,
  onClose,
  options,
}) => {
  const { theme } = useTheme();
  const systemColorScheme = useColorScheme() as ColorScheme;
  const colorScheme =
    theme === 'system' ? systemColorScheme : (theme as ColorScheme);
  const colors = Colors[colorScheme];
  const insets = useSafeAreaInsets();

  const styles = getStyles(colors, insets);
  const screenHeight = Dimensions.get('window').height;

  const translateY = useSharedValue(screenHeight);
  const overlayOpacity = useSharedValue(0);
  const gestureTranslateY = useSharedValue(0);

  useEffect(() => {
    if (visible) {
      // Show the modal
      gestureTranslateY.value = 0;
      StatusBar.setBarStyle('light-content');
      if (Platform.OS === 'android') {
        StatusBar.setBackgroundColor('rgba(0,0,0,0.05)');
      }
      translateY.value = withSpring(0, {
        damping: 25,
        stiffness: 200,
        mass: 0.5,
        overshootClamping: false,
      });
      overlayOpacity.value = withTiming(1, {
        duration: 100,
        easing: Easing.out(Easing.ease),
      });
    } else {
      // Hide the modal
      StatusBar.setBarStyle('default');
      if (Platform.OS === 'android') {
        StatusBar.setBackgroundColor('transparent');
      }
      translateY.value = withTiming(screenHeight, {
        duration: 100,
        easing: Easing.in(Easing.ease),
      });
      overlayOpacity.value = withTiming(0, {
        duration: 100,
        easing: Easing.in(Easing.ease),
      });
    }
  }, [visible, translateY, screenHeight, overlayOpacity, gestureTranslateY]);

  const handleGestureEvent = (event: any) => {
    'worklet';
    if (event.nativeEvent.translationY > 0) {
      gestureTranslateY.value = event.nativeEvent.translationY;
    }
  };

  const handleGestureEnd = (event: any) => {
    'worklet';
    const threshold = 80;
    if (
      event.nativeEvent.translationY > threshold ||
      event.nativeEvent.velocityY > 500
    ) {
      gestureTranslateY.value = withTiming(screenHeight, {
        duration: 200,
        easing: Easing.in(Easing.ease),
      });
      overlayOpacity.value = withTiming(0, {
        duration: 200,
        easing: Easing.in(Easing.ease),
      });
      setTimeout(() => onClose(), 200);
    } else {
      gestureTranslateY.value = withSpring(0, {
        damping: 25,
        stiffness: 200,
        mass: 0.5,
      });
    }
  };

  const containerAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: translateY.value + gestureTranslateY.value }],
    };
  });

  const overlayAnimatedStyle = useAnimatedStyle(() => {
    return {
      opacity: overlayOpacity.value,
    };
  });

  return (
    <Modal
      transparent={true}
      visible={visible}
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent={true}
    >
      <View style={styles.modalContainer}>
        <TouchableWithoutFeedback onPress={onClose}>
          <Animated.View style={[styles.modalOverlay, overlayAnimatedStyle]} />
        </TouchableWithoutFeedback>
        <PanGestureHandler
          onGestureEvent={handleGestureEvent}
          onEnded={handleGestureEnd}
        >
          <Animated.View style={[styles.container, containerAnimatedStyle]}>
            <View style={styles.handle} />
            <View style={styles.header}>
              <Text testID="bottom-popup-title" style={styles.title}>
                {title}
              </Text>
            </View>
            <View style={styles.optionsContainer}>
              {options?.map((option, index) => (
                <TouchableOpacity
                  key={index}
                  style={styles.optionButton}
                  onPress={() => {
                    option.onPress();
                    onClose();
                  }}
                >
                  {option.icon && (
                    <View style={styles.iconContainer}>
                      <Ionicons
                        name={option.icon}
                        size={24}
                        color={colors.primary}
                      />
                    </View>
                  )}
                  <Text style={styles.optionText}>{option.text}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </Animated.View>
        </PanGestureHandler>
      </View>
    </Modal>
  );
};

const getStyles = (colors: typeof Colors.light, insets: { bottom: number }) =>
  StyleSheet.create({
    modalContainer: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    modalOverlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.5)',
    },
    container: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 24,
      borderTopRightRadius: 24,
      paddingTop: 12,
      paddingHorizontal: 24,
      paddingBottom: insets.bottom + 24,
      maxHeight: '80%',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: -3 },
      shadowOpacity: 0.1,
      shadowRadius: 5,
      elevation: 5,
    },
    handle: {
      width: 40,
      height: 4,
      backgroundColor: colors.border,
      borderRadius: 2,
      alignSelf: 'center',
      marginBottom: 16,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 24,
    },
    title: {
      fontSize: 22,
      color: colors.text,
      fontWeight: 'bold',
    },
    optionsContainer: {
      marginTop: 8,
    },
    optionButton: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingVertical: 16,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    iconContainer: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
      marginRight: 16,
    },
    optionText: {
      fontSize: 18,
      color: colors.text,
      flex: 1,
    },
  });

export default BottomPopup;
