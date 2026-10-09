import { Pressable, StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Screen } from '../../design/components';
import { color, interaction, sizing, spacing } from '../../design/tokens';
import { WELCOME_AUTH_COPY as COPY } from './copy';
import { stepAfterBack, type WelcomeAuthCallbacks, type WelcomeAuthViewState } from './model';
import { AccountChoiceView } from './views/AccountChoiceView';
import { EmailEntryView } from './views/EmailEntryView';
import { OtpEntryView } from './views/OtpEntryView';
import { EmailPasswordView } from './views/EmailPasswordView';
import { ConflictView, DegradedHeader, SettlingView } from './views/StatePresentations';
import { WelcomeView } from './views/WelcomeView';

export interface WelcomeAuthShellProps extends WelcomeAuthCallbacks {
  state: WelcomeAuthViewState;
}

/**
 * The root of the welcome/auth frontend shell — the polished first-run
 * presentation a later integration pass wires to the EXISTING account
 * authorities (AccountProvider / AccountRuntime / routeAccess).
 *
 * This component is presentational only. It renders exactly what
 * `state` says, reports intent upward through callbacks, and owns no
 * transition, token, session, store or persistence of its own. The back
 * model (welcome is root; OTP returns to email with the address preserved;
 * no confirmation dialogs) is pure in `stepAfterBack` so the integration can
 * bind the visible control and Android hardware Back to the same rule.
 *
 * Production routing is untouched: the shell is exercised from the internal
 * design gallery until the integration pass places it.
 */
export function WelcomeAuthShell({ state, onBegin, onExistingAccount, onApple, onGoogle, onChooseEmail, onChoosePassword, onPasswordModeChange, onSubmitPassword, onSubmitEmail, onSubmitOtp, onResendOtp, onChangeEmail, onBack, onSignOut }: WelcomeAuthShellProps) {
  // Hard presentations replace the step tree entirely.
  if (state.presentation === 'settling') {
    return (
      <Screen scroll={false} bottomClearance={spacing.xxxl}>
        <SettlingView />
      </Screen>
    );
  }
  if (state.presentation === 'account-conflict') {
    return (
      <Screen scroll={false} bottomClearance={spacing.xxxl}>
        <ConflictView busy={state.pending !== null} onSignOut={onSignOut} />
      </Screen>
    );
  }

  const canGoBack = state.presentation === 'normal' && stepAfterBack(state.step) !== null;

  return (
    <Screen scroll={false} bottomClearance={spacing.xxxl}>
      {canGoBack && <BackControl onBack={onBack} />}

      {state.presentation === 'auth-degraded' && <DegradedHeader />}

      {state.presentation === 'normal' && state.step === 'welcome' && <WelcomeView onBegin={onBegin} onExistingAccount={onExistingAccount} />}

      {/* The degraded presentation keeps the account choice usable: reconnecting
          is the same control as a first sign-in, under its own header. */}
      {((state.presentation === 'normal' && state.step === 'account-choice') || state.presentation === 'auth-degraded') && (
        <AccountChoiceView
          platform={state.platform}
          pending={state.pending}
          headerless={state.presentation === 'auth-degraded'}
          notice={state.notice}
          authMode={state.passwordMode ?? 'signIn'}
          onApple={onApple}
          onGoogle={onGoogle}
          onChooseEmail={onChooseEmail}
          onChoosePassword={onChoosePassword}
        />
      )}

      {state.presentation === 'normal' && state.step === 'email' && (
        <EmailEntryView email={state.email} error={state.emailError} pending={state.pending === 'email'} onSubmitEmail={onSubmitEmail} />
      )}

      {state.presentation === 'normal' && state.step === 'password' && onPasswordModeChange && onSubmitPassword && (
        <EmailPasswordView
          mode={state.passwordMode ?? 'signIn'}
          notice={state.passwordNotice ?? null}
          pending={state.pending === 'password'}
          allowSignUp={state.passwordCanSignUp ?? true}
          onModeChange={onPasswordModeChange}
          onSubmit={onSubmitPassword}
        />
      )}

      {state.presentation === 'normal' && state.step === 'otp' && (
        <OtpEntryView
          email={state.email}
          error={state.otpError}
          pending={state.pending === 'email'}
          resendSecondsLeft={state.resendSecondsLeft}
          onSubmitOtp={onSubmitOtp}
          onResendOtp={onResendOtp}
          onChangeEmail={onChangeEmail}
        />
      )}
    </Screen>
  );
}

/** The one back control: quiet, labeled, and identical in behavior to Android hardware Back. */
function BackControl({ onBack }: { onBack: () => void }) {
  return (
    <Pressable
      onPress={onBack}
      accessibilityRole="button"
      accessibilityLabel={COPY.back}
      style={({ pressed }) => [styles.back, pressed && styles.backPressed]}
      hitSlop={spacing.sm}
    >
      <Ionicons name="chevron-back" size={sizing.icon.lg} color={color.text.secondary} />
      <AppText variant="actionLabel" color={color.text.secondary}>
        {COPY.back}
      </AppText>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'flex-start',
    minHeight: sizing.minTouchTarget,
    paddingHorizontal: spacing.lg,
    gap: spacing.xxs,
  },
  backPressed: { opacity: interaction.pressedOpacity },
});
