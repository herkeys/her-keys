// Controlled Staging synthetic account only. Secrets arrive through non-echoing
// stdin, remain in memory, and never enter evidence or command-line arguments.
import { createInterface } from 'node:readline';
import { randomBytes, createHash } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';
import { createPasswordRecoveryPort } from '../src/platform/passwordRecoveryProvider.ts';
import { createSupabaseEmailPassword } from '../src/platform/emailPasswordProvider.ts';
import { createConsentLedger } from '../src/platform/consentBackend.ts';
import { consentStatus } from '../src/domain/consent.ts';
import { createInitialState } from '../src/features/talk-it-out/engine.ts';
import { parseHerKeysAiTurn } from '../src/features/talk-it-out/providerContract.ts';

const URL = 'https://fhhudicklmpofuzkxeqe.supabase.co';
const EMAIL = '1596029a@aiunteiark.resend.app';
const ACCOUNT = '70a28225-f3ca-4c63-8e88-e65c09d07a3e';
let key; let client; let recoveryClient; let recovery; let session;
const password = randomBytes(32).toString('base64url') + 'aA1!';
const requests = [];
const nativeFetch = globalThis.fetch;
const safeFetch = async (url, init) => {
  const response = await nativeFetch(url, { ...init, signal: init?.signal ?? AbortSignal.timeout(30000) });
  requests.push({ path: new globalThis.URL(String(url)).pathname, status: response.status,
    requestId: response.headers.get('sb-request-id') ?? response.headers.get('x-request-id') });
  return response;
};
const makeClient = () => createClient(URL, key, {
  auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  global: { fetch: safeFetch },
});
const emit = result => process.stdout.write(JSON.stringify(result) + '\n');
const requireAccount = async sdk => {
  const { data, error } = await sdk.auth.getUser();
  if (error || data.user?.id !== ACCOUNT || data.user?.user_metadata?.hk_v2_cert !== '20261017A') throw new Error('wrong_synthetic_account');
};
async function execute(command) {
  switch (command.op) {
    case 'setup':
      if (client || typeof command.publishableKey !== 'string' || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(command.publishableKey)) throw new Error('invalid_setup');
      key = command.publishableKey;
      client = makeClient(); recoveryClient = makeClient();
      recovery = createPasswordRecoveryPort(recoveryClient);
      return { status: 'configured', environment: 'staging', secretsPersisted: false };
    case 'request':
      return { status: await recovery.request(EMAIL) };
    case 'invalid-code':
      return { status: await recovery.verify(EMAIL, '000000') };
    case 'verify':
      if (!/^\d{6}$/.test(command.code)) throw new Error('invalid_code_shape');
      {
        const status = await recovery.verify(EMAIL, command.code);
        if (status === 'ok') await requireAccount(recoveryClient);
        return { status };
      }
    case 'verify-link-for-backend-probes': {
      // Diagnostic SDK exchange only. This does NOT certify the app's numeric
      // recovery flow: a link-only template is an external configuration defect.
      if (!/^[a-zA-Z0-9_-]{20,512}$/.test(command.tokenHash)) throw new Error('invalid_token_shape');
      const { data, error } = await client.auth.verifyOtp({ token_hash: command.tokenHash, type: 'recovery' });
      if (error || !data.session || data.user?.id !== ACCOUNT) return { status: 'failed' };
      await requireAccount(client);
      session = { accountId: ACCOUNT, accessToken: data.session.access_token, refreshToken: data.session.refresh_token };
      return { status: 'authenticated_for_backend_probes', applicationRecoveryCertified: false };
    }
    case 'password':
      await requireAccount(recoveryClient);
      return { status: await recovery.updatePassword(password) };
    case 'used-code': {
      if (!/^\d{6}$/.test(command.code)) throw new Error('invalid_code_shape');
      const isolated = createPasswordRecoveryPort(makeClient());
      const status = await isolated.verify(EMAIL, command.code);
      await isolated.dispose();
      return { status };
    }
    case 'login': {
      const result = await createSupabaseEmailPassword(client).authenticate('signIn', EMAIL, password);
      if (result.kind !== 'success') return { status: result.kind, detail: result.detail };
      if (result.session.accountId !== ACCOUNT) throw new Error('wrong_account');
      await requireAccount(client);
      session = result.session;
      return { status: 'authenticated', accountFingerprint: createHash('sha256').update(ACCOUNT).digest('hex') };
    }
    case 'refresh': {
      await requireAccount(client);
      const { data, error } = await client.auth.refreshSession();
      if (error || data.user?.id !== ACCOUNT || !data.session) return { status: 'failed' };
      session = { ...session, accessToken: data.session.access_token, refreshToken: data.session.refresh_token };
      return { status: 'renewed' };
    }
    case 'restore': {
      const restored = makeClient();
      const { error } = await restored.auth.setSession({ access_token: session.accessToken, refresh_token: session.refreshToken });
      if (error) return { status: 'failed' };
      await requireAccount(restored);
      return { status: 'restored' };
    }
    case 'consent': {
      await requireAccount(client);
      const ledger = createConsentLedger(session, makeClient());
      const result = typeof command.granted === 'boolean' ? await ledger.changeAiProcessing(command.granted) : await ledger.read();
      return { status: result.kind, ...(result.kind === 'ok' ? { summary: consentStatus(result.receipts) } : {}) };
    }
    case 'ai': {
      await requireAccount(client);
      const { data, error } = await client.functions.invoke('herkeys-ai', {
        body: { state: createInitialState(), userText: command.uncertain === true ? "I'm not sure yet" : 'Synthetic test: a pretend household has too many routine tasks. Where can we start?', history: [] },
        headers: { Authorization: 'Bearer ' + session.accessToken },
      });
      let reason;
      if (error?.context?.clone) { try { reason = (await error.context.clone().json()).reason; } catch {} }
      return { status: error ? 'rejected' : 'returned', httpStatus: error?.context?.status ?? 200,
        reason: typeof reason === 'string' && /^[a-z0-9_]{1,64}$/.test(reason) ? reason : null,
        schemaValid: !error && Boolean(parseHerKeysAiTurn(data)), provider: data?.meta?.provider, model: data?.meta?.model, requestId: data?.meta?.requestId };
    }
    case 'readiness': {
      await requireAccount(client);
      const { data, error } = await client.rpc('premium_purchase_readiness');
      return { status: error ? 'failed' : 'returned', data: error ? null : data };
    }
    case 'logout': {
      const { error } = await client.auth.signOut({ scope: 'local' });
      const { data } = await client.auth.getSession();
      return { status: !error && data.session === null ? 'signed_out' : 'failed' };
    }
    default: throw new Error('unsupported_operation');
  }
}
if (process.stdin.isTTY) process.stdin.setRawMode(true);
emit({ status: 'ready', environment: 'staging', secretsPersisted: false });
const lines = createInterface({ input: process.stdin, terminal: false });
for await (const line of lines) {
  try {
    const command = JSON.parse(line);
    if (command.op === 'exit') break;
    const start = requests.length;
    emit({ op: command.op, ...await execute(command), requests: requests.slice(start) });
  } catch { emit({ status: 'operation_failed' }); }
}
lines.close();
if (process.stdin.isTTY) process.stdin.setRawMode(false);
