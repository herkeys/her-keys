import { AuthError, adminClient, requireUser } from '../_shared/supabaseAdmin.ts';
import { decryptSecret } from '../_shared/crypto.ts';
import { json, options } from '../_shared/http.ts';

type Connection = {
  id: string;
  user_id: string;
  provider_account_id: string | null;
  scopes: string[];
  refresh_token_ciphertext: string;
  refresh_token_iv: string;
  selected_calendar_ids: string[];
  status: 'connected' | 'reauth_required' | 'revoked';
  connected_at: string;
  updated_at: string;
  last_sync_at: string | null;
};

type ActionBody = {
  action?: unknown;
  selectedCalendarIds?: unknown;
  timeMin?: unknown;
  timeMax?: unknown;
};

function configured(): boolean {
  return Boolean(
    Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID') &&
    Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET') &&
    Deno.env.get('EXTERNAL_TOKEN_ENCRYPTION_KEY_B64')
  );
}

async function connectionFor(userId: string): Promise<Connection | null> {
  const { data, error } = await adminClient()
    .from('external_calendar_connections')
    .select('*')
    .eq('user_id', userId)
    .eq('provider', 'google')
    .maybeSingle();
  if (error) throw error;
  return data as Connection | null;
}

async function accessToken(connection: Connection): Promise<string> {
  const refreshToken = await decryptSecret(connection.refresh_token_ciphertext, connection.refresh_token_iv);
  const response = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: Deno.env.get('GOOGLE_CALENDAR_CLIENT_ID')!,
      client_secret: Deno.env.get('GOOGLE_CALENDAR_CLIENT_SECRET')!,
      grant_type: 'refresh_token',
      refresh_token: refreshToken,
    }),
  });
  const payload = await response.json() as Record<string, unknown>;
  const token = typeof payload.access_token === 'string' ? payload.access_token : null;
  if (!response.ok || !token) {
    await adminClient()
      .from('external_calendar_connections')
      .update({ status: 'reauth_required', updated_at: new Date().toISOString() })
      .eq('id', connection.id);
    throw new ReauthError();
  }
  return token;
}

function normalizeCalendar(item: Record<string, unknown>) {
  return {
    id: typeof item.id === 'string' ? item.id : '',
    summary: typeof item.summary === 'string' ? item.summary : 'Calendar',
    primary: item.primary === true,
    selected: item.selected !== false,
    accessRole: typeof item.accessRole === 'string' ? item.accessRole : null,
    timeZone: typeof item.timeZone === 'string' ? item.timeZone : null,
    backgroundColor: typeof item.backgroundColor === 'string' ? item.backgroundColor : null,
    foregroundColor: typeof item.foregroundColor === 'string' ? item.foregroundColor : null,
  };
}

async function liveCalendars(token: string) {
  const response = await fetch('https://www.googleapis.com/calendar/v3/users/me/calendarList?maxResults=250', {
    headers: { Authorization: `Bearer ${token}` },
  });
  const payload = await response.json() as { items?: Array<Record<string, unknown>> };
  if (!response.ok) throw new Error(`Google calendarList failed with ${response.status}`);
  return (Array.isArray(payload.items) ? payload.items : []).map(normalizeCalendar).filter((item) => item.id);
}

function iso(value: unknown): string | null {
  if (typeof value !== 'string' || !Number.isFinite(Date.parse(value))) return null;
  return new Date(value).toISOString();
}

function normalizeEvent(item: Record<string, unknown>, calendarId: string, calendarSummary: string, syncedAt: string) {
  const start = item.start && typeof item.start === 'object' ? item.start as Record<string, unknown> : {};
  const end = item.end && typeof item.end === 'object' ? item.end as Record<string, unknown> : {};
  return {
    provider: 'google',
    readOnly: true,
    sourceCalendarId: calendarId,
    sourceCalendarSummary: calendarSummary,
    sourceEventId: typeof item.id === 'string' ? item.id : '',
    sourceUpdatedAt: typeof item.updated === 'string' ? item.updated : null,
    lastSyncedAt: syncedAt,
    title: typeof item.summary === 'string' ? item.summary : 'Busy',
    startsAt: typeof start.dateTime === 'string' ? start.dateTime : null,
    startDate: typeof start.date === 'string' ? start.date : null,
    endsAt: typeof end.dateTime === 'string' ? end.dateTime : null,
    endDate: typeof end.date === 'string' ? end.date : null,
    status: typeof item.status === 'string' ? item.status : null,
    transparency: typeof item.transparency === 'string' ? item.transparency : null,
    visibility: typeof item.visibility === 'string' ? item.visibility : null,
    location: typeof item.location === 'string' ? item.location : null,
    htmlLink: typeof item.htmlLink === 'string' ? item.htmlLink : null,
    eventType: typeof item.eventType === 'string' ? item.eventType : 'default',
  };
}

