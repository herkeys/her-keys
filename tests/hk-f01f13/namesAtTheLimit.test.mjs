/**
 * PHASE 12 — long names, duplicate names and long-but-valid text on the Wave 3/4 destinations (HK-F01-F13 integration audit).
 *
 * Each feature proved its screens with ordinary names. These fill Money, Work, Me / Rebuild, Life Admin and People with rows whose
 * titles and names sit exactly at the domain's limits, twice over, and prove: every screen renders; both same-named rows are listed
 * and each opens its own record (identity is the id, never the name); the whole text reaches the screen and its accessibility label
 * (nothing is cut in the data); and a form field never takes more than the record it feeds may hold (HK13-D38).
 */
import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { PEOPLE_LIMITS } from '../../src/domain/foundation/personContext.ts';
import { addLifeRecord } from '../../src/domain/lifeRecords.ts';
import { completeOnboarding, toggleOnboardingOption } from '../../src/domain/onboarding.ts';
import { addOpportunity } from '../../src/domain/opportunities.ts';
import { addExternalPerson } from '../../src/domain/people.ts';
import { addRebuildFocus } from '../../src/domain/rebuild/commands.ts';
import { REBUILD_FOCUS_TITLE_MAX } from '../../src/domain/rebuild/schema.ts';
import { FIELD_LIMITS, LIFE_RECORD_LIMITS, validateAppState } from '../../src/domain/state.ts';
import { buildLifeAdminView } from '../../src/features/lifeAdmin/lifeAdminView.ts';
import { createObligation } from '../../src/features/money/mutations.ts';
import { buildMoneyHomeView } from '../../src/features/money/projection.ts';
import { buildPeopleHome } from '../../src/features/people/projection.ts';
import { buildRebuildHome } from '../../src/features/rebuild/model.ts';
import { careerListsOf } from '../../src/features/work/careerLists.ts';
import { createEmptyState } from '../../src/state/initialState.ts';
import { DAY, MORNING, TZ, ctx, harness, launch } from '../support/fixtures.mjs';
import { render } from '../support/render.tsx';

await import('../today/support/stub-expo-router.mjs');
await import('../today/support/stub-appstate.mjs');
const { router } = await import('../today/support/expo-router-stub.mjs');
const { AppStateProvider } = await import('../../src/store/AppStateProvider.tsx');
const { MoneyBody } = await import('../../src/features/money/MoneyBody.tsx');
const { CareerNext } = await import('../../src/features/work/CareerNext.tsx');
const { OpportunityForm } = await import('../../src/features/work/OpportunityForm.tsx');
const { RebuildHomeBody } = await import('../../src/features/rebuild/RebuildHomeBody.tsx');
const { LifeAdminBody } = await import('../../src/features/lifeAdmin/LifeAdminBody.tsx');
const { PeopleHomeView } = await import('../../src/features/people/ui/PeopleHomeView.tsx');
router.back ??= (...args) => router.calls.push(['back', ...args]);

/** Realistic text of exactly `n` characters — words, spaces, an accent — ending in a letter, so nothing is trimmed away. */
function atLimit(stem, n) {
  let text = '';
  while (text.length < n) text += `${stem} `;
  return `${text.slice(0, n - 1)}z`;
}

function onboarded() {
  let state = createEmptyState(TZ);
  for (const [group, id] of [['goals', 'calmer-household'], ['strengths', 'cooking'], ['struggles', 'overcommitting']]) state = toggleOnboardingOption(state, group, id);
  return completeOnboarding(state, ctx());
}

const saved = (result, label) => {
  const refusal = result.refusal ?? (result.outcome !== undefined && result.outcome !== 'saved' ? result.outcome : null);
  assert.equal(refusal ?? null, null, `${label} was refused: ${refusal}`);
  return result;
};
const valid = (state) => {
  const verdict = validateAppState(state);
  assert.equal(verdict.ok, true, `valid at the limit: ${JSON.stringify(verdict.issues ?? [])}`);
  return state;
};

const flat = (node) => [].concat(node.props.children).filter((c) => typeof c === 'string' || typeof c === 'number').join('');
const texts = (root) => root.findAllByType('Text').map(flat);
const noop = () => {};

/**
 * Press every control whose label carries `text` and report which records the screen opened. Counting what OPENS (not how many
 * controls match) keeps this honest when a row also has a secondary button naming the same title.
 */
