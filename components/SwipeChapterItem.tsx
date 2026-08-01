import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import Swipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Reanimated, {
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  type SharedValue,
} from 'react-native-reanimated';
import DownloadButton from './DownloadButton';
import { useDownloadStatus } from '@/hooks/useDownloadStatus';
import { stripChapterPrefix } from '@/utils/stripChapterPrefix';

// Constants
const SWIPE_ACTION_WIDTH = 80;
const SWIPE_THRESHOLD = 20; // Lower threshold for easier opening
const SWIPE_FRICTION = 2; // Higher friction for smoother feel
const SWIPE_OVERSHOOT_FRICTION = 8;

/**
 * Chapter data structure
 */
interface Chapter {
  number: string;
  title: string;
  date: string;
  url: string;
}

/**
 * Props for SwipeableChapterItem component
 */
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
  getCurrentlyOpenSwipeable: () => SwipeableMethods | null;
  setCurrentlyOpenSwipeable: (swipeable: SwipeableMethods | null) => void;
  mangaId?: string;
  mangaTitle?: string | undefined;
  showDownloadButton?: boolean;
  onDownloadStart?: () => void;
  onDownloadComplete?: () => void;
  onDownloadError?: (error: string) => void;
  onDeleteDownload?: () => void;
}

/**
 * Animated swipe action button component
 * Slides in from the right when swiping
 */
const SwipeActionButton = React.memo(
  ({
    progress,
    backgroundColor,
    buttonWidth,
    onPress,
    icon,
    label,
  }: {
    progress: SharedValue<number>;
    backgroundColor: string;
    buttonWidth: number;
    onPress: () => void;
    icon: keyof typeof Ionicons.glyphMap;
    label: string;
  }) => {
    const animStyle = useAnimatedStyle(() => ({
      transform: [
        {
          translateX: interpolate(
            progress.value,
            [0, 1],
            [buttonWidth, 0],
            Extrapolation.CLAMP
          ),
        },
      ],
    }));

    return (
      <Reanimated.View style={animStyle}>
        <TouchableOpacity
          onPress={onPress}
          activeOpacity={0.7}
          style={[actionBtn.touchable, { backgroundColor, width: buttonWidth }]}
          accessibilityRole="button"
          accessibilityLabel={label}
        >
          <Ionicons name={icon} size={22} color="#fff" />
        </TouchableOpacity>
      </Reanimated.View>
    );
  }
);
SwipeActionButton.displayName = 'SwipeActionButton';

/**
 * Animated download action button component
 * Wraps DownloadButton with swipe animation
 */
const DownloadActionButton = React.memo(
  ({
    progress,
    backgroundColor,
    buttonWidth,
    mangaId,
    mangaTitle,
    chapter,
    disabled,
    onDownloadStart,
    onDownloadComplete,
    onDownloadError,
  }: {
    progress: SharedValue<number>;
    backgroundColor: string;
    buttonWidth: number;
    mangaId: string;
    mangaTitle?: string | undefined;
    chapter: Chapter;
    disabled: boolean;
    onDownloadStart: () => void;
    onDownloadComplete: () => void;
    onDownloadError: (error: string) => void;
  }) => {
    const animStyle = useAnimatedStyle(() => ({
      transform: [
        {
          translateX: interpolate(
            progress.value,
            [0, 1],
            [buttonWidth, 0],
            Extrapolation.CLAMP
          ),
        },
      ],
    }));

    return (
      <Reanimated.View style={animStyle}>
        <View
          style={[actionBtn.touchable, { backgroundColor, width: buttonWidth }]}
        >
          <DownloadButton
            mangaId={mangaId}
            mangaTitle={mangaTitle}
            chapterNumber={chapter.number}
            chapterUrl={chapter.url}
            size="medium"
            variant="icon"
            appearance="swipe"
            disabled={disabled}
            onDownloadStart={onDownloadStart}
            onDownloadComplete={onDownloadComplete}
            onDownloadError={onDownloadError}
            style={{ width: '100%', height: '100%' }}
          />
        </View>
      </Reanimated.View>
    );
  }
);
DownloadActionButton.displayName = 'DownloadActionButton';

