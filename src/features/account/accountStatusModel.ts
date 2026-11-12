import type { DegradedReason } from '../../domain/account/authState';
import type { SyncPhase } from '../../domain/sync/syncTypes';
import type { LocationPermissionState } from '../../platform/deviceLocation';
import type { LocalNotificationPermission } from '../../platform/localNotifications';
import type { AiConsentView } from '../consent/consentSummary';
import { syncNoticeLine } from '../today/syncNoticeLine';
import type { AccountModalMode } from './accountModel';

/**
 * Your Account, at a glance — what is true right now, in plain words, derived ONLY from state the app already owns.
 *
 * Every row reads a real source and says "could not check" rather than guess:
 *  - account           the AccountState (via `accountModalMode`);
 *  - sync / offline    the sync namespace (queue, unresolved evidence, backlog, last sync), the live sync phase, and the account-access
 *                      gate's `offline_local` answer — there is no network probe here, so "Offline" is shown only when one of those
 *                      real signals says the cloud could not be reached;
 *  - AI processing     the account's consent ledger, decided by `consentStatus` (see ../consent/consentSummary);
 *  - notifications     the LocalNotificationProvider's preference + the OS permission;
 *  - location          the OS foreground-location permission, read without prompting;
 *  - camera & photos   not a status at all: the camera is asked only at the moment she chooses it, and photos use the system picker.
 *
 * Pure. It changes nothing and stores nothing; each row that can be acted on names the action, and the screen performs it.
 */

export type StatusActionId = 'phone-settings' | 'terms' | 'privacy' | 'delete-account';

export interface StatusRowModel {
  key: 'account' | 'sync' | 'ai' | 'notifications' | 'location' | 'media' | 'terms' | 'privacy' | 'delete';
  label: string;
  value: string;
  /** One honest sentence of context, shown under the row and spoken with it. */
  detail?: string;
  /** Marks the row as wanting her. Never a fault colour on its own: it is paired with the words. */
  needsAttention?: boolean;
  action?: { id: StatusActionId; hint: string };
}

export interface StatusGroupModel {
  key: 'setup' | 'permissions' | 'legal';
  title: string;
  rows: StatusRowModel[];
}

export interface SyncFacts {
  /** Changes made on this phone that the cloud has not acknowledged yet. */
  pending: number;
  /** Unresolved sync evidence (conflicts / refusals). */
  attention: number;
  /** The queue or the evidence store is full; work stops before intent is lost. */
  backlog: boolean;
  lastSyncedAt: string | null;
}

export interface AccountStatusInput {
  mode: AccountModalMode;
  /** The account-access gate could not check online and is letting this phone's own household open (`offline_local`). */
  accessCheckOffline: boolean;
  /** Why a bound account lost its credential, when it has. */
  degradedReason: DegradedReason | null;
  /** The sync runtime's current phase, or null when nothing is running. */
  syncPhase: SyncPhase | null;
  /** The bound account's sync namespace, or null. */
  sync: SyncFacts | null;
  ai: AiConsentView;
  /** null until the provider has read the device's preference and the OS permission. */
  notifications: { enabled: boolean; permission: LocalNotificationPermission } | null;
  /** null until read. */
  location: LocationPermissionState | null;
  now: number;
}

/** "just now", "5 min ago", "3 hr ago", or the date. Null for a timestamp that cannot be read or lies in the future by more than a minute. */
export function describeLastSynced(iso: string | null, now: number): string | null {
  if (iso === null) return null;
  const at = Date.parse(iso);
  if (!Number.isFinite(at)) return null;
  const elapsed = now - at;
  if (elapsed < -60_000) return null;
  if (elapsed < 60_000) return 'just now';
  const minutes = Math.floor(elapsed / 60_000);
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(at).toLocaleDateString();
}

const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);

