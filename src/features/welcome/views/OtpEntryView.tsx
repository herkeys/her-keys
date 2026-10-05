import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { AppText, Button, Overline, TextField } from '../../../design/components';
import { color, sizing, spacing } from '../../../design/tokens';
import { WELCOME_AUTH_COPY as COPY } from '../copy';
import { OTP_CODE_LENGTH, type OtpErrorKind } from '../model';

export interface OtpEntryViewProps {
  /** Where the code was sent — shown, and preserved if she goes back. */
  email: string;
  error: OtpErrorKind | null;
  pending: boolean;
  /** Seconds left on the visual resend cooldown; null means Resend is enabled. */
  resendSecondsLeft: number | null;
  onSubmitOtp: (code: string) => void;
  onResendOtp: () => void;
  onChangeEmail: () => void;
}

const ERROR_COPY: Record<OtpErrorKind, string> = {
  'wrong-code': COPY.otp.wrongCode,
  'expired-code': COPY.otp.expiredCode,
  'verify-failed': COPY.otp.verifyFailed,
};

/**
 * The verification-code step.
 *
 * ONE logical field, not six boxes: a single labeled input with a numeric
 * keyboard, paste and one-time-code autofill where the platform offers them,
 * a reading order of title → where the code went → field → action, and
 * errors announced as they appear. Verify stays disabled until the code is
 * complete; an expired code points at Resend, which carries a visible
 * cooldown ("Resend code in 30s") before it is enabled again — UI state
 * only, asserting nothing about any backend rate limit.
 */
export function OtpEntryView({ email, error, pending, resendSecondsLeft, onSubmitOtp, onResendOtp, onChangeEmail }: OtpEntryViewProps) {
  const [code, setCode] = useState('');
  const complete = code.length === OTP_CODE_LENGTH;
  const coolingDown = resendSecondsLeft !== null && resendSecondsLeft > 0;

  const submit = () => {
    if (pending || !complete) return;
    onSubmitOtp(code);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={styles.body}>
        <Overline>{COPY.otp.overline}</Overline>
        <AppText variant="display" style={styles.title}>
          {COPY.otp.title}
        </AppText>
        <AppText variant="supporting" color={color.text.secondary} style={styles.lede}>
          {COPY.otp.lede(email)}
        </AppText>

        <View style={styles.form}>
          <TextField
            label={COPY.otp.fieldLabel}
            value={code}
            onChangeText={setCode}
            keyboardType="number-pad"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="one-time-code"
            textContentType="oneTimeCode"
            returnKeyType="done"
            onSubmitEditing={submit}
            maxLength={OTP_CODE_LENGTH}
            editable={!pending}
            error={error ? ERROR_COPY[error] : null}
            errorAccessibilityLiveRegion="polite"
          />
        </View>
      </View>

      <View style={styles.footer}>
        {pending && (
          <View style={styles.pending} accessibilityLiveRegion="polite">
            <ActivityIndicator color={color.action.primary} />
            <AppText variant="bodySm" color={color.text.muted}>
              {COPY.otp.pending}
            </AppText>
          </View>
        )}
        <Button label={COPY.otp.verify} onPress={submit} disabled={pending || !complete} />
        <View style={styles.secondaryRow}>
          <Button
            label={coolingDown ? COPY.otp.resendIn(resendSecondsLeft) : COPY.otp.resend}
            variant="ghost"
            size="sm"
            onPress={onResendOtp}
            disabled={pending || coolingDown}
          />
          <Button label={COPY.otp.changeEmail} variant="ghost" size="sm" onPress={onChangeEmail} disabled={pending} />
        </View>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  title: { marginTop: spacing.md },
  lede: { marginTop: spacing.lg },
  form: { marginTop: spacing.xxxl },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  pending: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  secondaryRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: spacing.lg,
    minHeight: sizing.control.heightSmall,
  },
});