const actionBtn = StyleSheet.create({
  touchable: {
    minHeight: 64,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});

/**
 * SwipeableChapterItem - A chapter list item with swipe actions
 *
 * Features:
 * - Swipe right to reveal actions (download, delete, mark unread)
 * - Visual indicators for read status, download status, and last read
 * - Smooth animations and haptic feedback
 * - Accessibility support
 * - Optimized with React.memo for performance
 */
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
  styles: _parentStyles,
  getCurrentlyOpenSwipeable,
  setCurrentlyOpenSwipeable,
  mangaId,
  mangaTitle,
  showDownloadButton = false,
  onDownloadStart,
  onDownloadComplete,
  onDownloadError,
  onDeleteDownload,
}) => {
  const swipeableRef = useRef<SwipeableMethods | null>(null);
  const isSwipingRef = useRef(false);
  const [isStartingDownload, setIsStartingDownload] = useState(false);

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
    !resolvedIsDownloaded &&
    (isStartingDownload ||
      resolvedIsDownloading ||
      downloadStatus.isDownloading);

  useEffect(() => {
    if (resolvedIsDownloaded) setIsStartingDownload(false);
  }, [resolvedIsDownloaded]);

  const closeSelf = useCallback(() => {
    const current = getCurrentlyOpenSwipeable();
    if (current === swipeableRef.current) {
      setCurrentlyOpenSwipeable(null);
    }
    isSwipingRef.current = false;
    swipeableRef.current?.close();
  }, [getCurrentlyOpenSwipeable, setCurrentlyOpenSwipeable]);

  const renderRightActions = useCallback(
    (progress: SharedValue<number>, _drag: SharedValue<number>) => {
      const canDownload =
        showDownloadButton && mangaId && !resolvedIsDownloaded;
      const canDelete =
        resolvedIsDownloaded && typeof onDeleteDownload === 'function';
      const canMarkUnread = isRead;
      const count =
        (canDownload ? 1 : 0) + (canDelete ? 1 : 0) + (canMarkUnread ? 1 : 0);

      if (count === 0) return null;

      const buttonWidth = SWIPE_ACTION_WIDTH;

      return (
        <View style={s.actionsRow}>
          {canDownload && (
            <DownloadActionButton
              progress={progress}
              backgroundColor={colors.primary}
              mangaId={mangaId!}
              mangaTitle={mangaTitle}
              chapter={chapter}
              disabled={resolvedIsDownloaded || resolvedIsDownloading}
              buttonWidth={buttonWidth}
              onDownloadStart={() => {
                setIsStartingDownload(true);
                closeSelf();
                onDownloadStart?.();
              }}
              onDownloadComplete={() => {
                setIsStartingDownload(false);
                closeSelf();
                onDownloadComplete?.();
              }}
              onDownloadError={(error) => {
                setIsStartingDownload(false);
                closeSelf();
                onDownloadError?.(error);
              }}
            />
          )}
          {canDelete && (
            <SwipeActionButton
              progress={progress}
              backgroundColor={colors.error}
              buttonWidth={buttonWidth}
              onPress={() => {
                closeSelf();
                onDeleteDownload?.();
                downloadStatus.refresh().catch(() => {});
              }}
              icon="trash-outline"
              label="Delete"
            />
          )}
          {canMarkUnread && (
            <SwipeActionButton
              progress={progress}
              backgroundColor={colors.notification}
              buttonWidth={buttonWidth}
              onPress={() => {
                closeSelf();
                onUnread();
              }}
              icon="eye-off-outline"
              label="Mark as unread"
            />
          )}
        </View>
      );
    },
    [
      showDownloadButton,
      mangaId,
      mangaTitle,
      resolvedIsDownloaded,
      resolvedIsDownloading,
      onDeleteDownload,
      isRead,
      colors.primary,
      colors.error,
      colors.notification,
      chapter,
      closeSelf,
      onDownloadStart,
      onDownloadComplete,
      onDownloadError,
      onUnread,
      downloadStatus,
    ]
  );

  const handlePress = useCallback(() => {
    const current = getCurrentlyOpenSwipeable();
    if (current) {
      // If there's an open swipeable, close it but don't navigate
      current.close();
      setCurrentlyOpenSwipeable(null);
      return;
    }
    // Only navigate if nothing is open and we're not swiping
    if (!isSwipingRef.current) {
      onPress();
    }
  }, [getCurrentlyOpenSwipeable, setCurrentlyOpenSwipeable, onPress]);

  const handleLongPress = useCallback(() => {
    const current = getCurrentlyOpenSwipeable();
    if (current) {
      // If there's an open swipeable, close it but don't trigger long press
      current.close();
      setCurrentlyOpenSwipeable(null);
      return;
    }
    // Only trigger long press if nothing is open and we're not swiping
    if (!isSwipingRef.current) {
      onLongPress();
    }
  }, [getCurrentlyOpenSwipeable, setCurrentlyOpenSwipeable, onLongPress]);

  const chapterNum = chapter.number;
  const displayTitle = useMemo(
    () => stripChapterPrefix(chapter.title, chapterNum),
    [chapter.title, chapterNum]
  );

  const statusIcons = useMemo(() => {
    const icons: React.ReactNode[] = [];

    if (showTopDownloading) {
      const pct = Math.round(
        Math.max(0, Math.min(100, downloadStatus.progress || 0))
      );
      icons.push(
        <View
          key="downloading"
          style={[s.statusChip, { backgroundColor: colors.primary + '18' }]}
        >
          <Text
            style={[
              s.downloadPercent,
              { color: colors.primary },
            ]}
          >
            {pct}%
          </Text>
        </View>
      );
    } else if (resolvedIsDownloaded) {
      icons.push(
        <View
          key="downloaded"
          style={[s.statusChip, { backgroundColor: colors.primary + '18' }]}
        >
          <Ionicons name="cloud-done" size={13} color={colors.primary} />
        </View>
      );
    }

    if (isRead) {
      icons.push(
        <View
          key="read"
          style={[s.statusChip, { backgroundColor: colors.primary + '15' }]}
        >
          <Ionicons name="checkmark" size={13} color={colors.primary} />
        </View>
      );
    }

    return icons;
  }, [
    showTopDownloading,
    resolvedIsDownloaded,
    isRead,
    colors.primary,
    downloadStatus.progress,
  ]);

  return (
    <Swipeable
      ref={swipeableRef}
      renderRightActions={renderRightActions}
      rightThreshold={SWIPE_THRESHOLD}
      friction={SWIPE_FRICTION}
      overshootFriction={SWIPE_OVERSHOOT_FRICTION}
      overshootRight={false}
      overshootLeft={false}
      enableTrackpadTwoFingerGesture={false}
      containerStyle={[
        s.swipeContainer,
        {
          borderBottomColor: colors.border + '30',
          backgroundColor: colors.background,
        },
        isLastItem && s.lastItem,
      ]}
      childrenContainerStyle={s.childrenContainer}
      onSwipeableWillOpen={() => {
        isSwipingRef.current = true;
        const current = getCurrentlyOpenSwipeable();
        if (current && current !== swipeableRef.current) {
          current.close();
        }
      }}
      onSwipeableOpen={() => {
        setCurrentlyOpenSwipeable(swipeableRef.current);
      }}
      onSwipeableWillClose={() => {
        isSwipingRef.current = false;
      }}
      onSwipeableClose={() => {
        isSwipingRef.current = false;
        if (getCurrentlyOpenSwipeable() === swipeableRef.current) {
          setCurrentlyOpenSwipeable(null);
        }
      }}
    >
      <View style={[s.cardContent, { backgroundColor: colors.card }]}>
        <TouchableOpacity
          onPress={handlePress}
          onLongPress={handleLongPress}
          activeOpacity={0.65}
          style={[s.card, { backgroundColor: colors.card }]}
          accessibilityRole="button"
          accessibilityLabel={`Chapter ${chapterNum}${displayTitle ? `: ${displayTitle}` : ''}`}
          accessibilityHint={
            isRead
              ? 'Read chapter. Long press for options'
              : 'Unread chapter. Tap to read, long press for options'
          }
          accessibilityState={{
            selected: isCurrentlyLastRead,
            disabled: false,
          }}
        >
          {/* Last read indicator - subtle dot */}
          {isCurrentlyLastRead && (
            <View
              style={[s.lastReadDot, { backgroundColor: colors.primary }]}
            />
          )}

          {/* Chapter number as leading text */}
          <View style={s.chapterNumberContainer}>
            <Text
              style={[
                s.chapterNumber,
                {
                  color: isCurrentlyLastRead
                    ? colors.primary
                    : isRead
                      ? colors.tabIconDefault
                      : colors.text,
                },
              ]}
              numberOfLines={1}
            >
              #{chapterNum}
            </Text>
          </View>

          <View style={s.textBlock}>
            {displayTitle != null ? (
              <>
                <Text
                  style={[
                    s.title,
                    { color: isRead ? colors.tabIconDefault : colors.text },
                  ]}
                  numberOfLines={1}
                >
                  {displayTitle}
                </Text>
                <Text style={[s.date, { color: colors.tabIconDefault }]}>
                  {chapter.date}
                </Text>
              </>
            ) : (
              <Text style={[s.date, { color: colors.tabIconDefault }]}>
                {chapter.date}
              </Text>
            )}
          </View>

          {/* Status icons - always visible */}
          {statusIcons.length > 0 && (
            <View style={s.statusRow}>{statusIcons}</View>
          )}

          {/* Chevron indicator */}
          <Ionicons
            name="chevron-forward"
            size={16}
            color={colors.tabIconDefault}
            style={s.chevron}
          />
        </TouchableOpacity>
      </View>
    </Swipeable>
  );
};

