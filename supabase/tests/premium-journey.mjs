// Premium Stage 1 — the entitlement path over REAL HTTP: the production Supabase adapter (supabasePorts.ts) and the real webhook and
// gate handlers, talking to a private PostgREST + the migrated Postgres. Only RevenueCat's REST API is simulated (it cannot be real
// here); everything between the handlers and the tables is the production code path.
//
//   node supabase/tests/run-premium.mjs --journey
import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createSupabaseStore } from '../functions/_shared/premium/supabasePorts.ts';
import { handleGate } from '../functions/_shared/premium/gateHandler.ts';
import { handleWebhook, processBacklog } from '../functions/_shared/premium/webhookHandler.ts';
import { reconcileAccount } from '../functions/_shared/premium/reconcileService.ts';

const JWT_SECRET = process.env.HERKEYS_LOCAL_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long';
const b64 = (value) => Buffer.from(value).toString('base64url');
// Every key is MINTED from the published local-development secret at run time: no JWT literal is committed.
function mint(role, sub) {
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const body = { role, aud: role === 'service_role' ? undefined : 'authenticated', iss: 'supabase-demo', iat: Math.floor(Date.now() / 1000) - 10, exp: Math.floor(Date.now() / 1000) + 3600 };
  if (sub) body.sub = sub;
  const payload = b64(JSON.stringify(body));
  return `${header}.${payload}.${createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url')}`;
}
const ANON_KEY = process.env.HERKEYS_LOCAL_ANON_KEY ?? mint('anon');

const UA = '11111111-1111-4111-8111-111111111111';
const UB = '22222222-2222-4222-8222-222222222222';
const UC = '33333333-3333-4333-8333-333333333333';
const AUTH = 'journey-authorization-secret-0123456789';
const HMAC = 'journey-hmac-signing-secret-0123456789';
const DAY = 86_400_000;

let eventNumber = 0;
const rcBody = (over = {}, now = Date.now()) => {
  eventNumber += 1;
  return {
    api_version: '1.0',
    event: {
      id: `journey-evt-${eventNumber}-${Math.random().toString(16).slice(2, 8)}`, type: 'INITIAL_PURCHASE', app_user_id: UA, original_app_user_id: UA, aliases: [UA],
      environment: 'SANDBOX', event_timestamp_ms: now, entitlement_ids: ['her_keys_plus'], product_id: 'herkeys_premium_monthly', store: 'APP_STORE',
      purchased_at_ms: now, expiration_at_ms: now + 30 * DAY, period_type: 'NORMAL', price: 9.99, currency: 'USD', ...over,
    },
  };
};

function signed(body, { auth = AUTH, hmac = HMAC } = {}) {
  const rawBody = new TextEncoder().encode(JSON.stringify(body));
  const t = Math.floor(Date.now() / 1000);
  const headers = new Map();
  if (auth) headers.set('authorization', auth);
  if (hmac) headers.set('x-revenuecat-webhook-signature', `t=${t},v1=${createHmac('sha256', hmac).update(`${t}.`).update(rawBody).digest('hex')}`);
  return { method: 'POST', rawBody, header: (name) => headers.get(name.toLowerCase()) ?? null };
}

const subscriber = (over = {}) => {
  const now = Date.now();
  const { entitlement = true, expiresMs = now + 20 * DAY, refundedMs = null } = over;
  return {
    request_date_ms: now,
    subscriber: {
      entitlements: entitlement ? { her_keys_plus: { expires_date: new Date(expiresMs).toISOString(), grace_period_expires_date: null, product_identifier: 'herkeys_premium_monthly', purchase_date: new Date(now - 10 * DAY).toISOString() } } : {},
      subscriptions: entitlement ? { herkeys_premium_monthly: { is_sandbox: true, store: 'app_store', expires_date: new Date(expiresMs).toISOString(), refunded_at: refundedMs === null ? null : new Date(refundedMs).toISOString() } } : {},
    },
  };
};

