import { StyleSheet, View } from 'react-native';
import { color, colors, radius, spacing } from '../tokens';
import { AppText } from './AppText';

type Tone = 'neutral' | 'attention' | 'success' | 'accent';

interface TagProps {
  label: string;
  tone?: Tone;
}

const toneMap: Record<Tone, { bg: string; fg: string }> = {
  neutral: { bg: colors.surfaceSubtle, fg: colors.textTertiary },
  attention: { bg: colors.attentionSoft, fg: colors.attention },
  success: { bg: colors.successSoft, fg: colors.success },
  // Soft Lilac fill: plain Berry is 4.16:1 here (illegal for small text), so the label uses the Berry-family `onSoft` (5.54:1).
  accent: { bg: colors.accentSoft, fg: color.action.onSoft },
};

export function Tag({ label, tone = 'neutral' }: TagProps) {
  const { bg, fg } = toneMap[tone];
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <AppText variant="label" color={fg}>
        {label.toUpperCase()}
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  tag: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs + 1,
    borderRadius: radius.pill,
    alignSelf: 'flex-start',
  },
});
