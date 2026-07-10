import React from 'react';
import { View, StyleSheet } from 'react-native';
import { useTheme } from '@/hooks/useTheme';
import { Colors } from '@/constants/Colors';

const ITEM_HEIGHT = 65;

/**
 * Ultra-lightweight single chapter skeleton row.
 * No animations, no hooks, no state - just static Views
 * so FlashList can mount these instantly during fast scroll.
 */
export const ChapterItemPlaceholder: React.FC<{
  colors: typeof Colors.light;
}> = React.memo(({ colors }) => (
  <View style={[s.item, { borderBottomColor: colors.border + '30', backgroundColor: colors.card }]}>
    <View style={[s.numberBlock, { backgroundColor: colors.border + '40' }]} />
    <View style={s.textBlock}>
      <View style={[s.titleLine, { backgroundColor: colors.border + '40' }]} />
      <View style={[s.dateLine, { backgroundColor: colors.border + '30' }]} />
    </View>
    <View style={[s.statusBlock, { backgroundColor: colors.border + '30' }]} />
  </View>
));

ChapterItemPlaceholder.displayName = 'ChapterItemPlaceholder';

/**
 * Full skeleton list for initial loading state (before any chapter data).
 * Uses the same lightweight placeholder rows.
 */
interface ChapterListSkeletonProps {
  count?: number;
}

const ChapterListSkeleton: React.FC<ChapterListSkeletonProps> = ({
  count = 12,
}) => {
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];

  return (
    <View style={[s.container, { backgroundColor: colors.card }]}>
      {Array.from({ length: count }).map((_, i) => (
        <ChapterItemPlaceholder key={i} colors={colors} />
      ))}
    </View>
  );
};

const s = StyleSheet.create({
  container: {
    paddingHorizontal: 14,
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    height: ITEM_HEIGHT,
    paddingVertical: 12,
    paddingHorizontal: 14,
    gap: 12,
    borderBottomWidth: 1,
  },
  numberBlock: {
    width: 44,
    height: 16,
    borderRadius: 4,
  },
  textBlock: {
    flex: 1,
    justifyContent: 'center',
    gap: 6,
  },
  titleLine: {
    width: '65%',
    height: 13,
    borderRadius: 4,
  },
  dateLine: {
    width: '35%',
    height: 10,
    borderRadius: 3,
  },
  statusBlock: {
    width: 24,
    height: 24,
    borderRadius: 8,
  },
});

export default React.memo(ChapterListSkeleton);
