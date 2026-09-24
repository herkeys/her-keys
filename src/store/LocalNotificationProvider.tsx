import AsyncStorage from '@react-native-async-storage/async-storage';
import { router } from 'expo-router';
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { AppState as NativeAppState, Linking } from 'react-native';
import { isSettled } from '../domain/routeAccess';
import { buildNextTomorrowReminder, type LocalReminderPlan } from '../notifications/localReminderPlan';
import {
  addHerKeysReminderResponseListener,
  cancelHerKeysLocalReminders,
  configureLocalNotificationPresentation,
  readInitialHerKeysReminderRoute,
  readLocalNotificationPermission,
  reconcileHerKeysLocalReminder,
  requestLocalNotificationPermission,
  type LocalNotificationPermission,
} from '../platform/localNotifications';
import { useStoreSnapshot } from './AppStateProvider';

const PREFERENCE_KEY = 'herkeys.localNotifications.v1';

interface LocalNotificationValue {
  /** Device preference/permission have been read; no permission prompt is implied. */
  ready: boolean;
  /** Device-local preference. Effective delivery also requires OS permission. */
  enabled: boolean;
  permission: LocalNotificationPermission;
  busy: boolean;
  nextPlan: LocalReminderPlan | null;
  error: string | null;
  enable(): Promise<void>;
  disable(): Promise<void>;
  openSettings(): Promise<void>;
}

const Context = createContext<LocalNotificationValue | null>(null);

export function LocalNotificationProvider({ children }: { children: ReactNode }) {
  const snapshot = useStoreSnapshot();
  const [preferenceReady, setPreferenceReady] = useState(false);
  const [enabled, setEnabled] = useState(false);
  const [permission, setPermission] = useState<LocalNotificationPermission>('undetermined');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pendingRoute, setPendingRoute] = useState<'/today' | null>(null);

  const nextPlan = useMemo(
    () => (snapshot.state ? buildNextTomorrowReminder(snapshot.state, nowMs) : null),
    [snapshot.state, nowMs]
  );

  useEffect(() => {
    configureLocalNotificationPresentation();

    let live = true;
    void Promise.all([AsyncStorage.getItem(PREFERENCE_KEY), readLocalNotificationPermission()])
      .then(([stored, currentPermission]) => {
        if (!live) return;
        setEnabled(stored === 'enabled');
        setPermission(currentPermission);
        setPreferenceReady(true);
      })
      .catch((cause) => {
        if (!live) return;
        setError(describe(cause));
        setPreferenceReady(true);
      });

    const initial = readInitialHerKeysReminderRoute();
    if (initial) setPendingRoute(initial);
    const removeResponseListener = addHerKeysReminderResponseListener(setPendingRoute);

    return () => {
      live = false;
      removeResponseListener();
    };
  }, []);

  // Re-check the OS permission and household clock when the app returns.
  useEffect(() => {
    const subscription = NativeAppState.addEventListener('change', (state) => {
      if (state !== 'active') return;
      setNowMs(Date.now());
      void readLocalNotificationPermission()
        .then(setPermission)
        .catch((cause) => setError(describe(cause)));
    });
    return () => subscription.remove();
  }, []);

  // A cold-start tap waits until state and guarded navigation are ready.
  useEffect(() => {
    if (!pendingRoute || !snapshot.state || !isSettled(snapshot.status)) return;
    router.push(pendingRoute);
    setPendingRoute(null);
  }, [pendingRoute, snapshot.state, snapshot.status]);

  useEffect(() => {
    if (!preferenceReady || !snapshot.state || !isSettled(snapshot.status)) return;
    let live = true;
    void reconcileHerKeysLocalReminder(enabled, permission, nextPlan).catch((cause) => {
      if (live) setError(describe(cause));
    });
    return () => {
      live = false;
    };
  }, [
    preferenceReady,
    snapshot.state,
    snapshot.status,
    enabled,
    permission,
    nextPlan?.planKey,
    nextPlan?.triggerAtMs,
  ]);

  const enable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      // This is the only path that requests permission, and it is reachable
      // only from an explicit button tap.
      const nextPermission = await requestLocalNotificationPermission();
      setPermission(nextPermission);
      if (nextPermission !== 'granted') {
        setEnabled(false);
        await AsyncStorage.setItem(PREFERENCE_KEY, 'disabled');
        await cancelHerKeysLocalReminders();
        return;
      }
      await AsyncStorage.setItem(PREFERENCE_KEY, 'enabled');
      setEnabled(true);
    } catch (cause) {
      setError(describe(cause));
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const disable = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await AsyncStorage.setItem(PREFERENCE_KEY, 'disabled');
      setEnabled(false);
      await cancelHerKeysLocalReminders();
    } catch (cause) {
      setError(describe(cause));
    } finally {
      setBusy(false);
    }
  }, [busy]);

  const value = useMemo<LocalNotificationValue>(
    () => ({
      ready: preferenceReady,
      enabled,
      permission,
      busy,
      nextPlan,
      error,
      enable,
      disable,
      openSettings: () => Linking.openSettings(),
    }),
    [preferenceReady, enabled, permission, busy, nextPlan, error, enable, disable]
  );

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

export function useLocalNotifications(): LocalNotificationValue {
  const value = useContext(Context);
  if (!value) throw new Error('useLocalNotifications must be used within LocalNotificationProvider');
  return value;
}

function describe(cause: unknown): string {
  return cause instanceof Error ? cause.message : String(cause);
}
