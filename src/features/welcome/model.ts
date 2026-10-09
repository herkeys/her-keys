/**
 * Welcome tree — the presentational view-state model.
 *
 * This is the boundary the integration pass wires to the EXISTING account
 * authorities (AccountProvider / AccountRuntime / routeAccess). It is a plain
 * data object plus callbacks: nothing here knows about Supabase, SecureStore,
 * AsyncStorage, sessions, or persistence, and no callback may write any of
 * them. The shell renders exactly what the state says; the controller that
 * supplies the state owns every transition.
 *
 * Deliberately NOT modeled here: guest/demo paths (there are none), first-run
 * persistence flags (hasSeenWelcome etc. — routing, not presentation, decides
 * when the tree shows), and connectivity detection.
 */

/** The methods the welcome tree can offer. Email code remains available alongside password auth. */
export type WelcomeAuthMethod = 'apple' | 'google' | 'email';

/** Only the two mobile platforms exist; desktop/web is out of scope. */
export type WelcomeAuthPlatform = 'ios' | 'android';

/** The steps of the tree, in first-run order. */
export type WelcomeAuthStep = 'welcome' | 'premium' | 'account-choice' | 'email' | 'otp' | 'password' | 'recovery';

/**
 * Hard presentations that replace a step rather than decorate it. They mirror
 * account states the app already models; rendering them changes no runtime
 * meaning.
 */
export type WelcomeAuthPresentation =
  /** Normal step rendering. */
  | 'normal'
  /** The app cannot yet say what the account state is — no step is implied. */
  | 'settling'
  /** The bound account's credential lapsed; her local information is intact. */
  | 'auth-degraded'
  /** This device holds ANOTHER account's household. A quarantine/safety state. */
  | 'account-conflict';

export type EmailErrorKind = 'invalid-email' | 'send-failed';
/**
 * `invalid-or-expired` is what the auth service actually reports: it answers a
 * mistyped code and an expired one identically, so the wired flow cannot
 * honestly claim either `wrong-code` or `expired-code` on its own.
 */
export type OtpErrorKind = 'wrong-code' | 'expired-code' | 'invalid-or-expired' | 'verify-failed';

/**
 * A calm line on the account choice: the last attempt from this screen ended
 * without an account (a provider or network failure — never a cancellation,
 * which shows nothing at all).
 */
export type WelcomeAuthNotice = 'attempt-failed';

export interface WelcomeAuthViewState {
  step: WelcomeAuthStep;
  presentation: WelcomeAuthPresentation;
  platform: WelcomeAuthPlatform;
  /**
   * The method whose flow is in flight, or null. While set, every
   * contradictory control is disabled and a restrained progress treatment
   * shows near the action that started it.
   */
  pending: WelcomeAuthMethod | 'password' | null;
  /** The address as typed — preserved across back navigation, never transformed. */
  email: string;
  emailError: EmailErrorKind | null;
  otpError: OtpErrorKind | null;
  recoveryEmail?: string;
  passwordMode?: 'signIn' | 'signUp';
  passwordCanSignUp?: boolean;
  passwordNotice?: 'confirmationRequired' | 'rejected' | 'unreachable' | 'unavailable' | null;
  premiumNotice?: 'no_offering' | 'unavailable' | 'error' | null;
  premiumBusy?: boolean;
  /**
   * Seconds until Resend is enabled again, or null when it is enabled. This
   * is UI state only — it asserts nothing about any backend rate limit.
   */
  resendSecondsLeft: number | null;
  /** Shown on the account choice only, and only while nothing is in flight. Absent means none. */
  notice?: WelcomeAuthNotice | null;
}

/**
 * The callbacks the integration supplies. None of them may write tokens,
 * account state, onboarding state, AsyncStorage or SecureStore, call
 * Supabase, or simulate a successful authentication — they only report her
 * intent upward.
 */
export interface WelcomeAuthCallbacks {
  onBegin: () => void;
  onExistingAccount: () => void;
  onPremiumPlans: () => void;
  onContinueFree: () => void;
  onApple: () => void;
  onGoogle: () => void;
  onChooseEmail: () => void;
  /** Additional email/password method; existing OTP remains available. */
  onChoosePassword?: () => void;
  onPasswordModeChange?: (mode: 'signIn' | 'signUp') => void;
  onSubmitPassword?: (mode: 'signIn' | 'signUp', email: string, password: string) => void;
  onForgotPassword?: (email: string) => void;
  onRequestRecovery?: (email: string) => Promise<import('../../platform/passwordRecoveryProvider').RecoveryResult>;
  onVerifyRecovery?: (email: string, code: string) => Promise<import('../../platform/passwordRecoveryProvider').RecoveryResult>;
  onUpdateRecoveryPassword?: (password: string) => Promise<import('../../platform/passwordRecoveryProvider').RecoveryResult>;
  onCancelRecovery?: () => void;
  onSubmitEmail: (email: string) => void;
  onSubmitOtp: (code: string) => void;
  onResendOtp: () => void;
  onChangeEmail: () => void;
  onBack: () => void;
  /** Rendered only in the account-conflict presentation. */
  onSignOut?: () => void;
}

export const OTP_CODE_LENGTH = 6;
/** The visual cooldown after a resend. UI state only, not a server rate limit. */
export const RESEND_COOLDOWN_SECONDS = 30;

/**
 * Provider order is a product decision, per platform (final): Apple first on
 * iOS where it exists; Google everywhere; email last on both. The account
 * runtime's availability checks still apply on top — this is presentation
 * order, not availability.
 */
export function methodsForPlatform(platform: WelcomeAuthPlatform): WelcomeAuthMethod[] {
  return platform === 'ios' ? ['apple', 'google', 'email'] : ['google', 'email'];
}

/**
 * Obvious-error email check — presentation validation only, deliberately not
 * RFC 5322. "Valid enough" means: not empty, no whitespace, exactly one @,
 * content on both sides, and a plausible domain suffix. The address is
 * compared as typed: never lowercased, never trimmed into a different value.
 */
export function emailObviousError(email: string): Extract<EmailErrorKind, 'invalid-email'> | null {
  if (email.length === 0) return 'invalid-email';
  if (/\s/.test(email)) return 'invalid-email';
  const parts = email.split('@');
  if (parts.length !== 2) return 'invalid-email';
  const [local, domain] = parts;
  if (local.length === 0 || domain.length === 0) return 'invalid-email';
  const dot = domain.lastIndexOf('.');
  if (dot <= 0 || domain.length - dot - 1 < 2) return 'invalid-email';
  return null;
}

/**
 * The back model, identical for the visible back control and Android hardware
 * Back: Welcome is the root (no back), every other step returns one step and
 * the OTP step keeps the entered email. No confirmation dialogs anywhere.
 */
export function stepAfterBack(step: WelcomeAuthStep): WelcomeAuthStep | null {
  switch (step) {
    case 'welcome':
      return null;
    case 'premium':
      return 'welcome';
    case 'account-choice':
      return 'welcome';
    case 'email':
    case 'password':
      return 'account-choice';
    case 'otp':
      return 'email';
    case 'recovery':
      return 'password';
  }
}
