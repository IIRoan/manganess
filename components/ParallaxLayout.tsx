import React from 'react';
import { StyleProp, ViewStyle } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  interpolate,
  Extrapolation,
  SharedValue,
} from 'react-native-reanimated';
import { Image, ImageStyle } from 'expo-image';

// Hook for managing scroll state
export const useParallaxScroll = (onScroll?: (event: any) => void) => {
  const scrollY = useSharedValue(0);

  const scrollHandler = useAnimatedScrollHandler({
    onScroll: (event) => {
      scrollY.value = event.contentOffset.y;
      if (onScroll) {
        onScroll(event);
      }
    },
  });

  return { scrollY, scrollHandler };
};

interface ParallaxImageProps {
  scrollY: SharedValue<number>;
  source: string;
  height: number;
  style?: StyleProp<ImageStyle>;
  containerStyle?: StyleProp<ViewStyle>;
}

// Component for the parallax image
export const ParallaxImage: React.FC<ParallaxImageProps> = ({
  scrollY,
  source,
  height,
  style,
  containerStyle,
}) => {
  const animatedStyle = useAnimatedStyle(() => {
    return {
      transform: [
        {
          translateY: interpolate(
            scrollY.value,
            [-height, 0, height],
            [-height / 2, 0, height * 0.75],
            Extrapolation.CLAMP
          ),
        },
        {
          scale: interpolate(
            scrollY.value,
            [-height, 0, height],
            [2, 1, 1],
            Extrapolation.CLAMP
          ),
        },
      ],
    };
  });

  return (
    <Reanimated.View
      style={[
        { width: '100%', height: '100%', overflow: 'hidden' },
        containerStyle,
      ]}
    >
      <Reanimated.View
        style={[{ width: '100%', height: '100%' }, animatedStyle]}
      >
        <Image
          source={{ uri: source }}
          style={[{ width: '100%', height: '100%' }, style]}
          contentFit="cover"
          transition={500}
          cachePolicy="memory-disk"
        />
      </Reanimated.View>
    </Reanimated.View>
  );
};
