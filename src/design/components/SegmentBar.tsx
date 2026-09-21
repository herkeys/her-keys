import { StyleSheet, View, type ViewStyle } from 'react-native';
import { colors, radius } from '../tokens';

type Tone = 'accent' | 'attention' | 'neutral';

interface SegmentBarProps {
  filled: number;
  total: number;
  tone?: Tone;
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
export function SegmentBar({ filled, total, tone = 'accent', style }: SegmentBarProps) {
  return (
    <View style={[styles.row, style]}>
      {Array.from({ length: total }, (_, i) => (
        <View
          key={i}
          style={[styles.segment, { backgroundColor: i < filled ? toneColor[tone] : colors.track }]}
        />
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 5 },
  segment: { flex: 1, height: 6, borderRadius: radius.pill },
});
