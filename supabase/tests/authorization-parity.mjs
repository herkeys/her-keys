import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');

/**
 * THE AUTHORIZATION BOUNDARY, HELD TO ONE ANSWER.
 *
 * `executionAuthorization()` in TypeScript and `guard_execution_authorization()` in the database are the
 * same rule stated twice: an execution needs an approval that still stands, or an execute-mode authority that
 * covers the intent and is unspent. Two statements of one rule drift. So this runs THE SAME CASES through both and
 * requires the SAME VERDICT — authorized, or the same named reason — for every one.
 *
 * Nothing here executes anything: an execution row is a record, and the case is whether the record may exist.
 */

const T0 = '2026-09-16T14:00:00.000Z';
const DAY = 86_400_000;
const at = (offsetMs) => new Date(Date.parse(T0) + offsetMs).toISOString();

const KIDS = 'cat-kids';
const HOME = 'cat-home';

/** Cases are declarative, so the SQL fixtures and the TypeScript state are built from the same description. */
export const CASES = [
  { name: 'explicit approval stands', decisions: [{ id: 'd', of: 'i', decision: 'approved' }], use: { decision: 'd' }, expect: 'authorized' },
  { name: 'a declined intent has no approval', decisions: [{ id: 'd', of: 'i', decision: 'declined' }], use: { decision: 'd' }, expect: 'not_approved' },
  { name: 'an approval that was withdrawn no longer stands', decisions: [{ id: 'd', of: 'i', decision: 'approved' }, { id: 'w', of: 'i', decision: 'withdrawn' }], use: { decision: 'd' }, expect: 'not_approved' },
  { name: 'a decision belonging to a different intent', otherIntent: true, decisions: [{ id: 'd', of: 'other', decision: 'approved' }], use: { decision: 'd' }, expect: 'wrong_intent' },
  { name: 'no approval and no authority', use: {}, expect: 'no_authorization' },

  { name: 'a covering execute-mode authority', authorities: [{ id: 'a' }], use: { authority: 'a' }, expect: 'authorized' },
  { name: 'an authority that only asks approval is not execute mode', authorities: [{ id: 'a', mode: 'ask_approval' }], use: { authority: 'a' }, expect: 'not_execute_mode' },
  { name: 'an authority revoked before the attempt', authorities: [{ id: 'a', revokedAt: at(-DAY / 2) }], use: { authority: 'a' }, expect: 'revoked' },
  { name: 'an authority revoked AFTER the attempt still covered it', authorities: [{ id: 'a', revokedAt: at(DAY) }], use: { authority: 'a' }, expect: 'authorized' },
  { name: 'an authority granted after the attempt', authorities: [{ id: 'a', grantedAt: at(DAY) }], use: { authority: 'a' }, expect: 'not_yet_granted' },
  { name: 'an authority that had expired', authorities: [{ id: 'a', expiresAt: at(-DAY / 2) }], use: { authority: 'a' }, expect: 'expired' },
  { name: 'an authority for a different category of action', intent: { category: 'schedule_change', consequence: 'moderate' }, authorities: [{ id: 'a', category: 'internal_reminder' }], use: { authority: 'a' }, expect: 'wrong_category' },
  { name: 'an intent more consequential than the authority reaches', intent: { consequence: 'high' }, authorities: [{ id: 'a', maxConsequence: 'low' }], use: { authority: 'a' }, expect: 'consequence_exceeds_authority' },
  { name: 'an authority limited to another life area', about: 'task-kids', authorities: [{ id: 'a', categoryLocal: HOME }], use: { authority: 'a' }, expect: 'outside_category_boundary' },
  { name: 'an authority limited to this life area', about: 'task-kids', authorities: [{ id: 'a', categoryLocal: KIDS }], use: { authority: 'a' }, expect: 'authorized' },
  { name: 'an authority limited to one child, acting on another', about: 'task-child2', authorities: [{ id: 'a', childLocal: 'child-1' }], use: { authority: 'a' }, expect: 'outside_child_boundary' },
  { name: 'an authority limited to one child, acting on that child', about: 'task-child1', authorities: [{ id: 'a', childLocal: 'child-1' }], use: { authority: 'a' }, expect: 'authorized' },
  { name: 'a child-limited authority cannot act on something about no child', about: 'task-kids', authorities: [{ id: 'a', childLocal: 'child-1' }], use: { authority: 'a' }, expect: 'outside_child_boundary' },
  { name: 'an authority limited to one provider, acting through another', intent: { provider: 'outlook' }, authorities: [{ id: 'a', provider: 'gmail' }], use: { authority: 'a' }, expect: 'outside_provider_boundary' },
  { name: 'an authority limited to one provider, acting through it', intent: { provider: 'gmail' }, authorities: [{ id: 'a', provider: 'gmail' }], use: { authority: 'a' }, expect: 'authorized' },
  { name: 'a spend over the limit', intent: { category: 'financial_action', consequence: 'critical', amount: { minor: 6000, currency: 'USD' } }, authorities: [{ id: 'a', category: 'financial_action', maxConsequence: 'critical', limit: { minor: 5000, currency: 'USD' } }], use: { authority: 'a' }, expect: 'exceeds_amount_limit' },
  { name: 'a spend exactly at the limit', intent: { category: 'financial_action', consequence: 'critical', amount: { minor: 5000, currency: 'USD' } }, authorities: [{ id: 'a', category: 'financial_action', maxConsequence: 'critical', limit: { minor: 5000, currency: 'USD' } }], use: { authority: 'a' }, expect: 'authorized' },
  { name: 'a spend in another currency is never "within" the limit', intent: { category: 'financial_action', consequence: 'critical', amount: { minor: 100, currency: 'EUR' } }, authorities: [{ id: 'a', category: 'financial_action', maxConsequence: 'critical', limit: { minor: 5000, currency: 'USD' } }], use: { authority: 'a' }, expect: 'exceeds_amount_limit' },
  { name: 'a one-time authority is spent by its first execution', authorities: [{ id: 'a', persistent: false }], use: { authority: 'a' }, twice: true, expect: 'authorized', expectSecond: 'already_used' },
  { name: 'a standing authority can be used again', authorities: [{ id: 'a', persistent: true }], use: { authority: 'a' }, twice: true, expect: 'authorized', expectSecond: 'authorized' },
];