async function eventsForCalendar(
  token: string,
  calendar: { id: string; summary: string },
  timeMin: string,
  timeMax: string,
  syncedAt: string,
) {
  const events: ReturnType<typeof normalizeEvent>[] = [];
  let pageToken: string | null = null;

  for (let page = 0; page < 4; page += 1) {
    const url = new URL(`https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(calendar.id)}/events`);
    url.searchParams.set('timeMin', timeMin);
    url.searchParams.set('timeMax', timeMax);
    url.searchParams.set('singleEvents', 'true');
    url.searchParams.set('orderBy', 'startTime');
    url.searchParams.set('maxResults', '250');
    if (pageToken) url.searchParams.set('pageToken', pageToken);

    const response = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    const payload = await response.json() as { items?: Array<Record<string, unknown>>; nextPageToken?: string };
    if (!response.ok) throw new Error(`Google events.list failed with ${response.status}`);

    for (const item of Array.isArray(payload.items) ? payload.items : []) {
      const event = normalizeEvent(item, calendar.id, calendar.summary, syncedAt);
      if (event.sourceEventId) events.push(event);
    }

    pageToken = typeof payload.nextPageToken === 'string' ? payload.nextPageToken : null;
    if (!pageToken) break;
  }

  return events;
}

class ReauthError extends Error {}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return options();
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    const user = await requireUser(req);
    if (!configured()) return json({ status: 'unavailable', reason: 'google_calendar_not_configured' }, 503);

    const body = await req.json() as ActionBody;
    const action = typeof body.action === 'string' ? body.action : 'status';
    const connection = await connectionFor(user.id);

    if (action === 'status') {
      return json({
        status: 'ready',
        connection: connection
          ? {
              connected: connection.status === 'connected',
              state: connection.status,
              providerAccountId: connection.provider_account_id,
              scopes: connection.scopes,
              selectedCalendarIds: connection.selected_calendar_ids,
              connectedAt: connection.connected_at,
              lastSyncAt: connection.last_sync_at,
            }
          : { connected: false, state: 'disconnected', selectedCalendarIds: [] },
      });
    }

    if (!connection) return json({ status: 'ready', connection: { connected: false, state: 'disconnected' } }, 409);
    if (connection.status !== 'connected') return json({ status: 'ready', connection: { connected: false, state: connection.status } }, 409);

    if (action === 'disconnect') {
      const refreshToken = await decryptSecret(connection.refresh_token_ciphertext, connection.refresh_token_iv);
      try {
        await fetch('https://oauth2.googleapis.com/revoke', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ token: refreshToken }),
        });
      } finally {
        await adminClient().from('external_calendar_connections').delete().eq('id', connection.id);
      }
      return json({ status: 'ready', connection: { connected: false, state: 'disconnected' } });
    }

    const token = await accessToken(connection);
    const calendars = await liveCalendars(token);

    if (action === 'listCalendars') {
      return json({ status: 'ready', calendars, selectedCalendarIds: connection.selected_calendar_ids });
    }

    if (action === 'selectCalendars') {
      const requested = Array.isArray(body.selectedCalendarIds)
        ? body.selectedCalendarIds.filter((id): id is string => typeof id === 'string').slice(0, 20)
        : [];
      const allowed = new Set(calendars.map((calendar) => calendar.id));
      const selected = [...new Set(requested.filter((id) => allowed.has(id)))];
      const { error } = await adminClient()
        .from('external_calendar_connections')
        .update({ selected_calendar_ids: selected, updated_at: new Date().toISOString() })
        .eq('id', connection.id);
      if (error) throw error;
      return json({ status: 'ready', selectedCalendarIds: selected });
    }

    if (action === 'listEvents') {
      const timeMin = iso(body.timeMin);
      const timeMax = iso(body.timeMax);
      if (!timeMin || !timeMax || Date.parse(timeMax) <= Date.parse(timeMin)) return json({ error: 'invalid_time_range' }, 400);
      if (Date.parse(timeMax) - Date.parse(timeMin) > 45 * 24 * 60 * 60 * 1000) return json({ error: 'time_range_too_large' }, 400);

      const selected = new Set(connection.selected_calendar_ids);
      const chosen = calendars.filter((calendar) => selected.has(calendar.id)).slice(0, 20);
      const syncedAt = new Date().toISOString();
      const nested = await Promise.all(chosen.map((calendar) => eventsForCalendar(token, calendar, timeMin, timeMax, syncedAt)));
      const events = nested.flat().sort((a, b) => {
        const left = a.startsAt ?? a.startDate ?? '';
        const right = b.startsAt ?? b.startDate ?? '';
        return left.localeCompare(right);
      });

      await adminClient()
        .from('external_calendar_connections')
        .update({ last_sync_at: syncedAt, updated_at: syncedAt })
        .eq('id', connection.id);

      return json({ status: 'ready', events, syncedAt });
    }

    return json({ error: 'unknown_action' }, 400);
  } catch (error) {
    if (error instanceof AuthError) return json({ error: 'unauthorized' }, 401);
    if (error instanceof ReauthError) return json({ status: 'ready', connection: { connected: false, state: 'reauth_required' } }, 409);
    console.error('[calendar-data] internal error', error instanceof Error ? error.name : 'unknown');
    return json({ status: 'unavailable', reason: 'calendar_data_internal_error' }, 500);
  }
});
