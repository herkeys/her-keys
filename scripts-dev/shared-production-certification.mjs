#!/usr/bin/env node
// Controlled synthetic certification. JSON commands arrive through non-echoing
// stdin. Passwords and sessions stay in process memory; output excludes tokens,
// addresses, user/provider content, headers and raw server errors.
import { createInterface } from 'node:readline';
import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { appendFileSync } from 'node:fs';
import { createClient } from '@supabase/supabase-js';
import { createInitialState } from '../src/features/talk-it-out/engine.ts';
import { createHerKeysAiClient } from '../src/platform/herKeysAiClient.ts';
import { parseHerKeysAiTurn } from '../src/features/talk-it-out/providerContract.ts';
import { createAiReportClient } from '../src/platform/aiResponseReporting.ts';
import { supabaseConfig } from '../src/config/supabase.ts';

const projects = { staging: 'fhhudicklmpofuzkxeqe', production: 'npykvnxnehlsdlbumzwk' };
const accounts = new Map();
const network = [];
const nativeFetch = globalThis.fetch;
const evidencePath = process.argv.find(arg => arg.startsWith('--evidence='))?.slice('--evidence='.length);
if (evidencePath && !/^docs\/integration\/evidence\/shared-production-runtime-(?:staging|production)\.txt$/.test(evidencePath)) throw new Error('invalid_evidence_path');
const emit = value => {
  if (evidencePath) appendFileSync(evidencePath, JSON.stringify(value) + '\n', 'utf8');
  // Keep PTY output short; the optional redacted artifact holds complete IDs.
  process.stdout.write(JSON.stringify(evidencePath ? { label: value.label, status: value.status, httpStatus: value.httpStatus } : value) + '\n');
};
const fingerprint = value => createHash('sha256').update(value).digest('hex');
const errorCode = error => typeof error?.code === 'string' && /^[a-z0-9_]{1,64}$/i.test(error.code) ? error.code : 'request_failed';
globalThis.fetch = async (input, options) => {
  const url = new URL(typeof input === 'string' ? input : input.url ?? input);
  const start = Date.now();
  const response = await nativeFetch(input, { ...options, signal: options?.signal ?? AbortSignal.timeout(30000) });
  network.push({ path: url.pathname, status: response.status, latencyMs: Date.now() - start, requestId: response.headers.get('sb-request-id') ?? response.headers.get('x-request-id') });
  return response;
};
const rpcNames = new Set(['bootstrap_account', 'premium_purchase_readiness', 'submit_ai_response_report', 'list_ai_response_reports', 'review_ai_response_report']);