async function openEvery(root, text, opened) {
  const controls = root.findAllByType('Pressable').filter((p) => String(p.props.accessibilityLabel ?? '').includes(text));
  assert.ok(controls.length >= 2, `both rows carry the whole text in their label (found ${controls.length})`);
  for (const control of controls) await TestRenderer.act(async () => control.props.onPress());
  return [...new Set(opened)].sort();
}

describe('Wave 3/4 destinations with names at the limit, twice', () => {
  test('Money Home: two bills with the same 200-character title are two rows, each opening its own task', async () => {
    const title = atLimit('Quarterly estimated tax payment for Zoë’s household', FIELD_LIMITS.titleLength);
    assert.equal(title.length, FIELD_LIMITS.titleLength);
    const c = ctx();
    let s = onboarded();
    const a = saved(createObligation(s, c, { title, amountText: '1234.56', dueDate: DAY, paymentMechanism: 'manual', childId: null, notes: '' }), 'first bill');
    s = a.state;
    const b = saved(createObligation(s, c, { title, amountText: '1234.56', dueDate: DAY, paymentMechanism: 'manual', childId: null, notes: '' }), 'second bill');
    s = valid(b.state);

    const opened = [];
    const r = await render(<MoneyBody gate={{ state: 'ready', canWrite: true }} view={buildMoneyHomeView(s, s.household.id, { nowMs: MORNING })} today={DAY} onAddObligation={noop} onAddIncome={noop} onOpenItem={(id) => opened.push(id)} onOpenTask={noop} />);
    assert.equal(texts(r.root).filter((t) => t === title).length, 2, 'the whole title, twice');
    assert.deepEqual(await openEvery(r.root, title, opened), [a.id, b.id].sort());
  });

  test('Career Next: two opportunities with the same 200-character title and a 120-character organization, each opening its own', async () => {
    const title = atLimit('Director of Community Partnerships and Programs', FIELD_LIMITS.titleLength);
    const organizationName = atLimit('Northwind Regional Health Collaborative', 120);
    const c = ctx();
    let s = onboarded();
    s = addOpportunity(s, c, { title, organizationName, opportunityType: 'job' });
    s = valid(addOpportunity(s, c, { title, organizationName, opportunityType: 'job' }));
    const ids = s.careerOpportunities.map((o) => o.id);
    assert.equal(new Set(ids).size, 2);

    const opened = [];
    const r = await render(<CareerNext lists={careerListsOf(s.careerOpportunities)} hasNextAction={() => false} onOpen={(id) => opened.push(id)} onAdd={noop} />);
    assert.equal(texts(r.root).filter((t) => t === title).length, 2, 'the whole title, twice');
    assert.deepEqual(await openEvery(r.root, title, opened), [...ids].sort());
  });

  test('Me / Rebuild: two Focuses with the same 200-character title, each opening its own', async () => {
    const title = atLimit('Sleep before midnight and protect the quiet morning hour', REBUILD_FOCUS_TITLE_MAX);
    const c = ctx();
    let s = onboarded();
    s = addRebuildFocus(s, c, { id: 'focus-long-1', title });
    s = valid(addRebuildFocus(s, c, { id: 'focus-long-2', title }));
    assert.equal(s.rebuildFocuses.filter((f) => f.title === title).length, 2);

    const opened = [];
    const r = await render(<RebuildHomeBody gate={{ kind: 'ready', canWrite: true }} view={buildRebuildHome(s, DAY, MORNING)} onAddFocus={noop} onNotNow={noop} onOpenFocus={(id) => opened.push(id)} onAddNextStep={noop} />);
    assert.ok(texts(r.root).filter((t) => t === title).length >= 2, 'the whole title, for each Focus');
    assert.deepEqual(await openEvery(r.root, title, opened), ['focus-long-1', 'focus-long-2']);
  });

  test('Life Admin: two records with the same 200-character title, a 60-character type and a 120-character issuer; the reference stays off the home', async () => {
    const title = atLimit('Homeowners insurance declarations page for the lake house', LIFE_RECORD_LIMITS.title);
    const typeName = atLimit('Insurance declarations', LIFE_RECORD_LIMITS.typeName);
    const issuerName = atLimit('Great Lakes Mutual Insurance Company', LIFE_RECORD_LIMITS.issuerName);
    const referenceNumber = atLimit('HX-4471-9920', LIFE_RECORD_LIMITS.referenceNumber);
    const c = ctx();
    let s = onboarded();
    for (const id of ['rec-long-1', 'rec-long-2']) s = saved(addLifeRecord(s, c, { id, title, kind: 'document', typeName, issuerName, referenceNumber }), id).state;
    valid(s);

    const opened = [];
    const r = await render(<LifeAdminBody gate={{ state: 'ready', canWrite: true }} view={buildLifeAdminView(s, DAY)} flash={null} onAddRecord={noop} onSkip={noop} onOpenRecord={(id) => opened.push(id)} />);
    const shown = texts(r.root);
    assert.equal(shown.filter((t) => t === title).length, 2, 'the whole title, twice');
    assert.ok(shown.filter((t) => t === typeName).length === 2 || r.root.findAllByType('Pressable').filter((p) => String(p.props.accessibilityLabel).includes(typeName)).length === 2, 'her whole type name, for each');
    const everything = JSON.stringify([shown, r.root.findAllByType('Pressable').map((p) => p.props.accessibilityLabel)]);
    assert.equal(everything.includes(referenceNumber), false, 'a reference number never reaches the home, however long');
    assert.deepEqual(await openEvery(r.root, title, opened), ['rec-long-1', 'rec-long-2']);
  });

  test('People: two people with the same 80-character name, a 60-character relationship and an 80-character organization stay two people', async () => {
    const displayName = atLimit('Alexandria Montgomery-Wells Zoë', PEOPLE_LIMITS.displayName);
    const relationshipName = atLimit('Maya’s swim coach', PEOPLE_LIMITS.relationshipName);
    const organizationName = atLimit('Lakeside Aquatics Club', PEOPLE_LIMITS.organizationName);
    const c = ctx();
    let s = onboarded();
    const a = saved(addExternalPerson(s, c, { displayName, relationshipName, organizationName }), 'first person');
    s = a.state;
    const b = saved(addExternalPerson(s, c, { displayName, relationshipName, organizationName }), 'second person');
    s = valid(b.state);
    assert.notEqual(a.id, b.id, 'no automatic merge');

    const opened = [];
    const r = await render(<PeopleHomeView view={buildPeopleHome(s, DAY)} showAllFollowUps={false} onOpenPerson={(key) => opened.push(key)} onAddPerson={noop} onSeeAllFollowUps={noop} />);
    // Listed under People and again under Recently added: the whole name, for each of the two, in every section that lists them.
    assert.ok(texts(r.root).filter((t) => t === displayName).length >= 2, 'the whole name, for each person');
    const keys = await openEvery(r.root, displayName, opened);
    assert.equal(keys.length, 2, 'each row opens a different person');
    assert.deepEqual(keys, [`person:${a.id}`, `person:${b.id}`].sort(), 'People keys a row by its canonical person id');
  });
});

