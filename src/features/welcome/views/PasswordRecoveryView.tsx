import { useEffect, useRef, useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Button, Overline, TextField } from '../../../design/components';
import { color, spacing } from '../../../design/tokens';
import type { RecoveryResult } from '../../../platform/passwordRecoveryProvider';
import { emailObviousError } from '../model';
import { EMAIL_AUTH_KEYBOARD_BEHAVIOR } from './EmailEntryView';

export interface PasswordRecoveryViewProps {
  initialEmail: string;
  request: (email: string) => Promise<RecoveryResult>;
  verify: (email: string, code: string) => Promise<RecoveryResult>;
  updatePassword: (password: string) => Promise<RecoveryResult>;
  onReturnToSignIn: () => void;
}

/**
 * Recovery code and new password are held ONLY in this transient view.
 * The controller keeps the separate recovery client; this view is unaware
 * of Supabase sessions, household authority, secure storage or credentials.
 */
export function PasswordRecoveryView({ initialEmail, request, verify, updatePassword, onReturnToSignIn }: PasswordRecoveryViewProps) {
  const [stage, setStage] = useState<'request' | 'verify' | 'newPassword' | 'complete'>('request');
  const [email, setEmail] = useState(initialEmail);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendWait, setResendWait] = useState(0);
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => { alive.current = false; };
  }, []);
  useEffect(() => {
    if (resendWait <= 0 || stage !== 'verify') return;
    const handle = setInterval(() => setResendWait((current) => Math.max(0, current - 1)), 1000);
    return () => clearInterval(handle);
  }, [resendWait > 0, stage]);

  const message = (result: RecoveryResult) =>
    result === 'rateLimited'
      ? 'Too many attempts. Please wait before trying again.'
      : result === 'unavailable'
        ? 'Password recovery is unavailable in this build.'
        : 'That did not work. Check your connection and try again.';

  const send = async () => {
    if (busy || emailObviousError(email) || resendWait > 0) {
      if (emailObviousError(email)) setError('Enter a complete email address.');
      return;
    }
    setBusy(true);
    setError(null);
    const result = await request(email);
    if (!alive.current) return;
    setBusy(false);
    if (result === 'ok') {
      setStage('verify');
      setResendWait(60);
      setCode('');
    } else setError(message(result));
  };

  const checkCode = async () => {
    if (busy || code.length !== 6) return;
    setBusy(true);
    setError(null);
    const result = await verify(email, code);
    if (!alive.current) return;
    setBusy(false);
    if (result === 'ok') {
      setCode('');
      setStage('newPassword');
    } else setError(result === 'failed' ? 'That code is invalid or expired. Try again or request a new one.' : message(result));
  };

  const savePassword = async () => {
    if (busy) return;
    if (password.length < 8) { setError('Use a password with at least eight characters.'); return; }
    if (password !== confirm) { setError('The passwords do not match.'); return; }
    setBusy(true);
    setError(null);
    const result = await updatePassword(password);
    if (!alive.current) return;
    setBusy(false);
    if (result === 'ok') {
      setPassword('');
      setConfirm('');
      setStage('complete');
    } else setError(message(result));
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={EMAIL_AUTH_KEYBOARD_BEHAVIOR}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container}>
        <Overline>Account recovery</Overline>
        <AppText variant="display" style={styles.heading}>
          {stage === 'request' ? 'Forgot your password?' : stage === 'verify' ? 'Check your email.' : stage === 'newPassword' ? 'Create a new password.' : 'Password updated.'}
        </AppText>
        <AppText variant="supporting" color={color.text.secondary} style={styles.lede}>
          {stage === 'request'
            ? 'Enter your email. If an account exists, we will send recovery instructions.'
            : stage === 'verify'
              ? 'Enter the six-digit recovery code from your email. Sending a request does not confirm delivery.'
              : stage === 'newPassword'
                ? 'Set a new password for your account.'
                : 'Your password has been changed. Sign in using your new password.'}
        </AppText>

        <View style={styles.form}>
          {stage === 'request' && (
            <TextField label="Email address" value={email} onChangeText={(value) => { setEmail(value); setError(null); }}
              keyboardType="email-address" autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!busy} />
          )}
          {stage === 'verify' && (
            <TextField label="Recovery code" value={code} onChangeText={(value) => { setCode(value.replace(/\\D/g, '').slice(0, 6)); setError(null); }}
              keyboardType="number-pad" autoComplete="one-time-code" maxLength={6} editable={!busy} />
          )}
          {stage === 'newPassword' && (
            <>
              <TextField label="New password" value={password} onChangeText={(value) => { setPassword(value); setError(null); }}
                secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} autoComplete="new-password" editable={!busy} />
              <TextField label="Confirm new password" value={confirm} onChangeText={(value) => { setConfirm(value); setError(null); }}
                secureTextEntry={!showPassword} autoCapitalize="none" autoCorrect={false} editable={!busy} />
              <Button label={showPassword ? 'Hide passwords' : 'Show passwords'} variant="ghost" size="sm"
                onPress={() => setShowPassword((shown) => !shown)} disabled={busy} />
            </>
          )}
          {error && <AppText variant="supporting" color={color.status.risk} accessibilityLiveRegion="polite">{error}</AppText>}
        </View>
        <View style={styles.actions}>
          {stage === 'request' && <Button label="Send Reset Email" onPress={() => void send()} disabled={busy || !email} />}
          {stage === 'verify' && (
            <>
              <Button label="Verify Recovery Code" onPress={() => void checkCode()} disabled={busy || code.length !== 6} />
              <Button label={resendWait ? `Resend in ${resendWait}s` : 'Resend Reset Email'} variant="ghost"
                onPress={() => void send()} disabled={busy || resendWait > 0} />
            </>
          )}
          {stage === 'newPassword' && <Button label="Update Password" onPress={() => void savePassword()} disabled={busy || !password || !confirm} />}
          <Button label={stage === 'complete' ? 'Return to Sign In' : 'Cancel Recovery'} variant="secondary" onPress={onReturnToSignIn} disabled={busy} />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  heading: { marginTop: spacing.lg },
  lede: { marginTop: spacing.md },
  form: { marginTop: spacing.xl },
  actions: { marginTop: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl },
});
