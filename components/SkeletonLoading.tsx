import React, { useEffect, useRef } from 'react';
import {
  View,
  Animated,
  StyleSheet,
  Dimensions,
  ViewStyle,
} from 'react-native';
import { useTheme } from '@/constants/ThemeContext';
import { Colors } from '@/constants/Colors';
import { ShimmerEffect, ShimmerCard } from './ShimmerEffect';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface SkeletonLoadingProps {
  width?: number | string;
  height?: number;
  borderRadius?: number;
  style?: ViewStyle;
}

export const SkeletonItem: React.FC<SkeletonLoadingProps> = ({
  width = '100%',
  height = 20,
  borderRadius = 4,
  style,
}) => {
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const animatedValue = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const startAnimation = () => {
      Animated.loop(
        Animated.sequence([
          Animated.timing(animatedValue, {
            toValue: 1,
            duration: 1000,
            useNativeDriver: false,
          }),
          Animated.timing(animatedValue, {
            toValue: 0,
            duration: 1000,
            useNativeDriver: false,
          }),
        ])
      ).start();
    };

    startAnimation();
  }, [animatedValue]);

  const backgroundColor = animatedValue.interpolate({
    inputRange: [0, 1],
    outputRange: [colors.card, colors.border],
  });

  return (
    <Animated.View
      style={[
        {
          width,
          height,
          borderRadius,
          backgroundColor,
        },
        style,
      ]}
    />
  );
};

export const MangaCardSkeleton: React.FC = () => {
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const styles = getStyles(colors);

  return <ShimmerCard style={styles.cardContainer} />;
};

export const RecentlyReadSkeleton: React.FC = () => {
  const cardWidth = Math.min(160, (SCREEN_WIDTH - 64) / 2);

  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: 16 }}>
      {Array.from({ length: 3 }).map((_, index) => (
        <View key={index} style={{ width: cardWidth, marginRight: 12 }}>
          <MangaCardSkeleton />
        </View>
      ))}
    </View>
  );
};

export const TrendingSkeleton: React.FC = () => {
  return (
    <View style={{ flexDirection: 'row', paddingHorizontal: 16 }}>
      {Array.from({ length: 4 }).map((_, index) => (
        <View key={index} style={{ width: 200, height: 260, marginRight: 12 }}>
          <ShimmerEffect width="100%" height="100%" borderRadius={16} />
        </View>
      ))}
    </View>
  );
};

export const NewReleasesSkeleton: React.FC = () => {
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const styles = getStyles(colors);

  return (
    <View style={styles.gridContainer}>
      {Array.from({ length: 6 }).map((_, index) => (
        <View key={index} style={styles.gridItem}>
          <MangaCardSkeleton />
        </View>
      ))}
    </View>
  );
};

export const FeaturedMangaSkeleton: React.FC = () => {
  return (
    <View style={{ height: 280, marginHorizontal: 16, marginBottom: 24 }}>
      <ShimmerEffect width="100%" height="100%" borderRadius={16} />
    </View>
  );
};

const getStyles = (colors: typeof Colors.light) =>
  StyleSheet.create({
    cardContainer: {
      borderRadius: 12,
      overflow: 'hidden',
      backgroundColor: colors.card,
    },
    cardInfo: {
      padding: 8,
    },
    gridContainer: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      paddingHorizontal: 16,
    },
    gridItem: {
      width: '50%',
      padding: 8,
    },
  });

export default SkeletonItem;
