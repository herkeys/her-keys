import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { AppText } from '../../design/components';
import { ConsentErrorView, ConsentLegalView, ConsentPermissionsView } from './ConsentViews';
import { spacing } from '../../design/tokens';
import { createThemedStyles } from '../../design/theme';
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
export const CONSENT_WRITE_TIMEOUT_MS = 45_000;

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
  const styles = useStyles();
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
  // The gate renders above the app's own safe-area shell, so it carries the system insets itself (status bar, gesture/3-button bar).
  const insets = useSafeAreaInsets();
  const inset = { paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.xxl };

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
    // Bounded like the read: a save that never answers is a failed save she can retry, not a frozen button.
    const result = await readWithTimeout(
      () =>
        createConsentLedger(sessionRef.current).record([
          { consent_type: 'terms', granted: true },
          { consent_type: 'privacy', granted: true },
          { consent_type: 'age18', granted: true },
          { consent_type: 'ai_processing', granted: ai },
        ]),
      CONSENT_WRITE_TIMEOUT_MS
    );
    setSaving(false);
    if (result.kind !== 'ok') {
      setIssue('We could not securely save your selections. Check your connection and try again.');
      return;
    }
    setStage('permissions');
  };
  if (stage === 'ready') return <>{children}</>;
  if (stage === 'loading') return <View style={[styles.center, inset]}><AppText variant="body">Checking your account setup…</AppText></View>;
  if (stage === 'error') {
    return <ConsentErrorView inset={inset} retried={retried} leaving={leaving} onRetry={retry} onLeave={() => void leave()} />;
  }
  if (stage === 'permissions') {
    return <ConsentPermissionsView inset={inset} notificationsBusy={notification.busy} onEnableNotifications={() => void notification.enable()} onContinue={() => setStage('ready')} />;
  }
  return <ConsentLegalView
    inset={inset}
    terms={terms} privacy={privacy} adult={adult} ai={ai} saving={saving} issue={issue}
    onToggleTerms={() => setTerms(!terms)} onTogglePrivacy={() => setPrivacy(!privacy)} onToggleAdult={() => setAdult(!adult)}
    onChooseAi={setAi} onCommit={() => void commit()}
  />;
}

export { ConsentErrorView, ConsentLegalView, ConsentPermissionsView } from './ConsentViews';

const useStyles = createThemedStyles(({ color }) => StyleSheet.create({
  center: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md, backgroundColor: color.background },
}));
