import { useEffect, useRef } from 'react';
import { Animated, Easing, StyleSheet, View, type ViewStyle } from 'react-native';
import { durationFor, motionDuration, useReduceMotion } from '../motion';
import { colors, radius } from '../tokens';

type Tone = 'accent' | 'attention' | 'neutral';

interface SegmentBarProps {
  filled: number;
  total: number;
  tone?: Tone;
  /** When set, fill changes settle in with a short per-segment fade instead of snapping. */
  animated?: boolean;
  style?: ViewStyle;
}

const toneColor: Record<Tone, string> = {
  accent: colors.accent,
  attention: colors.attention,
  neutral: colors.textTertiary,
};

/**
 * Discrete segments rather than a continuous percentage bar: the underlying
 * estimate is approximate, and segments read as "about this much" instead of
 * implying measurement.
 */
export function SegmentBar({ filled, total, tone = 'accent', animated = false, style }: SegmentBarProps) {
  return (
    <View style={[styles.row, style]}>
      {Array.from({ length: total }, (_, i) =>
        animated ? (
          <AnimatedSegment key={i} filled={i < filled} color={toneColor[tone]} index={i} />
        ) : (
          <View
            key={i}
            style={[styles.segment, { backgroundColor: i < filled ? toneColor[tone] : colors.track }]}
          />
        ),
      )}
    </View>
  );
}

/**
 * One segment whose fill settles in (and out) over the STANDARD motion window
 * with a slight positional delay, so a load change reads as a shift rather
 * than a flicker. Color interpolation requires the JS driver; these bars are
 * a handful of segments at most, so the cost is negligible. Reduce Motion
 * collapses the transition to an immediate state change.
 */
function AnimatedSegment({ filled, color, index }: { filled: boolean; color: string; index: number }) {
  const reduceMotion = useReduceMotion();
  const progress = useRef(new Animated.Value(filled ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: filled ? 1 : 0,
      duration: durationFor(motionDuration.standard, reduceMotion),
      delay: reduceMotion ? 0 : index * 30,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
  }, [progress, filled, index, reduceMotion]);

  return (
    <Animated.View
      style={[
        styles.segment,
        {
          backgroundColor: progress.interpolate({
            inputRange: [0, 1],
            outputRange: [colors.track, color],
          }),
        },
      ]}
    />
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 5 },
  segment: { flex: 1, height: 6, borderRadius: radius.pill },
});
