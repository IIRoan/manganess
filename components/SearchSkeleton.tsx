import React, { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
} from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { Colors } from '@/constants/Colors';

interface SearchSkeletonProps {
  layoutMode: 'grid' | 'list';
  count?: number;
}

const SkeletonItem = ({
  layoutMode,
  colors,
}: {
  layoutMode: 'grid' | 'list';
  colors: typeof Colors.light;
}) => {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(withTiming(1, { duration: 1200 }), -1, false);
  }, [shimmer]);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 0.5, 1], [0.3, 0.7, 0.3]),
  }));

  if (layoutMode === 'list') {
    return (
      <Reanimated.View
        style={[
          styles.listItem,
          { backgroundColor: colors.card },
          animatedStyle,
        ]}
      >
        <View style={[styles.listImage, { backgroundColor: colors.border }]} />
        <View style={styles.listContent}>
          <View
            style={[
              styles.listTitle,
              { backgroundColor: colors.border, width: '80%' },
            ]}
          />
          <View
            style={[
              styles.listTitle,
              { backgroundColor: colors.border, width: '50%', marginTop: 8 },
            ]}
          />
          <View
            style={[styles.listBadge, { backgroundColor: colors.border }]}
          />
        </View>
      </Reanimated.View>
    );
  }

  return (
    <Reanimated.View
      style={[styles.gridItem, { backgroundColor: colors.card }, animatedStyle]}
    >
      <View style={[styles.gridImage, { backgroundColor: colors.border }]} />
      <View style={styles.gridContent}>
        <View style={[styles.gridTitle, { backgroundColor: colors.border }]} />
        <View
          style={[
            styles.gridTitle,
            { backgroundColor: colors.border, width: '60%', marginTop: 6 },
          ]}
        />
      </View>
    </Reanimated.View>
  );
};

export default function SearchSkeleton({
  layoutMode,
  count = 6,
}: SearchSkeletonProps) {
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];

  const items = Array.from({ length: count }, (_, i) => i);

  if (layoutMode === 'list') {
    return (
      <View style={styles.listContainer}>
        {items.map((i) => (
          <SkeletonItem key={i} layoutMode={layoutMode} colors={colors} />
        ))}
      </View>
    );
  }

  return (
    <View style={styles.gridContainer}>
      {items.map((i) => (
        <SkeletonItem key={i} layoutMode={layoutMode} colors={colors} />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  listContainer: {
    paddingHorizontal: 16,
    gap: 12,
  },
  gridContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: 16,
    gap: 16,
  },
  listItem: {
    flexDirection: 'row',
    height: 110,
    borderRadius: 12,
    overflow: 'hidden',
  },
  listImage: {
    width: 80,
    height: 110,
  },
  listContent: {
    flex: 1,
    padding: 12,
    justifyContent: 'space-between',
  },
  listTitle: {
    height: 16,
    borderRadius: 4,
  },
  listBadge: {
    height: 24,
    width: 80,
    borderRadius: 6,
    alignSelf: 'flex-start',
  },
  gridItem: {
    width: '47%',
    borderRadius: 12,
    overflow: 'hidden',
  },
  gridImage: {
    aspectRatio: 3 / 4,
    width: '100%',
  },
  gridContent: {
    padding: 10,
  },
  gridTitle: {
    height: 14,
    borderRadius: 4,
    width: '90%',
  },
});
