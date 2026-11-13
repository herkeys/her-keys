import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { addDays, toInstant, zonedTimeToEpochMs } from '../../domain/logicalDay';
import type { ExternalCalendar, ExternalCalendarEvent } from '../../external/types';
import { useOptionalAccount } from '../../store/AccountProvider';
import { externalIntelligenceClient } from '../../store/accountRuntimeInstance';

type Availability = 'checking' | 'dormant' | 'disconnected' | 'connected' | 'reauth_required' | 'error';

const HER_KEYS_CALENDAR_REDIRECT_URI = 'herkeys://calendar-connected';

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
      if (browser.type === 'success') await refresh();
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
