import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { Linking, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Button, Overline, ChipToggle } from '../../design/components';
import { color, spacing } from '../../design/tokens';
import { HER_KEYS_LEGAL_URLS } from '../../config/legal';
import { consentStatus } from '../../domain/consent';
import type { AccountSession } from '../../domain/account/identity';
import { createConsentLedger, type ConsentReadResult } from '../../platform/consentBackend';
import { useAccount } from '../../store/AccountProvider';
import { useLocalNotifications } from '../../store/LocalNotificationProvider';

type Stage = 'loading' | 'error' | 'legal' | 'permissions' | 'ready';

/**
 * A consent check that never answers is a failed check. Without a bound the gate would sit on "Checking your account setup…"
 * forever on a dead connection, with nothing she could do. At the bound it becomes the recoverable error screen (Try again /
 * Sign out). It never grants access: only a ledger that answers "legal accepted and AI decision recorded" opens the app.
 */
export const CONSENT_READ_TIMEOUT_MS = 15_000;

function readWithTimeout(read: () => Promise<ConsentReadResult>, ms: number): Promise<ConsentReadResult> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve({ kind: 'unavailable' }), ms);
    read().then(
      (answer) => {
        clearTimeout(timer);
        resolve(answer);
      },
      () => {
        clearTimeout(timer);
        resolve({ kind: 'unavailable' });
      },
    );
  });
}

export function ConsentGate({ session, children }: { session: AccountSession; children: ReactNode }) {
  const accountId = session.accountId;
  // Tokens rotate while she uses the app. The consent decision belongs to the ACCOUNT, not to one token pair: it is keyed by
  // accountId, and each request reads the freshest tokens at the moment it is made. A rotation therefore never re-runs the
  // check or unmounts the app, while a different account always starts again from "loading" (fail closed).
  const sessionRef = useRef(session);
  sessionRef.current = session;
  const [flow, setFlow] = useState<{ accountId: string; stage: Stage }>({ accountId, stage: 'loading' });
  const stage: Stage = flow.accountId === accountId ? flow.stage : 'loading';
  const setStage = useCallback((next: Stage) => setFlow({ accountId: sessionRef.current.accountId, stage: next }), []);
  const [attempt, setAttempt] = useState(0);
  const [retried, setRetried] = useState(false);
  const [leaving, setLeaving] = useState(false);
  const leavingRef = useRef(false);
  const [terms, setTerms] = useState(false);
  const [privacy, setPrivacy] = useState(false);
  const [adult, setAdult] = useState(false);
  const [ai, setAi] = useState<boolean | null>(null);
  const [saving, setSaving] = useState(false);
  const [issue, setIssue] = useState<string | null>(null);
  const notification = useLocalNotifications();
  const { signOut } = useAccount();

  useEffect(() => {
    let active = true;
    setStage('loading');
    void readWithTimeout(() => createConsentLedger(sessionRef.current).read(), CONSENT_READ_TIMEOUT_MS).then((answer) => {
      if (!active) return;
      if (answer.kind !== 'ok') { setStage('error'); return; }
      const status = consentStatus(answer.receipts);
      setStage(status.legalAccepted && status.aiDecisionRecorded ? 'ready' : 'legal');
    });
    return () => { active = false; };
  }, [accountId, attempt, setStage]);

  const retry = () => {
    if (stage !== 'error') return;
    setRetried(true);
    setAttempt((n) => n + 1);
  };

  const leave = async () => {
    if (leavingRef.current) return;
    leavingRef.current = true;
    setLeaving(true);
    try {
      await signOut();
    } catch {
      // The account runtime reports its own failures; the controls simply come back so she can try again.
    } finally {
      leavingRef.current = false;
      setLeaving(false);
    }
  };

  const commit = async () => {
    if (saving || !terms || !privacy || !adult || ai === null) return;
    setSaving(true);
    setIssue(null);
    const result = await createConsentLedger(sessionRef.current).record([
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
    return <ScrollView contentContainerStyle={styles.recover}>
      <AppText variant="title" accessibilityRole="header">We could not verify your account’s policy choices.</AppText>
      <AppText variant="body" color={color.text.secondary}>Your household remains protected. Her Keys stays closed until your choices can be confirmed. Check your connection and try again, or sign out.</AppText>
      {retried ? <AppText variant="body" color={color.status.risk} accessibilityRole="alert" accessibilityLiveRegion="polite">We still couldn’t reach your account. Check your connection and try again.</AppText> : null}
      <Button label="Try again" disabled={leaving} onPress={retry} />
      <Button label={leaving ? 'Signing out…' : 'Sign out'} variant="secondary" disabled={leaving} onPress={() => void leave()} />
    </ScrollView>;
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
  recover: { flexGrow: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  content: { flexGrow: 1, paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl, gap: spacing.md },
});
