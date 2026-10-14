import { constantTimeEqual } from '../_shared/premium/webhookAuth.ts';
import { processBacklog } from '../_shared/premium/webhookHandler.ts';
import { reconcileAccount } from '../_shared/premium/reconcileService.ts';
import { createApi, createStore, log, readDeployment, readWebhookAuthConfig, unavailableApi } from '../_shared/premium/runtime.ts';

// OPERATOR endpoint (verify_jwt = false; authenticated by PREMIUM_OPS_SECRET, constant-time). Not reachable by any app user.
//   POST {"action":"backlog","limit":50}                 re-process received/failed webhook events (idempotent)
//   POST {"action":"reconcile","accountId":"<uuid>"}     force-reconcile one account against RevenueCat
const headers = { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' };
const reply = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers });
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

Deno.serve(async (req) => {
  if (req.method !== 'POST') return reply({ error: 'method_not_allowed' }, 405);
  const secret = Deno.env.get('PREMIUM_OPS_SECRET');
  if (!secret || secret.length < 24) return reply({ error: 'not_configured' }, 503);
  const presented = req.headers.get('x-premium-ops-secret') ?? '';
  if (!(await constantTimeEqual(presented, secret))) return reply({ error: 'unauthorized' }, 401);

  let body: Record<string, unknown>;
  try {
    body = (await req.json()) as Record<string, unknown>;
  } catch {
    return reply({ error: 'invalid_request' }, 400);
  }

  const deployment = readDeployment();
  const store = createStore();
  const api = createApi() ?? unavailableApi;
  const deps = { store, api, auth: readWebhookAuthConfig(deployment), deployment, nowMs: () => Date.now(), log };

  try {
    if (body.action === 'backlog') {
      const limit = typeof body.limit === 'number' ? body.limit : 50;
      return reply(await processBacklog(deps, limit));
    }
    if (body.action === 'reconcile' && typeof body.accountId === 'string' && UUID.test(body.accountId)) {
      return reply({ status: await reconcileAccount(deps, body.accountId, { force: true }) });
    }
    return reply({ error: 'invalid_request' }, 400);
  } catch {
    log({ op: 'ops', outcome: 'error' });
    return reply({ error: 'failed' }, 500);
  }
});