describe('HK13-D38 — a Work form field never takes more than its record may hold', () => {
  test('every field of the opportunity form, the next action and the interview included, is bounded by the domain limit', async () => {
    const store = await launch(harness({ mode: 'empty', initial: {} }));
    await store.commit(() => addOpportunity(onboarded(), ctx(), { title: 'Senior analyst', opportunityType: 'job' }));
    await store.flush();
    const opportunity = store.getSnapshot().state.careerOpportunities[0];
    let renderer;
    await TestRenderer.act(async () => {
      renderer = TestRenderer.create(
        <AppStateProvider store={store}>
          <OpportunityForm opportunityId={opportunity.id} />
        </AppStateProvider>
      );
    });
    try {
      const button = (label) => {
        const found = renderer.root.findAllByType('Pressable').find((p) => p.props.accessibilityLabel === label);
        assert.ok(found, `"${label}" is on screen`);
        return found;
      };
      await TestRenderer.act(async () => button('Add a next action').props.onPress());
      await TestRenderer.act(async () => button('Schedule an interview').props.onPress());
      const inputs = renderer.root.findAllByType('TextInput');
      const byLabel = (label) => inputs.find((input) => input.props.accessibilityLabel === label);
      assert.equal(byLabel('Next action')?.props.maxLength, FIELD_LIMITS.titleLength, 'the next action becomes a Task: 200 characters at most');
      assert.equal(byLabel('Interview')?.props.maxLength, FIELD_LIMITS.titleLength, 'the interview becomes an Event: 200 characters at most');
      const unbounded = inputs.filter((input) => typeof input.props.maxLength !== 'number').map((input) => input.props.accessibilityLabel);
      assert.deepEqual(unbounded, [], 'no field of the form is unbounded');
    } finally {
      await store.flush();
      await TestRenderer.act(async () => renderer.unmount());
    }
  });
});
