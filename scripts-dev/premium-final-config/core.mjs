/**
 * Pure, secret-safe Premium final-config primitives.
 * Nothing in this module connects to an API or logs operator credentials.
 * Official RevenueCat webhook fields: https://www.revenuecat.com/docs/integrations/webhooks
 */
import { createHmac, timingSafeEqual, randomUUID } from 'node:crypto';

export const PROJECTS = Object.freeze({
  staging: 'fhhudicklmpofuzkxeqe',
  production: 'npykvnxnehlsdlbumzwk',
});
export const FEATURES = Object.freeze(['daily_load_premium', 'smart_inbox_extract', 'momentum_report']);
export const SECRET_NAMES = Object.freeze([
  'REVENUECAT_WEBHOOK_AUTH', 'REVENUECAT_WEBHOOK_HMAC_SECRET',
  'REVENUECAT_SECRET_API_KEY', 'PREMIUM_OPS_SECRET',
]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export const isUuid = (id) => typeof id === 'string' && UUID.test(id);

export function environmentRef(env) {
  if (!Object.hasOwn(PROJECTS, env)) throw new Error('environment must be staging or production');
  return PROJECTS[env];
}
export function endpoint(env, slug) {
  return `https://${environmentRef(env)}.supabase.co/functions/v1/${slug}`;
}
/** The operator's local shell stores environment-specific secrets, NEVER a .env file. */
export function localSecretConfig(source = process.env) {
  const result = {};
  for (const env of ['staging','production']) {
    const prefix = `HK_${env.toUpperCase()}_`;
    result[env] = {
      PREMIUM_ENVIRONMENT: source[`${prefix}PREMIUM_ENVIRONMENT`],
      ...Object.fromEntries(SECRET_NAMES.map(name => [name, source[`${prefix}${name}`]])),
    };
  }
  return result;
}
export function preflightLocal(config) {
  const checks = {};
  for (const env of ['staging','production']) {
    const conf = config[env] ?? {};
    checks[env] = Object.fromEntries([
      ['environment_matches', conf.PREMIUM_ENVIRONMENT === env],
      ...SECRET_NAMES.map(name => [name + '_present', typeof conf[name] === 'string' && conf[name].length >= (name.endsWith('_AUTH') ? 16 : name.endsWith('_SECRET') ? 24 : 12)]),
    ]);
  }
  for (const name of SECRET_NAMES) {
    const a = config.staging?.[name], b = config.production?.[name];
    checks.crossEnvironment ??= {};
    checks.crossEnvironment[name + '_distinct'] = Boolean(a && b && a !== b);
  }
  const passed = Object.values(checks).every(group => Object.values(group).every(Boolean));
  return {passed,checks};  // Never include, serialize or log config itself.
}
export function redactError(err) {
  // Do NOT include exception messages: clients, SDKs and proxies sometimes echo URLs/tokens.
  return err && typeof err === 'object' && err.name === 'AbortError' ? 'timeout' : 'request_failed';
}
export function eventFixture(type, {accountId, environment = 'SANDBOX', timestampMs = Date.now(), eventId = 'hk-preflight-' + randomUUID()} = {}) {
  const supported = new Set(['INITIAL_PURCHASE','RENEWAL','CANCELLATION','UNCANCELLATION',
    'EXPIRATION','BILLING_ISSUE','PRODUCT_CHANGE','TRANSFER','SUBSCRIBER_ALIAS','NON_RENEWING_PURCHASE','TEST']);
  if (!supported.has(type)) throw new Error('unsupported RevenueCat event fixture type');
  if (!['SANDBOX','PRODUCTION'].includes(environment)) throw new Error('bad event environment');
  if (type !== 'TEST' && !isUuid(accountId)) throw new Error('fixtures require a real-format Staging account UUID');
  const e = {
    id: eventId, type, environment, event_timestamp_ms: timestampMs,
    app_id: 'app3bba22bc6a', app_user_id: accountId ?? '$RCAnonymousID:preflight',
    aliases: [], entitlement_ids: ['her_keys_plus'], store: 'TEST_STORE',
    product_id: 'monthly', purchased_at_ms: timestampMs - 1000,
    expiration_at_ms: timestampMs + 86400000,
  };
  if (type === 'TRANSFER') { e.transferred_from = [accountId]; e.transferred_to = ['00000000-0000-4000-8000-000000000001']; }
  if (type === 'SUBSCRIBER_ALIAS') { e.aliases = [accountId]; e.original_app_user_id = accountId; }
  if (type === 'BILLING_ISSUE') e.grace_period_expiration_at_ms = timestampMs + 3600000;
  if (type === 'CANCELLATION') e.cancel_reason = 'UNSUBSCRIBE';
  if (type === 'EXPIRATION') e.expiration_reason = 'UNSUBSCRIBE';
  return {api_version:'1.0',event:e};
}
export function signWebhook(raw, secret, seconds = Math.floor(Date.now()/1000)) {
  if (typeof secret !== 'string' || secret.length < 24) throw new Error('HMAC secret missing/too short');
  if (!Number.isSafeInteger(seconds)) throw new Error('invalid timestamp');
  const v1=createHmac('sha256',secret).update(`${seconds}.`).update(raw).digest('hex');
  return `t=${seconds},v1=${v1}`;
}
export function verifyWebhook(raw, header, secret, nowMs=Date.now()) {
  if (typeof header !== 'string') return false;
  const m=/^t=(\d{10}),v1=([0-9a-f]{64})$/.exec(header);
  if (!m || Math.abs(Math.floor(nowMs/1000)-Number(m[1]))>300) return false;
  const expected=signWebhook(raw,secret,Number(m[1])).split('v1=')[1];
  return timingSafeEqual(Buffer.from(m[2],'hex'),Buffer.from(expected,'hex'));
}
/** A synthetic signed webhook is NOT a real RevenueCat purchase. Never equate receipt with a grant. */
export function classifyWebhookResult(code, data) {
  if (code===401) return 'unauthorized';
  if (code===503 && data?.error==='not_configured') return 'missing_dashboard_configuration';
  if (code>=500) return 'service_unavailable';
  if (code!==200) return 'rejected';
  return typeof data?.status==='string' ? data.status : 'accepted_response_unverified';
}
export function projectionComparison(subscriber, projection, nowMs=Date.now()) {
  // RevenueCat v1 /subscribers/{uuid} returns subscriber.entitlements keyed by lookup_key.
  const rc=subscriber?.subscriber?.entitlements?.her_keys_plus;
  const expiry=rc?.expires_date ? Date.parse(rc.expires_date) : null;
  const rcActive=Boolean(rc && (rc.expires_date===null || Number.isFinite(expiry) && expiry>nowMs));
  if (!projection) return {matched:false,category:'missing',expected:rcActive?'premium_active':'free'};
  if (projection.needs_reconcile === true) return {matched:false,category:'stale',expected:rcActive?'premium_active':'free'};
  const state=projection.state;
  const live=new Set(['premium_active','premium_canceled_active','premium_billing_grace']);
  if (rcActive && !live.has(state)) return {matched:false,category:'conflicting',expected:'premium_active'};
  if (!rcActive && live.has(state)) return {matched:false,category:'conflicting',expected:'free'};
  if (!rcActive && state==='unknown') return {matched:false,category:'stale',expected:'free'};
  return {matched:true,category:'matched',expected:rcActive?'premium_active':'free'};
}
export function statusLine(name,ok) { return {check:name,passed:Boolean(ok)}; }
