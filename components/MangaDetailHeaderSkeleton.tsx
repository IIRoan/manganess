import { useEffect } from 'react';
import { View, StyleSheet } from 'react-native';
import { LinearGradient } from 'expo-linear-gradient';
import Reanimated, {
  useSharedValue,
  useAnimatedStyle,
  withRepeat,
  withTiming,
  interpolate,
  Easing,
} from 'react-native-reanimated';
import { useTheme } from '@/hooks/useTheme';
import { Colors } from '@/constants/Colors';
import ChapterListSkeleton from '@/components/ChapterListSkeleton';

const BANNER_HEIGHT = 325;

function useShimmerStyle() {
  const shimmer = useSharedValue(0);

  useEffect(() => {
    shimmer.value = withRepeat(
      withTiming(1, { duration: 1400, easing: Easing.inOut(Easing.ease) }),
      -1,
      true
    );
  }, [shimmer]);

  return useAnimatedStyle(() => ({
    opacity: interpolate(shimmer.value, [0, 1], [0.35, 0.85]),
  }));
}

function Bone({
  style,
  colors,
}: {
  style?: object;
  colors: typeof Colors.light;
}) {
  const animatedStyle = useShimmerStyle();

  return (
    <Reanimated.View
      style={[
        {
          backgroundColor: colors.border,
          borderRadius: 8,
        },
        style,
        animatedStyle,
      ]}
    />
  );
}

export function MangaDetailMetaSkeleton() {
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];

  return (
    <View
      style={styles.metaContainer}
      accessibilityLabel="Loading manga details"
    >
      <View style={styles.section}>
        <Bone colors={colors} style={styles.sectionTitle} />
        <Bone colors={colors} style={styles.descriptionLine} />
        <Bone
          colors={colors}
          style={[styles.descriptionLine, { width: '92%' }]}
        />
        <Bone
          colors={colors}
          style={[styles.descriptionLine, { width: '76%' }]}
        />
        <Bone colors={colors} style={styles.lastReadBar} />
      </View>
      <View style={styles.section}>
        <Bone colors={colors} style={styles.sectionTitle} />
        <View style={styles.detailRow}>
          <Bone colors={colors} style={styles.detailLabel} />
          <Bone colors={colors} style={styles.detailValue} />
        </View>
        <View style={styles.detailRow}>
          <Bone colors={colors} style={styles.detailLabel} />
          <Bone colors={colors} style={[styles.detailValue, { width: 90 }]} />
        </View>
        <View style={styles.detailRow}>
          <Bone colors={colors} style={styles.detailLabel} />
          <Bone colors={colors} style={[styles.detailValue, { width: 120 }]} />
        </View>
        <View style={styles.genreRow}>
          <Bone colors={colors} style={styles.genreChip} />
          <Bone colors={colors} style={[styles.genreChip, { width: 72 }]} />
          <Bone colors={colors} style={[styles.genreChip, { width: 88 }]} />
        </View>
      </View>
    </View>
  );
}

export default function MangaDetailHeaderSkeleton() {
  const { actualTheme } = useTheme();
  const colors = Colors[actualTheme];
  const sweep = useSharedValue(0);

  useEffect(() => {
    sweep.value = withRepeat(
      withTiming(1, { duration: 1600, easing: Easing.linear }),
      -1,
      false
    );
  }, [sweep]);

  const sweepStyle = useAnimatedStyle(() => ({
    transform: [
      {
        translateX: interpolate(sweep.value, [0, 1], [-220, 420]),
      },
    ],
  }));

  const bannerBase = colors.card;
  const bannerHighlight = colors.border;

  return (
    <View
      style={[styles.page, { backgroundColor: colors.card }]}
      accessibilityLabel="Loading manga"
    >
      <View style={[styles.banner, { backgroundColor: bannerBase }]}>
        <Reanimated.View style={[styles.sweep, sweepStyle]}>
          <LinearGradient
            colors={[bannerBase, bannerHighlight, bannerBase]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={styles.sweepGradient}
          />
        </Reanimated.View>
        <View style={styles.bannerContent}>
          <Bone colors={colors} style={styles.titleLine} />
          <Bone
            colors={colors}
            style={[styles.titleLine, { width: '62%', height: 22 }]}
          />
          <Bone colors={colors} style={styles.statusPill} />
        </View>
      </View>
      <View style={[styles.content, { backgroundColor: colors.card }]}>
        <View style={styles.progressCard}>
          <Bone colors={colors} style={styles.progressTitle} />
          <Bone colors={colors} style={styles.progressBar} />
        </View>
        <MangaDetailMetaSkeleton />
      </View>
      <ChapterListSkeleton count={8} />
    </View>
  );
}

const styles = StyleSheet.create({
  page: {
    flex: 1,
  },
  banner: {
    height: BANNER_HEIGHT,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  sweep: {
    ...StyleSheet.absoluteFill,
    width: 220,
  },
  sweepGradient: {
    width: 220,
    height: '100%',
  },
  bannerContent: {
    paddingHorizontal: 20,
    paddingBottom: 24,
    gap: 10,
  },
  titleLine: {
    height: 28,
    width: '84%',
    borderRadius: 8,
  },
  statusPill: {
    height: 22,
    width: 88,
    borderRadius: 12,
    marginTop: 4,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  progressCard: {
    borderRadius: 15,
    paddingVertical: 8,
    marginBottom: 16,
    gap: 10,
  },
  progressTitle: {
    height: 16,
    width: 150,
  },
  progressBar: {
    height: 8,
    width: '100%',
    borderRadius: 4,
  },
  metaContainer: {
    gap: 24,
    marginBottom: 16,
  },
  section: {
    gap: 10,
  },
  sectionTitle: {
    height: 22,
    width: 140,
    marginBottom: 4,
  },
  descriptionLine: {
    height: 14,
    width: '100%',
  },
  lastReadBar: {
    height: 44,
    width: '100%',
    borderRadius: 12,
    marginTop: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    height: 14,
    width: 80,
  },
  detailValue: {
    height: 14,
    width: 110,
  },
  genreRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
  },
  genreChip: {
    height: 28,
    width: 64,
    borderRadius: 14,
  },
});
