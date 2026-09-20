import { createHmac } from 'node:crypto';
import { createClient } from '@supabase/supabase-js';

/**
 * A deterministic simulated device.
 *
 * Each one has its OWN persisted namespace, identity map, queue, cursor,
 * evidence, lifecycle, origin_device_id and coordinator. They share exactly one
 * thing: the real local Supabase backend. Nothing mutable is shared in memory,
 * which is the only way second-device behaviour can be proven without real
 * phones.
 *
 * `restart()` throws away the runtime and rebuilds it from the persisted blob —
 * the same thing a process death and relaunch does — so durability is testable
 * rather than assumed.
 */

const API_URL = process.env.HERKEYS_LOCAL_API_URL ?? 'http://127.0.0.1:54321';
const ANON_KEY =
  process.env.HERKEYS_LOCAL_ANON_KEY ??
  'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0';
/** The published local development secret. Not a credential: it is in Supabase's own docs. */
const JWT_SECRET =
  process.env.HERKEYS_LOCAL_JWT_SECRET ?? 'super-secret-jwt-token-with-at-least-32-characters-long';

const b64 = (value) => Buffer.from(value).toString('base64url');

/** An `authenticated` JWT for one synthetic local account. */
export function mintJwt(sub) {
  const header = b64(JSON.stringify({ alg: 'HS256', typ: 'JWT' }));
  const payload = b64(
    JSON.stringify({
      sub,
      role: 'authenticated',
      aud: 'authenticated',
      iss: 'supabase-demo',
      iat: Math.floor(Date.now() / 1000) - 10,
      exp: Math.floor(Date.now() / 1000) + 3600,
    })
  );
  const signature = createHmac('sha256', JWT_SECRET).update(`${header}.${payload}`).digest('base64url');
  return `${header}.${payload}.${signature}`;
}

export function clientFor(accountId) {
  return createClient(API_URL, ANON_KEY, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${mintJwt(accountId)}` } },
  });
}

export async function apiReachable() {
  try {
    const response = await fetch(`${API_URL}/rest/v1/`, { headers: { apikey: ANON_KEY } });
    return response.status < 500;
  } catch {
    return false;
  }
}

/**
 * Per-device durable storage.
 *
 * One object holds the household state and its namespace, and `commit` replaces
 * both at once — which is the whole point: a batch and its cursor become durable
 * together or not at all. `failNextCommit` is the crash.
 */
export function createDeviceStore() {
  let blob = null;
  let failNext = false;

  return {
    read: () => (blob === null ? null : JSON.parse(blob)),
    commit(state, namespace) {
      if (failNext) {
        failNext = false;
        throw new Error('Simulated process death before the write landed');
      }
      blob = JSON.stringify({ state, namespace });
    },
    failNextCommit() {
      failNext = true;
    },
    isEmpty: () => blob === null,
  };
}

/**
 * A transport wrapper that can lose an acknowledgement.
 *
 * The request really is sent and the server really does commit; only the ANSWER
 * is discarded. A fully mocked transport could not prove this case, because the
 * whole point is that the server state and the client state disagree.
 */
export function withLostAck(transport, plan) {
  const remaining = { ...plan };
  const maybeLose = (operation, result) => {
    if (remaining[operation] > 0) {
      remaining[operation] -= 1;
      return { kind: 'failure', failure: 'unreachable', detail: `simulated lost ${operation} acknowledgement`, code: null };
    }
    return result;
  };

  return {
    async create(...args) {
      return maybeLose('create', await transport.create(...args));
    },
    async update(...args) {
      return maybeLose('update', await transport.update(...args));
    },
    async pull(...args) {
      return maybeLose('pull', await transport.pull(...args));
    },
    async fetchRows(...args) {
      return maybeLose('fetchRows', await transport.fetchRows(...args));
    },
  };
}

/** A transport that is simply not reachable. */
export function offlineTransport() {
  const down = async () => ({ kind: 'failure', failure: 'unreachable', detail: 'offline', code: null });
  return { create: down, update: down, pull: down, fetchRows: down };
}
