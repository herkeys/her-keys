import { ActivityIndicator, StyleSheet, View, type ViewStyle } from 'react-native';
import { color, radius, spacing } from '../tokens';
import { AppText, Overline } from './AppText';

/**
 * System states — the shared vocabulary for "nothing to show yet" and
 * "something needs saying". Every state is text-first: a heading, a plain
 * explanation, and at most one action. Calm does not mean vague.
 */

export interface LoadingStateProps {
  label?: string;
  /** When the wait is explainable, say why (e.g. "Syncing your household…"). */
  detail?: string;
  style?: ViewStyle;
}

export function LoadingState({ label = 'Loading…', detail, style }: LoadingStateProps) {
  return (
    <View style={[styles.center, style]} accessibilityRole="progressbar" accessibilityLabel={label}>
      <ActivityIndicator color={color.action.primary} />
      <AppText variant="body" color={color.text.secondary} style={styles.gap}>
        {label}
      </AppText>
      {detail && (
        <AppText variant="supporting" color={color.text.muted} style={styles.tightGap}>
          {detail}
        </AppText>
      )}
    </View>
  );
}

export interface EmptyStateProps {
  title: string;
  body: string;
  /** Optional single recovery action. */
  actionLabel?: string;
  onAction?: () => void;
  style?: ViewStyle;
}

export function EmptyState({ title, body, actionLabel, onAction, style }: EmptyStateProps) {
  return (
    <View style={[styles.center, style]}>
      <AppText variant="sectionTitle" style={styles.gap}>
        {title}
      </AppText>
      <AppText variant="supporting" color={color.text.secondary} style={styles.tightGap}>
        {body}
      </AppText>
      {actionLabel && onAction && (
        <AppText variant="body" color={color.action.primary} style={styles.tightGap} onPress={onAction} accessibilityRole="link">
          {actionLabel}
        </AppText>
      )}
    </View>
  );
}

export interface ErrorStateProps {
  title?: string;
  body: string;
  onRetry?: () => void;
  style?: ViewStyle;
}

export function ErrorState({ title = 'Something didn’t go through', body, onRetry, style }: ErrorStateProps) {
  return (
    <View style={[styles.center, style]} accessibilityRole="alert">
      <AppText variant="sectionTitle" color={color.status.risk} style={styles.gap}>
        {title}
      </AppText>
      <AppText variant="supporting" color={color.text.secondary} style={styles.tightGap}>
        {body}
      </AppText>
      {onRetry && (
        <AppText variant="body" color={color.action.primary} style={styles.tightGap} onPress={onRetry} accessibilityRole="link">
          Try again
        </AppText>
      )}
    </View>
  );
}

export interface OfflineStateProps {
  /** What still works while offline, in plain words. */
  body?: string;
  style?: ViewStyle;
}

export function OfflineState({
  body = 'You’re offline. Nothing you’ve entered is lost — it will sync when the connection is back.',
  style,
}: OfflineStateProps) {
  return (
    <View style={[styles.center, style]}>
      <Overline color={color.status.waiting}>Offline</Overline>
      <AppText variant="supporting" color={color.text.secondary} style={styles.tightGap}>
        {body}
      </AppText>
    </View>
  );
}

export type NoticeTone = 'info' | 'attention' | 'success' | 'waiting';

export interface InlineNoticeProps {
  tone?: NoticeTone;
  title: string;
  body?: string;
  style?: ViewStyle;
}

const noticeTones: Record<NoticeTone, { bg: string; border: string; fg: string }> = {
  info: { bg: color.ai.insightSoft, border: color.ai.insightBorder, fg: color.ai.insight },
  attention: { bg: color.status.attentionSoft, border: color.status.attentionBorder, fg: color.status.attention },
  success: { bg: color.status.successSoft, border: color.status.successBorder, fg: color.status.success },
  waiting: { bg: color.status.waitingSoft, border: color.status.waitingBorder, fg: color.status.waiting },
};

/** A quiet inline banner for state that deserves a sentence, not a screen. */
export function InlineNotice({ tone = 'info', title, body, style }: InlineNoticeProps) {
  const t = noticeTones[tone];
  return (
    <View style={[styles.notice, { backgroundColor: t.bg, borderColor: t.border }, style]} accessibilityRole="text">
      <AppText variant="bodyStrong" color={t.fg}>
        {title}
      </AppText>
      {body && (
        <AppText variant="supporting" color={t.fg} style={styles.tightGap}>
          {body}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  gap: { marginTop: spacing.md, textAlign: 'center' },
  tightGap: { marginTop: spacing.sm, textAlign: 'center' },
  notice: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
});
