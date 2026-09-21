import type { ReactNode } from 'react';
import { StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { colors, elevation, radius, spacing } from '../tokens';

type Tone = 'surface' | 'subtle' | 'accent' | 'attention' | 'success' | 'risk';

interface CardProps {
  tone?: Tone;
  /** Adds soft elevation. Reserve this for the one surface that should dominate. */
  raised?: boolean;
  style?: StyleProp<ViewStyle>;
  children: ReactNode;
}

const toneStyles: Record<Tone, { backgroundColor: string; borderColor: string }> = {
  surface: { backgroundColor: colors.surface, borderColor: colors.borderSubtle },
  subtle: { backgroundColor: colors.surfaceSubtle, borderColor: 'transparent' },
  accent: { backgroundColor: colors.accentSoft, borderColor: colors.accentBorder },
  attention: { backgroundColor: colors.attentionSoft, borderColor: colors.attentionBorder },
  success: { backgroundColor: colors.successSoft, borderColor: colors.successBorder },
  risk: { backgroundColor: colors.riskSoft, borderColor: colors.riskBorder },
};

export function Card({ tone = 'surface', raised = false, style, children }: CardProps) {
  return <View style={[styles.card, toneStyles[tone], raised ? elevation.raised : null, style]}>{children}</View>;
}

const styles = StyleSheet.create({
  card: {
    borderRadius: radius.lg,
    padding: spacing.xl,
    borderWidth: StyleSheet.hairlineWidth,
  },
});
