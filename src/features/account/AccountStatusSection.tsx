import { useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { AppState, Linking } from 'react-native';
import { HER_KEYS_LEGAL_URLS } from '../../config/legal';
import { unresolvedEvidence } from '../../domain/sync/syncTypes';
import { createConsentLedger } from '../../platform/consentBackend';
import { readLocationPermissionState, type LocationPermissionState } from '../../platform/deviceLocation';
import { useAiConsentSummary } from '../consent/useAiConsentSummary';
import { AiConsentControl } from '../consent/AiConsentControl';
import { accountRuntime, syncRuntime } from '../../store/accountRuntimeInstance';
import { useAccount } from '../../store/AccountProvider';
import { useLocalNotifications } from '../../store/LocalNotificationProvider';
import { deletionRuntime } from '../../store/deletionRuntimeInstance';
import type { AccountModalMode } from './accountModel';
import { accountStatusGroups, type AccountStatusInput, type StatusActionId } from './accountStatusModel';
import { AccountStatusView, LINK_FAILED_NOTICE } from './AccountStatusView';

/**
 * The wired status section. It reads the REAL state — account state, sync namespace + phase, the account-access gate, the consent
 * ledger, the notification provider and the OS permissions — and hands the model what each says, or "checking" / "could not check".
 * The explicit AI-choice control appends an account-scoped consent receipt; status reads never request OS permissions.
 */
/** The wired section. `onPrivacy` is the account surface's own route into Privacy and Data (delete account); absent when unreachable. */
export function AccountStatusSection({ mode, onPrivacy }: { mode: AccountModalMode; onPrivacy?: () => void }) {
  const { state, syncNamespace } = useAccount();
  const notifications = useLocalNotifications();
  const gate = useSyncExternalStore(deletionRuntime.subscribe, deletionRuntime.getSnapshot, deletionRuntime.getSnapshot);

  // Consent is read only for a bound account with a live session; the read always uses the freshest session at call time.
  const bound = state.kind === 'accountBound' ? state.session : null;
  const accountId = bound === null ? null : bound.accountId;
  const { view: ai, recheck } = useAiConsentSummary(accountId, () => {
    const current = accountRuntime.getState();
    if (current.kind !== 'accountBound' || current.session.accountId !== accountId) return Promise.resolve({ kind: 'unavailable' as const });
    return createConsentLedger(current.session).read();
  });

  const location = useLocationPermission();
  const [notice, setNotice] = useState<string | null>(null);

  const input: AccountStatusInput = {
    mode,
    accessCheckOffline: gate.kind === 'offline_local',
    degradedReason: state.kind === 'authDegraded' ? state.reason : null,
    syncPhase: syncRuntime.snapshot()?.phase ?? null,
    // Only a connected account's namespace is ever read for display: a quarantined phone's namespace belongs to ANOTHER account.
    sync:
      mode !== 'connected' || syncNamespace === null
        ? null
        : {
            pending: syncNamespace.queue.length,
            attention: unresolvedEvidence(syncNamespace).length,
            backlog: syncNamespace.backlog,
            lastSyncedAt: syncNamespace.lastSyncedAt,
          },
    ai,
    notifications: notifications.ready ? { enabled: notifications.enabled, permission: notifications.permission } : null,
    location,
    now: Date.now(),
  };

  const onAction = useCallback(
    (action: StatusActionId) => {
      setNotice(null);
      const failed = () => setNotice(LINK_FAILED_NOTICE);
      switch (action) {
        case 'phone-settings':
          void Linking.openSettings().catch(failed);
          return;
        case 'terms':
          void Linking.openURL(HER_KEYS_LEGAL_URLS.terms).catch(failed);
          return;
        case 'privacy':
          void Linking.openURL(HER_KEYS_LEGAL_URLS.privacy).catch(failed);
          return;
        case 'delete-account':
          onPrivacy?.();
          return;
      }
    },
    [onPrivacy],
  );

  return <>
    <AccountStatusView groups={accountStatusGroups(input, { canManageData: onPrivacy !== undefined })} onAction={onAction} notice={notice} />
    {mode === 'connected' && accountId !== null ? <AiConsentControl key={accountId} view={ai} recheck={recheck} save={(granted) => {
      const current = accountRuntime.getState();
      if (current.kind !== 'accountBound' || current.session.accountId !== accountId) return Promise.resolve({ kind: 'unavailable' as const });
      return createConsentLedger(current.session).changeAiProcessing(granted);
    }} /> : null}
  </>;
}

/** The OS foreground-location permission, re-read whenever the app returns to the foreground (she may have changed it in Settings). */
function useLocationPermission(): LocationPermissionState | null {
  const [permission, setPermission] = useState<LocationPermissionState | null>(null);
  useEffect(() => {
    let live = true;
    const read = () =>
      void readLocationPermissionState().then((next) => {
        if (live) setPermission(next);
      });
    read();
    const subscription = AppState.addEventListener('change', (next) => {
      if (next === 'active') read();
    });
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return permission;
}