/** A fixture insert whose failure is reported rather than swallowed: a case that silently lost a row proves nothing. */
const fixture = (call) => `WITH r AS (SELECT ${call} AS e) SELECT 'FIXTURE_ERROR|' || e FROM r WHERE e IS NOT NULL;`;
const q = (v) => (v === null || v === undefined ? 'NULL' : `'${String(v).replace(/'/g, "''")}'`);

function normalize(c) {
  return {
    ...c,
    intent: { category: 'internal_reminder', consequence: 'low', provider: null, amount: null, ...(c.intent ?? {}) },
    authorities: (c.authorities ?? []).map((a) => ({
      category: 'internal_reminder', mode: 'execute_authorized', maxConsequence: 'low', persistent: true,
      categoryLocal: null, childLocal: null, provider: null, limit: null,
      grantedAt: at(-DAY), expiresAt: null, revokedAt: null, ...a,
    })),
    decisions: c.decisions ?? [],
    about: c.about ?? null,
  };
}

/** The SQL for one case: its fixtures, then the attempt(s). Every local id is prefixed by the case so cases never collide. */
function sqlFor(index, raw) {
  const c = normalize(raw);
  const p = `c${index}-`;
  const lines = [];
  const aboutSql = c.about
    ? `, 'about_type', 'task', 'about_task_id', (SELECT id FROM public.tasks WHERE household_id = :'hh_a' AND local_id = ${q(`ap-${c.about}`)})`
    : '';
  const amount = c.intent.amount
    ? `, 'amount_amount_minor', ${c.intent.amount.minor}, 'amount_currency', ${q(c.intent.amount.currency)}, 'amount_direction', 'outflow'`
    : '';
  const intents = [['i', c.intent]];
  if (c.otherIntent) intents.push(['other', { category: 'internal_reminder', consequence: 'low', provider: null }]);
  for (const [id, intent] of intents) {
    lines.push(fixture(`herkeys_test.ins('action_intents', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', ${q(p + id)}, 'category', ${q(intent.category)},
      'consequence', ${q(intent.consequence)}, 'reversibility', 'reversible', 'summary_code', 'parity', 'permitted_mode', 'suggest', 'provider', ${q(intent.provider)},
      'producer', 'ai-inference', 'confidence', 'possible'${id === 'i' ? aboutSql + amount : ''}))`));
  }
  for (const a of c.authorities) {
    const cat = a.categoryLocal ? `(SELECT id FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = ${q(a.categoryLocal)})` : 'NULL';
    const child = a.childLocal ? `(SELECT id FROM public.household_members WHERE household_id = :'hh_a' AND local_id = ${q(a.childLocal)})` : 'NULL';
    lines.push(fixture(`herkeys_test.ins('automation_authorities', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', ${q(p + a.id)}, 'category', ${q(a.category)},
      'mode', ${q(a.mode)}, 'max_consequence', ${q(a.maxConsequence)}, 'persistent', ${a.persistent}, 'category_id', ${cat}, 'subject_member_id', ${child}, 'provider', ${q(a.provider)},
      'max_amount_minor', ${a.limit ? a.limit.minor : 'NULL'}, 'max_amount_currency', ${a.limit ? q(a.limit.currency) : 'NULL'},
      'granted_at', ${q(a.grantedAt)}::timestamptz, 'expires_at', ${a.expiresAt ? `${q(a.expiresAt)}::timestamptz` : 'NULL'}, 'revoked_at', ${a.revokedAt ? `${q(a.revokedAt)}::timestamptz` : 'NULL'}))`));
  }
  for (const d of c.decisions) {
    lines.push(fixture(`herkeys_test.ins('intent_decisions', jsonb_build_object('household_id', :'hh_a', 'profile_id', :'ua', 'local_id', ${q(p + d.id)},
      'intent_id', (SELECT id FROM public.action_intents WHERE household_id = :'hh_a' AND local_id = ${q(p + d.of)}), 'decision', ${q(d.decision)}, 'basis', 'explicit', 'decided_at', ${q(at(-DAY / 4))}::timestamptz))`));
  }
  const attempt = (n, label) =>
    `SELECT 'CASE|${index}|${label}|' || COALESCE(pg_temp.verdict(:'hh_a', :'ua', ${q(p + 'i')}, ${q(c.use.decision ? p + c.use.decision : null)}, ${q(c.use.authority ? p + c.use.authority : null)}, ${q(T0)}::timestamptz, ${n}), 'authorized');`;
  lines.push(attempt(1, 'first'));
  if (c.twice) lines.push(attempt(2, 'second'));
  return lines.join('\n');
}