function accountRow(input: AccountStatusInput): StatusRowModel {
  const label = 'Account';
  switch (input.mode) {
    case 'connected':
      return { key: 'account', label, value: 'Signed in', detail: 'Your household is connected to this account on this phone.' };
    case 'reconnect':
      return { key: 'account', label, value: 'Sign in again', detail: 'Nothing on this phone was removed. Signing in again reconnects the same account.', needsAttention: true };
    case 'resolving':
      return { key: 'account', label, value: 'Connecting…', detail: 'Everything on this phone stays exactly as it is.' };
    case 'quarantined':
      return { key: 'account', label, value: 'A different account is signed in', detail: 'This phone’s household belongs to another account, so it is kept separate and not shown.', needsAttention: true };
    case 'unavailable':
      return { key: 'account', label, value: 'Not set up in this build', detail: 'Her Keys keeps working on this phone.' };
    case 'signIn':
      return { key: 'account', label, value: 'Not signed in', detail: 'Your information stays on this phone until you connect an account.' };
  }
}

function syncRow(input: AccountStatusInput): StatusRowModel {
  const label = 'Sync';
  const saved = 'Your changes are saved on this phone.';
  switch (input.mode) {
    case 'signIn':
    case 'unavailable':
      return { key: 'sync', label, value: 'Off — this phone only', detail: input.mode === 'signIn' ? 'Signing in connects eligible records to your account.' : undefined };
    case 'quarantined':
      return { key: 'sync', label, value: 'Off', detail: 'Nothing from this phone is uploaded while another account is signed in.' };
    case 'resolving':
      return { key: 'sync', label, value: 'Connecting…' };
    case 'reconnect':
      return input.degradedReason === 'offline'
        ? { key: 'sync', label, value: 'Offline', detail: `${saved} They sync once you are online and signed in again.` }
        : { key: 'sync', label, value: 'Paused until you sign in again', detail: saved };
    case 'connected':
      break;
  }

  const facts = input.sync;
  const pending = facts?.pending ?? 0;
  const attention = facts?.attention ?? 0;
  if (input.accessCheckOffline) {
    return { key: 'sync', label, value: 'Offline', detail: 'Sync is paused until account access is checked online. Your saved household is available on this phone.' };
  }
  if (input.syncPhase === 'offline') {
    return {
      key: 'sync',
      label,
      value: 'Offline',
      detail: pending > 0 ? `${pending} ${plural(pending, 'change is', 'changes are')} waiting here and will sync when you are back online.` : `${saved} They sync when you are back online.`,
    };
  }
  if (attention > 0 || facts?.backlog === true || input.syncPhase === 'conflicted' || input.syncPhase === 'backlog') {
    return { key: 'sync', label, value: syncNoticeLine(attention), detail: 'Nothing was lost; the changes are kept on this phone.', needsAttention: true };
  }
  if (input.syncPhase === 'error') {
    return { key: 'sync', label, value: 'Sync hit a problem', detail: `${saved} It will try again.`, needsAttention: true };
  }
  if (pending > 0) {
    return { key: 'sync', label, value: `${pending} ${plural(pending, 'change', 'changes')} waiting to sync`, detail: saved };
  }
  if (input.syncPhase === 'hydrating' || input.syncPhase === 'pulling' || input.syncPhase === 'pushing') {
    return { key: 'sync', label, value: 'Syncing…' };
  }
  const last = describeLastSynced(facts?.lastSyncedAt ?? null, input.now);
  return last === null
    ? { key: 'sync', label, value: 'Not synced yet', detail: saved }
    : { key: 'sync', label, value: 'Up to date', detail: `Last synced ${last}.` };
}

function aiRow(input: AccountStatusInput): StatusRowModel {
  const label = 'AI processing';
  const AI_OFF_NEEDS_ACCOUNT = 'AI features need a signed-in account and your choice.';
  switch (input.mode) {
    case 'signIn':
    case 'unavailable':
      return { key: 'ai', label, value: 'Off', detail: AI_OFF_NEEDS_ACCOUNT };
    case 'quarantined':
      return { key: 'ai', label, value: 'Off', detail: 'AI features are not available while another account is signed in.' };
    case 'reconnect':
      return { key: 'ai', label, value: 'Sign in to check', detail: 'Your choice is kept with your account. AI features stay off until you are signed in.' };
    case 'resolving':
      return { key: 'ai', label, value: 'Checking…' };
    case 'connected':
      break;
  }
  switch (input.ai.kind) {
    case 'not-applicable':
    case 'checking':
      return { key: 'ai', label, value: 'Checking…' };
    case 'unavailable':
      return { key: 'ai', label, value: 'Could not check right now', detail: 'Check your connection. AI features stay off until your choice can be confirmed.' };
    case 'known':
      if (input.ai.aiPermitted) {
        return {
          key: 'ai',
          label,
          value: 'On',
          detail: 'Information you choose to share with AI features may be processed by external AI providers, including Google Gemini. The Privacy Policy has the details.',
        };
      }
      return input.ai.aiDecisionRecorded
        ? { key: 'ai', label, value: 'Off', detail: 'You chose to continue without AI data processing. AI features stay off; everything else works as usual.' }
        : { key: 'ai', label, value: 'Not chosen yet', detail: 'AI features stay off until you choose.' };
  }
}

