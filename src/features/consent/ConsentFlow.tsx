import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Button, Overline, ChipToggle } from '../../design/components';
import { color, spacing } from '../../design/tokens';
import { HER_KEYS_LEGAL_URLS } from '../../config/legal';
import { consentStatus } from '../../domain/consent';
import type { AccountSession } from '../../domain/account/identity';
import { createConsentLedger } from '../../platform/consentBackend';
import { useLocalNotifications } from '../../store/LocalNotificationProvider';

type Stage = 'loading' | 'error' | 'legal' | 'permissions' | 'ready';

export function ConsentGate({ session, children }: { session: AccountSession; children: ReactNode }) {
  const ledger = useMemo(() => createConsentLedger(session), [session.accountId, session.accessToken]);
  const [stage, setStage] = useState<Stage>('loading');
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [adult, setAdult] = useState(false);
  const [ai, setAi] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const notification = useLocalNotifications();

  useEffect(() => {
    let active = true;
    setStage('loading');
    void ledger.read().then((answer) => {
      if (!active) return;
      if (answer.kind !== 'ok') { setStage('error'); return; }
      const status = consentStatus(answer.receipts);
      setStage(status.legalAccepted && status.aiDecisionRecorded ? 'ready' : 'legal');
    });
    return () => { active = false; };
  }, [ledger]);

  const commit = async () => {
    if (saving || !terms || !privacy || !adult || ai === null) return;
    setSaving(true);
    setIssue(null);
    const result = await ledger.record([
      { consent_type: 'terms', granted: true },
      { consent_type: 'privacy', granted: true },
      { consent_type: 'age18', granted: true },
      { consent_type: 'ai_processing', granted: ai },
    ]);
    setSaving(false);
    if (result.kind !== 'ok') {
      setIssue('We could not securely save your selections. Check your connection and try again.');
      return;
    }
    setStage('permissions');
  };
  if (stage === 'ready') return <>{children}</>;
  if (stage === 'loading') return <View style={styles.center}><AppText variant="body">Checking your account setup…</AppText></View>;
  if (stage === 'error') {
    return <View style={styles.center}>
      <AppText variant="title">We could not verify your account’s policy choices.</AppText>
      <AppText variant="body" color={color.text.secondary}>Your household remains protected. Connect to the internet and reopen Her Keys to continue.</AppText>
    </View>;
  }
  if (stage === 'permissions') {
    return <ScrollView contentContainerStyle={styles.content}>
      <Overline>Optional permissions</Overline>
      <AppText variant="display">Set things up your way.</AppText>
      <AppText variant="body">Notifications can remind you about plans you chose. You can turn them on now or later.</AppText>
      <Button label="Enable Notifications" disabled={notification.busy} onPress={() => void notification.enable()} />
      <Button label="Maybe Later" variant="ghost" onPress={() => setStage('ready')} />
      <AppText variant="body">Location can improve weather experiences. Her Keys only needs approximate foreground location when you request it.</AppText>
      <AppText variant="body" color={color.text.secondary}>You can enable location when you use Weather. No background location is requested here.</AppText>
      <AppText variant="body">Google Calendar is a separate read-only OAuth connection, not an operating-system permission. Connect it later when you’re ready.</AppText>
      <AppText variant="body">AI Data Processing is a separate account choice you just made, not an operating-system permission.</AppText>
      <Button label="Continue to Life Systems Audit" onPress={() => setStage('ready')} />
    </ScrollView>;
  }
  return <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.content}>
    <Overline>Before we begin</Overline>
    <AppText variant="display">A little clarity goes a long way.</AppText>
    <AppText variant="body">Please review the complete Terms and Privacy Policy, and confirm your choices before using Her Keys.</AppText>
    <Button variant="ghost" label="Read Terms and Conditions" onPress={() => void Linking.openURL(HER_KEYS_LEGAL_URLS.terms)} />
    <Button variant="ghost" label="Read Privacy Policy" onPress={() => void Linking.openURL(HER_KEYS_LEGAL_URLS.privacy)} />
    <ChipToggle label="I agree to the Terms and Conditions" selected={terms} onPress={() => setTerms(!terms)} />
    <ChipToggle label="I acknowledge the Privacy Policy" selected={privacy} onPress={() => setPrivacy(!privacy)} />
    <ChipToggle label="I confirm that I am 18 or older" selected={adult} onPress={() => setAdult(!adult)} />
    <Overline>AI Data Processing</Overline>
    <AppText variant="body">
      Her Keys uses information you choose to share with its AI features — such as your messages and relevant tasks, schedules, and household details — to provide planning help and AI-generated recommendations. The information needed for an AI request may be processed by external AI providers, including Google Gemini. See the Privacy Policy for details.
    </AppText>
    <AppText variant="body" color={color.text.secondary}>
      Share only the context needed. AI suggestions can be inaccurate and do not replace professional advice. You can use non-AI features without consenting to optional AI processing.
    </AppText>
    <ChipToggle label="I consent to AI data processing." selected={ai === true} onPress={() => setAi(true)} />
    <ChipToggle label="Continue without optional AI Data Processing" selected={ai === false} onPress={() => setAi(false)} />
    {issue && <AppText variant="body" color={color.status.risk}>{issue}</AppText>}
    <Button label={saving ? 'Saving…' : 'Agree and Continue'} disabled={saving || !terms || !privacy || !adult || ai === null} onPress={() => void commit()} />
  </ScrollView>;
}

const styles = StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl, gap: spacing.md },
});
