import { HER_KEYS_PREMIUM_DISPLAY_NAME } from './entitlement';
import { defaultFormatDate, type DateFormatter } from './premiumCopy';
import { isHomeEntitled, type PremiumHomeState } from './premiumHomeState';
import type { ManifestEntry } from './premiumTypes';

/**
 * Every word the Premium home says. The rules these obey (pinned by tests/premiumHome/copy.test.mjs):
 *  - the product is always "Her Keys Premium"; the technical entitlement id never appears;
 *  - no price, currency, limit or count appears anywhere: a price is shown only by the store, inside the purchase interface;
 *  - what she is told about her subscription comes from the SERVER's state, never from the store SDK;
 *  - each of the three tools is described only as what it does today, and says nothing is saved or changed without her approval;
 *  - every state says what she can do next and that her information and the Free tools are untouched;
 *  - a state never offers a second Restore Purchases button: the Account surface owns the one control.
 */
const PREMIUM = HER_KEYS_PREMIUM_DISPLAY_NAME;
const FREE_UNTOUCHED = 'Everything free in Her Keys still works.';
const DATA_SAFE = 'Everything you saved is still yours and still here.';
const RESTORE_HINT = 'If you bought it with this store account, use Restore purchases below.';

export type HomeAction = 'upgrade' | 'verify' | 'retry' | 'manage' | 'none';

export interface HomeActionCopy {
  action: Exclude<HomeAction, 'none'>;
  label: string;
}

export interface PremiumHomeCopy {
  /** A short badge: where she stands, in words. */
  status: string;
  title: string;
  body: string;
  tone: 'success' | 'info' | 'attention';
  primary: HomeActionCopy | null;
  /** Opens the platform's own subscriptions screen. Never offered where there is no subscription to manage. */
  manage: HomeActionCopy | null;
}

const MANAGE: HomeActionCopy = { action: 'manage', label: 'Manage subscription' };
const through = (endsOn: string | null, format: DateFormatter, lead: string, fallback: string) => (endsOn ? `${lead} ${format(endsOn)}.` : fallback);

export function premiumHomeCopyFor(state: PremiumHomeState, format: DateFormatter = defaultFormatDate): PremiumHomeCopy {
  switch (state.kind) {
    case 'signed_out':
      return { status: 'Signed out', title: `${PREMIUM} belongs to your account`, body: `Sign in to your Her Keys account to use ${PREMIUM}. ${FREE_UNTOUCHED}`, tone: 'info', primary: null, manage: null };
    case 'loading':
      return { status: 'Checking', title: `Checking ${PREMIUM}…`, body: 'One moment.', tone: 'info', primary: null, manage: null };
    case 'free':
      return {
        status: 'Free plan',
        title: 'You’re on the Free plan',
        body: `${PREMIUM} is being prepared to add three tools that do more of the work for you. Check availability below. ${FREE_UNTOUCHED}`,
        tone: 'info',
        primary: { action: 'upgrade', label: `See ${PREMIUM}` },
        manage: null,
      };
    case 'active':
      if (state.periodType === 'TRIAL') return {
        status: 'Free trial', title: `${PREMIUM} — Free trial`,
        body: `${through(state.trialEndsOn ?? null, format, 'Trial ends', 'Your free trial is active; its end date is not confirmed yet.')} After your trial, your subscription renews automatically unless canceled. Your store subscription settings show your plan and renewal price.`,
        tone: 'success', primary: null, manage: MANAGE,
      };
      if (state.periodType === 'INTRO') return {
        status: 'Introductory offer', title: `${PREMIUM} — Introductory offer`,
        body: `${through(state.endsOn, format, 'Your introductory period runs through', 'Your introductory offer is active.')} Your store subscription settings show your renewal price and terms.`,
        tone: 'success', primary: null, manage: MANAGE,
      };
      return {
        status: 'On',
        title: `${PREMIUM} is on`,
        body: `${through(state.endsOn, format, 'Your current period runs through', 'Your subscription is active.')} Check the availability of each tool below.`,
        tone: 'success',
        primary: null,
        manage: MANAGE,
      };
    case 'canceled_active':
      if (state.periodType === 'TRIAL') return {
        status: 'Trial ending', title: `${PREMIUM} — Trial canceled`,
        body: `${through(state.trialEndsOn ?? null, format, 'Your free trial stays on through', 'Your free trial stays on until its verified end.')} It won’t renew. ${FREE_UNTOUCHED}`,
        tone: 'success', primary: null, manage: MANAGE,
      };
      return {
        status: 'Ending',
        title: `${PREMIUM} is on, and won’t renew`,
        body: `${through(state.endsOn, format, 'It stays on through', 'It stays on for the rest of your paid time.')} You can turn renewal back on in your store subscription settings. ${FREE_UNTOUCHED}`,
        tone: 'success',
        primary: null,
        manage: MANAGE,
      };
    case 'billing_grace':
      return {
        status: 'Payment problem',
        title: `${PREMIUM} is on, but there’s a payment problem`,
        body: `The store couldn’t renew your subscription. ${PREMIUM} stays on${state.endsOn ? ` until ${format(state.endsOn)}` : ' for now'} while it retries. Update your payment method in your store account to keep it.`,
        tone: 'attention',
        primary: null,
        manage: { action: 'manage', label: 'Update payment method' },
      };
    case 'verification_pending':
      return verificationCopy(state.cause, state.canRetry);
    case 'expired':
      return {
        status: 'Ended',
        title: `Your ${PREMIUM} has ended`,
        body: `New work from the three tools is paused. ${DATA_SAFE} ${FREE_UNTOUCHED}`,
        tone: 'info',
        primary: { action: 'upgrade', label: `Get ${PREMIUM} again` },
        manage: null,
      };
    case 'revoked':
      return {
        status: 'Refunded',
        title: `Your ${PREMIUM} purchase was refunded`,
        body: `New work from the three tools is paused. ${DATA_SAFE} ${FREE_UNTOUCHED}`,
        tone: 'info',
        primary: { action: 'upgrade', label: `Get ${PREMIUM} again` },
        manage: null,
      };
    case 'unavailable':
      return {
        status: 'Can’t check right now',
        title: `Can’t reach ${PREMIUM} right now`,
        body: `Her Keys couldn’t check your subscription just now. Nothing has changed on your account. ${FREE_UNTOUCHED} Try again in a moment.`,
        tone: 'attention',
        primary: { action: 'retry', label: 'Try again' },
        manage: null,
      };
    case 'account_closing':
      return {
        status: 'Account closing',
        title: 'This account is being closed',
        body: `${PREMIUM} actions are paused while your account is being deleted. If this isn’t what you meant, you can restore your account from the deletion notice.`,
        tone: 'attention',
        primary: null,
        manage: null,
      };
  }
}

