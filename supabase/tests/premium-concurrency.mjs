// Premium Stage 1 — REAL concurrency: N overlapping database sessions (each psql is its own backend connection) racing the quota,
// the idempotency key and the global budget. A single session can never show a race; this does.
//
//   node supabase/tests/run-premium.mjs --concurrency
const UA = '11111111-1111-4111-8111-111111111111';
const UB = '22222222-2222-4222-8222-222222222222';
const UD = '44444444-4444-4444-8444-444444444444';

const call = (account, household, feature, key, extra = '') =>
  `SELECT (d->>'outcome') || '|' || (d->>'reason') || '|' || coalesce(d->>'replay','') FROM (SELECT public.premium_authorize('${account}', '${feature}', '${household}', '${key}'${extra}) AS d) s;`;

async function race(psqlAsync, statements) {
  const results = await Promise.all(statements.map((sql) => psqlAsync(sql)));
  return results.map((r) => (r.ok ? r.stdout.trim().split('\n').pop() : `ERROR:${r.stderr.trim().split('\n')[0]}`));
}

export async function premiumConcurrency({ check, psql, scalar, psqlAsync }) {
  const hh = scalar(`SELECT household_id FROM public.household_members WHERE profile_id = '${UA}' AND role = 'owner'`);

  // ---- 1. N parallel DISTINCT requests against a limit of 5: exactly 5 may be admitted -------------------------------------
  psql(`
    SELECT herkeys_test.premium_grant('${UA}', 'active');
    UPDATE public.premium_feature_config SET premium_limit = 5, rate_limit_per_minute = 600 WHERE feature_key = 'daily_load_premium';
    DELETE FROM public.premium_usage WHERE account_id = '${UA}';
    DELETE FROM public.premium_usage_events WHERE account_id = '${UA}';`, 'concurrency setup 1');
  const distinct = await race(psqlAsync, Array.from({ length: 16 }, (_, i) => call(UA, hh, 'daily_load_premium', `race-distinct-${String(i).padStart(3, '0')}`)));
  const admitted = distinct.filter((r) => r.startsWith('allowed')).length;
  const refused = distinct.filter((r) => r.startsWith('denied|quota_exhausted')).length;
  check(`16 concurrent sessions against a limit of 5 admit EXACTLY 5 (admitted ${admitted}, quota_exhausted ${refused})`, admitted === 5 && refused === 11, distinct.join(' ; '));
  check('the stored counter never exceeds the limit', scalar(`SELECT used + reserved FROM public.premium_usage WHERE account_id = '${UA}' AND feature_key = 'daily_load_premium'`) === '5');

  // ---- 2. N parallel requests with the SAME key: one charge, the rest replays ---------------------------------------------------
  psql(`DELETE FROM public.premium_usage WHERE account_id = '${UA}'; DELETE FROM public.premium_usage_events WHERE account_id = '${UA}';
        UPDATE public.premium_feature_config SET premium_limit = 50 WHERE feature_key = 'daily_load_premium';`, 'concurrency setup 2');
  const same = await race(psqlAsync, Array.from({ length: 10 }, () => call(UA, hh, 'daily_load_premium', 'race-same-key-0001')));
  const allAllowed = same.every((r) => r.startsWith('allowed'));
  check(`10 concurrent retries of ONE idempotency key all succeed (${same.filter((r) => r.endsWith('|true')).length} replays)`, allAllowed, same.join(' ; '));
  check('…and the account was charged exactly once', scalar(`SELECT reserved FROM public.premium_usage WHERE account_id = '${UA}' AND feature_key = 'daily_load_premium'`) === '1'
    && scalar(`SELECT count(*) FROM public.premium_usage_events WHERE account_id = '${UA}' AND idempotency_key = 'race-same-key-0001'`) === '1');

  // ---- 3. Global cost cap across accounts: cap 10, weight 5 => exactly 2 admitted of 8 ------------------------------------------
  psql(`
    SELECT herkeys_test.premium_grant('${UB}', 'active');
    INSERT INTO public.account_consents (account_id, consent_type, policy_version, granted) VALUES
      ('${UA}', 'ai_processing', 'ai-data-processing-initial-v1', true), ('${UB}', 'ai_processing', 'ai-data-processing-initial-v1', true);
    UPDATE public.premium_feature_config SET global_daily_cost_cap = 10, cost_weight = 5, premium_limit = 100, rate_limit_per_minute = 600 WHERE feature_key = 'smart_inbox_extract';
    DELETE FROM public.premium_usage_global; DELETE FROM public.premium_usage WHERE feature_key = 'smart_inbox_extract';`, 'concurrency setup 3');
  const budget = await race(psqlAsync, Array.from({ length: 8 }, (_, i) => call(i % 2 ? UA : UB, hh, 'smart_inbox_extract', `race-budget-${String(i).padStart(3, '0')}`)));
  const ok3 = budget.filter((r) => r.startsWith('allowed')).length;
  check(`8 concurrent captures against a global cap that fits 2 admit EXACTLY 2 (admitted ${ok3})`, ok3 === 2, budget.join(' ; '));
  check('global spend equals the cap, never more', scalar(`SELECT cost_units FROM public.premium_usage_global WHERE feature_key = 'smart_inbox_extract'`) === '10');
  check('per-account reservations compensated for every refused request (reserved sums to admitted)',
    scalar(`SELECT coalesce(sum(reserved), 0) FROM public.premium_usage WHERE feature_key = 'smart_inbox_extract'`) === String(ok3));

  // ---- 4. Free allowance: approved allowance of 3, 10 parallel => 3 ------------------------------------------------------------
  psql(`
    INSERT INTO public.profiles (id, timezone) VALUES ('${UD}', 'America/Chicago') ON CONFLICT (id) DO NOTHING;
    INSERT INTO public.household_members (household_id, local_id, profile_id, member_type, role, display_name, scope)
      SELECT '${hh}', 'user-d-race', '${UD}', 'adult', 'member', NULL, 'personal' ON CONFLICT DO NOTHING;
    SELECT herkeys_test.premium_grant('${UD}', 'free');
    INSERT INTO public.account_consents (account_id, consent_type, policy_version, granted) VALUES ('${UD}', 'ai_processing', 'ai-data-processing-initial-v1', true);
    UPDATE public.premium_feature_config SET global_daily_cost_cap = NULL, free_allowance = 3, free_allowance_status = 'approved', cost_weight = 1 WHERE feature_key = 'smart_inbox_extract';`, 'concurrency setup 4');
  const free = await race(psqlAsync, Array.from({ length: 10 }, (_, i) => call(UD, hh, 'smart_inbox_extract', `race-free-${String(i).padStart(3, '0')}`)));
  const ok4 = free.filter((r) => r.startsWith('allowed')).length;
  check(`10 concurrent sessions against an approved free allowance of 3 admit EXACTLY 3 (admitted ${ok4})`, ok4 === 3, free.join(' ; '));

  // ---- cleanup: restore the seed so later runs are unaffected ------------------------------------------------------------------
  psql(`
    DELETE FROM public.premium_usage; DELETE FROM public.premium_usage_events; DELETE FROM public.premium_usage_global;
    DELETE FROM public.premium_authorization_audit; DELETE FROM public.premium_entitlements;`, 'concurrency cleanup');
}
