import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  Dimensions,
  Animated,
  ActivityIndicator,
  InteractionManager,
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
  useParentDownloadState?: boolean;
  isDownloaded?: boolean;
  isDownloading?: boolean;
  onPress: () => void;
  onLongPress: () => void;
  onUnread: () => void;
  colors: any;
  styles: any;
  getCurrentlyOpenSwipeable: () => Swipeable | null;
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
  useParentDownloadState = false,
  isDownloaded = false,
  isDownloading = false,
  onPress,
  onLongPress,
  onUnread,
  colors,
  styles,
  getCurrentlyOpenSwipeable,
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
  const [isStartingDownload, setIsStartingDownload] = useState(false);

  // Get unified download status
  const downloadStatus = useDownloadStatus({
    mangaId: mangaId || '',
    chapterNumber: chapter.number,
  });
  const resolvedIsDownloaded = useParentDownloadState
    ? isDownloaded
    : isDownloaded || downloadStatus.isDownloaded;
  const resolvedIsDownloading =
    !resolvedIsDownloaded &&
    (useParentDownloadState
      ? isDownloading
      : isDownloading || downloadStatus.isDownloading);
  const showTopDownloading =
    !resolvedIsDownloaded && (isStartingDownload || resolvedIsDownloading);

  useEffect(() => {
    if (resolvedIsDownloaded) {
      setIsStartingDownload(false);
    }
  }, [resolvedIsDownloaded]);

  const runAfterSwipeClose = useCallback(
    (callback: () => void) => {
      if (getCurrentlyOpenSwipeable() === swipeableRef.current) {
        setCurrentlyOpenSwipeable(null);
      }
      isSwipingRef.current = false;
      swipeableRef.current?.close();
      InteractionManager.runAfterInteractions(callback);
    },
    [getCurrentlyOpenSwipeable, setCurrentlyOpenSwipeable]
  );

  const closeSwipeableSafely = useCallback(() => {
    if (getCurrentlyOpenSwipeable() === swipeableRef.current) {
      setCurrentlyOpenSwipeable(null);
    }
    isSwipingRef.current = false;
    swipeableRef.current?.close();
  }, [getCurrentlyOpenSwipeable, setCurrentlyOpenSwipeable]);

  const renderRightActions = (
    _progress: Animated.AnimatedAddition<number>,
    dragX: Animated.AnimatedAddition<number>
  ) => {
    const showDownloadAction =
      showDownloadButton && mangaId && !resolvedIsDownloaded;
    const showDeleteAction =
      resolvedIsDownloaded && typeof onDeleteDownload === 'function';

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
                  resolvedIsDownloaded || resolvedIsDownloading
                }
                onDownloadStart={() => {
                  setIsStartingDownload(true);
                  closeSwipeableSafely();
                  onDownloadStart?.();
                }}
                onDownloadComplete={() => {
                  setIsStartingDownload(false);
                  runAfterSwipeClose(() => {
                    onDownloadComplete?.();
                  });
                }}
                onDownloadError={(error) => {
                  setIsStartingDownload(false);
                  runAfterSwipeClose(() => {
                    onDownloadError?.(error);
                  });
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
                runAfterSwipeClose(() => {
                  onDeleteDownload?.();
                  downloadStatus.refresh().catch(() => {});
                });
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
                closeSwipeableSafely();
                onUnread();
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
      onSwipeableWillClose={() => {
        isSwipingRef.current = false;
      }}
      onSwipeableOpen={(direction) => {
        if (direction === 'right') {
          const currentlyOpenSwipeable = getCurrentlyOpenSwipeable();
          if (currentlyOpenSwipeable && currentlyOpenSwipeable !== swipeableRef.current) {
            currentlyOpenSwipeable.close();
          }
          setCurrentlyOpenSwipeable(swipeableRef.current);
        }
      }}
      onSwipeableClose={() => {
        isSwipingRef.current = false;
        if (getCurrentlyOpenSwipeable() === swipeableRef.current) {
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
          const currentlyOpenSwipeable = getCurrentlyOpenSwipeable();
          if (isSwipingRef.current || currentlyOpenSwipeable) {
            if (currentlyOpenSwipeable) {
              currentlyOpenSwipeable.close();
            }
            return;
          }
          onPress();
        }}
        onLongPress={() => {
          const currentlyOpenSwipeable = getCurrentlyOpenSwipeable();
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
            {showTopDownloading || resolvedIsDownloaded ? (
              <View style={styles.downloadStatusSlot}>
                {showTopDownloading ? (
                  <ActivityIndicator size={16} color={colors.primary} />
                ) : (
                  <Ionicons
                    name="cloud-done-outline"
                    size={18}
                    color={colors.primary}
                  />
                )}
              </View>
            ) : null}
            {isRead && (
              <Ionicons
                name="checkmark-circle"
                size={20}
                color={colors.primary}
                style={[
                  styles.readIndicator,
                  showTopDownloading || resolvedIsDownloaded
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

export default React.memo(SwipeableChapterItem, (prevProps, nextProps) => {
  return (
    prevProps.chapter.number === nextProps.chapter.number &&
    prevProps.isRead === nextProps.isRead &&
    prevProps.isLastItem === nextProps.isLastItem &&
    prevProps.isCurrentlyLastRead === nextProps.isCurrentlyLastRead &&
    prevProps.useParentDownloadState === nextProps.useParentDownloadState &&
    prevProps.isDownloaded === nextProps.isDownloaded &&
    prevProps.isDownloading === nextProps.isDownloading &&
    prevProps.getCurrentlyOpenSwipeable === nextProps.getCurrentlyOpenSwipeable &&
    prevProps.mangaId === nextProps.mangaId &&
    prevProps.colors === nextProps.colors
  );
});

