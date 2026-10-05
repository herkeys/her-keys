import { StyleSheet, View } from 'react-native';
import { AppText, Button, LoadingState, Overline } from '../../../design/components';
import { color, spacing } from '../../../design/tokens';
import { WELCOME_AUTH_COPY as COPY } from '../copy';

/**
 * The hard presentations. Each replaces the step tree rather than decorating
 * it, and each mirrors an account state the app already models — rendering
 * one here changes no runtime meaning.
 */

/** Settling / restore: nothing about account state is known yet, so no step is implied. */
export function SettlingView() {
  return (
    <View style={styles.center}>
      <LoadingState label={COPY.settling.label} />
    </View>
  );
}

/**
 * Auth degraded / reconnect: the calm doctrine — her local information has
 * not disappeared. The account choice still renders below this header so the
 * reconnect action is the same control as a first sign-in.
 */
export function DegradedHeader() {
  return (
    <View style={styles.degraded}>
      <Overline>{COPY.degraded.overline}</Overline>
      <AppText variant="hero" style={styles.degradedTitle}>
        {COPY.degraded.title}
      </AppText>
      <AppText variant="supporting" color={color.text.secondary} style={styles.degradedLede}>
        {COPY.degraded.lede}
      </AppText>
    </View>
  );
}

export interface ConflictViewProps {
  busy: boolean;
  onSignOut?: () => void;
}

/**
 * Account conflict / quarantine: the device holds ANOTHER account's
 * household. A safety state, never a generic sign-in error — no providers,
 * no email field, nothing of the other household is rendered or implied. The
 * only move offered is signing back out. Wording mirrors the production
 * account-conflict screen.
 */
export function ConflictView({ busy, onSignOut }: ConflictViewProps) {
  return (
    <>
      <View style={styles.body}>
        <Overline>{COPY.conflict.overline}</Overline>
        <AppText variant="hero" style={styles.title}>
          {COPY.conflict.title}
        </AppText>
        <AppText variant="title" color={color.text.secondary} style={styles.lede}>
          {COPY.conflict.lede}
        </AppText>
        <AppText variant="bodySm" color={color.text.muted} style={styles.note}>
          {COPY.conflict.note}
        </AppText>
      </View>

      <View style={styles.footer}>
        <Button label={COPY.conflict.signOut} onPress={() => onSignOut?.()} disabled={busy || !onSignOut} />
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center' },
  degraded: { paddingHorizontal: spacing.xl, paddingTop: spacing.xxxl },
  degradedTitle: { marginTop: spacing.md },
  degradedLede: { marginTop: spacing.lg },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  title: { marginTop: spacing.md },
  lede: { marginTop: spacing.lg },
  note: { marginTop: spacing.lg },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxxl },
});