// ─── Styles ──────────────────────────────────────────────────────────
const s = StyleSheet.create({
  swipeContainer: {
    marginHorizontal: 14,
    marginVertical: 0,
    borderBottomWidth: 1,
    backgroundColor: 'transparent',
    overflow: 'hidden',
  },
  lastItem: {
    marginBottom: 8,
    borderBottomWidth: 0,
  },
  childrenContainer: {
    overflow: 'hidden',
  },
  cardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    position: 'relative',
    overflow: 'hidden',
  },
  card: {
    flexDirection: 'row',
    alignItems: 'center',
    minHeight: 64,
    paddingVertical: 12,
    paddingHorizontal: 14,
    borderRadius: 0,
    gap: 12,
    position: 'relative',
    flex: 1,
  },
  lastReadDot: {
    position: 'absolute',
    left: 6,
    width: 6,
    height: 6,
    borderRadius: 3,
  },
  chapterNumberContainer: {
    flexShrink: 0,
    minWidth: 50,
  },
  chapterNumber: {
    fontSize: 16,
    fontWeight: '800',
    letterSpacing: -0.5,
    fontVariant: ['tabular-nums'],
  },
  textBlock: {
    flex: 1,
    justifyContent: 'center',
    minHeight: 40,
    minWidth: 0,
  },
  title: {
    fontSize: 15,
    fontWeight: '600',
    lineHeight: 20,
    marginBottom: 2,
  },
  date: {
    fontSize: 12,
    opacity: 0.7,
    lineHeight: 16,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    flexShrink: 0,
  },
  statusChip: {
    minWidth: 24,
    height: 24,
    paddingHorizontal: 4,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  downloadPercent: {
    fontSize: 10,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    letterSpacing: -0.2,
  },
  chevron: {
    opacity: 0.4,
    flexShrink: 0,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    height: '100%',
    overflow: 'hidden',
  },
});

export default React.memo(
  SwipeableChapterItem,
  (prev, next) =>
    prev.chapter.number === next.chapter.number &&
    prev.isRead === next.isRead &&
    prev.isLastItem === next.isLastItem &&
    prev.isCurrentlyLastRead === next.isCurrentlyLastRead &&
    prev.useParentDownloadState === next.useParentDownloadState &&
    prev.isDownloaded === next.isDownloaded &&
    prev.isDownloading === next.isDownloading &&
    prev.getCurrentlyOpenSwipeable === next.getCurrentlyOpenSwipeable &&
    prev.mangaId === next.mangaId &&
    prev.colors === next.colors
);
