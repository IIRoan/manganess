import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Animated,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import DownloadButton from './DownloadButton';

const { width: SCREEN_WIDTH } = Dimensions.get('window');
const SWIPE_ACTION_WIDTH = SCREEN_WIDTH * 0.3; // 30% of screen width

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
  mangaId?: string;
  showDownloadButton?: boolean;
  onDownloadStart?: () => void;
  onDownloadComplete?: () => void;
  onDownloadError?: (error: string) => void;
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
  mangaId,
  showDownloadButton = false,
  onDownloadStart,
  onDownloadComplete,
  onDownloadError,
}) => {
  const swipeableRef = useRef<Swipeable>(null);
  const isSwipingRef = useRef(false);

  const renderRightActions = (
    _progress: Animated.AnimatedAddition<number>,
    dragX: Animated.AnimatedAddition<number>
  ) => {
    const actionWidth =
      showDownloadButton && mangaId
        ? SWIPE_ACTION_WIDTH * 1.5
        : SWIPE_ACTION_WIDTH;

    const trans = dragX.interpolate({
      inputRange: [-actionWidth, 0],
      outputRange: [0, actionWidth],
      extrapolate: 'clamp',
    });

    return (
      <View style={[styles.rightAction, { width: actionWidth }]}>
        <Animated.View
          style={[
            styles.actionContainer,
            {
              transform: [{ translateX: trans }],
              width: actionWidth,
              flexDirection: 'row',
            },
          ]}
        >
          {/* Download Action */}
          {showDownloadButton && mangaId && (
            <TouchableOpacity
              style={[
                styles.actionButton,
                { backgroundColor: colors.primary, flex: 1 },
              ]}
              onPress={() => {
                // Download action will be handled by the DownloadButton component
                swipeableRef.current?.close();
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="download-outline" size={18} color="white" />
              <Text style={styles.actionText}>Download</Text>
            </TouchableOpacity>
          )}

          {/* Unread Action */}
          {isRead && (
            <TouchableOpacity
              style={[
                styles.actionButton,
                {
                  backgroundColor: colors.notification,
                  flex: showDownloadButton && mangaId ? 1 : undefined,
                },
              ]}
              onPress={() => {
                onUnread();
                swipeableRef.current?.close();
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="refresh" size={18} color="white" />
              <Text style={styles.actionText}>Unread</Text>
            </TouchableOpacity>
          )}
        </Animated.View>
      </View>
    );
  };

  return (
    <Swipeable
      renderRightActions={renderRightActions}
      rightThreshold={showDownloadButton && mangaId ? 60 : 40}
      friction={2}
      onSwipeableWillOpen={() => {
        isSwipingRef.current = true;
      }}
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
      onSwipeableClose={() => {
        isSwipingRef.current = false;
        if (currentlyOpenSwipeable === swipeableRef.current) {
          setCurrentlyOpenSwipeable(null);
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
        onPress={() => {
          // Prevent navigation if currently swiping or if another swipeable is open
          if (isSwipingRef.current || currentlyOpenSwipeable) {
            if (currentlyOpenSwipeable) {
              currentlyOpenSwipeable.close();
            }
            return;
          }
          onPress();
        }}
        onLongPress={() => {
          // Prevent long press if currently swiping or if another swipeable is open
          if (isSwipingRef.current || currentlyOpenSwipeable) {
            if (currentlyOpenSwipeable) {
              currentlyOpenSwipeable.close();
            }
            return;
          }
          onLongPress();
        }}
        activeOpacity={0.7}
      >
        <View style={styles.chapterContent}>
          <View style={styles.chapterInfo}>
            <Text
              style={[styles.chapterTitle, isRead && styles.readChapterTitle]}
              numberOfLines={1}
            >
              {chapter.title}
            </Text>
            <Text style={styles.chapterDate}>{chapter.date}</Text>
          </View>
          <View style={styles.chapterActions}>
            {showDownloadButton && mangaId && (
              <DownloadButton
                mangaId={mangaId}
                chapterNumber={chapter.number}
                chapterUrl={chapter.url}
                size="small"
                variant="icon"
                onDownloadStart={onDownloadStart || (() => {})}
                onDownloadComplete={onDownloadComplete || (() => {})}
                onDownloadError={onDownloadError || (() => {})}
                style={styles.downloadButton}
              />
            )}
            {isRead && (
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={colors.primary}
                style={
                  showDownloadButton && mangaId ? { marginLeft: 8 } : undefined
                }
              />
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
};

export default SwipeableChapterItem;