const HEADER = `
\\pset format unaligned
\\pset tuples_only on
\\set ua '11111111-1111-4111-8111-111111111111'
RESET ROLE;
BEGIN;
SELECT hm.household_id AS hh_a FROM public.household_members hm WHERE hm.profile_id = :'ua' AND hm.role = 'owner' \\gset
SELECT id AS cat_kids FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-kids' \\gset
SELECT id AS cat_home FROM public.household_categories WHERE household_id = :'hh_a' AND local_id = 'cat-home' \\gset
INSERT INTO public.household_members (household_id, local_id, profile_id, member_type, role, display_name, birth_date, scope)
VALUES (:'hh_a', 'child-2', NULL, 'child', 'member', 'Second child', DATE '2018-01-01', 'child') ON CONFLICT DO NOTHING;
SELECT id AS ch1 FROM public.household_members WHERE household_id = :'hh_a' AND local_id = 'child-1' \\gset
SELECT id AS ch2 FROM public.household_members WHERE household_id = :'hh_a' AND local_id = 'child-2' \\gset
INSERT INTO public.tasks (household_id, local_id, title, category_id, subject_member_id, duration_minutes, commitment, plan_kind, status, scope, producer) VALUES
  (:'hh_a', 'ap-task-kids',   'about kids',   :'cat_kids', NULL,      5, 'flexible', 'unplanned', 'open', 'household', 'user-action'),
  (:'hh_a', 'ap-task-home',   'about home',   :'cat_home', NULL,      5, 'flexible', 'unplanned', 'open', 'household', 'user-action'),
  (:'hh_a', 'ap-task-child1', 'about child1', :'cat_kids', :'ch1',    5, 'flexible', 'unplanned', 'open', 'child',     'user-action'),
  (:'hh_a', 'ap-task-child2', 'about child2', :'cat_kids', :'ch2',    5, 'flexible', 'unplanned', 'open', 'child',     'user-action');
CREATE FUNCTION pg_temp.verdict(p_hh uuid, p_ua uuid, p_intent text, p_decision text, p_authority text, p_attempted timestamptz, p_attempt int) RETURNS text LANGUAGE plpgsql AS $f$
DECLARE v_detail text;
BEGIN
  INSERT INTO public.action_executions (household_id, local_id, profile_id, intent_id, decision_id, authority_id, attempt, attempted_at, result, error_class, reversibility, producer, scope, origin_created_at)
  VALUES (p_hh, 'ex-' || p_intent || '-' || p_attempt, p_ua,
          (SELECT id FROM public.action_intents WHERE household_id = p_hh AND local_id = p_intent),
          (SELECT id FROM public.intent_decisions WHERE household_id = p_hh AND local_id = p_decision),
          (SELECT id FROM public.automation_authorities WHERE household_id = p_hh AND local_id = p_authority),
          p_attempt, p_attempted, 'succeeded', 'none', 'reversible', 'automation', 'personal', now());
  RETURN NULL;
EXCEPTION WHEN OTHERS THEN
  GET STACKED DIAGNOSTICS v_detail = PG_EXCEPTION_DETAIL;
  RETURN COALESCE(NULLIF(v_detail, ''), SQLSTATE || ' ' || SQLERRM);
END $f$;
`;

