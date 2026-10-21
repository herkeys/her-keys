#!/usr/bin/env node
// Internal operator workflow. Supply a signed-in designated reviewer's token
// through the protected shell environment, never arguments, Git or chat.
import { pathToFileURL } from 'node:url';

const projects = { staging: 'fhhudicklmpofuzkxeqe', production: 'npykvnxnehlsdlbumzwk' };
const statuses = new Set(['pending', 'reviewing', 'resolved']);
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const knownErrors = new Set(['reviewer_required', 'invalid_review_request', 'review_conflict', 'report_unavailable']);

export function createReviewerClient({ environment, accessToken, publishableKey, fetch: transport = globalThis.fetch }) {
  if (!Object.hasOwn(projects, environment) || !accessToken || !publishableKey) throw new Error('review_configuration_required');
  const invoke = async (name, body) => {
    try {
      const response = await transport(`https://${projects[environment]}.supabase.co/rest/v1/rpc/${name}`, {
        method: 'POST', signal: AbortSignal.timeout(12000),
        headers: { apikey: publishableKey, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await response.json();
      if (!response.ok) return { ok: false, error: knownErrors.has(data?.message) ? data.message : 'review_unavailable' };
      return { ok: true, data };
    } catch { return { ok: false, error: 'review_unavailable' }; }
  };
  return {
    list({ status = 'pending', limit = 50, afterCreatedAt = null, afterId = null } = {}) {
      if (!statuses.has(status) || !Number.isInteger(limit) || limit < 1 || limit > 100 ||
          (afterCreatedAt === null) !== (afterId === null) || (afterId !== null && !uuid.test(afterId))) {
        return Promise.resolve({ ok: false, error: 'invalid_review_request' });
      }
      return invoke('list_ai_response_reports', { p_status: status, p_limit: limit, p_after_created_at: afterCreatedAt, p_after_id: afterId });
    },
    setStatus({ reportId, expectedStatus, status }) {
      if (!uuid.test(reportId) || !statuses.has(expectedStatus) || !['reviewing', 'resolved'].includes(status)) {
        return Promise.resolve({ ok: false, error: 'invalid_review_request' });
      }
      return invoke('review_ai_response_report', { p_report_id: reportId, p_expected_status: expectedStatus, p_status: status });
    },
  };
}

export async function run(args, env = process.env) {
  const [command, ...flags] = args;
  const value = name => { const i = flags.indexOf(name); return i < 0 ? undefined : flags[i + 1]; };
  if (!['list', 'set-status'].includes(command)) return { ok: false, error: 'usage: list|set-status --env staging|production' };
  try {
    const client = createReviewerClient({ environment: value('--env'), accessToken: env.HK_AI_REVIEW_ACCESS_TOKEN, publishableKey: env.HK_AI_REVIEW_PUBLISHABLE_KEY });
    if (command === 'list') return client.list({ status: value('--status') ?? 'pending', limit: Number(value('--limit') ?? '50'), afterCreatedAt: value('--after-created-at') ?? null, afterId: value('--after-id') ?? null });
    return client.setStatus({ reportId: value('--report-id'), expectedStatus: value('--expect'), status: value('--status') });
  } catch { return { ok: false, error: 'review_configuration_required' }; }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const result = await run(process.argv.slice(2));
  process.stdout.write(JSON.stringify(result, null, 2) + '\n');
  if (!result.ok) process.exitCode = 1;
}
