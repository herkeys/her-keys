import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { AppText, Button, Overline, TextField } from '../../../design/components';
import { color, spacing } from '../../../design/tokens';
import type { EmailPasswordMode } from '../../../domain/account/emailPassword';
import { emailObviousError } from '../model';
import { WELCOME_AUTH_COPY as COPY } from '../copy';
import { EMAIL_AUTH_KEYBOARD_BEHAVIOR } from './EmailEntryView';

export type EmailPasswordNotice = 'confirmationRequired' | 'rejected' | 'unreachable' | 'unavailable' | null;

export interface EmailPasswordViewProps {
  mode: EmailPasswordMode;
  notice: EmailPasswordNotice;
  pending: boolean;
  allowSignUp: boolean;
  onModeChange: (mode: EmailPasswordMode) => void;
  onSubmit: (mode: EmailPasswordMode, email: string, password: string) => void;
}

/**
 * Password text remains in this screen only, never in the welcome reducer,
 * AppState or analytics. The password is passed directly to AccountRuntime.
 * No fake session is created while email confirmation is pending.
 */
export function EmailPasswordView({ mode, notice, pending, allowSignUp, onModeChange, onSubmit }: EmailPasswordViewProps) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);

  const create = mode === 'signUp';
  const clearError = () => setError(null);
  const submit = () => {
    if (pending) return;
    if (emailObviousError(email)) return setError(COPY.email.invalid);
    if (password.length < 8) return setError(COPY.password.minimum);
    if (create && confirm !== password) return setError(COPY.password.mismatch);
    setError(null);
    onSubmit(mode, email, password);
  };
  const changeMode = (next: EmailPasswordMode) => {
    if (pending || (next === 'signUp' && !allowSignUp)) return;
    setPassword('');
    setConfirm('');
    setError(null);
    onModeChange(next);
  };

  const serverNotice = notice === 'confirmationRequired'
    ? COPY.password.confirmationRequired
    : notice === 'unreachable' ? COPY.password.unreachable
    : notice === 'unavailable' ? COPY.password.unavailable
    : notice === 'rejected' ? COPY.password.rejected : null;

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={EMAIL_AUTH_KEYBOARD_BEHAVIOR}>
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.container}>
        <Overline>{COPY.password.overline}</Overline>
        <AppText variant="display" style={styles.heading}>{create ? COPY.password.createTitle : COPY.password.signInTitle}</AppText>
        <AppText variant="supporting" color={color.text.secondary} style={styles.lede}>
          {create ? COPY.password.createLede : COPY.password.signInLede}
        </AppText>
        <View style={styles.form}>
          <TextField label={COPY.email.fieldLabel} value={email}
            onChangeText={(value) => { setEmail(value); clearError(); }}
            placeholder={COPY.email.placeholder} keyboardType="email-address"
            autoCapitalize="none" autoCorrect={false} autoComplete="email" editable={!pending} />
          <TextField label={COPY.password.fieldLabel} value={password}
            onChangeText={(value) => { setPassword(value); clearError(); }}
            placeholder={COPY.password.placeholder}
            autoCapitalize="none" autoCorrect={false}
            autoComplete={create ? 'new-password' : 'current-password'}
            textContentType={create ? 'newPassword' : 'password'}
            secureTextEntry={!showPassword} editable={!pending} />
          {create && (
            <TextField label={COPY.password.confirmLabel} value={confirm}
              onChangeText={(value) => { setConfirm(value); clearError(); }}
              autoCapitalize="none" autoCorrect={false}
              autoComplete="off" textContentType="none"
              secureTextEntry={!showPassword} editable={!pending} />
          )}
          <Button label={showPassword ? COPY.password.hide : COPY.password.show}
            variant="ghost" size="sm" disabled={pending}
            onPress={() => setShowPassword((shown) => !shown)} />
          {error && <AppText variant="supporting" color={color.status.risk} accessibilityLiveRegion="polite">{error}</AppText>}
          {serverNotice && (
            <AppText variant="supporting" color={color.text.secondary} accessibilityLiveRegion="polite">{serverNotice}</AppText>
          )}
        </View>
        <View style={styles.actions}>
          <Button label={create ? COPY.password.create : COPY.password.signIn} onPress={submit}
            disabled={pending || password.length === 0 || email.length === 0} />
          {allowSignUp && (
            <Button label={create ? COPY.password.goToSignIn : COPY.password.goToCreate}
              variant="ghost" disabled={pending}
              onPress={() => changeMode(create ? 'signIn' : 'signUp')} />
          )}
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  container: { flexGrow: 1, justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.lg },
  heading: { marginTop: spacing.md },
  lede: { marginTop: spacing.md },
  form: { marginTop: spacing.xl },
  actions: { marginTop: spacing.lg, gap: spacing.sm, paddingBottom: spacing.xl },
});
