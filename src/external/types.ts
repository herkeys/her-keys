export interface WeatherSnapshot {
  provider: 'weatherkit';
  fetchedAt: string;
  attribution: {
    providerName: string;
    attributionURL: string | null;
    providerLogo: string | null;
  };
  metadata: {
    readTime: string | null;
    expireTime: string | null;
  };
  current: {
    asOf: string | null;
    conditionCode: string | null;
    temperatureC: number | null;
    apparentTemperatureC: number | null;
    daylight: boolean | null;
  };
  daily: Array<{
    forecastStart: string | null;
    forecastEnd: string | null;
    conditionCode: string | null;
    temperatureMinC: number | null;
    temperatureMaxC: number | null;
    precipitationChance: number | null;
    precipitationType: string | null;
  }>;
  hourly: Array<{
    forecastStart: string | null;
    conditionCode: string | null;
    temperatureC: number | null;
    precipitationChance: number | null;
    precipitationType: string | null;
  }>;
}

export interface ExternalCalendarConnection {
  connected: boolean;
  state: 'connected' | 'disconnected' | 'reauth_required' | 'revoked';
  providerAccountId?: string | null;
  scopes?: string[];
  selectedCalendarIds: string[];
  connectedAt?: string;
  lastSyncAt?: string | null;
}

export interface ExternalCalendar {
  id: string;
  summary: string;
  primary: boolean;
  selected: boolean;
  accessRole: string | null;
  timeZone: string | null;
  backgroundColor: string | null;
  foregroundColor: string | null;
}

export interface ExternalCalendarEvent {
  provider: 'google';
  readOnly: true;
  sourceCalendarId: string;
  sourceCalendarSummary: string;
  sourceEventId: string;
  sourceUpdatedAt: string | null;
  lastSyncedAt: string;
  title: string;
  startsAt: string | null;
  startDate: string | null;
  endsAt: string | null;
  endDate: string | null;
  status: string | null;
  transparency: string | null;
  visibility: string | null;
  location: string | null;
  htmlLink: string | null;
  eventType: string;
}

export type ExternalCall<T> =
  | { kind: 'ready'; value: T }
  | { kind: 'unavailable'; reason: string; detail?: string }
  | { kind: 'unauthorized' };
