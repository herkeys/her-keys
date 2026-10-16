import { ActivityIndicator, StyleSheet, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { radius, sizing, spacing } from '../tokens';
import { themed, useTheme, createThemedStyles } from '../theme';
import { FadeIn } from './animated';
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
  const { color } = useTheme();
  const styles = useStyles();
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
  const { color } = useTheme();
  const styles = useStyles();
  return (
    <FadeIn style={[styles.center, style]}>
      {/* The quiet mark: an open ring — a section that is valid and at rest,
          not a warning and not an illustration. */}
      <View style={styles.quietMark} accessibilityElementsHidden importantForAccessibility="no" />
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
    </FadeIn>
  );
}

export interface ErrorStateProps {
  title?: string;
  body: string;
  onRetry?: () => void;
  style?: ViewStyle;
}

export function ErrorState({ title = 'Something didn’t go through', body, onRetry, style }: ErrorStateProps) {
  const { color } = useTheme();
  const styles = useStyles();
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
  const { color } = useTheme();
  const styles = useStyles();
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

type NoticeIcon = 'information-circle-outline' | 'alert-circle-outline' | 'checkmark-circle-outline' | 'time-outline';

/**
 * HK-FE-UI-02: `info` is Deep Plum Gray with an information icon — it is NOT the AI register any more (plum is a brand
 * colour now; AI identity lives in intelligence.tsx structure + labels). Every tone also carries its own icon, so the state is
 * never colour alone.
 */
const noticeTonesFor = themed<Record<NoticeTone, { bg: string; border: string; fg: string; icon: NoticeIcon }>>(({ color }) => ({
  info: { bg: color.status.infoSoft, border: color.status.infoBorder, fg: color.status.info, icon: 'information-circle-outline' },
  attention: { bg: color.status.attentionSoft, border: color.status.attentionBorder, fg: color.status.attention, icon: 'alert-circle-outline' },
  success: { bg: color.status.successSoft, border: color.status.successBorder, fg: color.status.success, icon: 'checkmark-circle-outline' },
  waiting: { bg: color.status.waitingSoft, border: color.status.waitingBorder, fg: color.status.waiting, icon: 'time-outline' },
}));

/** A quiet inline banner for state that deserves a sentence, not a screen. */
export function InlineNotice({ tone = 'info', title, body, style }: InlineNoticeProps) {
  const { color } = useTheme();
  const styles = useStyles();
  const t = noticeTonesFor(useTheme())[tone];
  return (
    <View style={[styles.notice, { backgroundColor: t.bg, borderColor: t.border }, style]} accessibilityRole="text">
      <View style={styles.noticeRow}>
        <View accessibilityElementsHidden importantForAccessibility="no" style={styles.noticeIcon}>
          <Ionicons name={t.icon} size={sizing.icon.md} color={t.fg} />
        </View>
        <View style={styles.noticeText}>
          <AppText variant="bodyStrong" color={t.fg}>
            {title}
          </AppText>
          {body && (
            <AppText variant="supporting" color={t.fg} style={styles.noticeBody}>
              {body}
            </AppText>
          )}
        </View>
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(({ color }) => StyleSheet.create({
  center: { alignItems: 'center', paddingVertical: spacing.xxxl, paddingHorizontal: spacing.xl },
  quietMark: {
    width: 26,
    height: 26,
    borderRadius: 13,
    borderWidth: StyleSheet.hairlineWidth * 2,
    borderColor: color.border.control,
  },
  gap: { marginTop: spacing.md, textAlign: 'center' },
  tightGap: { marginTop: spacing.sm, textAlign: 'center' },
  notice: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.lg,
  },
  noticeRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md },
  noticeIcon: { paddingTop: 2 },
  noticeText: { flex: 1 },
  noticeBody: { marginTop: spacing.xs },
}));
