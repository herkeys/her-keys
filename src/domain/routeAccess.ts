import { canRenderAccountData, type AccountState } from './account/authState';
import { isOnboardingComplete, onboardingStepAccess } from './onboarding';
import type { Onboarding, OnboardingStep } from './state';

/**
 * Who may open which root screen, decided from application state alone.
 *
 * The root layout declares every root screen through this table and wraps each
 * in `Stack.Protected`, so the table is the routing authority rather than
 * per-screen redirects. Account state is one more condition here, which is why
 * no screen had to learn about authentication.
 *
 * IDENTITY IS PART OF THE FIRST-RUN GATE. The Life Systems Audit and the app
 * open only for a household this device holds under a known account; everyone
 * else gets the welcome tree. Whether Welcome shows is derived, every launch,
 * from three facts — hydration, the restored account state, and onboarding —
 * and from nothing else: there is no "has seen welcome" flag to drift from them,
 * and there is no guest path.
 */

export type HydrationStatus = 'unhydrated' | 'hydrating' | 'ready' | 'recovery';

type Guard = 'entry' | 'app' | 'internal' | 'account' | 'quarantined' | { onboardingStep: OnboardingStep };

export const ROOT_SCREEN_GUARDS = {
  /**
   * The entry: the welcome tree (Welcome, account choice, email, code) for anyone without an account-held household, and
   * the place a signed-in household that has not finished the audit is handed on to the step she had reached.
   */
  index: 'entry',
  'onboarding/goals': { onboardingStep: 'goals' },
  'onboarding/strengths': { onboardingStep: 'strengths' },
  'onboarding/struggles': { onboardingStep: 'struggles' },
  'onboarding/talk-it-out': { onboardingStep: 'talk-it-out' },
  'onboarding/profile': { onboardingStep: 'profile' },
  'onboarding/plus': { onboardingStep: 'plus' },
  '(app)': 'app',
  'talk-it-out': 'app',
  'event-editor': 'app',
  'task-editor': 'app',
  'opportunity-editor': 'app',
  'dev-tools': 'internal',
  /** Development design gallery — same internal-build gate as dev-tools. */
  gallery: 'internal',
  /**
   * Your Account (PP-D04): account status, reconnect, and sign out — for a household this device holds under an account,
   * including while a reconnect is in flight, because that flow is running ON this screen. Signing in for the first time
   * is the welcome tree's job, not this screen's, so it does not open for someone who is signed out.
   */
  'sign-in': 'account',
  /** The one screen a device holding another account's household may open. */
  'account-conflict': 'quarantined',
} as const satisfies Record<string, Guard>;

export type RootScreen = keyof typeof ROOT_SCREEN_GUARDS;

export interface RouteAccessInput {
  status: HydrationStatus;
  onboarding: Onboarding | null;
  internalTools: boolean;
  /** Who the app belongs to right now. The single account authority. */
  account: AccountState;
  /**
   * Whether the stored session has been resolved this launch. Until it has, `account` is only the runtime's starting
   * value: routing on it would show Welcome to a returning account for as long as the restore takes.
   */
  accountSettled: boolean;
}

/** Until state has loaded nothing is decided — no screen opens, so nothing protected can flash. */
export function isSettled(status: HydrationStatus): boolean {
  return status === 'ready' || status === 'recovery';
}

/** Hydration AND the account restore have both answered. Before that, the only thing to show is that we are getting ready. */
export function isRoutingSettled(input: Pick<RouteAccessInput, 'status' | 'accountSettled'>): boolean {
  return isSettled(input.status) && input.accountSettled;
}

export function canOpenScreen(screen: RootScreen, input: RouteAccessInput): boolean {
  if (!isRoutingSettled(input) || input.onboarding === null) return false;

  const guard: Guard = ROOT_SCREEN_GUARDS[screen];
  const account = input.account;

  // A device holding a DIFFERENT account's household opens one screen and no
  // others. The other household is preserved and never rendered -- not even for
  // a frame -- which is only true if the guard runs before anything else
  // (B4-P0-035).
  if (account.kind === 'boundOther') return guard === 'quarantined';
  if (guard === 'quarantined') return false;

  // Internal tooling is a build property, not an account one.
  if (guard === 'internal') return input.internalTools;

  // The household on this device may be shown only once it is known to be THIS
  // account's: bound, or bound with a lapsed credential (local work continues,
  // B4-P0-015). Signed out, a flow in flight, a failed attempt, and signed in
  // but not yet bound are all the same answer here -- not yet -- so a session
  // that is still resolving can never put a household on screen that might turn
  // out to be someone else's.
  const held = canRenderAccountData(account);
  const complete = isOnboardingComplete(input.onboarding);

  // The entry stays open through a sign-in in flight ('authenticating', then
  // binding), so the screen running the flow is never pulled out from under it
  // and the root stack never empties onto Expo Router's system routes (PP-D21).
  if (guard === 'entry') return !held || !complete;

  if (!held) return false;

  // Your Account, for a household this device holds. A reconnect leaves the
  // account degraded until the same account returns, so the modal stays mounted
  // under its own flow.
  if (guard === 'account') return true;

  if (guard === 'app') return complete;
  return !complete && onboardingStepAccess(input.onboarding)[guard.onboardingStep];
}

const APP_TAB_ROUTES = new Set(['today', 'life', 'calendar', 'systems', 'ai']);

/**
 * Which root screen a link lands on, mirroring the file routes under `app/`
 * (the `(app)` group adds no URL segment). Used to check deep links against
 * the guard table; the router itself resolves the real URL.
 */
export function rootScreenForPath(path: string): RootScreen | null {
  const segments = path.split('?')[0].split('/').filter(Boolean);
  if (segments.length === 0) return 'index';

  const [first, second] = segments;
  if (APP_TAB_ROUTES.has(first)) return '(app)';
  if (first === 'talk-it-out' && segments.length === 1) return 'talk-it-out';
  if (first === 'event-editor' && segments.length === 1) return 'event-editor';
  if (first === 'task-editor' && segments.length === 1) return 'task-editor';
  if (first === 'opportunity-editor' && segments.length === 1) return 'opportunity-editor';
  if (first === 'dev-tools' && segments.length === 1) return 'dev-tools';
  if (first === 'sign-in' && segments.length === 1) return 'sign-in';
  if (first === 'account-conflict' && segments.length === 1) return 'account-conflict';
  if (first === 'onboarding' && segments.length === 2) {
    const screen = `onboarding/${second}`;
    return screen in ROOT_SCREEN_GUARDS ? (screen as RootScreen) : null;
  }
  return null;
}
