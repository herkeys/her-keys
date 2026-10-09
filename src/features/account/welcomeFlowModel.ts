import type { EmailPasswordAttempt, EmailVerification } from '../../domain/account/accountRuntime';
import type { AccountStateKind } from '../../domain/account/authState';
import type { EmailOtpRequestResult } from '../../domain/account/emailOtp';
import {
  RESEND_COOLDOWN_SECONDS,
  stepAfterBack,
  type EmailErrorKind,
  type OtpErrorKind,
  type WelcomeAuthMethod,
  type WelcomeAuthPlatform,
  type WelcomeAuthStep,
  type WelcomeAuthViewState,
} from '../welcome/model';

/**
 * The welcome tree's controller, as a pure state machine.
 *
 * It owns only what is the SCREEN's business: which step she is on, the address
 * she typed, the inline errors, which control is waiting, and the visual resend
 * cooldown. It owns nothing about who she is. Every authentication decision is
 * AccountRuntime's; this reads the runtime's outcome and decides what to show.
 *
 * Nothing here is persisted, and the code she types never enters it at all —
 * it goes from the field to the runtime and is gone. A killed process starts
 * the tree again at its first step, which is the correct amount of memory for
 * an unfinished sign-in.
 */

/**
 * `first-run`: the entry route, for anyone without an account-held household.
 * `reconnect`: Your Account, for a bound household whose credential lapsed — the
 * same choice under the reconnect header, with no Welcome step above it.
 */
export type WelcomeFlowMode = 'first-run' | 'reconnect';

export interface WelcomeFlowState {
  mode: WelcomeFlowMode;
  step: WelcomeAuthStep;
  /** As typed. Kept across back navigation; never transformed. */
  email: string;
  emailError: EmailErrorKind | null;
  otpError: OtpErrorKind | null;
  passwordMode: 'signIn' | 'signUp';
  passwordNotice: 'confirmationRequired' | 'rejected' | 'unreachable' | 'unavailable' | null;
  premiumNotice: 'no_offering' | 'unavailable' | 'error' | null;
  premiumBusy: boolean;
  /** The method this screen is waiting on, so progress shows beside the control that started it. */
  inFlight: WelcomeAuthMethod | 'password' | null;
  /** When Resend is offered again (epoch ms), or null when it already is. A courtesy to her, not a rate limit. */
  resendAvailableAt: number | null;
  /** The last attempt from here ended without an account. Never set by a cancellation. */
  attemptFailed: boolean;
}

export type WelcomeFlowEvent =
  | { type: 'begin' }
  | { type: 'existingAccount' }
  | { type: 'premiumStarted' }
  | { type: 'premiumSettled'; outcome: 'purchased' | 'restored' | 'already_entitled' | 'cancelled' | 'no_offering' | 'unavailable' | 'error' }
  | { type: 'premiumContinueFree' }
  | { type: 'back' }
  | { type: 'chooseEmail' }
  | { type: 'choosePassword' }
  | { type: 'passwordModeChanged'; mode: 'signIn' | 'signUp' }
  | { type: 'passwordStarted' }
  | { type: 'passwordSettled'; outcome: EmailPasswordAttempt['outcome']; account: AccountStateKind }
  | { type: 'changeEmail' }
  | { type: 'providerStarted'; method: 'apple' | 'google' }
  /** The provider flow ended. `account` is the runtime's state afterwards — the only evidence of how it went. */
  | { type: 'providerSettled'; account: AccountStateKind }
  | { type: 'emailSubmitted'; email: string }
  | { type: 'emailRequestSettled'; result: EmailOtpRequestResult; now: number }
  | { type: 'resendStarted' }
  | { type: 'resendSettled'; result: EmailOtpRequestResult; now: number }
  | { type: 'codeSubmitted' }
  | { type: 'codeSettled'; outcome: EmailVerification; account: AccountStateKind };

export function initialWelcomeFlow(mode: WelcomeFlowMode): WelcomeFlowState {
  return {
    mode,
    step: mode === 'reconnect' ? 'account-choice' : 'welcome',
    email: '',
    emailError: null,
    otpError: null,
    passwordMode: 'signIn',
    passwordNotice: null,
    premiumNotice: null,
    premiumBusy: false,
    inFlight: null,
    resendAvailableAt: null,
    attemptFailed: false,
  };
}