/** The TypeScript state for one case, and the verdict the local rule gives. */
function localVerdicts(m, raw) {
  const c = normalize(raw);
  const tasks = [
    { id: 'task-kids', categoryId: KIDS, subjectMemberId: null },
    { id: 'task-home', categoryId: HOME, subjectMemberId: null },
    { id: 'task-child1', categoryId: KIDS, subjectMemberId: 'child-1' },
    { id: 'task-child2', categoryId: KIDS, subjectMemberId: 'child-2' },
  ];
  const provenance = { producer: 'user-action', artifactId: null, confidence: null };
  const intent = {
    id: 'i', category: c.intent.category, about: c.about ? { kind: 'task', id: c.about } : null, consequence: c.intent.consequence, reversibility: 'reversible',
    summaryCode: 'parity', amount: c.intent.amount ? { amountMinor: c.intent.amount.minor, currency: c.intent.amount.currency, direction: 'outflow' } : null,
    provider: c.intent.provider, permittedMode: 'suggest', createdAt: at(-DAY), expiresAt: null, provenance, scope: 'personal',
  };
  const intents = [intent, ...(c.otherIntent ? [{ ...intent, id: 'other', about: null }] : [])];
  const authorities = c.authorities.map((a) => ({
    id: a.id, category: a.category, mode: a.mode, maxConsequence: a.maxConsequence, persistent: a.persistent, categoryId: a.categoryLocal, subjectMemberId: a.childLocal,
    provider: a.provider, maxAmountMinor: a.limit?.minor ?? null, maxAmountCurrency: a.limit?.currency ?? null, grantedAt: a.grantedAt, expiresAt: a.expiresAt, revokedAt: a.revokedAt,
    createdAt: a.grantedAt, updatedAt: a.grantedAt, provenance, scope: 'personal',
  }));
  const decisions = c.decisions.map((d) => ({ id: d.id, intentId: d.of, decision: d.decision, basis: 'explicit', authorityId: null, decidedAt: at(-DAY / 4), createdAt: at(-DAY / 4), provenance, scope: 'personal' }));
  const exec = (n) => ({ id: `ex-${n}`, intentId: 'i', decisionId: c.use.decision ?? null, authorityId: c.use.authority ?? null, attempt: n, attemptedAt: T0 });
  const base = { tasks, events: [], needsMe: [], systems: [], meals: [], goals: [], intents, authorities, decisions };
  const first = m.auth.executionAuthorization({ ...base, executions: [] }, exec(1));
  const out = [first.authorized ? 'authorized' : first.reason];
  if (c.twice) {
    const second = m.auth.executionAuthorization({ ...base, executions: [exec(1)] }, exec(2));
    out.push(second.authorized ? 'authorized' : second.reason);
  }
  return out;
}

export async function authorizationParity(check, psql, db = 'b4_env_c') {
  console.log('\n  authorization: the database and the domain give ONE answer');
  await import(`file://${join(REPO, 'tests', 'support', 'register-ts.mjs')}`);
  const m = { auth: await import(`file://${join(REPO, 'src', 'domain', 'authorization.ts')}`) };

  const script = HEADER + CASES.map((c, i) => sqlFor(i, c)).join('\n') + '\nROLLBACK;\n';
  const out = psql(db, script, { label: 'authorization parity' }).out;
  const sqlVerdicts = new Map();
  for (const line of out.split('\n')) {
    const hit = line.match(/^CASE\|(\d+)\|(first|second)\|(.*)$/);
    if (hit) sqlVerdicts.set(`${hit[1]}:${hit[2]}`, hit[3].trim());
  }

  let agree = 0;
  CASES.forEach((c, i) => {
    const local = localVerdicts(m, c);
    const first = sqlVerdicts.get(`${i}:first`);
    const second = sqlVerdicts.get(`${i}:second`);
    const wants = [c.expect, ...(c.twice ? [c.expectSecond] : [])];
    const got = [first, ...(c.twice ? [second] : [])];
    const ok = JSON.stringify(local) === JSON.stringify(got) && JSON.stringify(got) === JSON.stringify(wants);
    if (ok) agree += 1;
    check(`authorization parity: ${c.name} -> ${wants.join(' then ')}`, ok, `domain=${local.join(',')} database=${got.join(',')}`);
  });
  check(`authorization parity: all ${CASES.length} cases receive the same verdict from the domain and from the database`, agree === CASES.length, `${agree}/${CASES.length}`);
}
