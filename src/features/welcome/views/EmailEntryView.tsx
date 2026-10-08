import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, StyleSheet, View } from 'react-native';
import { AppText, Button, Overline, TextField } from '../../../design/components';
import { color, spacing } from '../../../design/tokens';
import { WELCOME_AUTH_COPY as COPY } from '../copy';
import { emailObviousError, type EmailErrorKind } from '../model';

export interface EmailEntryViewProps {
  /** The address as last typed — restored when she comes back from the code screen. */
  email: string;
  /** A send failure reported by the controller; obvious-format errors are caught here first. */
  error: EmailErrorKind | null;
  pending: boolean;
  onSubmitEmail: (email: string) => void;
}

/** Shared email-auth keyboard behavior; one audited platform conditional, used by password + OTP screens. */
export const EMAIL_AUTH_KEYBOARD_BEHAVIOR = Platform.OS === 'ios' ? 'padding' : undefined;

/**
 * Passwordless email entry. Continue stays disabled until something is
 * typed; obvious format errors are caught inline on submit (presentation
 * validation only — never RFC 5322, never a silent rewrite of what she
 * typed). A send failure is reported inline under the field, in words, with
 * the typed address untouched.
 *
 * Keyboard-safe: the field and action ride above the keyboard.
 */
export function EmailEntryView({ email, error, pending, onSubmitEmail }: EmailEntryViewProps) {
  const [draft, setDraft] = useState(email);
  const [formatError, setFormatError] = useState<string | null>(null);

  const shownError = formatError ?? (error === 'send-failed' ? COPY.email.sendFailed : error === 'invalid-email' ? COPY.email.invalid : null);

  const submit = () => {
    if (pending || draft.length === 0) return;
    // Validated exactly as typed — no lowercasing, no trimming into a value
    // she did not enter.
    if (emailObviousError(draft)) {
      setFormatError(COPY.email.invalid);
      return;
    }
    setFormatError(null);
    onSubmitEmail(draft);
  };

  return (
    <KeyboardAvoidingView style={styles.flex} behavior={EMAIL_AUTH_KEYBOARD_BEHAVIOR}>
      <View style={styles.body}>
        <Overline>{COPY.email.overline}</Overline>
        <AppText variant="display" style={styles.title}>
          {COPY.email.title}
        </AppText>
        <AppText variant="supporting" color={color.text.secondary} style={styles.lede}>
          {COPY.email.lede}
        </AppText>

        <View style={styles.form}>
          <TextField
            label={COPY.email.fieldLabel}
            value={draft}
            onChangeText={(text) => {
              setDraft(text);
              // Editing after an error clears the message, never the text.
              if (formatError) setFormatError(null);
            }}
            placeholder={COPY.email.placeholder}
            keyboardType="email-address"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="email"
            textContentType="emailAddress"
            returnKeyType="done"
            onSubmitEditing={submit}
            editable={!pending}
            error={shownError}
            errorAccessibilityLiveRegion="polite"
          />
        </View>
      </View>

      <View style={styles.footer}>
        {pending && (
          <View style={styles.pending} accessibilityLiveRegion="polite">
            <ActivityIndicator color={color.action.primary} />
            <AppText variant="bodySm" color={color.text.muted}>
              {COPY.email.pending}
            </AppText>
          </View>
        )}
        <Button label={COPY.email.continue} onPress={submit} disabled={pending || draft.length === 0} />
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
});
