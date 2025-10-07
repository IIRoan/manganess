import React, { useRef, useEffect } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TouchableOpacity,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/Swipeable';
import * as Reanimated from 'react-native-reanimated';

interface SwipeableChapterItemProps {
  chapter: {
    number: string;
    title: string;
    date: string;
  };
  isRead: boolean;
  isLastItem: boolean;
  isCurrentlyLastRead?: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onUnread: () => void;
  colors: any;
  styles: any;
  currentlyOpenSwipeable: Swipeable | null;
  setCurrentlyOpenSwipeable: (swipeable: Swipeable | null) => void;
}

const BUTTON_WIDTH = 75;

const SwipeableChapterItem: React.FC<SwipeableChapterItemProps> = ({
  chapter,
  isRead,
  isLastItem,
  isCurrentlyLastRead = false,
  onPress,
  onLongPress,
  onUnread,
  colors,
  styles: parentStyles,
  currentlyOpenSwipeable,
  setCurrentlyOpenSwipeable,
}) => {
  const swipeableRef = useRef<Swipeable>(null);
  const supportsWorkletCallback = typeof (Reanimated as any).useWorkletCallback === 'function';

  useEffect(() => {
    if (
      currentlyOpenSwipeable &&
      currentlyOpenSwipeable !== swipeableRef.current
    ) {
      swipeableRef.current?.close();
    }
  }, [currentlyOpenSwipeable]);

  const renderRightActions = (
    _progress: Animated.AnimatedInterpolation<number>,
    dragX: Animated.AnimatedInterpolation<number>
  ) => {
    const trans = dragX.interpolate({
      inputRange: [-BUTTON_WIDTH, 0],
      outputRange: [0, BUTTON_WIDTH],
      extrapolate: 'clamp',
    });

    return (
      <Animated.View
        style={[
          styles.rightActionContainer,
          {
            transform: [{ translateX: trans }],
          },
        ]}
      >
        <TouchableOpacity
          style={[styles.button, { backgroundColor: colors.primary }]}
          onPress={() => {
            onUnread();
            swipeableRef.current?.close();
          }}
        >
          <Ionicons name="close-circle-outline" size={24} color="white" />
          <Text style={styles.buttonText}>Unread</Text>
        </TouchableOpacity>
      </Animated.View>
    );
  };

  // If Reanimated's useWorkletCallback is unavailable or chapter is unread, render a non-swipeable view
  if (!isRead || !supportsWorkletCallback) {
    return (
      <View
        style={[styles.container, isLastItem && parentStyles.lastChapterItem]}
      >
        <TouchableOpacity
          testID="chapter-item"
          onPress={onPress}
          onLongPress={onLongPress}
          style={[parentStyles.chapterItem, styles.content]}
        >
          <View style={parentStyles.chapterInfo}>
            <Text style={parentStyles.chapterTitle}>{chapter.title}</Text>
            <Text style={parentStyles.chapterDate}>{chapter.date}</Text>
          </View>
          <View style={parentStyles.chapterStatus}>
            <Ionicons
              name={isRead ? 'checkmark-circle' : 'ellipse-outline'}
              size={24}
              color={isRead ? colors.primary : colors.tabIconDefault}
            />
          </View>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View
      style={[styles.container, isLastItem && parentStyles.lastChapterItem]}
    >
      <Swipeable
        testID="chapter-item"
        ref={swipeableRef}
        renderRightActions={renderRightActions}
        friction={2}
        leftThreshold={30}
        rightThreshold={40}
        overshootRight={false}
        onSwipeableOpen={() => {
          if (
            currentlyOpenSwipeable &&
            currentlyOpenSwipeable !== swipeableRef.current
          ) {
            currentlyOpenSwipeable.close();
          }
          setCurrentlyOpenSwipeable(swipeableRef.current);
        }}
        onSwipeableClose={() => {
          if (currentlyOpenSwipeable === swipeableRef.current) {
            setCurrentlyOpenSwipeable(null);
          }
        }}
      >
        <TouchableOpacity
          onPress={onPress}
          onLongPress={onLongPress}
          style={[
            parentStyles.chapterItem,
            styles.content,
            isCurrentlyLastRead && styles.lastReadChapterItem,
          ]}
        >
          <View style={parentStyles.chapterInfo}>
            <Text
              style={[
                parentStyles.chapterTitle,
                isRead && parentStyles.readChapterTitle,
                isCurrentlyLastRead && styles.lastReadChapterText,
              ]}
            >
              {chapter.title}
            </Text>
            <Text style={parentStyles.chapterDate}>{chapter.date}</Text>
          </View>
          <View style={parentStyles.chapterStatus}>
            <Ionicons
              name="checkmark-circle"
              size={24}
              color={
                isCurrentlyLastRead ? colors.primary : colors.primary + '99'
              }
            />
          </View>
        </TouchableOpacity>
      </Swipeable>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    width: '100%',
    backgroundColor: 'transparent',
  },
  content: {
    backgroundColor: 'transparent',
  },
  rightActionContainer: {
    width: BUTTON_WIDTH,
    height: '100%',
  },
  button: {
    width: BUTTON_WIDTH,
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonText: {
    color: 'white',
    fontSize: 12,
    marginTop: 4,
  },
  lastReadChapterItem: {
    backgroundColor: 'rgba(0, 128, 0, 0.05)',
  },
  lastReadChapterText: {
    fontWeight: '700',
  },
});

export default SwipeableChapterItem;
