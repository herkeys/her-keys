import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Overline, ChipToggle } from '../../design/components';
import { HeaderBadge } from '../welcome/HeaderBadge';
import { spacing } from '../../design/tokens';
import { createThemedStyles, useTheme } from '../../design/theme';
import { HER_KEYS_LEGAL_URLS } from '../../config/legal';

/**
 * The consent / permissions stage VIEWS — presentation only (HK-FE-UI-02). They own no state, no ledger, no navigation and
 * import nothing from the account or notification layers: ConsentGate (ConsentFlow.tsx) decides everything and passes values
 * and handlers in. Kept in their own module so the design gallery can render the real components with fixed props.
 */
// ---------------------------------------------------------------------------
// Presentational stage views. They own no state, no ledger and no navigation: the gate above decides everything and passes
// values and handlers in. They are exported so the design gallery can render the REAL components with fixed props.
// ---------------------------------------------------------------------------

type Inset = { paddingTop: number; paddingBottom: number };

export function ConsentErrorView({ inset, retried, leaving, onRetry, onLeave }: { inset: Inset; retried: boolean; leaving: boolean; onRetry: () => void; onLeave: () => void }) {
  const { color } = useTheme();
  const styles = useStyles();
  return <ScrollView style={styles.ground} contentContainerStyle={[styles.recover, inset]}>
    <HeaderBadge icon="shield-checkmark-outline" />
    <AppText variant="title" accessibilityRole="header">We could not verify your account’s policy choices.</AppText>
    <AppText variant="body" color={color.text.secondary}>Your household remains protected. Her Keys stays closed until your choices can be confirmed. Check your connection and try again, or sign out.</AppText>
    {retried ? <AppText variant="body" color={color.status.risk} accessibilityRole="alert" accessibilityLiveRegion="polite">We still couldn’t reach your account. Check your connection and try again.</AppText> : null}
    <Button label="Try again" disabled={leaving} onPress={onRetry} />
    <Button label={leaving ? 'Signing out…' : 'Sign out'} variant="secondary" disabled={leaving} onPress={onLeave} />
  </ScrollView>;
}

export function ConsentPermissionsView({ inset, notificationsBusy, onEnableNotifications, onContinue }: { inset: Inset; notificationsBusy: boolean; onEnableNotifications: () => void; onContinue: () => void }) {
  const { color } = useTheme();
  const styles = useStyles();
  return <ScrollView style={styles.ground} contentContainerStyle={[styles.content, inset]}>
    <Overline>Optional permissions</Overline>
    <AppText variant="display">Set things up your way.</AppText>
    <Card style={styles.section}>
      <AppText variant="body">Notifications can remind you about plans you chose. You can turn them on now or later.</AppText>
      <Button label="Enable Notifications" disabled={notificationsBusy} onPress={onEnableNotifications} />
      <Button label="Maybe Later" variant="ghost" onPress={onContinue} />
    </Card>
    <Card tone="subtle" style={styles.section}>
      <AppText variant="body">Location can improve weather experiences. Her Keys only needs approximate foreground location when you request it.</AppText>
      <AppText variant="body" color={color.text.secondary}>You can enable location when you use Weather. No background location is requested here.</AppText>
    </Card>
    <Card tone="subtle" style={styles.section}>
      <AppText variant="body">Google Calendar is a separate read-only OAuth connection, not an operating-system permission. Connect it later when you’re ready.</AppText>
      <AppText variant="body">AI Data Processing is a separate account choice you just made, not an operating-system permission.</AppText>
    </Card>
    <Button label="Continue to Life Systems Audit" onPress={onContinue} />
  </ScrollView>;
}

export function ConsentLegalView({ inset, terms, privacy, adult, ai, saving, issue, onToggleTerms, onTogglePrivacy, onToggleAdult, onChooseAi, onCommit }: {
  inset: Inset; terms: boolean; privacy: boolean; adult: boolean; ai: boolean | null; saving: boolean; issue: string | null;
  onToggleTerms: () => void; onTogglePrivacy: () => void; onToggleAdult: () => void; onChooseAi: (value: boolean) => void; onCommit: () => void;
}) {
  const { color } = useTheme();
  const styles = useStyles();
  return <ScrollView style={styles.ground} keyboardShouldPersistTaps="handled" contentContainerStyle={[styles.content, inset]}>
    <Overline>Before we begin</Overline>
    <AppText variant="display">A little clarity goes a long way.</AppText>
    <AppText variant="body">Please review the complete Terms and Privacy Policy, and confirm your choices before using Her Keys.</AppText>
    <View style={styles.readRow}>
      <Button variant="ghost" label="Read Terms and Conditions" onPress={() => void Linking.openURL(HER_KEYS_LEGAL_URLS.terms)} />
      <Button variant="ghost" label="Read Privacy Policy" onPress={() => void Linking.openURL(HER_KEYS_LEGAL_URLS.privacy)} />
    </View>
    <Card style={styles.section}>
      <ChipToggle label="I agree to the Terms and Conditions" selected={terms} onPress={onToggleTerms} />
      <ChipToggle label="I acknowledge the Privacy Policy" selected={privacy} onPress={onTogglePrivacy} />
      <ChipToggle label="I confirm that I am 18 or older" selected={adult} onPress={onToggleAdult} />
    </Card>
    <Card tone="subtle" style={styles.section}>
      <Overline>AI Data Processing</Overline>
      <AppText variant="body">
        Her Keys uses information you choose to share with its AI features — such as your messages and relevant tasks, schedules, and household details — to provide planning help and AI-generated recommendations. The information needed for an AI request may be processed by external AI providers, including Google Gemini. See the Privacy Policy for details.
      </AppText>
      <AppText variant="body" color={color.text.secondary}>
        Share only the context needed. AI suggestions can be inaccurate and do not replace professional advice. You can use non-AI features without consenting to optional AI processing.
      </AppText>
      <ChipToggle label="I consent to AI data processing." selected={ai === true} onPress={() => onChooseAi(true)} />
      <ChipToggle label="Continue without optional AI Data Processing" selected={ai === false} onPress={() => onChooseAi(false)} />
    </Card>
    {issue && <AppText variant="body" color={color.status.risk}>{issue}</AppText>}
    <Button label={saving ? 'Saving…' : 'Agree and Continue'} disabled={saving || !terms || !privacy || !adult || ai === null} onPress={onCommit} />
  </ScrollView>;
}

const useStyles = createThemedStyles(({ color }) => StyleSheet.create({
  // The gate renders above the app shell, so it supplies the warm off-white ground itself.
  ground: { flex: 1, backgroundColor: color.background },
  recover: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl, gap: spacing.lg },
  section: { gap: spacing.md },
  readRow: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
}));
