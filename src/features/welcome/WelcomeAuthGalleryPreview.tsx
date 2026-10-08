import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, ChipToggle, Overline } from '../../design/components';
import { color, radius, spacing } from '../../design/tokens';
import { RESEND_COOLDOWN_SECONDS, emailObviousError, stepAfterBack, type WelcomeAuthPresentation, type WelcomeAuthStep, type WelcomeAuthViewState } from './model';
import { WelcomeAuthShell } from './WelcomeAuthShell';

type SceneKey =
  | 'welcome'
  | 'choice'
  | 'email'
  | 'otp'
  | 'otp-wrong'
  | 'otp-expired'
  | 'otp-cooldown'
  | 'pending'
  | 'settling'
  | 'degraded'
  | 'conflict';

const SCENES: Array<{ key: SceneKey; label: string }> = [
  { key: 'welcome', label: 'Welcome' },
  { key: 'choice', label: 'Account choice' },
  { key: 'email', label: 'Email' },
  { key: 'otp', label: 'OTP' },
  { key: 'otp-wrong', label: 'OTP wrong' },
  { key: 'otp-expired', label: 'OTP expired' },
  { key: 'otp-cooldown', label: 'Resend cooldown' },
  { key: 'pending', label: 'Provider pending' },
  { key: 'settling', label: 'Settling' },
  { key: 'degraded', label: 'Degraded' },
  { key: 'conflict', label: 'Conflict' },
];

const SCENE_STATE: Record<SceneKey, Partial<WelcomeAuthViewState>> = {
  welcome: { step: 'welcome' },
  choice: { step: 'account-choice' },
  email: { step: 'email' },
  otp: { step: 'otp', email: 'rowan@example.com' },
  'otp-wrong': { step: 'otp', email: 'rowan@example.com', otpError: 'wrong-code' },
  'otp-expired': { step: 'otp', email: 'rowan@example.com', otpError: 'expired-code' },
  'otp-cooldown': { step: 'otp', email: 'rowan@example.com', resendSecondsLeft: RESEND_COOLDOWN_SECONDS },
  pending: { step: 'account-choice', pending: 'google' },
  settling: { presentation: 'settling' },
  degraded: { presentation: 'auth-degraded', step: 'account-choice' },
  conflict: { presentation: 'account-conflict' },
};

const BASE: WelcomeAuthViewState = {
  step: 'welcome',
  presentation: 'normal',
  platform: 'ios',
  pending: null,
  email: '',
  emailError: null,
  otpError: null,
  resendSecondsLeft: null,
};

/**
 * Development-only exercise of every welcome/auth state (HK welcome tree
 * design pass). This controller is the gallery's stand-in for the future
 * integration: it holds the view state, applies the shell's own rules (back
 * model, obvious email validation, the visual resend cooldown), and proves
 * the callbacks need no auth implementation behind them. No timers stand in
 * for server behavior — the cooldown is the shell's documented local visual
 * state, and every other transition happens on a press.
 */
export function WelcomeAuthGalleryPreview() {
  const [scene, setScene] = useState<SceneKey>('welcome');
  const [state, setState] = useState<WelcomeAuthViewState>(BASE);

  const apply = (key: SceneKey) => {
    setScene(key);
    setState((current) => ({
      ...BASE,
      platform: current.platform,
      ...SCENE_STATE[key],
    }));
  };

  // The shell's local visual cooldown: ticks down once resend has been used,
  // then re-enables. UI state only — it asserts no backend rate limit.
  useEffect(() => {
    if (state.resendSecondsLeft === null || state.resendSecondsLeft <= 0) return;
    const timer = setInterval(() => {
      setState((current) => {
        const left = current.resendSecondsLeft;
        if (left === null || left <= 1) return { ...current, resendSecondsLeft: null };
        return { ...current, resendSecondsLeft: left - 1 };
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [state.resendSecondsLeft !== null && state.resendSecondsLeft > 0]);

  const goTo = (step: WelcomeAuthStep, presentation: WelcomeAuthPresentation = 'normal') =>
    setState((current) => ({ ...current, step, presentation }));

  return (
    <View>
      <View style={styles.controls}>
        <Overline>Platform</Overline>
        <View style={styles.chips}>
          <ChipToggle label="iOS" selected={state.platform === 'ios'} onPress={() => setState((c) => ({ ...c, platform: 'ios' }))} />
          <ChipToggle label="Android" selected={state.platform === 'android'} onPress={() => setState((c) => ({ ...c, platform: 'android' }))} />
        </View>
        <Overline style={styles.sceneLabel}>State</Overline>
        <View style={styles.chips}>
          {SCENES.map(({ key, label }) => (
            <ChipToggle key={key} label={label} selected={scene === key} onPress={() => apply(key)} />
          ))}
        </View>
      </View>

      <View style={styles.frame}>
        <WelcomeAuthShell
          state={state}
          onBegin={() => goTo('account-choice')}
          onApple={() => goTo('account-choice')}
          onGoogle={() => goTo('account-choice')}
          onChooseEmail={() => goTo('email')}
          onChoosePassword={() => goTo('password')}
          onPasswordModeChange={(mode) => setState((current) => ({ ...current, passwordMode: mode, passwordNotice: null }))}
          onSubmitPassword={() => setState((current) => ({ ...current, passwordNotice: 'unavailable' }))}
          onSubmitEmail={(email) => {
            if (emailObviousError(email)) return;
            setState((current) => ({ ...current, step: 'otp', email, emailError: null }));
          }}
          onSubmitOtp={() => setState((current) => ({ ...current, otpError: 'wrong-code' }))}
          onResendOtp={() => setState((current) => ({ ...current, resendSecondsLeft: RESEND_COOLDOWN_SECONDS, otpError: null }))}
          onChangeEmail={() => setState((current) => ({ ...current, step: 'email', otpError: null, resendSecondsLeft: null }))}
          onBack={() =>
            setState((current) => {
              const previous = stepAfterBack(current.step);
              return previous ? { ...current, step: previous, emailError: null, otpError: null } : current;
            })
          }
          onSignOut={() => apply('welcome')}
        />
      </View>

      <AppText variant="metadata" color={color.text.muted} style={styles.hint}>
        The frame renders the shell exactly as the integration will: one view-state object in, intent callbacks out.
      </AppText>
    </View>
  );
}

const styles = StyleSheet.create({
  controls: { marginBottom: spacing.lg },
  sceneLabel: { marginTop: spacing.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  frame: {
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border.control,
    borderRadius: radius.md,
    overflow: 'hidden',
    minHeight: 560,
  },
  hint: { marginTop: spacing.md },
});
