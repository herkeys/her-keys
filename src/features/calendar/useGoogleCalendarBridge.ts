import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, toInstant, zonedTimeToEpochMs } from '../../domain/logicalDay';
import type { ExternalCalendar, ExternalCalendarEvent } from '../../external/types';
import { isCalendarConnectedReturn } from '../../platform/systemLinks';
import { useOptionalAccount } from '../../store/AccountProvider';
import { externalIntelligenceClient } from '../../store/accountRuntimeInstance';

type Availability = 'checking' | 'dormant' | 'disconnected' | 'connected' | 'reauth_required' | 'error';

const HER_KEYS_CALENDAR_REDIRECT_URI = 'herkeys://calendar-connected';
const COMPLETION_HANDLE = /^[A-Za-z0-9_-]{43}$/;

/**
 * The single-use completion handle from Google's return to the app, or null. Only the exact Calendar return with `status=authorized`
 * carries one; anything else (cancelled, an error, a malformed or foreign URL) yields null and nothing is redeemed. Parsed by hand:
 * React Native's URL polyfill does not reliably support custom schemes or `searchParams`.
 */
export function completionHandleOf(url: string | undefined): string | null {
  if (typeof url !== 'string' || url.length > 1024 || !isCalendarConnectedReturn(url)) return null;
  // Only the full app return the auth session captured; never the router's bare path forms the matcher also accepts.
  if (!url.toLowerCase().startsWith(HER_KEYS_CALENDAR_REDIRECT_URI)) return null;
  const at = url.indexOf('?');
  if (at < 0) return null;
  const query = url.slice(at + 1).split('#')[0];
  const params = new Map<string, string>();
  for (const pair of query.split('&')) {
    const [key, value = ''] = pair.split('=');
    if (params.has(key)) return null;
    params.set(key, value);
  }
  const handle = params.get('handle') ?? '';
  return params.get('status') === 'authorized' && COMPLETION_HANDLE.test(handle) ? handle : null;
}

export interface GoogleCalendarBridge {
  availability: Availability;
  calendars: ExternalCalendar[];
  selectedCalendarIds: string[];
  events: ExternalCalendarEvent[];
  busy: boolean;
  error: string | null;
  connect(): Promise<void>;
  disconnect(): Promise<void>;
  toggleCalendar(id: string): Promise<void>;
  refresh(): Promise<void>;
}

