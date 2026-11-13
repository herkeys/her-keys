import { json, options } from '../../_shared/http.ts';

/*
 * EMERGENCY MITIGATION for HK-V2ACT-CAL-03 (Google Calendar account-linking CSRF), Production only, management-authorized 2026-11-13.
 *
 * Deployed in place of the `calendar-oauth` function (slug unchanged, verify_jwt unchanged = false). It PAUSES new Google Calendar
 * connections and nothing else:
 *   - POST (start consent): refused with the same 503 `unavailable` shape the app already handles when Calendar is not configured, so
 *     every shipped build degrades quietly. No state row is created and no Google authorization URL is issued.
 *   - GET (Google's callback, including any authorization started before this deployment): returns to the app with
 *     `status=error&detail=connect_paused`. Google's code is NEVER exchanged and no credential is written.
 *
 * Deliberately self-contained: no database, no Google secret, no network call, no shared auth or crypto module. Existing connections,
 * their read-only synchronization and disconnect live in `calendar-data`, which this deployment does not touch.
 *
 * Rollback: redeploy the previously deployed `calendar-oauth` bundle (retrieved and recorded before this deployment). The permanent
 * repair (authenticated completion, supabase/functions/calendar-oauth) replaces this only after Staging + native Google verification
 * and a coordinated app/backend rollout.
 */

export const CALENDAR_CONNECT_PAUSED = 'calendar_connect_paused';

function appRedirect(): Response {
  let target: URL;
  try {
    target = new URL(Deno.env.get('HERKEYS_CALENDAR_APP_REDIRECT_URI') ?? 'herkeys://calendar-connected');
  } catch {
    target = new URL('herkeys://calendar-connected');
  }
  target.searchParams.set('status', 'error');
  target.searchParams.set('detail', 'connect_paused');
  return new Response(null, {
    status: 302,
    headers: { Location: target.toString(), 'Cache-Control': 'no-store', Pragma: 'no-cache', 'Referrer-Policy': 'no-referrer' },
  });
}

Deno.serve((req) => {
  if (req.method === 'OPTIONS') return options();
  if (req.method === 'GET') return appRedirect();
  if (req.method === 'POST') return json({ status: 'unavailable', reason: CALENDAR_CONNECT_PAUSED }, 503);
  return json({ error: 'method_not_allowed' }, 405);
});
