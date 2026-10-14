// Premium Stage 1 — DIFFERENTIAL PARITY: the SQL state derivation (public.premium_derive_state, the server's authority) and the
// TypeScript derivation (entitlementState.ts, what the app and handlers use) must agree on every input. A seeded generator covers
// every field combination plus the exact boundary instants (expires_at == now, grace == now, now - 1ms ...).
//
//   node supabase/tests/run-premium.mjs --parity
import { deriveEntitlementState } from '../functions/_shared/premium/entitlementState.ts';

const NOW_MS = Date.UTC(2026, 9, 13, 15, 0, 0);

function prng(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 0x100000000;
  };
}

const OFFSETS = [null, 0, -1, 1, -1000, 1000, -86_400_000, 86_400_000, -30 * 86_400_000, 30 * 86_400_000];

export async function premiumParity({ check, psql, scalar }) {
  const rand = prng(20261013);
  const pick = (items) => items[Math.floor(rand() * items.length)];
  const rows = [];
  for (let i = 0; i < 4000; i += 1) {
    const at = (offset) => (offset === null ? null : new Date(NOW_MS + offset).toISOString());
    rows.push({
      exists: rand() > 0.05,
      source: pick(['webhook', 'reconcile', 'test_fixture']),
      has_entitlement: rand() > 0.15,
      expires_at: at(pick(OFFSETS)),
      grace_expires_at: at(pick(OFFSETS)),
      canceled_at: at(pick([null, null, -1000])),
      revoked_at: at(pick([null, null, null, -1000])),
      expiration_confirmed_at: at(pick([null, null, -1000])),
      fixtures_allowed: rand() > 0.5,
    });
  }

  const sqlValue = (v) => (v === null ? 'NULL' : typeof v === 'boolean' ? String(v) : `'${v}'`);
  const values = rows
    .map((r, i) => `(${i}, ${sqlValue(r.exists)}, ${sqlValue(r.source)}, ${sqlValue(r.has_entitlement)}, ${sqlValue(r.expires_at)}::timestamptz, ${sqlValue(r.grace_expires_at)}::timestamptz, ${sqlValue(r.canceled_at)}::timestamptz, ${sqlValue(r.revoked_at)}::timestamptz, ${sqlValue(r.expiration_confirmed_at)}::timestamptz, ${sqlValue(r.fixtures_allowed)})`)
    .join(',\n');
  const out = scalarMany(psql, `
    SELECT i || '|' || public.premium_derive_state(e, s, h, x, g, c, r, f, fx, '${new Date(NOW_MS).toISOString()}'::timestamptz)
    FROM (VALUES ${values}) AS t(i, e, s, h, x, g, c, r, f, fx) ORDER BY i;`);

  const sql = new Map(out.map((line) => line.split('|')).map(([i, state]) => [Number(i), state]));
  let mismatches = 0;
  const examples = [];
  const histogram = {};
  rows.forEach((r, i) => {
    const projection = r.exists
      ? {
          source: r.source, has_entitlement: r.has_entitlement, expires_at: r.expires_at, grace_expires_at: r.grace_expires_at,
          canceled_at: r.canceled_at, revoked_at: r.revoked_at, expiration_confirmed_at: r.expiration_confirmed_at,
        }
      : null;
    const ts = deriveEntitlementState(projection, NOW_MS, r.fixtures_allowed);
    histogram[ts] = (histogram[ts] ?? 0) + 1;
    if (ts !== sql.get(i)) {
      mismatches += 1;
      if (examples.length < 3) examples.push(`${JSON.stringify(r)} ts=${ts} sql=${sql.get(i)}`);
    }
  });
  check(`SQL and TypeScript derive the SAME state for all ${rows.length} generated rows (${mismatches} mismatches)`, mismatches === 0, examples.join(' ; '));
  const reached = ['unknown', 'free', 'premium_active', 'premium_canceled_active', 'premium_billing_grace', 'premium_expired', 'premium_revoked'];
  check(`the generator reached every derivable state (${reached.map((s) => `${s}:${histogram[s] ?? 0}`).join(' ')})`, reached.every((s) => (histogram[s] ?? 0) > 0));
}

function scalarMany(psql, sql) {
  return psql(`\\pset format unaligned\n\\pset tuples_only on\n${sql}`, 'parity').split('\n').map((l) => l.trim()).filter((l) => /^\d+\|/.test(l));
}