/**
 * One step back, by the shell's own rule (`stepAfterBack`), or null when there
 * is nowhere to go: Welcome is the root of the first run, and the account
 * choice is the root of a reconnect. Nothing moves while a request is out.
 */
export function welcomeFlowBackTarget(state: WelcomeFlowState): WelcomeAuthStep | null {
  if (state.inFlight !== null || state.premiumBusy) return null;
  if (state.mode === 'reconnect' && state.step === 'account-choice') return null;
  return stepAfterBack(state.step);
}

/**
 * Signed in, but the account never got as far as holding this household: the
 * attempt did not finish, whatever the method. A cancellation lands on
 * `unauthenticated` (or leaves a degraded account degraded) and is not here.
 */
const ENDED_WITHOUT_AN_ACCOUNT: ReadonlySet<AccountStateKind> = new Set(['authError', 'authenticatedUnbound']);

/** A verified code that still left no usable account: the same failure, plus "still degraded" on a reconnect. */
const verifiedButNotHeld = (account: AccountStateKind): boolean =>
  ENDED_WITHOUT_AN_ACCOUNT.has(account) || account === 'authDegraded' || account === 'unauthenticated';

export function welcomeFlowReducer(state: WelcomeFlowState, event: WelcomeFlowEvent): WelcomeFlowState {
  switch (event.type) {
    case 'begin':
      return state.step === 'welcome'
        ? { ...state, step: 'premium', passwordMode: 'signUp', premiumNotice: null, attemptFailed: false }
        : state;

    case 'premiumStarted':
      if (state.step !== 'premium' || state.premiumBusy || state.inFlight !== null) return state;
      return { ...state, premiumBusy: true, premiumNotice: null };

    case 'premiumSettled':
      if (state.step !== 'premium' || !state.premiumBusy) return state;
      if (event.outcome === 'purchased' || event.outcome === 'restored' || event.outcome === 'already_entitled') {
        return { ...state, premiumBusy: false, premiumNotice: null, step: 'account-choice' };
      }
      return {
        ...state,
        premiumBusy: false,
        premiumNotice: event.outcome === 'cancelled' ? null : event.outcome,
      };

    case 'premiumContinueFree':
      return state.step === 'premium' && !state.premiumBusy
        ? { ...state, step: 'account-choice', premiumNotice: null }
        : state;

    case 'existingAccount':
      return state.step === 'welcome'
        ? { ...state, step: 'account-choice', passwordMode: 'signIn', attemptFailed: false }
        : state;

    case 'back': {
      const target = welcomeFlowBackTarget(state);
      if (target === null) return state;
      // Going back clears what was said about the step being left, never what she typed.
      return { ...state, step: target, emailError: null, otpError: null, attemptFailed: false };
    }

    case 'choosePassword':
      if (state.inFlight !== null || state.step !== 'account-choice') return state;
      return { ...state, step: 'password', passwordMode: state.mode === 'reconnect' ? 'signIn' : state.passwordMode, passwordNotice: null, attemptFailed: false };

    case 'passwordModeChanged':
      if (state.inFlight !== null || state.step !== 'password' || (state.mode === 'reconnect' && event.mode === 'signUp')) return state;
      return { ...state, passwordMode: event.mode, passwordNotice: null };

    case 'passwordStarted':
      if (state.inFlight !== null || state.step !== 'password') return state;
      return { ...state, inFlight: 'password', passwordNotice: null };

    case 'passwordSettled': {
      if (state.inFlight !== 'password') return state;
      const outcome = event.outcome.kind;
      if (outcome === 'authenticated') {
        const failed = verifiedButNotHeld(event.account);
        return { ...state, inFlight: null, passwordNotice: failed ? 'rejected' : null };
      }
      return { ...state, inFlight: null, passwordNotice: outcome };
    }

    case 'chooseEmail':
      if (state.inFlight !== null || state.step !== 'account-choice') return state;
      return { ...state, step: 'email', emailError: null, attemptFailed: false };

    case 'changeEmail':
      if (state.inFlight !== null || state.step !== 'otp') return state;
      return { ...state, step: 'email', otpError: null };

    case 'providerStarted':
      if (state.inFlight !== null) return state;
      return { ...state, inFlight: event.method, attemptFailed: false };

    case 'providerSettled':
      return { ...state, inFlight: null, attemptFailed: ENDED_WITHOUT_AN_ACCOUNT.has(event.account) };

    case 'emailSubmitted':
      if (state.inFlight !== null) return state;
      return { ...state, email: event.email, emailError: null, inFlight: 'email' };

    case 'emailRequestSettled':
      if (event.result.kind === 'sent') {
        return { ...state, inFlight: null, step: 'otp', otpError: null, resendAvailableAt: cooldownFrom(event.now) };
      }
      return { ...state, inFlight: null, emailError: emailErrorFor(event.result) };

    case 'resendStarted':
      if (state.inFlight !== null) return state;
      return { ...state, inFlight: 'email', otpError: null };

    case 'resendSettled':
      if (event.result.kind === 'sent') return { ...state, inFlight: null, resendAvailableAt: cooldownFrom(event.now) };
      return {
        ...state,
        inFlight: null,
        otpError: 'verify-failed',
        // The service said it is being asked too often. Its limit is the authority; the least this screen can do is not
        // offer the same button again straight away.
        resendAvailableAt: event.result.kind === 'rateLimited' ? cooldownFrom(event.now) : state.resendAvailableAt,
      };

    case 'codeSubmitted':
      if (state.inFlight !== null) return state;
      return { ...state, inFlight: 'email', otpError: null };

    case 'codeSettled': {
      if (event.outcome.kind === 'codeRejected') return { ...state, inFlight: null, otpError: 'invalid-or-expired' };
      if (event.outcome.kind !== 'verified') return { ...state, inFlight: null, otpError: 'verify-failed' };
      // The code was right. If an account now holds this household, routing takes over and this screen is simply
      // leaving. If not, the code is spent — sending her back to the choice is the only honest place to stand.
      if (!verifiedButNotHeld(event.account)) return { ...state, inFlight: null };
      return { ...state, inFlight: null, step: 'account-choice', otpError: null, attemptFailed: true };
    }
  }
}