export function useGoogleCalendarBridge(selectedDate: string, timezone: string, loadEvents: boolean): GoogleCalendarBridge {
  const account = useOptionalAccount();
  // Every provider answer is about ONE account and ONE requested day. A reload starts whenever either changes, and an answer is
  // applied only if no newer request (another day, another account, a disconnect, a calendar choice, unmount) has started since it
  // was asked. Without this fence a slow answer for the previous day, or for an account that has since signed out, overwrote the
  // newer one (HK-V2ACT-CAL-01).
  const accountKey = account?.state.kind === 'accountBound' ? account.state.session.accountId : null;
  const currentAccount = useRef(accountKey);
  currentAccount.current = accountKey;
  const generation = useRef(0);
  const begin = useCallback(() => {
    generation.current += 1;
    const mine = generation.current;
    return () => mine === generation.current;
  }, []);
  const [availability, setAvailability] = useState<Availability>('checking');
  const [calendars, setCalendars] = useState<ExternalCalendar[]>([]);
  const [selectedCalendarIds, setSelectedCalendarIds] = useState<string[]>([]);
  const [events, setEvents] = useState<ExternalCalendarEvent[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const range = useMemo(() => {
    const start = zonedTimeToEpochMs(selectedDate, 0, timezone);
    const end = zonedTimeToEpochMs(addDays(selectedDate, 1), 0, timezone);
    return { timeMin: toInstant(start), timeMax: toInstant(end) };
  }, [selectedDate, timezone]);

  const loadConnected = useCallback(async (current: () => boolean) => {
    const calendarResult = await externalIntelligenceClient.listCalendars();
    if (!current()) return;
    if (calendarResult.kind !== 'ready') {
      setAvailability(calendarResult.kind === 'unauthorized' ? 'dormant' : 'error');
      setError(calendarResult.kind === 'unavailable' ? calendarResult.reason : null);
      return;
    }
    setCalendars(calendarResult.value.calendars);
    setSelectedCalendarIds(calendarResult.value.selectedCalendarIds);

    if (!loadEvents) {
      setEvents([]);
      setAvailability('connected');
      setError(null);
      return;
    }

    const eventResult = await externalIntelligenceClient.calendarEvents(range.timeMin, range.timeMax);
    if (!current()) return;
    if (eventResult.kind === 'ready') {
      setEvents(eventResult.value.events);
      setAvailability('connected');
      setError(null);
    } else {
      setEvents([]);
      setAvailability(eventResult.kind === 'unauthorized' ? 'dormant' : 'error');
      setError(eventResult.kind === 'unavailable' ? eventResult.reason : null);
    }
  }, [range.timeMin, range.timeMax, loadEvents]);

  const refresh = useCallback(async () => {
    const current = begin();
    if (accountKey === null) {
      setAvailability('dormant');
      setCalendars([]);
      setEvents([]);
      return;
    }

    const status = await externalIntelligenceClient.calendarStatus();
    if (!current()) return;
    if (status.kind === 'unauthorized') {
      setAvailability('dormant');
      return;
    }
    if (status.kind === 'unavailable') {
      // Missing provider credentials or an undeployed scaffold should not make
      // an unfinished integration appear in the released UI.
      setAvailability('dormant');
      setError(null);
      return;
    }

    if (!status.value.connected) {
      setAvailability(status.value.state === 'reauth_required' ? 'reauth_required' : 'disconnected');
      setSelectedCalendarIds(status.value.selectedCalendarIds ?? []);
      setCalendars([]);
      setEvents([]);
      setError(null);
      return;
    }

    await loadConnected(current);
  }, [accountKey, begin, loadConnected]);

  useEffect(() => {
    let live = true;
    setAvailability('checking');
    // Another account or another day must never show the previous one's calendars or events while it loads.
    setCalendars([]);
    setEvents([]);
    void refresh().catch((cause) => {
      if (!live) return;
      setAvailability('error');
      setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => {
      live = false;
      // Unmount, or a new account/day: every answer still in flight is now stale.
      generation.current += 1;
    };
  }, [refresh]);

  const connect = useCallback(async () => {
    if (busy || accountKey === null) return;
    // The account that starts consent is the only one that may finish it (HK-V2ACT-CAL-03). The server enforces that; the app also
    // never redeems a handle once the account on screen has changed.
    const startedFor = accountKey;
    setBusy(true);
    setError(null);
    try {
      const result = await externalIntelligenceClient.beginCalendarConnection();
      if (result.kind !== 'ready') {
        setAvailability(result.kind === 'unavailable' ? 'dormant' : 'error');
        setError(result.kind === 'unavailable' ? result.reason : null);
        return;
      }

      WebBrowser.maybeCompleteAuthSession();
      const browser = await WebBrowser.openAuthSessionAsync(result.value.authorizationUrl, HER_KEYS_CALENDAR_REDIRECT_URI);
      if (browser.type !== 'success' || currentAccount.current !== startedFor) return;
      const handle = completionHandleOf(browser.url);
      if (handle !== null) {
        const completed = await externalIntelligenceClient.completeCalendarConnection(handle);
        if (currentAccount.current !== startedFor) return;
        if (completed.kind !== 'ready') {
          setAvailability('error');
          setError(completed.kind === 'unavailable' ? completed.reason : null);
          return;
        }
      }
      // Cancelled, refused or completed: the server's answer is what the panel shows.
      await refresh();
    } catch (cause) {
      setAvailability('error');
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setBusy(false);
    }
  }, [busy, accountKey, refresh]);

  const disconnect = useCallback(async () => {
    if (busy) return;
    // A disconnect supersedes any load still in flight: that load's answer must not reinstate the calendars being removed.
    const current = begin();
    setBusy(true);
    setError(null);
    try {
      const result = await externalIntelligenceClient.disconnectCalendar();
      if (!current()) return;
      if (result.kind === 'ready') {
        setAvailability('disconnected');
        setCalendars([]);
        setSelectedCalendarIds([]);
        setEvents([]);
      } else {
        setError(result.kind === 'unavailable' ? result.reason : 'Could not disconnect Google Calendar');
      }
    } finally {
      setBusy(false);
    }
  }, [busy, begin]);

  const toggleCalendar = useCallback(async (id: string) => {
    if (busy) return;
    const next = selectedCalendarIds.includes(id)
      ? selectedCalendarIds.filter((value) => value !== id)
      : [...selectedCalendarIds, id];
    const current = begin();
    setBusy(true);
    setError(null);
    try {
      const result = await externalIntelligenceClient.selectCalendars(next);
      if (!current()) return;
      if (result.kind === 'ready') {
        setSelectedCalendarIds(result.value.selectedCalendarIds);
        await loadConnected(current);
      } else {
        setError(result.kind === 'unavailable' ? result.reason : 'Could not change calendars');
      }
    } finally {
      setBusy(false);
    }
  }, [busy, begin, selectedCalendarIds, loadConnected]);

  return {
    availability,
    calendars,
    selectedCalendarIds,
    events,
    busy,
    error,
    connect,
    disconnect,
    toggleCalendar,
    refresh,
  };
}
