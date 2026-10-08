/**
 * Welcome tree — every user-facing string of the first-run welcome/auth
 * frontend shell, in one module.
 *
 * The headline and lede are pinned product copy; everything else follows the
 * established Her Keys voice: calm, concrete, no alarms. Provider labels reuse
 * the account feature's own wording so the two surfaces never drift apart.
 *
 * This module is presentation-only: no copy here implies a backend behavior,
 * a rate limit, or a persisted state.
 */
import { CROSS_PLATFORM_NOTE, PROVIDER_LABELS } from '../account/accountModel';
import type { WelcomeAuthMethod } from './model';

export const WELCOME_AUTH_COPY = {
  welcome: {
    overline: 'Her Keys',
    // Pinned brand headline — do not reword.
    title: 'Rebuild your life.\nRun it your way.',
    // Pinned lede — the current product voice.
    lede: 'Her Keys holds the parts of your life you shouldn’t have to keep in your head — and tells you what actually needs you today.',
    footnote: 'Your household stays on this device until you choose an account to hold it.',
    begin: 'Begin',
  },

  accountChoice: {
    overline: 'Your account',
    title: 'Connect your\naccount.',
    lede: 'Sign in to connect your household to your account and sync eligible records. Restoring an existing household on a different phone is not available yet.',
    legalNotice: 'By continuing, you agree to the Terms and Conditions and acknowledge the Privacy Policy.',
    legalTerms: 'Terms and Conditions',
    legalPrivacy: 'Privacy Policy',
    pending: 'Connecting your account…',
    /**
     * EX-01, the owner-approved Apple exception: Sign in with Apple is iOS-only, so where Apple is offered the choice
     * carries the account feature's own disclosure, word for word. Never shown where Apple is not.
     */
    crossPlatformNote: CROSS_PLATFORM_NOTE,
    /** Same reassurance, in the same words, as the account surface uses after a failed sign-in. */
    attemptFailed: 'That did not go through. Nothing on this device changed — you can try again.',
  },

  email: {
    overline: 'Continue with email',
    title: 'What’s your email?',
    lede: 'We’ll send a short code to check it’s you. There’s no password to remember.',
    fieldLabel: 'Email',
    placeholder: 'you@example.com',
    continue: 'Continue',
    invalid: 'That doesn’t look like a complete email address. Check it and try again.',
    sendFailed: 'That didn’t go through. Your information is still here — try again.',
    pending: 'Sending your code…',
  },

  otp: {
    overline: 'Check your email',
    title: 'Enter your code',
    lede: (email: string) => `We sent a 6-digit code to ${email}.`,
    fieldLabel: 'Verification code',
    verify: 'Verify',
    resend: 'Resend code',
    resendIn: (seconds: number) => `Resend code in ${seconds}s`,
    changeEmail: 'Use a different email',
    wrongCode: 'That code doesn’t match. Check it and try again.',
    expiredCode: 'This code expired. Request a new one.',
    /** The auth service does not say which, so neither does this line. */
    invalidOrExpired: 'That code didn’t work. Check it, or request a new one.',
    verifyFailed: 'That didn’t go through. Your information is still here — try again.',
    pending: 'Checking your code…',
  },

  /** Settling / restore: the app does not know the account state yet. */
  settling: {
    label: 'Getting things ready…',
  },

  /**
   * Auth degraded / reconnect: the calm doctrine — her local information has
   * not disappeared.
   */
  degraded: {
    overline: 'Reconnect',
    title: 'Your life is here.\nReconnect the cloud.',
    lede: 'Nothing on this device was removed. Sign in again to reconnect this same account and resume syncing.',
  },

  /**
   * Account conflict / quarantine presentation: the device holds another
   * account's household. A safety state, never a generic sign-in error. The
   * wording mirrors the production account-conflict screen.
   */
  conflict: {
    overline: 'Different account',
    title: 'This phone already\nbelongs to someone.',
    lede: 'The household saved on this device was set up under a different account. It has not been changed, moved or shared — it is simply not this account’s to open.',
    note: 'Sign out to go back to it.',
    signOut: 'Sign out',
  },

  back: 'Back',
} as const;

/**
 * Method labels. Apple and Google reuse the account feature's own labels;
 * email joins them here so all three read as one family of "Continue with…"
 * choices. Never "Continue with Android".
 */
export const METHOD_LABELS: Record<WelcomeAuthMethod, string> = {
  ...PROVIDER_LABELS,
  email: 'Continue with email',
};