export async function premiumJourney({ check, stack, stackPsql }) {
  const service = createClient(stack.apiUrl, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { headers: { Authorization: `Bearer ${mint('service_role')}` } } });
  const as = (sub) => createClient(stack.apiUrl, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }, global: { headers: { Authorization: `Bearer ${mint('authenticated', sub)}` } } });
  const anon = createClient(stack.apiUrl, ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } });

  // ---- world: three accounts, A and B share household A, C owns another; features released; staging environment ------------------
  stackPsql(stack.database, `
    INSERT INTO auth.users (id, email, aud, role) VALUES ('${UA}', 'a@local.test', 'authenticated', 'authenticated'), ('${UB}', 'b@local.test', 'authenticated', 'authenticated'), ('${UC}', 'c@local.test', 'authenticated', 'authenticated');
    BEGIN;
    SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claims = '{"sub":"${UA}"}';
    SELECT public.bootstrap_account('aaaaaaaa-0000-4000-8000-00000000000a'::uuid, 'America/Chicago', NULL);
    SET LOCAL request.jwt.claims = '{"sub":"${UC}"}';
    SELECT public.bootstrap_account('cccccccc-0000-4000-8000-00000000000c'::uuid, 'Europe/London', NULL);
    RESET ROLE;
    COMMIT;
    INSERT INTO public.profiles (id, timezone) VALUES ('${UB}', 'America/Chicago') ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.household_members (household_id, local_id, profile_id, member_type, role, display_name, scope)
      SELECT h.id, 'user-2', '${UB}', 'adult', 'member', NULL, 'personal' FROM public.households h JOIN public.household_members o ON o.household_id = h.id AND o.profile_id = '${UA}' ON CONFLICT DO NOTHING;
    UPDATE public.premium_runtime_config SET environment = 'staging';
    UPDATE public.premium_feature_config SET enabled = true, released = true WHERE feature_key IN ('daily_load_premium', 'smart_inbox_extract', 'momentum_report');
    UPDATE public.premium_feature_config SET rate_limit_per_minute = 100 WHERE feature_key = 'daily_load_premium';`, { label: 'journey world' });
  const hhA = (await service.from('household_members').select('household_id').eq('profile_id', UA).eq('role', 'owner').single()).data?.household_id;
  const hhC = (await service.from('household_members').select('household_id').eq('profile_id', UC).eq('role', 'owner').single()).data?.household_id;
  check('journey world built (two households, three accounts)', Boolean(hhA && hhC && hhA !== hhC));

  const store = createSupabaseStore(service);
  let rcRecords = new Map();
  const api = { async getSubscriber(id) { const r = rcRecords.get(id); return r ? { ok: true, body: r } : { ok: false, status: 404 }; } };
  const deps = {
    store, api, deployment: 'staging', nowMs: () => Date.now(), log: () => {},
    auth: { authorizationSecret: AUTH, hmacSecret: HMAC, requireHmac: false, toleranceSeconds: 300 },
  };
  const gateDeps = { store, api, deployment: 'staging', nowMs: () => Date.now(), log: () => {}, newRequestId: () => `req-${Math.random().toString(16).slice(2, 10)}` };
  const hook = (body, options) => handleWebhook(deps, signed(body, options));
  const mine = async (sub) => (await as(sub).rpc('premium_my_entitlement')).data?.state;
  const gate = (user, body) => handleGate(gateDeps, user, body);
  let key = 0;
  const op = () => `journey-op-${String(++key).padStart(6, '0')}`;

  // ---- authentication over the production handler ------------------------------------------------------------------------------
  const rejected = [await hook(rcBody(), { auth: null }), await hook(rcBody(), { auth: 'wrong-wrong-wrong-wrong-wrong' }), await hook(rcBody(), { hmac: 'a-different-signing-secret-xyz-0123' })];
  check('unauthenticated webhooks are refused with 401', rejected.every((r) => r.status === 401));
  check('…and leave no event, projection or identity in the database', (await service.from('premium_events').select('id', { count: 'exact', head: true })).count === 0
    && (await service.from('premium_entitlements').select('account_id', { count: 'exact', head: true })).count === 0);

  // ---- purchase -> projection -> client read -> gate ----------------------------------------------------------------------------
  const purchase = rcBody({ id: 'journey-purchase-1' });
  const first = await hook(purchase);
  check('an authenticated INITIAL_PURCHASE is processed (200)', first.status === 200 && first.body.status === 'processed', JSON.stringify(first));
  // Provider-freshness policy: a signed webhook alone never authorizes NEW paid computation. Until RevenueCat's subscriber record has
  // been read recently, the gate answers entitlement_unknown and tells the client to retry verification.
  const beforeReconcile = await gate(UA, { feature: 'daily_load_premium', householdId: hhA, idempotencyKey: op() });
  check('a webhook-only purchase is NOT yet authorized: the gate says entitlement_unknown / retry_verification', beforeReconcile.body.outcome === 'denied' && beforeReconcile.body.reason === 'entitlement_unknown' && beforeReconcile.body.nextAction === 'retry_verification', JSON.stringify(beforeReconcile.body));
  rcRecords.set(UA, subscriber());
  check('reading RevenueCat\'s subscriber record for A reconciles the projection', (await reconcileAccount(deps, UA, { force: true })) === 'reconciled');
  check('A\'s own client reads premium_active through premium_my_entitlement', (await mine(UA)) === 'premium_active');
  check('B (same household, no purchase) does NOT inherit Premium', (await mine(UB)) === 'unknown');
  const allowedA = await gate(UA, { feature: 'daily_load_premium', householdId: hhA, idempotencyKey: op() });
  check('the gate allows A\'s Premium feature (real authorize over HTTP)', allowedA.body.outcome === 'allowed' && allowedA.body.entitlementState === 'premium_active', JSON.stringify(allowedA.body));
  const deniedB = await gate(UB, { feature: 'daily_load_premium', householdId: hhA, idempotencyKey: op() });
  check('the gate denies B in the SAME household (entitlement is purchaser-bound)', deniedB.body.outcome === 'denied' && ['entitlement_unknown', 'requires_premium'].includes(deniedB.body.reason), JSON.stringify(deniedB.body));
  const wrongHousehold = await gate(UA, { feature: 'daily_load_premium', householdId: hhC, idempotencyKey: op() });
  check('naming ANOTHER account\'s household is ownership_denied even for a Premium account', wrongHousehold.body.reason === 'ownership_denied');
  const forged = await gate(UB, { feature: 'daily_load_premium', householdId: hhA, idempotencyKey: op(), isPremium: true });
  check('a forged isPremium body is rejected before authorization', forged.status === 400);

  // ---- duplicate, replay, environment -------------------------------------------------------------------------------------------
  const dup = await hook(purchase);
  check('redelivery of the same event id is acknowledged as a duplicate', dup.body.status === 'duplicate');
  check('exactly one evidence row exists for it', (await service.from('premium_events').select('id', { count: 'exact', head: true }).eq('event_id', 'journey-purchase-1')).count === 1);
  const production = await hook(rcBody({ environment: 'PRODUCTION', app_user_id: UC, original_app_user_id: UC, aliases: [UC] }));
  check('a PRODUCTION event is kept as evidence but not granted on a staging deployment', production.body.status === 'ignored_environment' && (await mine(UC)) === 'unknown');
  const stored = (await service.from('premium_events').select('payload').eq('event_id', 'journey-purchase-1').single()).data?.payload;
  check('the stored payload is the allow-list only (no price, currency, e-mail)', stored && !('price' in stored) && !('currency' in stored) && !JSON.stringify(stored).includes('9.99'));

  // ---- refund, late renewal, expiry; stored data stays readable -------------------------------------------------------------------
  const refundAt = Date.now() - 2000;
  rcRecords.set(UA, subscriber({ refundedMs: refundAt }));
  await hook(rcBody({ type: 'CANCELLATION', cancel_reason: 'CUSTOMER_SUPPORT', event_timestamp_ms: refundAt }));
  const lateRenewal = await hook(rcBody({ type: 'RENEWAL', event_timestamp_ms: Date.now() - 5000, expiration_at_ms: Date.now() + 90 * DAY }));
  check('a refund revokes, and an OLDER renewal arriving afterwards is processed without resurrecting access', lateRenewal.body.status === 'processed' && (await mine(UA)) === 'premium_revoked');
  const afterRefund = await gate(UA, { feature: 'daily_load_premium', householdId: hhA, idempotencyKey: op() });
  check('the gate now denies NEW Premium computation (entitlement_expired)', afterRefund.body.outcome === 'denied' && afterRefund.body.reason === 'entitlement_expired', JSON.stringify(afterRefund.body));
  const readable = await as(UA).from('profiles').select('id').eq('id', UA);
  const members = await as(UA).from('household_members').select('id').eq('household_id', hhA);
  check('…while A can still READ her own stored data (profile, household): entitlement never gates stored data', readable.data?.length === 1 && (members.data?.length ?? 0) >= 2, JSON.stringify([readable.error, members.error]));

  // ---- transfer / alias ----------------------------------------------------------------------------------------------------------
  rcRecords.set(UA, subscriber({ entitlement: false }));
  rcRecords.set(UB, subscriber({ expiresMs: Date.now() + 25 * DAY }));
  const transfer = await hook(rcBody({ type: 'TRANSFER', app_user_id: undefined, original_app_user_id: undefined, aliases: [], transferred_from: [UA], transferred_to: [UB], event_timestamp_ms: Date.now() }));
  check('a TRANSFER is resolved by reading RevenueCat: B becomes Premium, A is released', transfer.body.status === 'processed' && (await mine(UB)) === 'premium_active' && (await mine(UA)) === 'free', JSON.stringify(transfer.body));
  rcRecords.set(UC, subscriber({ entitlement: false }));
  const ambiguous = await hook(rcBody({ app_user_id: UB, aliases: [UB, UC] }));
  check('an event implicating two real accounts grants nothing to the second one (it is read from RevenueCat and found to be free)', ambiguous.body.status === 'ambiguous' && (await mine(UC)) === 'free' && (await mine(UB)) === 'premium_active', JSON.stringify(ambiguous.body));

  // ---- failure, backlog, dead letter (through the real RPCs) -------------------------------------------------------------------------------
  const poison = rcBody({ id: 'journey-poison', type: 'TRANSFER', app_user_id: undefined, transferred_from: [UA], transferred_to: [UB] });
  rcRecords.delete(UA);
  rcRecords.delete(UB);
  const f1 = await hook(poison);
  check('when RevenueCat is unreachable a transfer is stored and marked failed (200), not lost', f1.status === 200 && f1.body.status === 'failed');
  for (let i = 0; i < 4; i += 1) await processBacklog(deps, 50);
  const row = (await service.from('premium_events').select('status,attempts').eq('event_id', 'journey-poison').single()).data;
  check('five failed attempts dead-letter the event', row?.status === 'dead_letter' && row?.attempts === 5, JSON.stringify(row));
  check('a dead letter leaves the backlog', (await processBacklog(deps, 50)).attempted === 0);

  // ---- quota through the gate ----------------------------------------------------------------------------------------------------------------
  stackPsql(stack.database, `UPDATE public.premium_feature_config SET premium_limit = 2 WHERE feature_key = 'daily_load_premium';`, { label: 'limit' });
  const results = [];
  for (let i = 0; i < 3; i += 1) results.push(await gate(UB, { feature: 'daily_load_premium', householdId: hhA, idempotencyKey: op() }));
  check('the gate meters: the third request against a limit of 2 is quota_exhausted with an honest snapshot',
    results[0].body.outcome === 'allowed' && results[1].body.outcome === 'allowed' && results[2].body.reason === 'quota_exhausted' && results[2].body.quota?.remaining === 0, JSON.stringify(results.map((r) => r.body.reason)));

  // ---- client-role privilege boundary over HTTP ---------------------------------------------------------------------------------------------------
  const asB = as(UB);
  const direct = await asB.rpc('premium_authorize', { p_account: UB, p_feature: 'daily_load_premium', p_idempotency_key: op() });
  check('an authenticated client cannot call premium_authorize directly (permission denied)', direct.error !== null && /permission denied|42501|not found|PGRST202/i.test(JSON.stringify(direct.error)), JSON.stringify(direct.error));
  const tableRead = await asB.from('premium_entitlements').select('account_id');
  check('an authenticated client cannot read the projection table', tableRead.error !== null || (tableRead.data ?? []).length === 0, JSON.stringify(tableRead));
  const tableWrite = await asB.from('premium_entitlements').insert({ account_id: UB, source: 'webhook', environment: 'PRODUCTION', has_entitlement: true });
  check('an authenticated client cannot forge its own entitlement', tableWrite.error !== null);
  const anonRead = await anon.from('premium_feature_config').select('feature_key');
  const anonRpc = await anon.rpc('premium_my_entitlement');
  check('anon reads nothing and cannot call the entitlement RPC', (anonRead.error !== null || (anonRead.data ?? []).length === 0) && anonRpc.error !== null);
  const manifest = await asB.rpc('premium_feature_manifest');
  check('the client manifest is readable and is the display subset only', Array.isArray(manifest.data) && manifest.data.length === 6 && manifest.data.every((f) => !('premiumLimit' in f) && !('costWeight' in f)));
}
