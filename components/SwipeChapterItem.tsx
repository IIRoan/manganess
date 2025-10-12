import React from 'react';
import { View, Text, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Swipeable from 'react-native-gesture-handler/Swipeable';

interface Chapter {
  number: string;
  title: string;
  date: string;
  url: string;
}

interface SwipeableChapterItemProps {
  chapter: Chapter;
  isRead: boolean;
  isLastItem: boolean;
  isCurrentlyLastRead: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onUnread: () => void;
  colors: any;
  styles: any;
  currentlyOpenSwipeable: Swipeable | null;
  setCurrentlyOpenSwipeable: (swipeable: Swipeable | null) => void;
}

const SwipeableChapterItem: React.FC<SwipeableChapterItemProps> = ({
  chapter,
  isRead,
  isLastItem,
  isCurrentlyLastRead,
  onPress,
  onLongPress,
  onUnread,
  colors,
  styles,
  currentlyOpenSwipeable,
  setCurrentlyOpenSwipeable,
}) => {
  const renderRightActions = () => {
    if (!isRead) return null;

    return (
      <View
        style={[styles.rightAction, { backgroundColor: colors.notification }]}
      >
        <TouchableOpacity style={styles.actionButton} onPress={onUnread}>
          <Ionicons name="refresh" size={20} color="white" />
          <Text style={styles.actionText}>Mark Unread</Text>
        </TouchableOpacity>
      </View>
    );
  };

  return (
    <Swipeable
      renderRightActions={renderRightActions}
      onSwipeableOpen={(direction) => {
        if (direction === 'right') {
          if (
            currentlyOpenSwipeable &&
            currentlyOpenSwipeable !== swipeableRef.current
          ) {
            currentlyOpenSwipeable.close();
          }
          setCurrentlyOpenSwipeable(swipeableRef.current);
        }
      }}
      ref={swipeableRef}
    >
      <TouchableOpacity
        style={[
          styles.chapterItem,
          isRead && styles.readChapterItem,
          isCurrentlyLastRead && styles.currentlyLastReadItem,
          isLastItem && styles.lastChapterItem,
        ]}
        onPress={onPress}
        onLongPress={onLongPress}
        activeOpacity={0.7}
      >
        <View style={styles.chapterContent}>
          <View style={styles.chapterInfo}>
            <Text
              style={[
                styles.chapterTitle,
                isRead && styles.readChapterTitle,
                { color: colors.text },
              ]}
              numberOfLines={1}
            >
              {chapter.title}
            </Text>
            <Text
              style={[styles.chapterDate, { color: colors.tabIconDefault }]}
            >
              {chapter.date}
            </Text>
          </View>
          <View style={styles.chapterActions}>
            {isRead && (
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={colors.primary}
              />
            )}
            {isCurrentlyLastRead && (
              <View
                style={[
                  styles.lastReadBadge,
                  { backgroundColor: colors.primary },
                ]}
              >
                <Text style={styles.lastReadText}>Last Read</Text>
              </View>
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
};

// Create a ref for the swipeable
const swipeableRef = React.createRef<Swipeable>();

export default SwipeableChapterItem;
