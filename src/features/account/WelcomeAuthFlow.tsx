import { useCallback, useEffect, useReducer, useRef, useState } from 'react';
import { BackHandler, Platform } from 'react-native';
import { createPasswordRecoveryPort, type PasswordRecoveryPort } from '../../platform/passwordRecoveryProvider';
import { useAccount } from '../../store/AccountProvider';
import type { WelcomeAuthCallbacks, WelcomeAuthPlatform, WelcomeAuthViewState } from '../welcome/model';
import { WelcomeAuthShell } from '../welcome/WelcomeAuthShell';
import type { PaywallOutcome } from '../../monetization/entitlement';
import {
  initialWelcomeFlow,
  welcomeFlowBackTarget,
  welcomeFlowReducer,
  welcomeFlowView,
  type WelcomeFlowEvent,
  type WelcomeFlowMode,
} from './welcomeFlowModel';

/**
 * The welcome tree, wired.
 *
 * This is the one place Kimi's presentational shell meets the account runtime,
 * and it goes through `useAccount` for all of it: the shell still knows nothing
 * about sessions, and this component still decides nothing about identity. It
 * turns her taps into runtime calls and the runtime's answers into view state
 * (`welcomeFlowModel.ts` holds that mapping, pure).
 *
 * Nothing here routes. When an account comes to hold this household the route
 * table closes this screen and opens the next one; when another account's
 * household is found it opens the conflict screen instead.
 */
export function WelcomeAuthFlow({ mode, presentWelcomePaywall }: { mode: WelcomeFlowMode; presentWelcomePaywall?: () => Promise<PaywallOutcome> }) {
  const account = useAccount();
  const [flow, dispatch] = useReducer(welcomeFlowReducer, mode, initialWelcomeFlow);
  const platform = useOfferedPlatform();
  const now = useCooldownClock(flow.resendAvailableAt);
  const recovery = useRef<PasswordRecoveryPort | null>(null);

  // A request that settles after this screen has gone has nothing left to update.
  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
      void recovery.current?.dispose();
      recovery.current = null;
    };
  }, []);
  const send = useCallback((event: WelcomeFlowEvent) => {
    if (mounted.current) dispatch(event);
  }, []);

  // Signed in but never bound — a sign-in whose binding did not finish. The runtime will not start another attempt on top
  // of that session, so choosing a method again first ends it (nothing local changes), and then starts clean.
  const accountKind = account.state.kind;
  const { signOut } = account;
  const clearStrandedSession = useCallback(async () => {
    if (accountKind === 'authenticatedUnbound') await signOut();
  }, [accountKind, signOut]);

  const startProvider = (method: 'apple' | 'google') => {
    if (flow.inFlight !== null) return;
    dispatch({ type: 'providerStarted', method });
    void (async () => {
      await clearStrandedSession();
      const next = await account.signIn(method);
      send({ type: 'providerSettled', account: next.kind });
    })();
  };

  const cancelRecovery = () => {
    void recovery.current?.dispose();
    recovery.current = null;
    dispatch({ type: 'back' });
  };

  const callbacks: WelcomeAuthCallbacks = {
    onBegin: () => dispatch({ type: 'begin' }),
    onExistingAccount: () => dispatch({ type: 'existingAccount' }),
    onPremiumPlans: () => {
      if (flow.step !== 'premium' || flow.premiumBusy) return;
      dispatch({ type: 'premiumStarted' });
      void (async () => {
        let outcome: PaywallOutcome = { kind: 'unavailable' };
        try {
          outcome = await (presentWelcomePaywall?.() ?? Promise.resolve({ kind: 'unavailable' as const }));
        } catch {
          outcome = { kind: 'error', message: 'paywall_unreachable' };
        }
        send({ type: 'premiumSettled', outcome: outcome.kind });
      })();
    },
    onContinueFree: () => dispatch({ type: 'premiumContinueFree' }),
    onBack: () => flow.step === 'recovery' ? cancelRecovery() : dispatch({ type: 'back' }),
    onApple: () => startProvider('apple'),
    onGoogle: () => startProvider('google'),
    onChooseEmail: () => dispatch({ type: 'chooseEmail' }),
    onChoosePassword: () => dispatch({ type: 'choosePassword' }),
    onPasswordModeChange: (mode) => dispatch({ type: 'passwordModeChanged', mode }),
    onForgotPassword: (email) => dispatch({ type: 'forgotPassword', email }),
    onRequestRecovery: async (email) => {
      if (recovery.current === null) recovery.current = createPasswordRecoveryPort();
      return recovery.current.request(email);
    },
    onVerifyRecovery: async (email, code) => recovery.current?.verify(email, code) ?? 'unavailable',
    onUpdateRecoveryPassword: async (password) => recovery.current?.updatePassword(password) ?? 'unavailable',
    onCancelRecovery: cancelRecovery,
    onSubmitPassword: (mode, email, password) => {
      if (flow.inFlight !== null) return;
      dispatch({ type: 'passwordStarted' });
      void (async () => {
        await clearStrandedSession();
        const result = await account.authenticateEmailPassword(mode, email, password);
        send({ type: 'passwordSettled', outcome: result.outcome, account: result.state.kind });
      })();
    },
    onChangeEmail: () => dispatch({ type: 'changeEmail' }),

    onSubmitEmail: (email) => {
      if (flow.inFlight !== null) return;
      dispatch({ type: 'emailSubmitted', email });
      void (async () => {
        await clearStrandedSession();
        const result = await account.requestEmailOtp(email);
        send({ type: 'emailRequestSettled', result, now: Date.now() });
      })();
    },

    onResendOtp: () => {
      if (flow.inFlight !== null) return;
      dispatch({ type: 'resendStarted' });
      void (async () => {
        // The same request again. The service's own rate limit is the authority; one refusal is shown, never retried.
        const result = await account.requestEmailOtp(flow.email);
        send({ type: 'resendSettled', result, now: Date.now() });
      })();
    },

    onSubmitOtp: (code) => {
      if (flow.inFlight !== null) return;
      dispatch({ type: 'codeSubmitted' });
      void (async () => {
        // The code goes from the field to the runtime and is held nowhere in between.
        const { state: next, outcome } = await account.verifyEmailOtp(flow.email, code);
        send({ type: 'codeSettled', outcome, account: next.kind });
      })();
    },
  };

  // Android hardware Back follows the visible back control exactly. At the root of the tree it is left to the system,
  // which leaves the app (first run) or closes Your Account (reconnect): there is nothing behind Welcome to fall into.
  const backTarget = welcomeFlowBackTarget(flow);
  const waiting = flow.inFlight !== null;
  useEffect(() => {
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      if (waiting) return true;
      if (backTarget === null) return false;
      if (flow.step === 'recovery') cancelRecovery();
      else dispatch({ type: 'back' });
      return true;
    });
    return () => subscription.remove();
  }, [backTarget, waiting, flow.step]);

  return <WelcomeAuthShell state={welcomeFlowView(flow, platform, now)} {...callbacks} />;
}

