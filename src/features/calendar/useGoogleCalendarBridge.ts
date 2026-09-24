import * as WebBrowser from 'expo-web-browser';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { addDays, toInstant, zonedTimeToEpochMs } from '../../domain/logicalDay';
import type { ExternalCalendar, ExternalCalendarEvent } from '../../external/types';
import { useAccount } from '../../store/AccountProvider';
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
  const account = useAccount();
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

  const loadConnected = useCallback(async () => {
    const calendarResult = await externalIntelligenceClient.listCalendars();
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
    if (account.state.kind !== 'accountBound') {
      setAvailability('dormant');
      setCalendars([]);
      setEvents([]);
      return;
    }

    const status = await externalIntelligenceClient.calendarStatus();
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

    await loadConnected();
  }, [account.state.kind, loadConnected]);

  useEffect(() => {
    let live = true;
    setAvailability('checking');
    void refresh().catch((cause) => {
      if (!live) return;
      setAvailability('error');
      setError(cause instanceof Error ? cause.message : String(cause));
    });
    return () => {
      live = false;
    };
  }, [refresh]);

  const connect = useCallback(async () => {
    if (busy || account.state.kind !== 'accountBound') return;
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
  }, [busy, account.state.kind, refresh]);

  const disconnect = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result = await externalIntelligenceClient.disconnectCalendar();
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
  }, [busy]);

  const toggleCalendar = useCallback(async (id: string) => {
    if (busy) return;
    const next = selectedCalendarIds.includes(id)
      ? selectedCalendarIds.filter((value) => value !== id)
      : [...selectedCalendarIds, id];
    setBusy(true);
    setError(null);
    try {
      const result = await externalIntelligenceClient.selectCalendars(next);
      if (result.kind === 'ready') {
        setSelectedCalendarIds(result.value.selectedCalendarIds);
        await loadConnected();
      } else {
        setError(result.kind === 'unavailable' ? result.reason : 'Could not change calendars');
      }
    } finally {
      setBusy(false);
    }
  }, [busy, selectedCalendarIds, loadConnected]);

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
