import { HER_KEYS_PREMIUM_DISPLAY_NAME } from './entitlement';
import type { PremiumFeatureState } from './premiumFeatureState';
import type { PaywallOutcome, RestoreOutcome } from './entitlement';

/**
 * Every word Her Keys says about the state of Premium, in one place. The rules these obey (pinned by tests):
 *  - the product is always "Her Keys Premium"; the technical entitlement id never appears;
 *  - nothing claims a benefit that is not delivered, and no number (price, limit, count) is stated that the owner has not approved;
 *  - every state says what she can DO next, and says that her own information and Free tools are untouched;
 *  - nothing blames her, and nothing implies her data is at risk because a subscription changed.
 */
export type PremiumAction = 'upgrade' | 'verify' | 'restore' | 'manage_consent' | 'update_app' | 'retry' | 'none';

export interface PremiumCopy {
  title: string;
  body: string;
  /** The one primary thing she can do. */
  action: PremiumAction;
  actionLabel: string | null;
  /** A secondary affordance, if any (never a second purchase button). */
  secondaryAction: PremiumAction;
  secondaryLabel: string | null;
  tone: 'success' | 'info' | 'attention';
}

const PREMIUM = HER_KEYS_PREMIUM_DISPLAY_NAME;
const FREE_UNTOUCHED = 'Everything free in Her Keys still works.';
const DATA_SAFE = 'Everything you saved is still yours and still here.';

export type DateFormatter = (isoInstant: string) => string;
export const defaultFormatDate: DateFormatter = (iso) => new Date(iso).toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });

const none = { secondaryAction: 'none' as const, secondaryLabel: null };

export function premiumCopyFor(state: PremiumFeatureState, featureName: string, formatDate: DateFormatter = defaultFormatDate): PremiumCopy {
  switch (state.kind) {
    case 'signed_out':
      return { title: `${featureName} is part of ${PREMIUM}`, body: `${PREMIUM} belongs to your Her Keys account. Sign in to your account to use it. ${FREE_UNTOUCHED}`, action: 'none', actionLabel: null, ...none, tone: 'info' };
    case 'loading':
      return { title: `Checking ${PREMIUM}…`, body: 'One moment.', action: 'none', actionLabel: null, ...none, tone: 'info' };
    case 'entitled': {
      if (state.subscription === 'grace') {
        return {
          title: `${PREMIUM} is on, but there’s a payment problem`,
          body: `The store couldn’t renew your subscription. ${PREMIUM} stays on${state.endsOn ? ` until ${formatDate(state.endsOn)}` : ' for now'} while it retries. Please update your payment method in your store account.`,
          action: 'none', actionLabel: null, ...none, tone: 'attention',
        };
      }
      if (state.subscription === 'canceled') {
        return {
          title: `${PREMIUM} is on`,
          body: `Your subscription won’t renew. ${PREMIUM} stays on${state.endsOn ? ` through ${formatDate(state.endsOn)}` : ' for the rest of your paid time'}.`,
          action: 'none', actionLabel: null, ...none, tone: 'success',
        };
      }
      return { title: `${PREMIUM} is on`, body: `${featureName} is ready.`, action: 'none', actionLabel: null, ...none, tone: 'success' };
    }
    case 'free_allowance':
      return { title: `${featureName} is open to you`, body: `You can use ${featureName} on your Free plan. ${PREMIUM} lifts the limit on how much Her Keys does for you.`, action: 'none', actionLabel: null, ...none, tone: 'info' };
    case 'upgrade_required':
      return { title: `${featureName} is part of ${PREMIUM}`, body: `${PREMIUM} has Her Keys do more of the work for you. ${FREE_UNTOUCHED}`, action: 'upgrade', actionLabel: `See ${PREMIUM}`, secondaryAction: 'restore', secondaryLabel: 'Restore purchases', tone: 'info' };
    case 'verification_pending':
      switch (state.cause) {
        case 'checking':
          return { title: 'Confirming your purchase…', body: `The store says your purchase went through. Her Keys is confirming it with your account, which usually takes a few seconds. ${FREE_UNTOUCHED}`, action: 'none', actionLabel: null, ...none, tone: 'info' };
        case 'delayed':
          return { title: 'Your purchase isn’t confirmed yet', body: `The store says you purchased ${PREMIUM}, but Her Keys hasn’t been able to confirm it yet. You haven’t lost anything and you won’t be charged twice. ${FREE_UNTOUCHED}`, action: 'verify', actionLabel: 'Check again', secondaryAction: 'restore', secondaryLabel: 'Restore purchases', tone: 'attention' };
        case 'outage':
          return { title: `Can’t reach ${PREMIUM} right now`, body: `Her Keys couldn’t confirm your subscription just now. Nothing has changed on your account. ${FREE_UNTOUCHED} Try again in a moment.`, action: 'verify', actionLabel: 'Try again', ...none, tone: 'attention' };
        case 'account_mismatch':
          return { title: 'This purchase isn’t on this account', body: `The store has a ${PREMIUM} purchase, but it isn’t attached to the Her Keys account you’re signed in to. If it belongs to another Her Keys account, sign in to that one. Otherwise tap Restore purchases. ${FREE_UNTOUCHED}`, action: 'restore', actionLabel: 'Restore purchases', secondaryAction: 'verify', secondaryLabel: 'Check again', tone: 'attention' };
      }
      break;
    case 'subscription_expired':
      return {
        title: state.revoked ? `Your ${PREMIUM} purchase was refunded` : `Your ${PREMIUM} has ended`,
        body: `New ${featureName} work is paused. ${DATA_SAFE} ${FREE_UNTOUCHED}`,
        action: 'upgrade', actionLabel: `Get ${PREMIUM} again`, secondaryAction: 'restore', secondaryLabel: 'Restore purchases', tone: 'info',
      };
    case 'feature_unavailable':
      switch (state.cause) {
        case 'update_app':
          return { title: 'Update Her Keys to use this', body: `${featureName} needs a newer version of Her Keys. ${FREE_UNTOUCHED}`, action: 'update_app', actionLabel: 'Update', ...none, tone: 'info' };
        case 'disabled':
          return { title: `${featureName} isn’t available yet`, body: `${featureName} isn’t switched on for your account right now. ${FREE_UNTOUCHED}`, action: 'none', actionLabel: null, ...none, tone: 'info' };
        case 'ownership':
          return { title: `${featureName} isn’t available for this household`, body: `${PREMIUM} belongs to the account that bought it and works on that account’s own household. ${FREE_UNTOUCHED}`, action: 'none', actionLabel: null, ...none, tone: 'info' };
        case 'busy':
          return { title: 'Slow down a moment', body: `Her Keys is catching up. Try again in a minute. ${FREE_UNTOUCHED}`, action: 'retry', actionLabel: 'Try again', ...none, tone: 'info' };
        case 'service':
          return { title: `${featureName} is unavailable right now`, body: `Her Keys can’t do this just now. Nothing has changed. ${FREE_UNTOUCHED} Try again later.`, action: 'retry', actionLabel: 'Try again', ...none, tone: 'attention' };
      }
      break;
    case 'consent_required':
      return { title: 'This needs your OK first', body: `${featureName} sends what you give it to an AI service to read. You haven’t allowed that, so Her Keys hasn’t sent anything. You can change this in your privacy choices. ${FREE_UNTOUCHED}`, action: 'manage_consent', actionLabel: 'Review privacy choices', ...none, tone: 'info' };
    case 'usage_limit_reached':
      return {
        title: `You’ve reached this period’s limit`,
        body: `${featureName} is at its limit for now${state.resetsOn ? ` and starts fresh on ${formatDate(state.resetsOn)}` : ''}. ${FREE_UNTOUCHED}`,
        action: state.canUpgrade ? 'upgrade' : 'none', actionLabel: state.canUpgrade ? `See ${PREMIUM}` : null, ...none, tone: 'info',
      };
    case 'account_deactivated':
      return { title: 'This account is being closed', body: `${PREMIUM} actions are paused while your account is being deleted. If this isn’t what you meant, you can restore your account from the deletion notice.`, action: 'none', actionLabel: null, ...none, tone: 'attention' };
  }
  return { title: `${PREMIUM}`, body: FREE_UNTOUCHED, action: 'none', actionLabel: null, ...none, tone: 'info' };
}