const cooldownFrom = (now: number): number => now + RESEND_COOLDOWN_SECONDS * 1000;

/** Only the service's own "that address is not one" is called an invalid address; everything else is a send that failed. */
function emailErrorFor(result: Exclude<EmailOtpRequestResult, { kind: 'sent' }>): EmailErrorKind {
  return result.kind === 'rejected' && (result.detail === 'email_address_invalid' || result.detail === 'validation_failed')
    ? 'invalid-email'
    : 'send-failed';
}

/**
 * What the shell renders. `settling` and `account-conflict` are not produced
 * here: until the account has settled no flow exists, and quarantine opens its
 * own screen and no other — both decided by the route table, not by this tree.
 */
export function welcomeFlowView(state: WelcomeFlowState, platform: WelcomeAuthPlatform, now: number): WelcomeAuthViewState {
  const secondsLeft = state.resendAvailableAt === null ? 0 : Math.ceil((state.resendAvailableAt - now) / 1000);
  return {
    step: state.step,
    // A reconnect shows the choice under its own header; the email and code steps are the ordinary ones.
    presentation: state.mode === 'reconnect' && state.step === 'account-choice' ? 'auth-degraded' : 'normal',
    platform,
    pending: state.inFlight,
    email: state.email,
    emailError: state.emailError,
    otpError: state.otpError,
    passwordMode: state.passwordMode,
    passwordCanSignUp: state.mode === 'first-run',
    passwordNotice: state.passwordNotice,
    premiumNotice: state.premiumNotice,
    premiumBusy: state.premiumBusy,
    resendSecondsLeft: secondsLeft > 0 ? secondsLeft : null,
    notice: state.attemptFailed && state.step === 'account-choice' ? 'attempt-failed' : null,
  };
}
