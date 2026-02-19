import React, { useRef } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Animated,
  ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Swipeable } from 'react-native-gesture-handler';
import DownloadButton from './DownloadButton';
import { useDownloadStatus } from '@/hooks/useDownloadStatus';

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
  onDeleteDownload?: () => void;
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
  onDeleteDownload,
}) => {
  const swipeableRef = useRef<Swipeable>(null);
  const isSwipingRef = useRef(false);

  // Get unified download status
  const downloadStatus = useDownloadStatus({
    mangaId: mangaId || '',
    chapterNumber: chapter.number,
  });

  const renderRightActions = (
    _progress: Animated.AnimatedAddition<number>,
    dragX: Animated.AnimatedAddition<number>
  ) => {
    const showDownloadAction =
      showDownloadButton && mangaId && !downloadStatus.isDownloaded;
    const showDeleteAction =
      downloadStatus.isDownloaded && typeof onDeleteDownload === 'function';

    const actionCount =
      (showDownloadAction ? 1 : 0) +
      (showDeleteAction ? 1 : 0) +
      (isRead ? 1 : 0);

    if (actionCount === 0) {
      return null;
    }

    const actionWidth = Math.max(
      actionCount * SWIPE_ACTION_WIDTH,
      SWIPE_ACTION_WIDTH
    );

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
          {showDownloadAction ? (
            <View
              style={[
                styles.actionButton,
                styles.swipeDownloadWrapper,
                { backgroundColor: colors.primary },
              ]}
            >
              <DownloadButton
                mangaId={mangaId}
                chapterNumber={chapter.number}
                chapterUrl={chapter.url}
                size="medium"
                variant="full"
                appearance="swipe"
                disabled={
                  downloadStatus.isDownloaded || downloadStatus.isDownloading
                }
                onDownloadStart={() => {
                  onDownloadStart?.();
                  swipeableRef.current?.close();
                }}
                onDownloadComplete={() => {
                  onDownloadComplete?.();
                  swipeableRef.current?.close();
                }}
                onDownloadError={(error) => {
                  onDownloadError?.(error);
                  swipeableRef.current?.close();
                }}
                style={styles.swipeDownloadButton}
              />
            </View>
          ) : null}

          {showDeleteAction ? (
            <TouchableOpacity
              style={[
                styles.actionButton,
                {
                  backgroundColor: colors.error,
                },
              ]}
              onPress={() => {
                onDeleteDownload?.();
                downloadStatus.refresh();
                swipeableRef.current?.close();
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="trash-outline" size={18} color="white" />
              <Text style={styles.actionText}>Delete</Text>
            </TouchableOpacity>
          ) : null}

          {/* Unread Action */}
          {isRead && (
            <TouchableOpacity
              style={[
                styles.actionButton,
                {
                  backgroundColor: colors.notification,
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
            {downloadStatus.isDownloading ? (
              <View style={styles.downloadingWrapper}>
                <ActivityIndicator
                  size="small"
                  color={colors.primary}
                  style={styles.downloadingIndicator}
                />
                <Text style={styles.downloadingText}>
                  {downloadStatus.progress
                    ? `${downloadStatus.progress}%`
                    : 'Downloading…'}
                </Text>
              </View>
            ) : null}
            {downloadStatus.isDownloaded ? (
              <Ionicons
                name="cloud-done-outline"
                size={18}
                color={colors.primary}
                style={styles.downloadedIndicator}
              />
            ) : null}
            {isRead && (
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={colors.primary}
                style={[
                  styles.readIndicator,
                  downloadStatus.isDownloaded
                    ? styles.readIndicatorOffset
                    : undefined,
                ]}
              />
            )}
          </View>
        </View>
      </TouchableOpacity>
    </Swipeable>
  );
};

export default SwipeableChapterItem;