/**
 * What she is told right after a paywall or a restore, with the server-verification step in the sentence: "purchase complete" is
 * never claimed as "Premium is on" until the server has said so.
 */
export function purchaseOutcomeNotice(outcome: PaywallOutcome | { kind: 'restore'; restore: RestoreOutcome }): { tone: PremiumCopy['tone']; message: string } | null {
  if (outcome.kind === 'restore') {
    switch (outcome.restore.kind) {
      case 'restored':
        return { tone: 'success', message: `Your purchase was found. Her Keys is confirming ${PREMIUM} on your account.` };
      case 'no_purchases_found':
        return { tone: 'info', message: `No ${PREMIUM} purchase was found for this store account. If you bought it with a different store account or a different Her Keys account, use that one. ${FREE_UNTOUCHED}` };
      case 'unavailable':
        return { tone: 'attention', message: 'Purchases can’t be restored right now. Reconnect your account and try again.' };
      default:
        return { tone: 'attention', message: 'Purchases couldn’t be restored. Try again.' };
    }
  }
  switch (outcome.kind) {
    case 'purchased':
    case 'restored':
      return { tone: 'success', message: `Thank you. Her Keys is confirming ${PREMIUM} on your account.` };
    case 'already_entitled':
      return { tone: 'success', message: `${PREMIUM} is already on your account.` };
    case 'cancelled':
      return { tone: 'info', message: `No purchase was made. You can explore ${PREMIUM} again whenever you’re ready.` };
    case 'no_offering':
      return { tone: 'attention', message: `${PREMIUM} isn’t available to purchase right now. Nothing has changed. ${FREE_UNTOUCHED} Try again later.` };
    case 'unavailable':
      return { tone: 'attention', message: `${PREMIUM} can’t be reached right now. Nothing has changed. ${FREE_UNTOUCHED} Try again later.` };
    case 'error':
      return { tone: 'attention', message: 'Premium couldn’t open right now. Please try again in a moment. If you were charged, use Restore purchases in Your Account.' };
    case 'continued_without_plus':
      return null;
  }
}
