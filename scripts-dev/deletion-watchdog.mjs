// Independent account-deletion watchdog (DEL-P2-005). Runs OUTSIDE Supabase (GitHub
// Actions) so a stopped pg_cron scheduler, a broken monitor job or a failed Resend
// alert path cannot fail silently. It invokes the existing HMAC-authenticated
// monitor endpoint and exits non-zero when the endpoint is unreachable or reports
// anything other than healthy. Output is aggregate status only; the monitor never
// returns customer data.
import { createHmac } from 'node:crypto';

export const ALLOWED_PROJECTS = ['https://fhhudicklmpofuzkxeqe.supabase.co', 'https://npykvnxnehlsdlbumzwk.supabase.co'];

/** Same scheme as public.herkeys_verify_deletion_worker: HMAC-SHA256("herkeys-deletion:"+ts). */
export function signDeletionRequest(key, nowMs = Date.now()) {
  const timestamp = String(Math.floor(nowMs / 1000));
  const signature = createHmac('sha256', key).update('herkeys-deletion:' + timestamp, 'utf8').digest('hex');
  return { timestamp, signature };
}

/** Classify one monitor response. Only an explicit {healthy:true} is healthy. */
export function evaluateMonitorResponse(status, body) {
  if (status === 401) return { ok: false, reason: 'watchdog_unauthorized' };
  if (status !== 200) return { ok: false, reason: 'monitor_http_' + status };
  if (!body || typeof body !== 'object') return { ok: false, reason: 'monitor_unreadable' };
  if (body.healthy === true) return { ok: true, reason: 'healthy' };
  if (body.healthy === false) return { ok: false, reason: 'lifecycle_needs_attention:' + String(body.alert ?? 'unknown') };
  return { ok: false, reason: 'monitor_unreadable' };
}

export async function runWatchdog({ projectUrl, key, fetcher = fetch, nowMs = Date.now() }) {
  if (!ALLOWED_PROJECTS.includes(projectUrl)) return { ok: false, reason: 'watchdog_target_not_allowed' };
  if (!key) return { ok: false, reason: 'watchdog_unconfigured' };
  let lastReason = 'monitor_unreachable';
  for (let attempt = 0; attempt < 2; attempt++) {
    const { timestamp, signature } = signDeletionRequest(key, nowMs + attempt * 1000);
    try {
      const response = await fetcher(projectUrl + '/functions/v1/monitor-account-deletions', {
        method: 'POST', body: '{}', signal: AbortSignal.timeout(60000),
        headers: { 'Content-Type': 'application/json', 'x-deletion-timestamp': timestamp, 'x-deletion-signature': signature },
      });
      const body = await response.json().catch(() => null);
      const result = evaluateMonitorResponse(response.status, body);
      // Retry only transport-level/5xx failures; an authoritative answer is final.
      if (result.ok || response.status < 500) return result;
      lastReason = result.reason;
    } catch {
      lastReason = 'monitor_unreachable';
    }
  }
  return { ok: false, reason: lastReason };
}

if (import.meta.url === `file://${process.argv[1]?.replaceAll('\\', '/')}` || process.argv[1]?.endsWith('deletion-watchdog.mjs')) {
  const result = await runWatchdog({ projectUrl: process.env.DELETION_WATCHDOG_PROJECT_URL ?? '', key: process.env.DELETION_WORKER_KEY ?? '' });
  console.log(JSON.stringify({ at: new Date().toISOString(), project: process.env.DELETION_WATCHDOG_PROJECT_URL ?? '', ...result }));
  if (!result.ok) process.exitCode = 1;
}
