import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

describe('External Intelligence scaffold architecture', () => {
  test('WeatherKit provider credentials remain server-only', () => {
    const publicEnv = read('.env.example');
    const functionEnv = read('supabase/functions/.env.example');

    assert.doesNotMatch(publicEnv, /WEATHERKIT_(TEAM_ID|SERVICE_ID|KEY_ID|PRIVATE_KEY)/);
    assert.match(functionEnv, /WEATHERKIT_TEAM_ID=/);
    assert.match(functionEnv, /WEATHERKIT_SERVICE_ID=/);
    assert.match(functionEnv, /WEATHERKIT_KEY_ID=/);
    assert.match(functionEnv, /WEATHERKIT_PRIVATE_KEY_P8=/);
  });

  test('weather context is transient and has no database write path', () => {
    const weather = read('supabase/functions/weather-context/index.ts');
    assert.doesNotMatch(weather, /\.from\s*\(/);
    assert.doesNotMatch(weather, /insert\s*\(|upsert\s*\(|update\s*\(/);
    assert.match(weather, /forecastDaily/);
    assert.match(weather, /forecastHourly/);
  });

  test('Google Calendar requests exactly the two approved read-only scopes', () => {
    const oauth = read('supabase/functions/calendar-oauth/index.ts');
    const scopes = [...oauth.matchAll(/https:\/\/www\.googleapis\.com\/auth\/calendar[^'\s]*/g)].map((match) => match[0]);

    assert.deepEqual(scopes.sort(), [
      'https://www.googleapis.com/auth/calendar.calendarlist.readonly',
      'https://www.googleapis.com/auth/calendar.events.readonly',
    ].sort());
    assert.doesNotMatch(oauth, /auth\/calendar['"]/);
  });

  test('Google refresh-token and client-secret material never enters public app env', () => {
    const publicEnv = read('.env.example');
    const functionEnv = read('supabase/functions/.env.example');

    assert.doesNotMatch(publicEnv, /GOOGLE_CALENDAR_CLIENT_SECRET|EXTERNAL_TOKEN_ENCRYPTION_KEY_B64/);
    assert.match(functionEnv, /GOOGLE_CALENDAR_CLIENT_SECRET=/);
    assert.match(functionEnv, /EXTERNAL_TOKEN_ENCRYPTION_KEY_B64=/);
  });

  test('external Google events stay non-canonical and explicitly read-only', () => {
    const types = read('src/external/types.ts');
    const bridge = read('src/features/calendar/useGoogleCalendarBridge.ts');
    const panel = read('src/features/calendar/GoogleCalendarPanel.tsx');

    assert.match(types, /readOnly:\s*true/);
    assert.doesNotMatch(bridge, /addEvent|updateEvent|removeEvent|appStore|useAppStore/);
    assert.doesNotMatch(panel, /addEvent|updateEvent|removeEvent|useAppStore/);
    assert.match(panel, /Read only/);
  });

  test('Calendar authorization is a separate consent flow from identity sign-in', () => {
    const oauth = read('supabase/functions/calendar-oauth/index.ts');
    const identity = read('src/platform/googleProvider.ts');

    assert.match(oauth, /access_type', 'offline'/);
    assert.match(oauth, /prompt', 'consent'/);
    assert.doesNotMatch(identity, /calendar\.events|calendar\.calendarlist/);
  });

  test('Edge Function auth boundaries are explicit', () => {
    const config = read('supabase/config.toml');

    assert.match(config, /\[functions\.weather-context\][\s\S]*?verify_jwt\s*=\s*true/);
    assert.match(config, /\[functions\.calendar-data\][\s\S]*?verify_jwt\s*=\s*true/);
    assert.match(config, /\[functions\.calendar-oauth\][\s\S]*?verify_jwt\s*=\s*false/);
  });

  test('local function secrets cannot be committed accidentally', () => {
    assert.match(read('supabase/.gitignore'), /functions\/\.env/);
  });

  test('service-only Calendar tables are not directly granted to app roles', () => {
    const blueprint = read('supabase/blueprints/external_calendar_connections.sql');

    assert.match(blueprint, /enable row level security/);
    assert.match(blueprint, /revoke all on table public\.calendar_oauth_states from anon, authenticated/);
    assert.match(blueprint, /revoke all on table public\.external_calendar_connections from anon, authenticated/);
    assert.doesNotMatch(blueprint, /grant .* to authenticated/);
  });

  test('the provider scaffold is dormant without manual configuration', () => {
    const weather = read('src/features/today/WeatherContextCard.tsx');
    const calendar = read('src/features/calendar/useGoogleCalendarBridge.ts');

    assert.match(weather, /weatherAnchorConfig === null/);
    assert.match(calendar, /setAvailability\('dormant'\)/);
  });
});