function notificationsRow(input: AccountStatusInput): StatusRowModel {
  const label = 'Notifications';
  const n = input.notifications;
  if (n === null) return { key: 'notifications', label, value: 'Checking…' };
  if (n.permission === 'denied') {
    return {
      key: 'notifications',
      label,
      value: 'Off in phone settings',
      detail: 'Her Keys won’t change that setting itself.',
      action: { id: 'phone-settings', hint: 'Opens your phone’s settings for Her Keys' },
    };
  }
  if (n.enabled && n.permission === 'granted') {
    return { key: 'notifications', label, value: 'On', detail: 'One quiet evening heads-up when tomorrow has something worth reviewing. Names and private details stay inside the app.' };
  }
  return { key: 'notifications', label, value: 'Not turned on', detail: 'Her Keys asks only when you turn on a reminder.' };
}

function locationRow(input: AccountStatusInput): StatusRowModel {
  const label = 'Location';
  switch (input.location) {
    case null:
      return { key: 'location', label, value: 'Checking…' };
    case 'granted':
      return { key: 'location', label, value: 'Allowed while you use the app', detail: 'Used only for Weather, as an approximate place, and not stored.' };
    case 'denied':
      return {
        key: 'location',
        label,
        value: 'Off in phone settings',
        detail: 'Weather needs an approximate location to show local conditions.',
        action: { id: 'phone-settings', hint: 'Opens your phone’s settings for Her Keys' },
      };
    case 'undetermined':
      return { key: 'location', label, value: 'Not asked yet', detail: 'Her Keys asks only when you ask Weather to use your location.' };
    case 'unknown':
      return { key: 'location', label, value: 'Could not check' };
  }
}

const MEDIA_ROW: StatusRowModel = {
  key: 'media',
  label: 'Camera and photos',
  value: 'Only when you scan',
  detail: 'Choosing a photo uses your phone’s own picker and shares only the photo you pick. The camera is asked for only if you choose Take photo.',
};

/** The groups Your Account shows, in order. `canManageData` is whether the data / delete-account surface is reachable from here. */
export function accountStatusGroups(input: AccountStatusInput, options: { canManageData: boolean }): StatusGroupModel[] {
  const legal: StatusRowModel[] = [
    { key: 'terms', label: 'Terms and Conditions', value: 'Read', action: { id: 'terms', hint: 'Opens the Terms and Conditions' } },
    { key: 'privacy', label: 'Privacy Policy', value: 'Read', action: { id: 'privacy', hint: 'Opens the Privacy Policy' } },
  ];
  if (options.canManageData) {
    legal.push({
      key: 'delete',
      label: 'Privacy and data',
      value: 'Delete your account',
      detail: 'See what deleting removes and how recovery works before you decide.',
      action: { id: 'delete-account', hint: 'Opens Privacy and Data, where you can delete your account' },
    });
  }
  return [
    { key: 'setup', title: 'Your setup', rows: [accountRow(input), syncRow(input), aiRow(input)] },
    { key: 'permissions', title: 'On this phone', rows: [notificationsRow(input), locationRow(input), MEDIA_ROW] },
    { key: 'legal', title: 'Legal and data', rows: legal },
  ];
}

/** What a screen reader says for one row: the whole statement, so detail is never visible-only. */
export function statusRowSpeech(row: StatusRowModel): string {
  return row.detail ? `${row.label}: ${row.value}. ${row.detail}` : `${row.label}: ${row.value}`;
}
