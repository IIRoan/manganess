import React, { useRef } from 'react';
import { View, Text, Animated, PanGestureHandler, State } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import MangaCard from './MangaCard';
import { useTheme } from '@/constants/ThemeContext';
import { Colors } from '@/constants/Colors';
import { useHapticFeedback } from '@/utils/haptics';
import { MangaCardProps, CacheContext } from '@/types';

interface SwipeableMangaCardProps extends MangaCardProps {
  context?: CacheContext;
  mangaId?: string;
  onBookmark?: () => void;
  onShare?: () => void;
  showQuickActions?: boolean;
}

export const SwipeableMangaCard: React.FC<SwipeableMangaCardProps> = ({
  onBookmark,
  onShare,
  showQuickActions = false,
  ...cardProps
}) => {
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const haptics = useHapticFeedback();

  const translateX = useRef(new Animated.Value(0)).current;
  const actionOpacity = useRef(new Animated.Value(0)).current;

  if (!showQuickActions) {
    return <MangaCard {...cardProps} />;
  }

  const onGestureEvent = Animated.event(
    [{ nativeEvent: { translationX: translateX } }],
    { useNativeDriver: false }
  );

  const onHandlerStateChange = (event: any) => {
    const { state, translationX } = event.nativeEvent;

    if (state === State.ACTIVE) {
      // Show actions when swiping left
      if (translationX < -50) {
        haptics.onSwipe();
        Animated.timing(actionOpacity, {
          toValue: 1,
          duration: 200,
          useNativeDriver: true,
        }).start();
      } else {
        Animated.timing(actionOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }).start();
      }
    }

    if (state === State.END) {
      if (translationX < -100) {
        // Trigger action if swiped far enough
        if (translationX < -150 && onShare) {
          haptics.onSuccess();
          onShare();
        } else if (onBookmark) {
          haptics.onBookmark();
          onBookmark();
        }
      }

      // Reset position
      Animated.parallel([
        Animated.spring(translateX, {
          toValue: 0,
          useNativeDriver: false,
        }),
        Animated.timing(actionOpacity, {
          toValue: 0,
          duration: 200,
          useNativeDriver: true,
        }),
      ]).start();
    }
  };

  return (
    <View style={{ position: 'relative' }}>
      {/* Background Actions */}
      <Animated.View
        style={{
          position: 'absolute',
          right: 0,
          top: 0,
          bottom: 0,
          width: 140,
          flexDirection: 'row',
          opacity: actionOpacity,
        }}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: colors.primary,
            justifyContent: 'center',
            alignItems: 'center',
            borderRadius: 8,
            marginLeft: 4,
          }}
        >
          <Ionicons name="bookmark" size={24} color="#FFFFFF" />
          <Text style={{ color: '#FFFFFF', fontSize: 12, marginTop: 4 }}>
            Bookmark
          </Text>
        </View>
        {onShare && (
          <View
            style={{
              flex: 1,
              backgroundColor: '#34C759',
              justifyContent: 'center',
              alignItems: 'center',
              borderRadius: 8,
              marginLeft: 4,
            }}
          >
            <Ionicons name="share" size={24} color="#FFFFFF" />
            <Text style={{ color: '#FFFFFF', fontSize: 12, marginTop: 4 }}>
              Share
            </Text>
          </View>
        )}
      </Animated.View>

      {/* Swipeable Card */}
      <PanGestureHandler
        onGestureEvent={onGestureEvent}
        onHandlerStateChange={onHandlerStateChange}
        activeOffsetX={[-10, 10]}
        failOffsetY={[-20, 20]}
      >
        <Animated.View
          style={{
            transform: [{ translateX }],
          }}
        >
          <MangaCard {...cardProps} />
        </Animated.View>
      </PanGestureHandler>
    </View>
  );
};
