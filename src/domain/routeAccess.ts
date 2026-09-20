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
 */

export type HydrationStatus = 'unhydrated' | 'hydrating' | 'ready' | 'recovery';

type Guard = 'onboarding' | 'app' | 'internal' | 'signedOut' | 'quarantined' | { onboardingStep: OnboardingStep };

export const ROOT_SCREEN_GUARDS = {
  index: 'onboarding',
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
  'dev-tools': 'internal',
  'sign-in': 'signedOut',
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
}

/** Until state has loaded nothing is decided — no screen opens, so nothing protected can flash. */
export function isSettled(status: HydrationStatus): boolean {
  return status === 'ready' || status === 'recovery';
}

export function canOpenScreen(screen: RootScreen, input: RouteAccessInput): boolean {
  if (!isSettled(input.status) || input.onboarding === null) return false;

  const guard: Guard = ROOT_SCREEN_GUARDS[screen];
  const account = input.account;

  // A device holding a DIFFERENT account's household opens one screen and no
  // others. The other household is preserved and never rendered -- not even for
  // a frame -- which is only true if the guard runs before anything else
  // (B4-P0-035).
  if (account.kind === 'boundOther') return guard === 'quarantined';
  if (guard === 'quarantined') return false;

  // A provider flow is in flight. Deciding now would decide on a state that is
  // about to change, so nothing opens until it settles.
  if (account.kind === 'authenticating') return false;

  if (guard === 'signedOut') return !canRenderAccountData(account);

  const complete = isOnboardingComplete(input.onboarding);
  if (guard === 'app') return complete;
  if (guard === 'onboarding') return !complete;
  if (guard === 'internal') return input.internalTools;
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
  if (first === 'dev-tools' && segments.length === 1) return 'dev-tools';
  if (first === 'sign-in' && segments.length === 1) return 'sign-in';
  if (first === 'account-conflict' && segments.length === 1) return 'account-conflict';
  if (first === 'onboarding' && segments.length === 2) {
    const screen = `onboarding/${second}`;
    return screen in ROOT_SCREEN_GUARDS ? (screen as RootScreen) : null;
  }
  return null;
}
