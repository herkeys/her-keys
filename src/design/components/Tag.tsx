import { StyleSheet, View } from 'react-native';
import { colors, radius, spacing } from '../tokens';
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
  accent: { bg: colors.accentSoft, fg: colors.accent },
};

export function Tag({ label, tone = 'neutral' }: TagProps) {
  const { bg, fg } = toneMap[tone];
  return (
    <View style={[styles.tag, { backgroundColor: bg }]}>
      <AppText variant="overline" color={fg}>
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
