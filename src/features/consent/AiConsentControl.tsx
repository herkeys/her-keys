import { useEffect, useRef, useState } from 'react';
import { View } from 'react-native';
import { AppText, Button } from '../../design/components';
import { useAnnounceOnIOS } from '../../design/announce';
import { spacing } from '../../design/tokens';
import { consentStatus } from '../../domain/consent';
import type { ConsentReadResult } from '../../platform/consentBackend';
import { boundedConsentRead, type AiConsentView } from './consentSummary';

/** Mounted with an account key: a late save cannot update another account's controls. */
export function AiConsentControl({ view, save, recheck }: {
  view: AiConsentView;
  save: (granted: boolean) => Promise<ConsentReadResult>;
  recheck: () => void;
}) {
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const active = useRef(true);
  const writing = useRef(false);
  useEffect(() => { active.current = true; return () => { active.current = false; }; }, []);
  useAnnounceOnIOS(busy ? 'Saving your AI choice…' : notice);

  const choose = async (granted: boolean) => {
    if (writing.current || view.kind !== 'known') return;
    writing.current = true;
    setBusy(true);
    setNotice(null);
    const result = await boundedConsentRead(() => save(granted), 45_000);
    if (!active.current) return;
    writing.current = false;
    setBusy(false);
    recheck();
    if (result.kind !== 'ok' || !consentStatus(result.receipts).aiDecisionRecorded || consentStatus(result.receipts).aiPermitted !== granted) {
      setNotice('We could not confirm your AI choice. Check your connection and try again.');
      return;
    }
    setEditing(false);
    setNotice(granted ? 'AI data processing is on.' : 'AI data processing is off. Your saved information has not been deleted.');
  };

  return <View style={{ gap: spacing.md }}>
    {!editing ? <Button label="Review AI privacy choice" variant="secondary" onPress={() => { setEditing(true); setNotice(null); }} /> : <>
      <AppText variant="body">Her Keys uses information you choose to share with its AI features — such as your messages and relevant tasks, schedules, and household details — to provide planning help and AI-generated recommendations. The information needed for an AI request may be processed by external AI providers, including Google Gemini. See the Privacy Policy for details.</AppText>
      <AppText variant="body">You can use non-AI features without consenting to optional AI processing. Turning it off prevents new AI requests after your choice is saved. It does not recall a request already sent or delete information you saved.</AppText>
      {view.kind !== 'known' ? <Button label="Check AI choice again" variant="secondary" disabled={busy} onPress={recheck} /> : <>
        <Button label="I consent to AI data processing." disabled={busy} onPress={() => void choose(true)} />
        <Button label="Continue without optional AI Data Processing" variant="secondary" disabled={busy} onPress={() => void choose(false)} />
      </>}
      <Button label="Close AI privacy choice" variant="ghost" disabled={busy} onPress={() => setEditing(false)} />
    </>}
    {busy || notice ? <AppText variant="body" accessibilityLiveRegion="polite">{busy ? 'Saving your AI choice…' : notice}</AppText> : null}
  </View>;
}