async function execute(command) {
  const { op, label } = command;
  if (op === 'signup') {
    if (!Object.hasOwn(projects, command.environment) || !/^[AB]$/.test(label) || accounts.has(label) ||
        !/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.resend\.app$/.test(command.email)) throw new Error('invalid_setup');
    const client = createClient(`https://${projects[command.environment]}.supabase.co`, command.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'hk-v2-cert-' + label },
    });
    const account = { client, email: command.email, environment: command.environment, publishableKey: command.publishableKey };
    accounts.set(label, account);
    const result = await client.auth.signUp({ email: command.email, password: randomBytes(32).toString('base64url'), options: { data: { hk_v2_cert: '20261017' + label } } });
    if (result.error) return { label, status: 'signup_failed', code: errorCode(result.error), httpStatus: result.error.status };
    account.userId = result.data.user?.id;
    account.session = result.data.session;
    return { label, status: account.session ? 'authenticated' : 'confirmation_required', accountFingerprint: account.userId ? fingerprint(account.userId) : null };
  }
  const account = accounts.get(label);
  if (!account) throw new Error('unknown_account');
  if (op === 'verify') {
    if (!/^[A-Za-z0-9_-]{20,512}$/.test(command.tokenHash)) throw new Error('invalid_verification');
    const result = await account.client.auth.verifyOtp({ token_hash: command.tokenHash, type: 'signup' });
    if (result.error) return { label, status: 'verification_failed', code: errorCode(result.error), httpStatus: result.error.status };
    if (result.data.user?.id !== account.userId || result.data.user?.email !== account.email || !result.data.session) throw new Error('identity_mismatch');
    account.session = result.data.session;
    return { label, status: 'authenticated', accountFingerprint: fingerprint(account.userId) };
  }
  if (!account.session) throw new Error('session_required');
  if (op === 'consent') {
    const { error } = await account.client.from('account_consents').insert({ account_id: account.userId, consent_type: 'ai_processing', policy_version: command.policyVersion ?? 'ai-data-processing-initial-v1', granted: command.granted === true });
    return { label, status: error ? 'consent_rejected' : 'consent_recorded', code: error ? errorCode(error) : null };
  }
  if (op === 'ai') {
    const { data, error } = await account.client.functions.invoke('herkeys-ai', { body: { state: createInitialState(), userText: 'Synthetic test: a pretend household has too many routine tasks. Where can we start?', history: [] }, headers: { Authorization: `Bearer ${account.session.access_token}` } });
    let reason;
    if (error?.context?.clone) { try { reason = (await error.context.clone().json()).reason; } catch {} }
    return { label, status: error ? 'ai_rejected' : 'ai_returned', httpStatus: error?.context?.status ?? 200, reason: typeof reason === 'string' && /^[a-z0-9_]{1,64}$/.test(reason) ? reason : null, schemaValid: !error && Boolean(parseHerKeysAiTurn(data)), provider: data?.meta?.provider, model: data?.meta?.model, providerRequestId: data?.meta?.requestId, providerLatencyMs: data?.meta?.latencyMs };
  }
  if (op === 'report') {
    Object.assign(supabaseConfig, { url: `https://${projects[account.environment]}.supabase.co`, anonKey: account.publishableKey, backend: account.environment });
    const result = await createAiReportClient(account.client).submit({ messageId: command.messageId ?? 'msg-1', reason: command.reason ?? 'unsafe', dedupeKey: command.dedupeKey ?? randomUUID() }, { accountId: account.userId, signal: new AbortController().signal });
    return { label, status: result };
  }
  if (op === 'rpc') {
    if (!rpcNames.has(command.name)) throw new Error('rpc_not_allowed');
    const args = command.name === 'bootstrap_account' ? { p_claim_key: randomUUID(), p_timezone: 'UTC', p_device_id: null } : command.args ?? {};
    const { data, error } = await account.client.rpc(command.name, args);
    return { label, status: error ? 'rpc_rejected' : 'rpc_returned', name: command.name, code: error ? errorCode(error) : null, data: error ? null : command.name === 'bootstrap_account' ? { returnedKeys: Object.keys(data ?? {}) } : data };
  }
  if (op === 'ownership') {
    const other = accounts.get(label === 'A' ? 'B' : 'A');
    if (!other?.session) throw new Error('second_account_required');
    const own = await account.client.from('household_members').select('household_id').eq('profile_id', account.userId);
    const foreign = await account.client.from('household_members').select('household_id').eq('profile_id', other.userId);
    const consents = await account.client.from('account_consents').select('account_id').eq('account_id', other.userId);
    return { label, status: 'ownership_read', ownHouseholds: own.data?.length, foreignHouseholds: foreign.data?.length, foreignConsents: consents.data?.length, rejected: Boolean(own.error || foreign.error || consents.error) };
  }
  if (op === 'switch') {
    const other = accounts.get(label === 'A' ? 'B' : 'A');
    if (!other?.session) throw new Error('second_account_required');
    const controller = new AbortController();
    const originalFetch = globalThis.fetch;
    let switched = false, edgeCalls = 0;
    const switchClient = createClient(`https://${projects[account.environment]}.supabase.co`, account.publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, storageKey: 'hk-v2-cert-switch' },
      global: { fetch: async (url, options) => {
        if (new URL(url).pathname.includes('/functions/')) edgeCalls++;
        const response = await originalFetch(url, options);
        if (new URL(url).pathname.endsWith('/account_consents') && !switched) {
          switched = true;
          await switchClient.auth.setSession({ access_token: other.session.access_token, refresh_token: other.session.refresh_token });
          controller.abort();
        }
        return response;
      } },
    });
    await switchClient.auth.setSession({ access_token: account.session.access_token, refresh_token: account.session.refresh_token });
    process.env.EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE = 'true';
    const result = await createHerKeysAiClient(switchClient).advance({ state: createInitialState(), userText: 'Synthetic account switch probe', history: [] }, { accountId: account.userId, signal: controller.signal });
    return { label, status: 'switch_test', switched, edgeCalls, result: result.kind };
  }
  throw new Error('unknown_operation');
}

emit({ status: 'ready', secretsPersisted: false });
if (process.stdin.isTTY) process.stdin.setRawMode(true);
const lines = createInterface({ input: process.stdin, terminal: false });
for await (const line of lines) {
  try {
    const command = JSON.parse(line);
    if (command.op === 'exit') break;
    const start = network.length;
    const result = await execute(command);
    emit({ ...result, requests: network.slice(start) });
  } catch { emit({ status: 'operation_failed' }); }
}
lines.close();
if (process.stdin.isTTY) process.stdin.setRawMode(false);