function verificationCopy(cause: 'checking' | 'delayed' | 'account_mismatch' | 'outage', canRetry: boolean): PremiumHomeCopy {
  const check: HomeActionCopy | null = canRetry ? { action: 'verify', label: 'Check again' } : null;
  switch (cause) {
    case 'checking':
      return { status: 'Confirming', title: 'Confirming your purchase…', body: `The store says your purchase went through. Her Keys is confirming it with your account, which usually takes a few seconds. ${FREE_UNTOUCHED}`, tone: 'info', primary: null, manage: MANAGE };
    case 'delayed':
      return { status: 'Not confirmed yet', title: 'Your purchase isn’t confirmed yet', body: `The store says you purchased ${PREMIUM}, but Her Keys hasn’t been able to confirm it yet. Check your store subscription settings before trying to purchase again. ${RESTORE_HINT} ${FREE_UNTOUCHED}`, tone: 'attention', primary: check, manage: MANAGE };
    case 'outage':
      return { status: 'Can’t confirm right now', title: `Can’t reach ${PREMIUM} right now`, body: `Her Keys couldn’t confirm your subscription just now. Nothing has changed on your account. ${FREE_UNTOUCHED} Try again in a moment.`, tone: 'attention', primary: check, manage: MANAGE };
    case 'account_mismatch':
      return { status: 'Different account', title: 'This purchase isn’t on this account', body: `The store has a ${PREMIUM} purchase, but it isn’t attached to the Her Keys account you’re signed in to. If it belongs to another Her Keys account, sign in to that one. Otherwise use Restore purchases below. ${FREE_UNTOUCHED}`, tone: 'attention', primary: check, manage: MANAGE };
  }
}

// ------------------------------------------------------------------------------------------------------------- the three tools

export const PREMIUM_CAPABILITY_KEYS = ['daily_load_premium', 'smart_inbox_extract', 'momentum_report'] as const;
export type PremiumCapabilityKey = (typeof PREMIUM_CAPABILITY_KEYS)[number];

interface CapabilityText {
  name: string;
  summary: string;
  where: string;
}

/** Plain descriptions of what each tool does TODAY. Kept to behaviour that is built; changing a tool means changing this table and its test. */
export const CAPABILITY_TEXT: Readonly<Record<PremiumCapabilityKey, CapabilityText>> = {
  daily_load_premium: {
    name: 'Daily Load review',
    summary: 'When a day looks tight, Her Keys looks at it with you and suggests what could move. Nothing changes until you approve it, and you can undo it.',
    where: 'On Today, beneath your Daily Load, when the day needs it.',
  },
  smart_inbox_extract: {
    name: 'Smart Inbox',
    summary: 'When you capture a note with Talk It Out, Her Keys can read it more closely and propose tasks, events and items for you to review. It sends your note to an AI service only if you have allowed that, and nothing is saved until you approve it.',
    where: 'In Talk It Out, after you capture a note.',
  },
  momentum_report: {
    name: 'Weekly review',
    summary: 'A look back at your week that counts what was actually recorded and shows what each number is based on. It doesn’t score you, and you can save a copy.',
    where: 'On Today, near the bottom.',
  },
};

export type CapabilityStatus = 'ready' | 'included' | 'paused' | 'unavailable';

export interface CapabilityView {
  key: PremiumCapabilityKey;
  name: string;
  summary: string;
  where: string;
  status: CapabilityStatus;
  /** One line that says what the status means for her right now. */
  statusLabel: string;
}

/** `ready` only when the SERVER says she is entitled and the server's own manifest does not switch the tool off. */
export function capabilityViews(state: PremiumHomeState, manifest: readonly ManifestEntry[] | null): CapabilityView[] {
  return PREMIUM_CAPABILITY_KEYS.map((key) => {
    const entry = manifest?.find((item) => item.featureKey === key);
    let status: CapabilityStatus;
    let statusLabel: string;
    if (!entry?.available) {
      status = 'unavailable';
      statusLabel = manifest === null ? 'Checking availability' : 'Not switched on for your account yet';
    } else if (isHomeEntitled(state)) {
      status = 'ready';
      statusLabel = 'Ready';
    } else if (state.kind === 'expired' || state.kind === 'revoked') {
      status = 'paused';
      statusLabel = 'Paused';
    } else if (state.kind === 'account_closing') {
      status = 'paused';
      statusLabel = 'Paused while your account closes';
    } else {
      status = 'included';
      statusLabel = `Part of ${PREMIUM}`;
    }
    return { key, ...CAPABILITY_TEXT[key], status, statusLabel };
  });
}
