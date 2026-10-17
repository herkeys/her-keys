import { useEffect, useRef, useState } from 'react';
import * as Crypto from 'expo-crypto';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, InlineNotice } from '../../design/components';
import { radius, spacing } from '../../design/tokens';
import { createThemedStyles, useTheme } from '../../design/theme';
import { useAppStore } from '../../store/AppStateProvider';
import { aiReportClient } from '../../store/accountRuntimeInstance';
import type { AiReportReason } from '../../platform/aiResponseReporting';

const reasons: readonly [AiReportReason, string][] = [
  ['unsafe', 'Unsafe or harmful'],
  ['offensive', 'Offensive or discriminatory'],
  ['inaccurate', 'Inaccurate or misleading'],
  ['privacy', 'Privacy concern'],
  ['other', 'Something else'],
];

/** Explicit user action, zero message text or provider output transmitted. */
export function AiReportPanel({ messageId, onClose }: { messageId: string; onClose: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const accountStore = useAppStore();
  const [reason, setReason] = useState<AiReportReason>('unsafe');
  const [state, setState] = useState<'idle' | 'sending' | 'received' | 'error'>('idle');
  const [notice, setNotice] = useState<string | null>(null);
  const key = useRef(Crypto.randomUUID());
  const pending = useRef<AbortController | null>(null);
  useEffect(() => () => { pending.current?.abort(); }, []);

  const submit = async () => {
    if (state === 'sending' || state === 'received') return;
    const bound = accountStore.getSnapshot().identity.binding;
    if (!bound?.accountId) {
      setNotice('Sign in to submit your report. Your conversation was not shared.');
      return;
    }
    const request = new AbortController();
    pending.current = request;
    const unsubscribe = accountStore.subscribe(() => {
      const current = accountStore.getSnapshot().identity.binding;
      if (current?.accountId !== bound.accountId || current?.householdId !== bound.householdId ||
          current?.boundAt !== bound.boundAt) request.abort();
    });
    setState('sending');
    setNotice(null);
    try {
      const result = await aiReportClient.submit({ messageId, reason, dedupeKey: key.current },
        { accountId: bound.accountId, signal: request.signal });
      if (request.signal.aborted) return;
      if (result === 'received') {
        setState('received');
        setNotice('Report submitted. Your conversation text was not included.');
      } else {
        setState('error');
        setNotice(result === 'rate_limited'
          ? 'You have reached the report limit for today.'
          : 'Could not submit your report. Please try again.');
      }
    } finally {
      unsubscribe();
      if (pending.current === request) pending.current = null;
    }
  };

  return (
    <View style={styles.root}>
      <AppText variant="sectionTitle">Report this response</AppText>
      <AppText variant="bodySm" color={colors.textSecondary}>
        Choose a reason. We submit only a response reference and the selected reason, not conversation text.
      </AppText>
      {state !== 'received' && (
        <View style={styles.reasons}>
          {reasons.map(([value, label]) => (
            <Button key={value} label={reason === value ? `Selected: ${label}` : label}
              accessibilityHint={reason === value ? 'Currently selected report reason' : 'Choose this report reason'}
              size="sm" variant="secondary" disabled={state === 'sending'}
              onPress={() => { setReason(value); setNotice(null); setState('idle'); }} />
          ))}
        </View>
      )}
      {notice && <InlineNotice tone={state === 'received' ? 'success' : 'waiting'} title={notice} />}
      <View style={styles.actions}>
        {state !== 'received' && (
          <Button label={state === 'sending' ? 'Submitting…' : 'Submit report'} size="sm"
            disabled={state === 'sending'} onPress={() => void submit()} />
        )}
        <Button label="Close report" size="sm" variant="ghost" onPress={() => { pending.current?.abort(); onClose(); }} />
      </View>
    </View>
  );
}

const useStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  root: {
    marginTop: spacing.md,
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: radius.md,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  reasons: { gap: spacing.xs, alignItems: 'flex-start' },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
}));
