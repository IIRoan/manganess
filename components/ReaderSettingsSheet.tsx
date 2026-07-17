import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  Text,
  Modal,
  Pressable,
  StyleSheet,
  TouchableOpacity,
  Switch,
  ScrollView,
  Dimensions,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import Animated, {
  Easing,
  Extrapolation,
  interpolate,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { Colors } from '@/constants/Colors';
import type {
  ReadingMode,
  ReaderBackground,
  ReaderImageFit,
  ProgressBarPosition,
} from '@/types/settings';

interface ReaderSettingsSheetProps {
  visible: boolean;
  onClose: () => void;
  colorScheme: 'light' | 'dark';
  accentColor?: string | undefined;
  readingMode: ReadingMode;
  /** When true (manhwa/manhua/webtoon), LTR/RTL options are hidden. */
  verticalOnly?: boolean;
  readerBackground: ReaderBackground;
  readerImageFit: ReaderImageFit;
  progressBarPosition: ProgressBarPosition;
  readerDimPercent: number;
  keepHeaderVisible: boolean;
  onReadingModeChange: (mode: ReadingMode) => void;
  onReaderBackgroundChange: (background: ReaderBackground) => void;
  onReaderImageFitChange: (fit: ReaderImageFit) => void;
  onProgressBarPositionChange: (position: ProgressBarPosition) => void;
  onReaderDimPercentChange: (percent: number) => void;
  onKeepHeaderVisibleChange: (keep: boolean) => void;
}

const MANGA_READING_MODE_OPTIONS: Array<{
  value: ReadingMode;
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  hint: string;
}> = [
  {
    value: 'auto',
    label: 'Auto',
    icon: 'sparkles-outline',
    hint: 'Detect long-strip vs single-page layout',
  },
  {
    value: 'vertical',
    label: 'Strip',
    icon: 'swap-vertical-outline',
    hint: 'Long strip — continuous vertical scroll',
  },
  {
    value: 'ltr',
    label: 'LTR',
    icon: 'arrow-forward-outline',
    hint: 'Single page, left to right (manga)',
  },
  {
    value: 'rtl',
    label: 'RTL',
    icon: 'arrow-back-outline',
    hint: 'Single page, right to left (manga)',
  },
];

const BACKGROUND_OPTIONS: Array<{
  value: ReaderBackground;
  label: string;
  swatch: string;
}> = [
  { value: 'default', label: 'Theme', swatch: 'transparent' },
  { value: 'black', label: 'Black', swatch: '#000000' },
  { value: 'gray', label: 'Gray', swatch: '#2A2A2A' },
  { value: 'white', label: 'White', swatch: '#FFFFFF' },
];

const IMAGE_FIT_OPTIONS: Array<{
  value: ReaderImageFit;
  label: string;
  hint: string;
}> = [
  { value: 'width', label: 'Width', hint: 'Scale pages to screen width' },
  { value: 'height', label: 'Height', hint: 'Scale pages to screen height' },
  { value: 'both', label: 'Both', hint: 'Fit the whole page on screen' },
  { value: 'fill', label: 'Fill', hint: 'Fill the screen (crop edges)' },
];

const PROGRESS_OPTIONS: Array<{
  value: ProgressBarPosition;
  label: string;
}> = [
  { value: 'none', label: 'None' },
  { value: 'top', label: 'Top' },
  { value: 'bottom', label: 'Bottom' },
];

const DIM_PRESETS = [0, 15, 30, 45, 60] as const;
const SCREEN_HEIGHT = Dimensions.get('window').height;
const CLOSE_DISTANCE = 110;
const CLOSE_VELOCITY = 900;

/**
 * In-reader settings drawer: slides up from the bottom with drag-to-close.
 * Preferences are saved per content type (manga vs manhwa) by the parent.
 */
export default function ReaderSettingsSheet({
  visible,
  onClose,
  colorScheme,
  accentColor,
  readingMode,
  verticalOnly = false,
  readerBackground,
  readerImageFit,
  progressBarPosition,
  readerDimPercent,
  keepHeaderVisible,
  onReadingModeChange,
  onReaderBackgroundChange,
  onReaderImageFitChange,
  onProgressBarPositionChange,
  onReaderDimPercentChange,
  onKeepHeaderVisibleChange,
}: ReaderSettingsSheetProps) {
  const insets = useSafeAreaInsets();
  const colors = Colors[colorScheme];
  const primary = accentColor || colors.primary;
  const styles = useMemo(() => getStyles(colors), [colors]);

  const translateY = useSharedValue(SCREEN_HEIGHT);
  const dragStartY = useSharedValue(0);
  const overlayOpacity = useSharedValue(0);
  const isClosing = useSharedValue(false);
  const isClosingRef = useRef(false);
  const [modalVisible, setModalVisible] = useState(visible);

  const activeModeHint = useMemo(
    () =>
      MANGA_READING_MODE_OPTIONS.find((option) => option.value === readingMode)
        ?.hint ?? '',
    [readingMode]
  );

  const activeFitHint = useMemo(
    () =>
      IMAGE_FIT_OPTIONS.find((option) => option.value === readerImageFit)
        ?.hint ?? '',
    [readerImageFit]
  );

  const notifyClosed = useCallback(() => {
    isClosingRef.current = false;
    isClosing.value = false;
    setModalVisible(false);
    onClose();
  }, [isClosing, onClose]);

  const resetClosingFlag = useCallback(() => {
    isClosingRef.current = false;
  }, []);

  const requestClose = useCallback(() => {
    if (isClosingRef.current || isClosing.value) {
      return;
    }
    isClosingRef.current = true;
    isClosing.value = true;
    overlayOpacity.value = withTiming(0, {
      duration: 180,
      easing: Easing.out(Easing.cubic),
    });
    translateY.value = withTiming(
      SCREEN_HEIGHT,
      {
        duration: 260,
        easing: Easing.out(Easing.cubic),
      },
      (finished) => {
        if (finished) {
          runOnJS(notifyClosed)();
        } else {
          isClosing.value = false;
          runOnJS(resetClosingFlag)();
        }
      }
    );
  }, [isClosing, notifyClosed, overlayOpacity, resetClosingFlag, translateY]);

  const openSheet = useCallback(() => {
    isClosingRef.current = false;
    isClosing.value = false;
    translateY.value = SCREEN_HEIGHT;
    overlayOpacity.value = 0;
    translateY.value = withSpring(0, {
      damping: 28,
      stiffness: 260,
      mass: 0.7,
      overshootClamping: false,
    });
    overlayOpacity.value = withTiming(1, {
      duration: 200,
      easing: Easing.out(Easing.cubic),
    });
  }, [isClosing, overlayOpacity, translateY]);

  useEffect(() => {
    if (visible) {
      setModalVisible(true);
      requestAnimationFrame(() => openSheet());
      return;
    }
    if (modalVisible && !isClosingRef.current) {
      requestClose();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visible]);

  const markClosing = useCallback(() => {
    isClosingRef.current = true;
  }, []);

  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .activeOffsetY(6)
        .failOffsetX([-18, 18])
        .onBegin(() => {
          dragStartY.value = translateY.value;
        })
        .onUpdate((event) => {
          if (isClosing.value) {
            return;
          }
          const next = Math.max(0, dragStartY.value + event.translationY);
          translateY.value = next;
          overlayOpacity.value = interpolate(
            next,
            [0, SCREEN_HEIGHT * 0.45],
            [1, 0],
            Extrapolation.CLAMP
          );
        })
        .onEnd((event) => {
          if (isClosing.value) {
            return;
          }
          const shouldClose =
            translateY.value > CLOSE_DISTANCE ||
            event.velocityY > CLOSE_VELOCITY;

          if (shouldClose) {
            isClosing.value = true;
            runOnJS(markClosing)();
            const distance = Math.max(80, SCREEN_HEIGHT - translateY.value);
            const duration = Math.min(
              280,
              Math.max(160, distance / Math.max(event.velocityY / 1000, 1.2))
            );
            overlayOpacity.value = withTiming(0, {
              duration,
              easing: Easing.out(Easing.cubic),
            });
            translateY.value = withTiming(
              SCREEN_HEIGHT,
              {
                duration,
                easing: Easing.out(Easing.cubic),
              },
              (finished) => {
                if (finished) {
                  runOnJS(notifyClosed)();
                } else {
                  isClosing.value = false;
                  runOnJS(resetClosingFlag)();
                }
              }
            );
            return;
          }

          translateY.value = withSpring(0, {
            damping: 28,
            stiffness: 280,
            mass: 0.7,
          });
          overlayOpacity.value = withTiming(1, {
            duration: 160,
            easing: Easing.out(Easing.cubic),
          });
        }),
    [
      dragStartY,
      isClosing,
      markClosing,
      notifyClosed,
      overlayOpacity,
      resetClosingFlag,
      translateY,
    ]
  );

  const handleModePress = useCallback(
    (mode: ReadingMode) => {
      onReadingModeChange(mode);
    },
    [onReadingModeChange]
  );

  const sheetAnimatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }],
  }));

  const overlayAnimatedStyle = useAnimatedStyle(() => ({
    opacity: overlayOpacity.value,
  }));

  return (
    <Modal
      visible={modalVisible}
      transparent
      animationType="none"
      onRequestClose={requestClose}
      statusBarTranslucent
    >
      <GestureHandlerRootView style={styles.gestureRoot}>
        <View style={styles.modalRoot}>
          <Animated.View
            pointerEvents="box-none"
            style={[styles.overlay, overlayAnimatedStyle]}
          >
            <Pressable
              style={StyleSheet.absoluteFill}
              onPress={requestClose}
              accessibilityRole="button"
              accessibilityLabel="Close reader settings"
            />
          </Animated.View>

          <Animated.View
            style={[
              styles.sheet,
              { paddingBottom: Math.max(insets.bottom, 16) + 8 },
              sheetAnimatedStyle,
            ]}
          >
            <GestureDetector gesture={panGesture}>
              <Animated.View style={styles.dragRegion}>
                <View style={styles.handle} />
                <View style={styles.headerRow}>
                  <Text style={styles.title}>
                    {verticalOnly ? 'Manhwa Settings' : 'Manga Settings'}
                  </Text>
                  <TouchableOpacity
                    onPress={requestClose}
                    hitSlop={12}
                    accessibilityRole="button"
                    accessibilityLabel="Close"
                  >
                    <Ionicons name="close" size={22} color={colors.text} />
                  </TouchableOpacity>
                </View>
              </Animated.View>
            </GestureDetector>

            <ScrollView
              showsVerticalScrollIndicator={false}
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              bounces={false}
              nestedScrollEnabled
            >
              {!verticalOnly && (
                <>
                  <Text style={styles.sectionLabel}>Page Layout</Text>
                  <View style={styles.segmentRow}>
                    {MANGA_READING_MODE_OPTIONS.map((option) => {
                      const isActive = readingMode === option.value;
                      return (
                        <TouchableOpacity
                          key={option.value}
                          style={[
                            styles.segment,
                            isActive && { backgroundColor: primary },
                          ]}
                          onPress={() => handleModePress(option.value)}
                          accessibilityRole="button"
                          accessibilityState={{ selected: isActive }}
                          accessibilityLabel={`Reading mode ${option.label}`}
                        >
                          <Ionicons
                            name={option.icon}
                            size={18}
                            color={isActive ? '#FFFFFF' : colors.tabIconDefault}
                          />
                          <Text
                            style={[
                              styles.segmentText,
                              {
                                color: isActive
                                  ? '#FFFFFF'
                                  : colors.tabIconDefault,
                              },
                            ]}
                          >
                            {option.label}
                          </Text>
                        </TouchableOpacity>
                      );
                    })}
                  </View>
                  <Text style={styles.hint}>{activeModeHint}</Text>
                </>
              )}

              <Text
                style={[
                  styles.sectionLabel,
                  !verticalOnly && styles.sectionSpacing,
                ]}
              >
                Image Fit
              </Text>
              <View style={styles.segmentRow}>
                {IMAGE_FIT_OPTIONS.map((option) => {
                  const isActive = readerImageFit === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.segment,
                        isActive && { backgroundColor: primary },
                      ]}
                      onPress={() => onReaderImageFitChange(option.value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={`Image fit ${option.label}`}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          {
                            color: isActive
                              ? '#FFFFFF'
                              : colors.tabIconDefault,
                          },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.hint}>{activeFitHint}</Text>

              <Text style={[styles.sectionLabel, styles.sectionSpacing]}>
                Progress Bar
              </Text>
              <View style={styles.segmentRow}>
                {PROGRESS_OPTIONS.map((option) => {
                  const isActive = progressBarPosition === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.segment,
                        isActive && { backgroundColor: primary },
                      ]}
                      onPress={() => onProgressBarPositionChange(option.value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={`Progress bar ${option.label}`}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          {
                            color: isActive
                              ? '#FFFFFF'
                              : colors.tabIconDefault,
                          },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={[styles.sectionLabel, styles.sectionSpacing]}>
                Dim Pages
              </Text>
              <View style={styles.segmentRow}>
                {DIM_PRESETS.map((preset) => {
                  const isActive = readerDimPercent === preset;
                  return (
                    <TouchableOpacity
                      key={preset}
                      style={[
                        styles.segment,
                        isActive && { backgroundColor: primary },
                      ]}
                      onPress={() => onReaderDimPercentChange(preset)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={`Dim pages ${preset} percent`}
                    >
                      <Text
                        style={[
                          styles.segmentText,
                          {
                            color: isActive
                              ? '#FFFFFF'
                              : colors.tabIconDefault,
                          },
                        ]}
                      >
                        {preset === 0 ? 'Off' : `${preset}%`}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
              <Text style={styles.hint}>
                Softens bright panels without changing page background.
              </Text>

              <Text style={[styles.sectionLabel, styles.sectionSpacing]}>
                Background
              </Text>
              <View style={styles.segmentRow}>
                {BACKGROUND_OPTIONS.map((option) => {
                  const isActive = readerBackground === option.value;
                  return (
                    <TouchableOpacity
                      key={option.value}
                      style={[
                        styles.backgroundOption,
                        isActive && {
                          borderColor: primary,
                          backgroundColor: primary + '18',
                        },
                      ]}
                      onPress={() => onReaderBackgroundChange(option.value)}
                      accessibilityRole="button"
                      accessibilityState={{ selected: isActive }}
                      accessibilityLabel={`Background ${option.label}`}
                    >
                      <View
                        style={[
                          styles.swatch,
                          {
                            backgroundColor:
                              option.value === 'default'
                                ? colors.background
                                : option.swatch,
                            borderColor: colors.border,
                          },
                        ]}
                      />
                      <Text
                        style={[
                          styles.backgroundLabel,
                          {
                            color: isActive ? primary : colors.tabIconDefault,
                          },
                        ]}
                      >
                        {option.label}
                      </Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={[styles.toggleRow, styles.sectionSpacing]}>
                <View style={styles.toggleCopy}>
                  <Text style={styles.toggleTitle}>Sticky header</Text>
                  <Text style={styles.hint}>
                    Keep chapter controls visible while scrolling
                  </Text>
                </View>
                <Switch
                  value={keepHeaderVisible}
                  onValueChange={onKeepHeaderVisibleChange}
                  trackColor={{ false: colors.border, true: primary + '88' }}
                  thumbColor={keepHeaderVisible ? primary : colors.card}
                  accessibilityLabel="Toggle sticky header"
                />
              </View>
            </ScrollView>
          </Animated.View>
        </View>
      </GestureHandlerRootView>
    </Modal>
  );
}

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    gestureRoot: {
      flex: 1,
    },
    modalRoot: {
      flex: 1,
      justifyContent: 'flex-end',
    },
    overlay: {
      ...StyleSheet.absoluteFillObject,
      backgroundColor: 'rgba(0,0,0,0.45)',
    },
    sheet: {
      backgroundColor: colors.card,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      paddingHorizontal: 18,
      paddingTop: 10,
      maxHeight: '78%',
    },
    dragRegion: {
      paddingTop: 4,
      paddingBottom: 8,
    },
    scroll: {
      flexGrow: 0,
    },
    scrollContent: {
      paddingBottom: 8,
    },
    handle: {
      alignSelf: 'center',
      width: 44,
      height: 5,
      borderRadius: 3,
      backgroundColor: colors.text + '40',
      marginBottom: 14,
    },
    headerRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 16,
    },
    title: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    sectionLabel: {
      fontSize: 13,
      fontWeight: '600',
      color: colors.text + '99',
      marginBottom: 8,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
    },
    sectionSpacing: {
      marginTop: 18,
    },
    segmentRow: {
      flexDirection: 'row',
      backgroundColor: colors.background,
      borderRadius: 10,
      padding: 4,
      gap: 4,
    },
    segment: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      paddingVertical: 10,
      borderRadius: 8,
      gap: 4,
    },
    segmentText: {
      fontSize: 12,
      fontWeight: '600',
    },
    hint: {
      marginTop: 8,
      fontSize: 13,
      lineHeight: 18,
      color: colors.text + '80',
    },
    backgroundOption: {
      flex: 1,
      alignItems: 'center',
      gap: 6,
      paddingVertical: 10,
      borderRadius: 8,
      borderWidth: 1.5,
      borderColor: 'transparent',
    },
    swatch: {
      width: 28,
      height: 28,
      borderRadius: 14,
      borderWidth: StyleSheet.hairlineWidth,
    },
    backgroundLabel: {
      fontSize: 11,
      fontWeight: '600',
    },
    toggleRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 12,
      paddingVertical: 4,
    },
    toggleCopy: {
      flex: 1,
    },
    toggleTitle: {
      fontSize: 15,
      fontWeight: '600',
      color: colors.text,
      marginBottom: 2,
    },
  });
