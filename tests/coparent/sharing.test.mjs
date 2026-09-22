import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { hubTextManifest, presentHub, presentTransitionDetail } from '../../src/features/coparent/present.ts';
import { buildCoParentLogisticsView, buildTransitionDetail } from '../../src/features/coparent/projection.ts';
import { DAY, NOW, TZ, followUp, handoff, prep, request, world } from '../fixtures/coparent/world.mjs';

const root = fileURLToPath(new URL('../../', import.meta.url));
const read = (rel) => readFileSync(`${root}${rel}`, 'utf8');
const ctx = { today: DAY, zone: TZ };

describe('Sharing truth: `coparent-shared` is an OWNER-ONLY scope label, and Feature 07 never says otherwise', () => {
  test('CP1 capability fact, inspected mechanically in the shipping migration: only household/child are open to members', () => {
    const sql = read('supabase/migrations/20260919231500_build4_cloud_schema.sql').replace(/\r\n/g, '\n');
    const fn = /CREATE FUNCTION private\.can_access_scoped_row\([\s\S]*?\$fn\$;/.exec(sql)?.[0] ?? '';
    assert.ok(fn.length > 0, 'the scope predicate exists');
    assert.match(fn, /p_scope\s+IN\s+\('household',\s*'child'\)/, 'household and child are the ONLY member-visible scopes');
    assert.match(fn, /p_owner_profile_id\s*=\s*\(SELECT auth\.uid\(\)\)/, 'every other scope requires the row owner');
    assert.doesNotMatch(fn, /coparent/i, 'coparent-shared is not granted to anyone by this predicate');
    // ... and a coparent-shared row always has an owner (the owner/scope pairing CHECK).
    assert.match(sql, /scope\s*=\s*ANY\s*\(ARRAY\['personal'::text,\s*'professional'::text,\s*'coparent-shared'::text\]\)|scope IN \('personal',\s*'professional',\s*'coparent-shared'\)/i);
  });

  test('the executable proof of that enforcement exists in the backend harness (SQL test 20): owner allowed, other member denied', () => {
    const sql = read('supabase/tests/20-scope-isolation.sql');
    assert.match(sql, /coparent-shared/);
    assert.match(sql, /never a grant of access|private category/i);
  });

  test('every row Feature 07 creates is `coparent-shared` (the most private scope), never `household`/`child`', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w, { counterpart: { kind: 'person', personId: alex } });
    prep(w, { linkEventId: id });
    followUp(w);
    assert.deepEqual([...new Set(w.state.events.map((e) => e.scope))], ['coparent-shared']);
    assert.deepEqual([...new Set(w.state.tasks.map((t) => t.scope))], ['coparent-shared']);
    // The people, responsibilities, dependencies and recurrences are owner-private by their schema (`scope: 'personal'`).
    assert.deepEqual([...new Set(w.state.responsibilities.map((r) => r.scope))], ['personal']);
    assert.deepEqual([...new Set(w.state.people.map((p) => p.scope))], ['personal']);
  });

  test('the view says only "Only your account can open this" for an owner-only row — and says NOTHING about visibility for any other scope', () => {
    const w = world();
    const id = handoff(w);
    const detail = buildTransitionDetail(w.state, w.state.household.id, id, { nowMs: NOW });
    assert.equal(detail.transition.ownerOnly, true);
    assert.equal(presentTransitionDetail(detail, ctx).privacyLine, 'Only your account can open this in Her Keys.');

    // A co-parenting event filed through the generic editor is `household` scope (MP-07-14): no sentence about who can see it.
    w.state = { ...w.state, events: w.state.events.map((e) => (e.id === id ? { ...e, scope: 'household' } : e)) };
    const other = buildTransitionDetail(w.state, w.state.household.id, id, { nowMs: NOW });
    assert.equal(other.transition.ownerOnly, false);
    assert.equal(presentTransitionDetail(other, ctx).privacyLine, null);
  });

  test('no presentation, for any state, says shared / sharing / visible to / can see this / sent to / both parents / the raw scope label', () => {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w, { counterpart: { kind: 'person', personId: alex }, location: 'Front desk' });
    request; // the recorded request lives on the handoff itself
    prep(w, { linkEventId: id });
    followUp(w, { counterpart: { kind: 'person', personId: alex } });
    const v = buildCoParentLogisticsView(w.state, w.state.household.id, { nowMs: NOW });
    const detail = buildTransitionDetail(w.state, w.state.household.id, id, { nowMs: NOW });
    const strings = [...hubTextManifest(presentHub(v, ctx)), JSON.stringify(presentTransitionDetail(detail, ctx))].join('\n');
    assert.doesNotMatch(strings, /\bshar(e|ed|es|ing)\b|visible to|can see (this|it)|sent to|both parents|shared with|coparent-shared|co-parent-shared|access(ible)? (to|for)/i);
  });

  test('the counterpart needs no account, no invitation and no access: nothing in the view or mutations addresses a person outside the household', () => {
    const w = world();
    const alex = w.person('Alex');
    assert.equal(w.state.people.find((p) => p.id === alex).channel, 'unspecified', 'no way of reaching them is recorded, and none is required');
    const id = handoff(w, { counterpart: { kind: 'person', personId: alex } });
    const v = buildCoParentLogisticsView(w.state, w.state.household.id, { nowMs: NOW });
    assert.equal(v.transitions.find((t) => t.id === id).responsibility.evidence.sent, false);
    const rowText = JSON.stringify(presentHub(v, ctx));
    assert.match(rowText, /Her Keys has not contacted Alex\./);
    // The state contains no intent / execution / message of any kind after using every part of the feature.
    assert.deepEqual([w.state.intents.length, w.state.executions.length, w.state.outcomes.length, w.state.authorities.length], [0, 0, 0, 0]);
  });
});
