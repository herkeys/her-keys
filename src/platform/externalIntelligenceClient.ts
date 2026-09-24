import type { SupabaseClient } from '@supabase/supabase-js';
import type {
  ExternalCall,
  ExternalCalendar,
  ExternalCalendarConnection,
  ExternalCalendarEvent,
  WeatherSnapshot,
} from '../external/types';

export interface ExternalIntelligenceClient {
  weather(input: {
    latitude: number;
    longitude: number;
    timezone: string;
    countryCode?: string | null;
    language?: string;
  }): Promise<ExternalCall<WeatherSnapshot>>;
  calendarStatus(): Promise<ExternalCall<ExternalCalendarConnection>>;
  beginCalendarConnection(): Promise<ExternalCall<{ authorizationUrl: string; redirectUri: string; scopes: string[] }>>;
  listCalendars(): Promise<ExternalCall<{ calendars: ExternalCalendar[]; selectedCalendarIds: string[] }>>;
  selectCalendars(ids: string[]): Promise<ExternalCall<{ selectedCalendarIds: string[] }>>;
  calendarEvents(timeMin: string, timeMax: string): Promise<ExternalCall<{ events: ExternalCalendarEvent[]; syncedAt: string }>>;
  disconnectCalendar(): Promise<ExternalCall<ExternalCalendarConnection>>;
}

export function createExternalIntelligenceClient(client: SupabaseClient): ExternalIntelligenceClient {
  const invoke = async <T>(name: string, body: Record<string, unknown>): Promise<ExternalCall<T>> => {
    try {
      const { data, error } = await client.functions.invoke(name, { body });
      if (error) {
        const status = typeof (error as { context?: { status?: unknown } }).context?.status === 'number'
          ? (error as { context: { status: number } }).context.status
          : null;
        if (status === 401) return { kind: 'unauthorized' };
        const reason =
          data && typeof data === 'object' && typeof (data as Record<string, unknown>).reason === 'string'
            ? String((data as Record<string, unknown>).reason)
            : 'function_unavailable';
        return { kind: 'unavailable', reason, detail: error.message };
      }
      if (data && typeof data === 'object' && (data as Record<string, unknown>).status === 'unavailable') {
        return {
          kind: 'unavailable',
          reason: String((data as Record<string, unknown>).reason ?? 'unavailable'),
        };
      }
      return { kind: 'ready', value: data as T };
    } catch (error) {
      return { kind: 'unavailable', reason: 'network_unavailable', detail: error instanceof Error ? error.message : String(error) };
    }
  };

  return {
    async weather(input) {
      const result = await invoke<{ status: 'ready'; weather: WeatherSnapshot }>('weather-context', input);
      return result.kind === 'ready' ? { kind: 'ready', value: result.value.weather } : result;
    },
    async calendarStatus() {
      const result = await invoke<{ status: 'ready'; connection: ExternalCalendarConnection }>('calendar-data', { action: 'status' });
      return result.kind === 'ready' ? { kind: 'ready', value: result.value.connection } : result;
    },
    beginCalendarConnection: () =>
      invoke<{ authorizationUrl: string; redirectUri: string; scopes: string[] }>('calendar-oauth', {}),
    async listCalendars() {
      const result = await invoke<{ status: 'ready'; calendars: ExternalCalendar[]; selectedCalendarIds: string[] }>(
        'calendar-data',
        { action: 'listCalendars' },
      );
      return result.kind === 'ready'
        ? { kind: 'ready', value: { calendars: result.value.calendars, selectedCalendarIds: result.value.selectedCalendarIds } }
        : result;
    },
    async selectCalendars(ids) {
      const result = await invoke<{ status: 'ready'; selectedCalendarIds: string[] }>('calendar-data', {
        action: 'selectCalendars',
        selectedCalendarIds: ids,
      });
      return result.kind === 'ready' ? { kind: 'ready', value: { selectedCalendarIds: result.value.selectedCalendarIds } } : result;
    },
    async calendarEvents(timeMin, timeMax) {
      const result = await invoke<{ status: 'ready'; events: ExternalCalendarEvent[]; syncedAt: string }>('calendar-data', {
        action: 'listEvents',
        timeMin,
        timeMax,
      });
      return result.kind === 'ready'
        ? { kind: 'ready', value: { events: result.value.events, syncedAt: result.value.syncedAt } }
        : result;
    },
    async disconnectCalendar() {
      const result = await invoke<{ status: 'ready'; connection: ExternalCalendarConnection }>('calendar-data', { action: 'disconnect' });
      return result.kind === 'ready' ? { kind: 'ready', value: result.value.connection } : result;
    },
  };
}

export const UNCONFIGURED_EXTERNAL_INTELLIGENCE: ExternalIntelligenceClient = {
  weather: async () => ({ kind: 'unavailable', reason: 'supabase_not_configured' }),
  calendarStatus: async () => ({ kind: 'unavailable', reason: 'supabase_not_configured' }),
  beginCalendarConnection: async () => ({ kind: 'unavailable', reason: 'supabase_not_configured' }),
  listCalendars: async () => ({ kind: 'unavailable', reason: 'supabase_not_configured' }),
  selectCalendars: async () => ({ kind: 'unavailable', reason: 'supabase_not_configured' }),
  calendarEvents: async () => ({ kind: 'unavailable', reason: 'supabase_not_configured' }),
  disconnectCalendar: async () => ({ kind: 'unavailable', reason: 'supabase_not_configured' }),
};