const SETTLING: WelcomeAuthViewState = {
  step: 'welcome',
  presentation: 'settling',
  platform: 'android',
  pending: null,
  email: '',
  emailError: null,
  otpError: null,
  resendSecondsLeft: null,
};

const noop = () => {};
const INERT: WelcomeAuthCallbacks = {
  onBegin: noop,
  onExistingAccount: noop,
  onPremiumPlans: noop,
  onContinueFree: noop,
  onApple: noop,
  onGoogle: noop,
  onChooseEmail: noop,
  onSubmitEmail: noop,
  onSubmitOtp: noop,
  onResendOtp: noop,
  onChangeEmail: noop,
  onBack: noop,
};

/**
 * What the root shows while the stored session is still being resolved: the shell's own settling presentation, which
 * implies no step. No navigator exists yet, so neither Welcome nor the audit nor the app can appear before the answer.
 */
export function WelcomeAuthSettling() {
  return <WelcomeAuthShell state={SETTLING} {...INERT} />;
}

/**
 * An iOS candidate MUST always display native Sign in with Apple. Do not
 * infer the device's platform from the asynchronous provider-availability
 * probe: a temporary probe failure must not silently remove Apple signup.
 * The native Apple adapter remains the authentication authority, and an
 * unavailable/misconfigured native flow fails visibly at sign-in.
 */
function useOfferedPlatform(): WelcomeAuthPlatform {
  return Platform.OS === 'ios' ? 'ios' : 'android';
}

/** The current time, ticking once a second only while a resend cooldown is running. Presentation only. */
function useCooldownClock(resendAvailableAt: number | null): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (resendAvailableAt === null) return;
    setNow(Date.now());
    const timer = setInterval(() => {
      const current = Date.now();
      setNow(current);
      if (current >= resendAvailableAt) clearInterval(timer);
    }, 1000);
    return () => clearInterval(timer);
  }, [resendAvailableAt]);
  return now;
}
