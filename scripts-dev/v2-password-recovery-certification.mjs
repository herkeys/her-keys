// Live recovery probes use only these pre-existing, owner-authorized synthetic
// accounts. No account is created; no Auth configuration or household is changed.
// Secrets enter non-echoing stdin and never enter stdout or evidence files.
import { createInterface } from 'node:readline';
import { randomBytes, randomUUID, createHash } from 'node:crypto';
import { appendFileSync, mkdirSync, readFileSync } from 'node:fs';
import { dirname } from 'node:path';
import { createPasswordRecoveryPort } from '../src/platform/passwordRecoveryProvider.ts';
import { createSupabaseEmailPassword } from '../src/platform/emailPasswordProvider.ts';
import { createSupabaseClient } from '../src/platform/supabaseCloud.ts';
import { supabaseConfig } from '../src/config/supabase.ts';

const accounts = {
  staging: { ref: 'fhhudicklmpofuzkxeqe', id: '70a28225-f3ca-4c63-8e88-e65c09d07a3e' },
  production: { ref: 'npykvnxnehlsdlbumzwk', id: 'c07bdfd7-6cb0-49c8-9591-14e3eb5b9308' },
};
const environment = process.argv.find(a => a.startsWith('--environment='))?.slice(14);
if (!Object.hasOwn(accounts, environment)) throw new Error('explicit_environment_required');
const account = accounts[environment];
const evidencePath = `docs/handoffs/evidence/V2_RECOVERY_${environment.toUpperCase()}_20261113.jsonl`;
mkdirSync(dirname(evidencePath), { recursive: true });
const email = '1596029a@aiunteiark.resend.app';
const password = randomBytes(32).toString('base64url') + 'aA1!';
const runId = randomUUID();
const adapterSha256LF = createHash('sha256').update(readFileSync(new URL('../src/platform/passwordRecoveryProvider.ts', import.meta.url), 'utf8').replaceAll('\r\n', '\n')).digest('hex');
const requests = [];
let client; let recoveryClient; let recovery; let session;
const nativeFetch = globalThis.fetch;
globalThis.fetch = async (url, init) => {
  const response = await nativeFetch(url, init);
  const entry = { path: new URL(String(url)).pathname, status: response.status,
    requestId: response.headers.get('sb-request-id') ?? response.headers.get('x-request-id') };
  if (response.status >= 400) {
    try {
      const body = await response.clone().json();
      const code = body.code ?? body.error_code;
      if (typeof code === 'string' && /^[a-z0-9_]{1,64}$/.test(code)) entry.code = code;
    } catch { /* Deliberately omit response text, which may contain an address. */ }
  }
  requests.push(entry);
  return response;
};
const emit = result => {
  const evidence = { observedAt: new Date().toISOString(), runId, environment, ...result };
  appendFileSync(evidencePath, JSON.stringify(evidence) + '\n');
  process.stdout.write(JSON.stringify(evidence) + '\n');
};
const requireSynthetic = async sdk => {
  const { data, error } = await sdk.auth.getUser();
  if (error || data.user?.id !== account.id || data.user.email !== email || data.user.user_metadata?.hk_v2_cert !== '20261017A') throw new Error('synthetic_identity_mismatch');
};
const makeClient = () => {
  const sdk = createSupabaseClient(); // Shipping PKCE, ephemeral storage and timeout fetch.
  if (!sdk) throw new Error('client_unavailable');
  return sdk;
};
const validCode = command => {
  if (typeof command.code !== 'string' || !/^\d{6}$/.test(command.code)) throw new Error('invalid_code_shape');
  return command.code;
};
async function execute(command) {
  if (command.op === 'setup') {
    if (client || !/^sb_publishable_[A-Za-z0-9_-]+$/.test(command.publishableKey ?? '')) throw new Error('invalid_setup');
    Object.assign(supabaseConfig, { url: `https://${account.ref}.supabase.co`, backend: environment, anonKey: command.publishableKey });
    client = makeClient(); recoveryClient = makeClient(); recovery = createPasswordRecoveryPort(recoveryClient);
    return { status: 'configured', shippingClient: true, secretsPersisted: false };
  }
  if (!client) throw new Error('setup_required');
  switch (command.op) {
    case 'request': return { status: await recovery.request(email) };
    case 'new-flow':
      await recovery.dispose();
      recoveryClient = makeClient(); recovery = createPasswordRecoveryPort(recoveryClient);
      return { status: 'new_flow' };
    case 'verify': {
      const status = await recovery.verify(email, validCode(command));
      if (status === 'ok') await requireSynthetic(recoveryClient);
      return { status };
    }
    case 'reject-code': {
      // A fresh isolated client ensures rejection cannot inherit prior proof.
      const isolated = createPasswordRecoveryPort(makeClient());
      const status = await isolated.verify(email, validCode(command));
      await isolated.dispose();
      return { status, expectedRejection: command.reason === 'stale' ? 'stale' : command.reason === 'reused' ? 'reused' : 'invalid' };
    }
    case 'password': {
      await requireSynthetic(recoveryClient);
      return { status: await recovery.updatePassword(password) };
    }
    case 'login': {
      const result = await createSupabaseEmailPassword(client).authenticate('signIn', email, password);
      if (result.kind !== 'success') return { status: result.kind };
      if (result.session.accountId !== account.id) throw new Error('synthetic_identity_mismatch');
      await requireSynthetic(client); session = result.session;
      return { status: 'authenticated', canonicalAccountMatched: true };
    }
    case 'wrong-password': {
      const isolated = makeClient();
      const result = await createSupabaseEmailPassword(isolated).authenticate('signIn', email, randomBytes(32).toString('base64url'));
      return { status: result.kind };
    }
    case 'refresh': {
      await requireSynthetic(client);
      const { data, error } = await client.auth.refreshSession();
      if (error || data.user?.id !== account.id || !data.session) return { status: 'failed' };
      session = { ...session, accessToken: data.session.access_token, refreshToken: data.session.refresh_token };
      return { status: 'renewed' };
    }
    case 'restore': {
      if (!session) throw new Error('session_required');
      const restored = makeClient();
      const { error } = await restored.auth.setSession({ access_token: session.accessToken, refresh_token: session.refreshToken });
      if (error) return { status: 'failed' };
      await requireSynthetic(restored);
      return { status: 'restored', canonicalAccountMatched: true };
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
emit({ status: 'ready', adapterSha256LF, secretsPersisted: false });
const lines = createInterface({ input: process.stdin, terminal: false });
for await (const line of lines) {
  try {
    const command = JSON.parse(line);
    if (command.op === 'exit') break;
    const start = requests.length;
    emit({ op: command.op, ...await execute(command), requests: requests.slice(start) });
  } catch { emit({ status: 'operation_failed' }); }
}
await recovery?.dispose();
lines.close();
if (process.stdin.isTTY) process.stdin.setRawMode(false);
