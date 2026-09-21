/**
 * Render and wiring tests for the Co-Parent Logistics UI.
 *
 * Scope, honestly: the PRESENTATIONAL components (hub, both details, the person picker, the three editors, the responsibility
 * buttons, the removal control and the availability notice) are rendered under `node --test` with the react-native stub, from
 * presentations built by the real projection and presenter over households built by the feature's own mutations. The CONTAINERS
 * (`CoParentScreen` and friends) need the store provider and expo-router and cannot render here; what they decide is covered as pure
 * functions (`actions.ts`, `modes.ts`, `labels.ts`, `validation.ts`, `availabilityOf`). Layout, native behaviour and how any of it
 * looks are NOT verified here.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { archivePerson } from '../../src/domain/responsibility.ts';
import { editHandoff, handoffRevision, removeHandoff } from '../../src/features/coparent/mutations.ts';
import { availabilityOf } from '../../src/features/coparent/availability.ts';
import { COPY, NEGATED_BOUNDARY_SENTENCES } from '../../src/features/coparent/copy.ts';
import { buildCoParentLogisticsView, buildMoneyFollowUpDetail, buildTransitionDetail } from '../../src/features/coparent/projection.ts';
import { availableResponsibilityActions, presentFollowUpDetail, presentHub, presentTransitionDetail, responsibilityActionLabel } from '../../src/features/coparent/present.ts';
import { AvailabilityNotice } from '../../src/features/coparent/ui/AvailabilityNotice.tsx';
import { FollowUpDetailView } from '../../src/features/coparent/ui/FollowUpDetailView.tsx';
import { FollowUpEditor } from '../../src/features/coparent/ui/FollowUpEditor.tsx';
import { HandoffEditor } from '../../src/features/coparent/ui/HandoffEditor.tsx';
import { HubView } from '../../src/features/coparent/ui/HubView.tsx';
import { PersonPicker } from '../../src/features/coparent/ui/PersonPicker.tsx';
import { PreparationEditor } from '../../src/features/coparent/ui/PreparationEditor.tsx';
import { TransitionDetailView } from '../../src/features/coparent/ui/TransitionDetailView.tsx';
import {
  BLANK_FOLLOW_UP,
  BLANK_HANDOFF,
  followUpEditorGate,
  handoffEditorGate,
  handoffSeedFor,
  linkableTransitions,
  outcomeMessage,
  preparationEditorGate,
  responsibilityRun,
} from '../../src/features/coparent/ui/actions.ts';
import { handoffChoices } from '../../src/features/coparent/ui/labels.ts';
import { MODES_NEEDING_ID, paramText, resolveMode, titleFor } from '../../src/features/coparent/ui/modes.ts';
import { followUpPresenceIssue, handoffPresenceIssue, preparationPresenceIssue } from '../../src/features/coparent/ui/validation.ts';
import { render } from '../support/render.tsx';
import { DAY, JOSIE, MILO, TZ, answer, finishFollowUp, finishPrep, followUp, handoff, prep, request, showcaseWorld, world } from '../fixtures/coparent/world.mjs';

// ------------------------------------------------------------------------------------------------------------------- helpers

const noop = () => {};
const CTX = { today: DAY, zone: TZ };
const CHILDREN = [
  { childId: JOSIE, displayName: 'Josie' },
  { childId: MILO, displayName: 'Milo' },
];

const stringsIn = (children) => [children].flat(Infinity).filter((c) => typeof c === 'string' || typeof c === 'number').join('');
const texts = (r) => r.root.findAllByType('Text').map((node) => stringsIn(node.props.children));
const dump = (r) => JSON.stringify(r.toJSON());
const pressables = (r) => r.root.findAllByType('Pressable');
const labels = (r) => pressables(r).map((p) => p.props.accessibilityLabel);
const inputs = (r) => r.root.findAllByType('TextInput');
const inputOf = (r, label) => inputs(r).find((i) => i.props.accessibilityLabel === label);
const isSelected = (r, label) => pressables(r).find((p) => p.props.accessibilityLabel === label)?.props.accessibilityState?.selected === true;
const headers = (r) => r.root.findAll((n) => n.type === 'Text' && n.props.accessibilityRole === 'header').map((n) => stringsIn(n.props.children));

async function press(r, label, nth = 0) {
  const found = pressables(r).filter((p) => p.props.accessibilityLabel === label);
  assert.ok(found[nth], `no pressable labelled "${label}" (have: ${labels(r).join(' | ')})`);
  assert.notEqual(found[nth].props.disabled, true, `"${label}" is disabled, so a real press would do nothing`);
  await TestRenderer.act(async () => {
    found[nth].props.onPress();
  });
}

async function type(r, label, value) {
  const input = inputOf(r, label);
  assert.ok(input, `no input labelled "${label}"`);
  await TestRenderer.act(async () => {
    input.props.onChangeText(value);
  });
}

const buildView = (w, clock = {}) => buildCoParentLogisticsView(w.state, w.state.household.id, { nowMs: w.nowMs, ...clock });
const hubOf = (w, clock, options) => {
  const view = buildView(w, clock);
  return { view, presentation: presentHub(view, CTX, options) };
};

function detailProps(w, id, extra = {}) {
  const detail = buildTransitionDetail(w.state, w.state.household.id, id, { nowMs: w.nowMs });
  const presentation = presentTransitionDetail(detail, CTX);
  assert.ok(presentation, 'the handoff opens');
  return {
    householdId: w.state.household.id,
    presentation,
    detail,
    presentationCtx: CTX,
    busy: false,
    error: null,
    onResponsibilityAction: noop,
    onCompletePrep: noop,
    onRemovePrep: noop,
    onUnlinkPrep: noop,
    onAddPrep: noop,
    onEdit: noop,
    onRemove: noop,
    ...extra,
  };
}

function followUpProps(w, id, extra = {}) {
  const detail = buildMoneyFollowUpDetail(w.state, w.state.household.id, id, { nowMs: w.nowMs });
  const presentation = presentFollowUpDetail(detail, CTX);
  assert.ok(presentation, 'the follow-up opens');
  return { presentation, detail, busy: false, error: null, onResponsibilityAction: noop, onEdit: noop, onMarkDone: noop, onRemove: noop, ...extra };
}

function hubProps(w, extra = {}) {
  const { view, presentation } = hubOf(w);
  return {
    presentation,
    canCreate: view.capability.canCreate,
    busy: false,
    onOpenHandoff: noop,
    onOpenFollowUp: noop,
    onAddHandoff: noop,
    onAddPrep: noop,
    onAddFollowUp: noop,
    onCompletePrep: noop,
    onShowMoreUpcoming: noop,
    ...extra,
  };
}

const ALL_ACTIONS = ['record_asked', 'acknowledged', 'accepted_covered', 'accepted_needs_me', 'declined', 'completed', 'returned', 'reassign', 'still_needs_me', 'no_longer_needs_me'];
const ALL_LABELS = new Set(ALL_ACTIONS.map((action) => responsibilityActionLabel(action, 'Alex')));

const LOCATION = "Dad's place, 12 Elm St";
const OTHER_LOCATION = 'Riverside Pool';

/** A household with something in every section of the hub, two children, two people, and two recorded locations. */
function richWorld() {
  const w = world({ children: [JOSIE, MILO] });
  const alex = w.person('Alex');
  const sam = w.person('Sam', 'caregiver');
  const ids = {};
  ids.next = handoff(w, { title: 'Drop off Milo', child: MILO, date: '2026-09-17', startTime: '08:00', endTime: '08:15' });
  ids.needsYou = handoff(w, { title: 'Pickup Josie', date: '2026-09-18', location: LOCATION, notes: 'Bring the blue bag', needsMe: true });
  ids.waiting = handoff(w, { title: 'Swim lesson', date: '2026-09-19', location: OTHER_LOCATION, counterpart: { kind: 'person', personId: alex } });
  ids.review = handoff(w, { title: 'Weekend switch', child: MILO, date: '2026-09-20', counterpart: { kind: 'person', personId: sam } });
  w.apply((s, ctx) => archivePerson(s, ctx, sam));
  for (let n = 1; n <= 7; n += 1) handoff(w, { title: `Practice ${n}`, date: `2026-09-${String(20 + n).padStart(2, '0')}` });
  ids.laptop = prep(w, { child: JOSIE, title: 'Pack the school laptop', linkEventId: ids.needsYou });
  ids.book = prep(w, { child: MILO, title: 'Return library book', dueDate: '2026-09-17' });
  ids.slip = prep(w, { child: JOSIE, title: 'Sign permission slip' });
  finishPrep(w, ids.slip);
  ids.money = followUp(w, { title: 'Soccer registration', counterpart: { kind: 'person', personId: alex } });
  return { w, ids, alex, sam };
}

const FORBIDDEN = /\b(agreed|court|custody|owes|owed|settled|paid|complied|violation|shared|verified)\b/i;

function stripNegated(text) {
  return NEGATED_BOUNDARY_SENTENCES.reduce((rest, sentence) => rest.split(sentence).join(' '), text);
}

/** Every claim word found in anything a rendered screen shows or announces (visible text AND accessibility labels), outside the negated sentences. */
function claimOffenders(renderers, where = () => 'screen') {
  const offenders = [];
  renderers.forEach((r, index) => {
    const announced = r.root.findAll((n) => typeof n.props.accessibilityLabel === 'string').map((n) => n.props.accessibilityLabel);
    for (const text of [...texts(r), ...announced]) {
      const hit = FORBIDDEN.exec(stripNegated(text));
      if (hit) offenders.push(`${where(index)}: ${hit[0]} in "${text}"`);
    }
  });
  return offenders;
}

function everyPressableIsAccessible(r, where) {
  const all = pressables(r);
  assert.ok(all.length > 0, `${where}: something to press`);
  for (const p of all) {
    assert.ok(typeof p.props.accessibilityRole === 'string' && p.props.accessibilityRole !== '', `${where}: a pressable has no accessibilityRole`);
    assert.ok(typeof p.props.accessibilityLabel === 'string' && p.props.accessibilityLabel.trim() !== '', `${where}: a pressable has no accessibilityLabel`);
  }
}

// ---------------------------------------------------------------------------------------------------------------------- hub

describe('Hub', () => {
  test('(a) a recorded location never appears anywhere on the hub — not in text, not in a label', async () => {
    const { w } = richWorld();
    const r = await render(<HubView {...hubProps(w)} />);
    const everything = dump(r);
    assert.ok(everything.includes('Pickup Josie') && everything.includes('Swim lesson'), 'the handoffs themselves are there');
    for (const secret of ['Elm St', "Dad's place", OTHER_LOCATION, 'Bring the blue bag']) {
      assert.ok(!everything.includes(secret), `"${secret}" must not be on the hub`);
    }
  });

  test('sections come in the fixed order, and no heading is the other adult', async () => {
    const { w } = richWorld();
    const r = await render(<HubView {...hubProps(w)} />);
    const known = new Set(Object.values(COPY.sections));
    const sectionOrder = headers(r).filter((text) => known.has(text));
    assert.deepEqual(sectionOrder, [
      COPY.sections.next,
      COPY.sections.needsYou,
      COPY.sections.waiting,
      COPY.sections.needsReview,
      COPY.sections.upcoming,
      COPY.sections.preparation,
      COPY.sections.money,
      COPY.sections.recentlyCompleted,
    ]);
    assert.ok(headers(r).every((text) => !/Alex|Sam/.test(text)), 'organised by child and need, never by the other adult');
    assert.ok(headers(r).includes('Josie') && headers(r).includes('Milo'), 'preparation is grouped under each child');
    const all = texts(r);
    assert.ok(all.includes(COPY.screen.footnote) && all.includes(COPY.screen.hubHint), 'the footnote and the hint close the screen');
  });

  test('(c) every pressable has a role and a label, and none is smaller than the touch floor', async () => {
    const { w } = richWorld();
    const r = await render(<HubView {...hubProps(w)} />);
    everyPressableIsAccessible(r, 'hub');
    for (const p of pressables(r)) {
      assert.ok((StyleSheet.flatten(p.props.style) ?? {}).minHeight >= 44, `"${p.props.accessibilityLabel}" is under 44 high`);
    }
    const { presentation } = hubOf(w);
    assert.ok(labels(r).includes(presentation.next.accessibilityLabel), 'a row is labelled by the presenter, not by the view');
  });

  test('presses reach the callbacks with the ids they mean', async () => {
    const { w, ids } = richWorld();
    const calls = [];
    const r = await render(
      <HubView
        {...hubProps(w, {
          onOpenHandoff: (id) => calls.push(['handoff', id]),
          onOpenFollowUp: (id) => calls.push(['followup', id]),
          onCompletePrep: (id) => calls.push(['prep', id]),
          onShowMoreUpcoming: () => calls.push(['more']),
          onAddHandoff: () => calls.push(['add-handoff']),
          onAddPrep: () => calls.push(['add-prep']),
          onAddFollowUp: () => calls.push(['add-followup']),
        })}
      />
    );
    const { presentation } = hubOf(w);
    await press(r, presentation.next.accessibilityLabel);
    await press(r, presentation.money[0].accessibilityLabel);
    await press(r, COPY.actions.markDone, 0);
    await press(r, COPY.actions.showMore(presentation.upcomingHidden));
    await press(r, COPY.actions.addHandoff);
    await press(r, COPY.actions.addPrep);
    await press(r, COPY.actions.addFollowUp);
    assert.deepEqual(calls, [['handoff', ids.next], ['followup', ids.money], ['prep', calls[2][1]], ['more'], ['add-handoff'], ['add-prep'], ['add-followup']]);
    assert.ok([ids.laptop, ids.book].includes(calls[2][1]), 'Mark done names an open preparation item');
    assert.ok(presentation.upcomingHidden > 0, 'the collapsed list says how many more there are');
  });

  test('a preparation item that is not open has no "Mark done"', async () => {
    const { w } = richWorld();
    const r = await render(<HubView {...hubProps(w)} />);
    assert.equal(labels(r).filter((l) => l === COPY.actions.markDone).length, 2, 'only the two open items');
    assert.equal(texts(r).filter((t) => t === 'Sign permission slip').length, 1, 'a finished item appears once, under "recently completed"');
  });

  test('(e) an empty household shows the empty state; a household with records does not', async () => {
    const empty = world();
    const rEmpty = await render(<HubView {...hubProps(empty)} />);
    assert.ok(texts(rEmpty).includes(COPY.states.emptyTitle));
    assert.ok(texts(rEmpty).includes(COPY.states.emptyBody));
    assert.ok(!pressables(rEmpty).some((p) => p.props.disabled === true), 'creation is open when a child exists');

    const { w } = richWorld();
    const rFull = await render(<HubView {...hubProps(w)} />);
    assert.ok(!texts(rFull).includes(COPY.states.emptyTitle));
  });

  test('a household that cannot take a new record says why, and its create buttons are off — no unexplained dead control', async () => {
    const w = world({ children: [] });
    const r = await render(<HubView {...hubProps(w)} />);
    assert.ok(texts(r).includes(COPY.blocked.no_child.title));
    assert.ok(texts(r).includes(COPY.blocked.no_child.body));
    for (const label of [COPY.actions.addHandoff, COPY.actions.addPrep, COPY.actions.addFollowUp]) {
      const button = pressables(r).find((p) => p.props.accessibilityLabel === label);
      assert.equal(button.props.disabled, true, `${label} is off`);
      assert.equal(button.props.accessibilityHint, COPY.blocked.no_child.title, `${label} says why, to a screen reader too`);
    }
  });

  test('the household zone is named only when the device is somewhere else', async () => {
    const { w } = richWorld();
    const same = await render(<HubView {...hubProps(w)} />);
    assert.ok(!texts(same).some((t) => t.includes('household time zone')));
    const { presentation } = hubOf(w, { deviceTimeZone: 'Europe/London' });
    const away = await render(<HubView {...hubProps(w, { presentation })} />);
    assert.ok(texts(away).includes(COPY.time.zoneNote(TZ)));
  });

  test('a refused action is printed where it happened', async () => {
    const { w } = richWorld();
    const r = await render(<HubView {...hubProps(w, { error: COPY.outcomes.not_open })} />);
    assert.ok(texts(r).includes(COPY.outcomes.not_open));
  });
});

// ------------------------------------------------------------------------------------------------------- handoff detail

describe('Handoff detail', () => {
  test('(b) the location is hidden until "Show location", shown only while revealed, and forgotten for another household', async () => {
    const { w, ids } = richWorld();
    const props = detailProps(w, ids.needsYou);
    const r = await render(<TransitionDetailView {...props} />);

    assert.ok(!dump(r).includes('Elm St'), 'hidden by default');
    assert.ok(texts(r).includes(COPY.privacy.locationRecorded), 'it says that a location exists, without saying where');
    assert.ok(labels(r).includes(COPY.privacy.showLocation));
    assert.ok(!labels(r).includes(COPY.privacy.hideLocation));

    await press(r, COPY.privacy.showLocation);
    assert.ok(texts(r).includes(LOCATION), 'revealed on request');
    assert.ok(labels(r).includes(COPY.privacy.hideLocation));

    await press(r, COPY.privacy.hideLocation);
    assert.ok(!dump(r).includes('Elm St'), 'hidden again');
    assert.ok(labels(r).includes(COPY.privacy.showLocation));

    await press(r, COPY.privacy.showLocation);
    assert.ok(dump(r).includes('Elm St'));
    await TestRenderer.act(async () => r.update(<TransitionDetailView {...props} householdId="another-household" />));
    assert.ok(!dump(r).includes('Elm St'), 'a different household starts hidden');
    await TestRenderer.act(async () => r.update(<TransitionDetailView {...props} />));
    assert.ok(!dump(r).includes('Elm St'), 'and the first household coming back does not re-open it by itself');
  });

  test('a handoff with no location offers no reveal and says so', async () => {
    const { w, ids } = richWorld();
    const r = await render(<TransitionDetailView {...detailProps(w, ids.next)} />);
    assert.ok(texts(r).includes(COPY.privacy.noLocation));
    assert.ok(!labels(r).includes(COPY.privacy.showLocation));
    assert.ok(!labels(r).includes(COPY.privacy.hideLocation));
  });

  test('it shows the child, the title, when, the owner-only line and the notes she wrote', async () => {
    const { w, ids } = richWorld();
    const props = detailProps(w, ids.needsYou);
    const r = await render(<TransitionDetailView {...props} />);
    const all = texts(r);
    for (const line of [props.presentation.childName, props.presentation.title, props.presentation.whenLine, props.presentation.privacyLine, 'Bring the blue bag']) {
      assert.ok(all.includes(line), `"${line}" is on the detail`);
    }
    assert.ok(all.includes(COPY.needsYouReason.marked_needs_you), 'the reason it needs her is in words');
    assert.ok(headers(r).includes(props.presentation.title));
  });

  test('(c) every pressable has a role and a label', async () => {
    const { w, ids } = richWorld();
    const r = await render(<TransitionDetailView {...detailProps(w, ids.needsYou)} />);
    everyPressableIsAccessible(r, 'handoff detail');
    const waiting = await render(<TransitionDetailView {...detailProps(w, ids.waiting)} />);
    everyPressableIsAccessible(waiting, 'requested handoff detail');
  });

  const SCENARIOS = {
    none: [],
    requested: [['request']],
    acknowledged: [['request'], ['answer', 'acknowledged']],
    accepted_needs_me: [['request'], ['answer', 'accepted_needs_me']],
    accepted_covered: [['request'], ['answer', 'accepted_covered']],
    declined: [['request'], ['answer', 'declined']],
    completed: [['request'], ['answer', 'completed']],
    returned: [['request'], ['answer', 'returned']],
    archived: [['request'], ['archive']],
  };
  function scenarioWorld(steps) {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w);
    for (const [step, choice] of steps) {
      if (step === 'request') request(w, { kind: 'event', id }, alex);
      if (step === 'answer') answer(w, w.state.responsibilities[0].id, choice);
      if (step === 'archive') w.apply((s, ctx) => archivePerson(s, ctx, alex));
    }
    return { w, id };
  }

  const EXPECTED = {
    none: ["Record that you've asked someone"],
    archived: ['Record a different person', 'Take it back'],
    completed: [],
    accepted_needs_me: ["Record Alex's part as complete", 'It no longer needs me', 'Record a different person', 'Take it back'],
    declined: ["Record that you've asked someone"],
    returned: ["Record that you've asked someone"],
  };

  for (const [name, steps] of Object.entries(SCENARIOS)) {
    test(`(f) the responsibility buttons for "${name}" are exactly what is available, and nothing else`, async () => {
      const { w, id } = scenarioWorld(steps);
      const props = detailProps(w, id);
      const r = await render(<TransitionDetailView {...props} />);
      const shown = labels(r).filter((label) => ALL_LABELS.has(label));
      const available = availableResponsibilityActions(props.detail.transition.responsibility).map((action) => responsibilityActionLabel(action, 'Alex'));
      assert.deepEqual(shown, available);
      if (name in EXPECTED) assert.deepEqual(shown, EXPECTED[name], 'and that is what the recorded state allows');
    });
  }

  test('(f) an unavailable person is never offered a positive recording, and the review is said in words', async () => {
    const { w, id } = scenarioWorld(SCENARIOS.archived);
    const props = detailProps(w, id);
    const r = await render(<TransitionDetailView {...props} />);
    const shown = labels(r);
    for (const positive of ['acknowledged', 'accepted_covered', 'accepted_needs_me', 'declined']) {
      assert.ok(!shown.includes(responsibilityActionLabel(positive, 'Alex')), `${positive} is not offered for a person who is gone`);
    }
    assert.ok(texts(r).includes(COPY.review.counterpart_unavailable('Alex')), 'the review sentence is shown');
    assert.equal(texts(r).filter((t) => t === COPY.review.counterpart_unavailable('Alex')).length, 1, 'once, not twice');
    assert.ok(texts(r).includes(COPY.sections.needsReview));
  });

  test('(d) accepted-but-still-needs-me is never called covered; only "no longer needs me" is', async () => {
    const still = scenarioWorld(SCENARIOS.accepted_needs_me);
    const rStill = await render(<TransitionDetailView {...detailProps(still.w, still.id)} />);
    assert.ok(!/covered/i.test(dump(rStill)), 'detail: no Covered tag or sentence');
    assert.ok(texts(rStill).includes(COPY.responsibility.accepted_needs('Alex')));

    const rHub = await render(<HubView {...hubProps(still.w)} />);
    assert.ok(!/covered/i.test(dump(rHub)), 'hub: no Covered tag or sentence');
    assert.ok(texts(rHub).some((t) => t.toLowerCase() === COPY.sections.needsYou.toLowerCase()), 'it sits under Needs you');

    const covered = scenarioWorld(SCENARIOS.accepted_covered);
    const rCovered = await render(<TransitionDetailView {...detailProps(covered.w, covered.id)} />);
    assert.ok(/covered/i.test(dump(rCovered)), 'the same words DO appear when she recorded that it no longer needs her');
    assert.ok(texts(rCovered).includes(COPY.responsibility.covered('Alex')));
  });

  test('nothing here claims a request was sent or delivered without an execution to show for it', async () => {
    const { w, id } = scenarioWorld(SCENARIOS.requested);
    const r = await render(<TransitionDetailView {...detailProps(w, id)} />);
    assert.ok(texts(r).includes(COPY.responsibility.notContacted('Alex')));
    assert.ok(!texts(r).includes(COPY.responsibility.sentEvidence));
    assert.ok(!texts(r).includes(COPY.responsibility.deliveredEvidence));
  });

  test('the person picker opens in place for "record a request", has no "Not recorded", and reports the person she chose', async () => {
    const w = world();
    const alex = w.person('Alex');
    const id = handoff(w);
    const calls = [];
    const props = detailProps(w, id, { onResponsibilityAction: (action, counterpart) => calls.push([action, counterpart]) });
    assert.equal(props.detail.people.length, 1, 'one person is recorded');
    const r = await render(<TransitionDetailView {...props} />);
    assert.ok(!texts(r).includes(COPY.editor.askedWho.toUpperCase()));
    await press(r, COPY.actions.recordAsked);
    assert.ok(texts(r).includes(COPY.editor.askedWho.toUpperCase()), 'the picker is open under the button');
    assert.ok(!labels(r).includes(COPY.editor.responsibleNone), 'no "Not recorded" where an answer is needed');

    await press(r, COPY.actions.recordIt);
    assert.equal(calls.length, 0, 'nothing chosen: nothing recorded');
    assert.ok(texts(r).includes(COPY.editor.personIncomplete));

    await press(r, 'Alex');
    await press(r, COPY.actions.recordIt);
    assert.deepEqual(calls, [['record_asked', { kind: 'person', personId: alex }]]);
  });

  test('a two-step confirm guards "Remove handoff", and Cancel backs out', async () => {
    const { w, ids } = richWorld();
    const removed = [];
    const r = await render(<TransitionDetailView {...detailProps(w, ids.next, { onRemove: () => removed.push('removed') })} />);
    assert.equal(labels(r).filter((l) => l === COPY.actions.remove).length, 1);
    await press(r, COPY.actions.remove);
    assert.equal(removed.length, 0, 'the first press only asks');
    assert.ok(texts(r).includes(COPY.confirm.removeHandoffTitle));
    assert.ok(labels(r).includes(COPY.actions.cancel));
    await press(r, COPY.actions.cancel);
    assert.ok(!texts(r).includes(COPY.confirm.removeHandoffTitle));
    await press(r, COPY.actions.remove);
    await press(r, COPY.actions.remove);
    assert.deepEqual(removed, ['removed'], 'the second press removes, once');
  });

  test('preparation: "Mark done" and "Remove from the list" only for open items, "Unlink" for a linked one, and "Add preparation"', async () => {
    const w = world();
    const id = handoff(w);
    const open = prep(w, { title: 'Pack the school laptop', linkEventId: id });
    const done = prep(w, { title: 'Return library book', linkEventId: id });
    finishPrep(w, done);
    const calls = [];
    const props = detailProps(w, id, {
      onCompletePrep: (task) => calls.push(['done', task]),
      onRemovePrep: (task) => calls.push(['remove', task]),
      onUnlinkPrep: (edge) => calls.push(['unlink', typeof edge]),
      onAddPrep: () => calls.push(['add']),
    });
    const r = await render(<TransitionDetailView {...props} />);
    assert.equal(labels(r).filter((l) => l === COPY.actions.markDone).length, 1);
    assert.equal(labels(r).filter((l) => l === COPY.actions.removeItem).length, 1);
    assert.equal(labels(r).filter((l) => l === COPY.actions.unlink).length, 2, 'both items are tied to this handoff');
    assert.ok(texts(r).includes(COPY.prep.standing.done) && texts(r).includes(COPY.prep.standing.open));
    assert.ok(texts(r).includes(props.presentation.preparationLine));
    await press(r, COPY.actions.markDone);
    await press(r, COPY.actions.removeItem);
    await press(r, COPY.actions.unlink, 1);
    await press(r, COPY.actions.addPrep);
    assert.deepEqual(calls, [['done', open], ['remove', open], ['unlink', 'string'], ['add']]);
    assert.ok(!texts(r).some((t) => /arrived|received|delivered/i.test(t)), 'ticked off is not "arrived"');
  });

  test('an error is printed in the part of the screen that made it', async () => {
    const { w, ids } = richWorld();
    const r = await render(<TransitionDetailView {...detailProps(w, ids.waiting, { error: { area: 'preparation', text: COPY.outcomes.not_open } })} />);
    assert.ok(texts(r).includes(COPY.outcomes.not_open));
    const elsewhere = await render(<TransitionDetailView {...detailProps(w, ids.waiting, { error: { area: 'manage', text: COPY.outcomes.not_saved } })} />);
    assert.ok(texts(elsewhere).includes(COPY.outcomes.not_saved));
    assert.ok(!texts(elsewhere).includes(COPY.outcomes.not_open));
  });

  test('a removed handoff offers nothing to change, and says it was removed', async () => {
    const { w, ids } = richWorld();
    w.run((s, ctx) => removeHandoff(s, ctx, ids.next));
    const r = await render(<TransitionDetailView {...detailProps(w, ids.next)} />);
    assert.ok(texts(r).includes(COPY.detail.removed));
    for (const gone of [COPY.actions.edit, COPY.actions.remove, COPY.actions.addPrep]) assert.ok(!labels(r).includes(gone), `${gone} is not offered`);
  });
});

// ------------------------------------------------------------------------------------------------------ follow-up detail

describe('Follow-up detail', () => {
  test('an open follow-up shows the amount as the presenter words it, and offers Edit / Mark done / Remove', async () => {
    const w = world();
    const id = followUp(w);
    const props = followUpProps(w, id);
    const r = await render(<FollowUpDetailView {...props} />);
    const all = texts(r);
    for (const line of [props.presentation.title, props.presentation.childLine, props.presentation.amountLine, props.presentation.amountNote, props.presentation.dateLine, props.presentation.statusLine]) {
      assert.ok(all.includes(line), `"${line}" is on the follow-up`);
    }
    assert.deepEqual(labels(r).filter((l) => [COPY.actions.edit, COPY.actions.markDone, COPY.actions.removeFollowUp].includes(l)), [COPY.actions.edit, COPY.actions.markDone, COPY.actions.removeFollowUp]);
    assert.ok(!all.includes(COPY.money.paymentReported), 'no payment is reported without a report to show');
    assert.ok(labels(r).includes(COPY.actions.recordAsked));
    everyPressableIsAccessible(r, 'follow-up detail');
  });

  test('a follow-up marked done says only what the record supports, and offers no more changes', async () => {
    const w = world();
    const id = followUp(w);
    finishFollowUp(w, id);
    const props = followUpProps(w, id);
    const r = await render(<FollowUpDetailView {...props} />);
    assert.ok(texts(r).includes(COPY.money.done));
    for (const gone of [COPY.actions.edit, COPY.actions.markDone, COPY.actions.removeFollowUp, COPY.actions.recordAsked]) assert.ok(!labels(r).includes(gone), `${gone} is not offered`);
    assert.ok(!texts(r).some((t) => /\breceived\b|\bpaid\b|\bsettled\b/i.test(stripNegated(t))));
  });

  test('a follow-up asked of someone shows the same responsibility buttons the presenter allows', async () => {
    const w = world();
    const alex = w.person('Alex');
    const id = followUp(w, { counterpart: { kind: 'person', personId: alex } });
    const props = followUpProps(w, id);
    const r = await render(<FollowUpDetailView {...props} />);
    const shown = labels(r).filter((l) => ALL_LABELS.has(l));
    assert.deepEqual(shown, availableResponsibilityActions(props.detail.followUp.responsibility).map((a) => responsibilityActionLabel(a, 'Alex')));
    assert.ok(texts(r).includes(COPY.responsibility.notContacted('Alex')));
  });

  test('a two-step confirm guards "Remove follow-up"', async () => {
    const w = world();
    const id = followUp(w);
    const removed = [];
    const r = await render(<FollowUpDetailView {...followUpProps(w, id, { onRemove: () => removed.push(1) })} />);
    await press(r, COPY.actions.removeFollowUp);
    assert.equal(removed.length, 0);
    assert.ok(texts(r).includes(COPY.confirm.removeFollowUpTitle));
    await press(r, COPY.actions.removeFollowUp);
    assert.equal(removed.length, 1);
  });

  test('the notes she wrote are shown; Edit and Mark done reach their callbacks', async () => {
    const w = world();
    const id = followUp(w, { notes: 'Receipt is in the blue folder' });
    const calls = [];
    const r = await render(<FollowUpDetailView {...followUpProps(w, id, { onEdit: () => calls.push('edit'), onMarkDone: () => calls.push('done') })} />);
    assert.ok(texts(r).includes('Receipt is in the blue folder'));
    await press(r, COPY.actions.edit);
    await press(r, COPY.actions.markDone);
    assert.deepEqual(calls, ['edit', 'done']);
  });
});

// ---------------------------------------------------------------------------------------------------------- person picker

describe('Person picker', () => {
  function threeAlexes() {
    const w = world();
    w.person('Alex', 'co-parent');
    w.person('Alex', 'co-parent');
    w.person('Alex', 'grandparent');
    w.person('Sam', 'caregiver');
    return buildView(w).people;
  }

  test('people who share a name stay visibly distinct, and each is one chip', async () => {
    const people = threeAlexes();
    const r = await render(<PersonPicker people={people} allowNone onChange={noop} />);
    const chips = labels(r);
    for (const person of people) assert.ok(chips.includes(person.label), `${person.label} is a chip`);
    assert.equal(new Set(people.map((p) => p.label)).size, people.length, 'the presenter made the labels unique');
    assert.equal(people.filter((p) => p.label.startsWith('Alex')).length, 3);
    assert.ok(texts(r).includes('Caregiver'), 'the relationship is shown alongside a name that does not already carry it');
    assert.ok(texts(r).includes(COPY.editor.responsibleHelp));
  });

  test('"Not recorded" is offered and selected first where nobody is a valid answer, and absent where it is not', async () => {
    const people = threeAlexes();
    const seen = [];
    const withNone = await render(<PersonPicker people={people} allowNone onChange={(v) => seen.push(v)} />);
    assert.ok(isSelected(withNone, COPY.editor.responsibleNone));
    await press(withNone, people[0].label);
    assert.deepEqual(seen.at(-1), { kind: 'person', personId: people[0].personId });
    await press(withNone, COPY.editor.responsibleNone);
    assert.deepEqual(seen.at(-1), { kind: 'none' });

    const without = await render(<PersonPicker people={people} allowNone={false} onChange={noop} />);
    assert.ok(!labels(without).includes(COPY.editor.responsibleNone));
    assert.ok(!labels(without).some((l) => isSelected(without, l)), 'nothing is pre-chosen');
  });

  test('"Add someone" asks for a name and a relationship, and reports null until both are there', async () => {
    const seen = [];
    const r = await render(<PersonPicker people={[]} allowNone onChange={(v) => seen.push(v)} />);
    assert.ok(!inputOf(r, COPY.editor.personName), 'the name field is not there until "Add someone"');
    await press(r, COPY.editor.responsibleAdd);
    assert.equal(seen.at(-1), null);
    assert.equal(inputOf(r, COPY.editor.personName).props.maxLength, 80);
    await type(r, COPY.editor.personName, '  Pat  ');
    assert.equal(seen.at(-1), null, 'a name alone is not an answer');
    await press(r, COPY.editor.relationships.neighbor);
    assert.deepEqual(seen.at(-1), { kind: 'new', displayName: 'Pat', relationship: 'neighbor' });
    await type(r, COPY.editor.personName, '   ');
    assert.equal(seen.at(-1), null, 'a blank name is not an answer');
  });

  test('with nobody recorded and no "Not recorded", it opens straight on "Add someone"', async () => {
    const r = await render(<PersonPicker people={[]} allowNone={false} onChange={noop} />);
    assert.ok(inputOf(r, COPY.editor.personName));
    assert.ok(Object.values(COPY.editor.relationships).every((label) => labels(r).includes(label)), 'every recorded kind of relationship is offered');
  });
});

// --------------------------------------------------------------------------------------------------------- handoff editor

describe('Handoff editor', () => {
  const props = (extra = {}) => ({ mode: 'create', initial: BLANK_HANDOFF, childOptions: CHILDREN, people: [], error: null, busy: false, stale: false, onSubmit: noop, ...extra });

  test('on create nothing is guessed: no child among several, no date, no time, no length — placeholders only', async () => {
    const r = await render(<HandoffEditor {...props()} />);
    assert.ok(!isSelected(r, 'Josie') && !isSelected(r, 'Milo'), 'no child is chosen for her');
    for (const label of [COPY.editor.date, COPY.editor.start, COPY.editor.end, COPY.editor.title, COPY.editor.location, COPY.editor.notes]) {
      assert.equal(inputOf(r, label).props.value, '', `${label} starts empty`);
    }
    assert.equal(inputOf(r, COPY.editor.date).props.placeholder, COPY.editor.datePlaceholder);
    assert.equal(inputOf(r, COPY.editor.start).props.placeholder, COPY.editor.timePlaceholder);
    assert.equal(inputOf(r, COPY.editor.end).props.placeholder, COPY.editor.timePlaceholder);
    assert.ok(texts(r).includes(COPY.editor.timeHelp));
    assert.ok(isSelected(r, COPY.editor.fixed), 'Fixed is the default commitment');
    assert.ok(isSelected(r, COPY.editor.needsYesNo.unsure), 'not sure is the default answer to "needs you"');
    assert.ok(isSelected(r, COPY.editor.repeatChoices.none));
    assert.ok(!labels(r).includes(COPY.editor.repeatChoices.keep), '"keep as recorded" belongs only to a recorded schedule');
    assert.ok(labels(r).includes(COPY.editor.responsibleAdd), 'the person picker is part of creating');
    everyPressableIsAccessible(r, 'handoff editor');
  });

  test('exactly one child is pre-selected, visibly', async () => {
    const r = await render(<HandoffEditor {...props({ childOptions: [CHILDREN[0]] })} />);
    assert.ok(isSelected(r, 'Josie'));
  });

  test('the starter chips fill the title and nothing else', async () => {
    const r = await render(<HandoffEditor {...props()} />);
    await press(r, COPY.editor.starters[1]);
    assert.equal(inputOf(r, COPY.editor.title).props.value, COPY.editor.starters[1]);
    for (const label of [COPY.editor.date, COPY.editor.start, COPY.editor.end, COPY.editor.location, COPY.editor.notes]) assert.equal(inputOf(r, label).props.value, '');
    assert.ok(texts(r).includes(COPY.editor.startersHint));
  });

  test('saving with a required answer missing names it and submits nothing', async () => {
    const submitted = [];
    const r = await render(<HandoffEditor {...props({ onSubmit: (...args) => submitted.push(args) })} />);
    await press(r, COPY.actions.create);
    assert.ok(texts(r).includes(COPY.outcomes.invalid_child));
    await press(r, 'Josie');
    await press(r, COPY.actions.create);
    assert.ok(texts(r).includes(COPY.outcomes.invalid_title));
    await type(r, COPY.editor.title, 'Pickup Josie');
    await press(r, COPY.actions.create);
    assert.ok(texts(r).includes(COPY.outcomes.invalid_date));
    await type(r, COPY.editor.date, '2026-09-18');
    await press(r, COPY.actions.create);
    assert.ok(texts(r).includes(COPY.outcomes.invalid_time));
    assert.equal(submitted.length, 0);
  });

  test('a complete form submits exactly what was typed, with "Not recorded" as the default person', async () => {
    const submitted = [];
    const r = await render(<HandoffEditor {...props({ childOptions: [CHILDREN[0]], onSubmit: (...args) => submitted.push(args) })} />);
    await type(r, COPY.editor.title, 'Pickup Josie');
    await type(r, COPY.editor.date, '2026-09-18');
    await type(r, COPY.editor.start, '17:00');
    await type(r, COPY.editor.end, '17:30');
    await press(r, COPY.editor.needsYesNo.yes);
    await press(r, COPY.editor.flexible);
    await press(r, COPY.editor.repeatChoices.weekly);
    await press(r, COPY.actions.create);
    assert.equal(submitted.length, 1);
    assert.deepEqual(submitted[0][0], {
      childId: JOSIE,
      title: 'Pickup Josie',
      date: '2026-09-18',
      startTime: '17:00',
      endTime: '17:30',
      location: '',
      notes: '',
      commitment: 'flexible',
      needsMe: true,
      repeat: 'weekly',
    });
    assert.deepEqual(submitted[0][1], { kind: 'none' });
  });

  test('a person typed in but not finished is not silently dropped', async () => {
    const submitted = [];
    const r = await render(<HandoffEditor {...props({ childOptions: [CHILDREN[0]], onSubmit: (...args) => submitted.push(args) })} />);
    await type(r, COPY.editor.title, 'Pickup Josie');
    await type(r, COPY.editor.date, '2026-09-18');
    await type(r, COPY.editor.start, '17:00');
    await type(r, COPY.editor.end, '17:30');
    await press(r, COPY.editor.responsibleAdd);
    await type(r, COPY.editor.personName, 'Pat');
    await press(r, COPY.actions.create);
    assert.equal(submitted.length, 0);
    assert.ok(texts(r).includes(COPY.editor.personIncomplete));
    await press(r, COPY.editor.relationships['co-parent']);
    await press(r, COPY.actions.create);
    assert.deepEqual(submitted[0][1], { kind: 'new', displayName: 'Pat', relationship: 'co-parent' });
  });

  test('edit: the counterpart is not editable here, the recorded schedule can be kept, and a child no longer here is not guessed', async () => {
    const initial = { ...BLANK_HANDOFF, childId: 'child-gone', title: 'Pickup', date: '2026-09-18', startTime: '17:00', endTime: '17:30', repeat: 'keep' };
    const submitted = [];
    const r = await render(<HandoffEditor {...props({ mode: 'edit', initial, childOptions: [CHILDREN[0]], onSubmit: (...args) => submitted.push(args) })} />);
    assert.ok(!labels(r).includes(COPY.editor.responsibleAdd), 'no person picker on edit');
    assert.ok(!labels(r).includes(COPY.editor.responsibleNone));
    assert.ok(isSelected(r, COPY.editor.repeatChoices.keep));
    assert.ok(!isSelected(r, 'Josie'), 'the only child is not chosen for a handoff whose child is gone');
    assert.ok(labels(r).includes(COPY.actions.save));
    await press(r, COPY.actions.save);
    assert.ok(texts(r).includes(COPY.outcomes.invalid_child));
    await press(r, 'Josie');
    await press(r, COPY.actions.save);
    assert.equal(submitted.length, 1);
    assert.equal(submitted[0][0].childId, JOSIE);
    assert.equal(submitted[0][0].repeat, 'keep');
    assert.deepEqual(submitted[0][1], { kind: 'none' });
  });

  test('a stale row turns Save off and prints why; a refusal from the mutation is printed as its own sentence', async () => {
    const stale = await render(<HandoffEditor {...props({ mode: 'edit', initial: { ...BLANK_HANDOFF, childId: JOSIE }, stale: true })} />);
    const save = pressables(stale).find((p) => p.props.accessibilityLabel === COPY.actions.save);
    assert.equal(save.props.disabled, true);
    assert.ok(texts(stale).includes(COPY.outcomes.stale), 'the dead control is explained');

    const refused = await render(<HandoffEditor {...props({ error: COPY.outcomes.invalid_time })} />);
    assert.ok(texts(refused).includes(COPY.outcomes.invalid_time));
    const busy = await render(<HandoffEditor {...props({ busy: true })} />);
    assert.equal(pressables(busy).find((p) => p.props.accessibilityLabel === COPY.actions.create).props.disabled, true, 'no second save while one is running');
  });
});

// ----------------------------------------------------------------------------------------------------- preparation editor

describe('Preparation editor', () => {
  const props = (extra = {}) => ({ childOptions: CHILDREN, transitions: [{ id: 'evt-1', label: 'Pickup Josie · Fri, Sep 18' }], initialLinkId: null, error: null, busy: false, onSubmit: noop, ...extra });

  test('it links only when told to: "Not linked" by default, the handoff she came from when there is one', async () => {
    const plain = await render(<PreparationEditor {...props()} />);
    assert.ok(isSelected(plain, COPY.editor.linkNone));
    assert.ok(!isSelected(plain, 'Pickup Josie · Fri, Sep 18'));
    const linked = await render(<PreparationEditor {...props({ initialLinkId: 'evt-1' })} />);
    assert.ok(isSelected(linked, 'Pickup Josie · Fri, Sep 18'));
    const gone = await render(<PreparationEditor {...props({ initialLinkId: 'evt-removed' })} />);
    assert.ok(isSelected(gone, COPY.editor.linkNone), 'a handoff that is not listed is not linked to');
  });

  test('a complete form submits its fields; a missing child or title is named', async () => {
    const submitted = [];
    const r = await render(<PreparationEditor {...props({ initialLinkId: 'evt-1', onSubmit: (f) => submitted.push(f) })} />);
    await press(r, COPY.actions.createPrep);
    assert.ok(texts(r).includes(COPY.outcomes.invalid_child));
    await press(r, 'Josie');
    await press(r, COPY.actions.createPrep);
    assert.ok(texts(r).includes(COPY.outcomes.invalid_title));
    await type(r, COPY.editor.title, 'Pack the school laptop');
    await type(r, COPY.editor.dueDate, '2026-09-17');
    await press(r, COPY.actions.createPrep);
    assert.deepEqual(submitted, [{ childId: JOSIE, title: 'Pack the school laptop', dueDate: '2026-09-17', notes: '', linkEventId: 'evt-1' }]);
    everyPressableIsAccessible(r, 'preparation editor');
  });
});

// ---------------------------------------------------------------------------------------------------- follow-up editor

describe('Follow-up editor', () => {
  const props = (extra = {}) => ({ mode: 'create', initial: BLANK_FOLLOW_UP, childOptions: CHILDREN, people: [], suggestedCurrency: null, error: null, busy: false, stale: false, onSubmit: noop, ...extra });
  const CURRENCIES = ['USD', 'CAD', 'GBP', 'EUR', 'AUD'];

  test('on create no direction, no currency and no amount is chosen for her, and the amount takes a decimal keyboard', async () => {
    const r = await render(<FollowUpEditor {...props()} />);
    assert.ok(!isSelected(r, COPY.editor.directionInflow) && !isSelected(r, COPY.editor.directionOutflow), 'the direction is her own answer');
    assert.ok(!CURRENCIES.some((code) => isSelected(r, code)), 'no currency is chosen for her');
    assert.equal(inputOf(r, COPY.editor.amount).props.value, '');
    assert.equal(inputOf(r, COPY.editor.amount).props.keyboardType, 'decimal-pad');
    assert.equal(inputOf(r, COPY.editor.currencyOther).props.maxLength, 3);
    assert.ok(isSelected(r, COPY.editor.noChild), 'a follow-up may be about no child');
    assert.ok(texts(r).includes(COPY.editor.amountHelp) && texts(r).includes(COPY.editor.followUpHelp));
    assert.ok(labels(r).includes(COPY.editor.responsibleAdd), 'the person picker is part of creating');
    everyPressableIsAccessible(r, 'follow-up editor');
  });

  test('only a suggested currency is pre-selected, and it says where the suggestion came from', async () => {
    const r = await render(<FollowUpEditor {...props({ suggestedCurrency: 'CAD' })} />);
    const suggested = COPY.editor.currencySuggested('CAD');
    assert.ok(isSelected(r, suggested));
    assert.ok(!labels(r).includes('CAD'), 'the chip carries the suggestion label');
    for (const code of CURRENCIES.filter((c) => c !== 'CAD')) assert.ok(!isSelected(r, code), `${code} is not chosen`);
    const unusual = await render(<FollowUpEditor {...props({ suggestedCurrency: 'JPY' })} />);
    assert.ok(isSelected(unusual, COPY.editor.currencySuggested('JPY')), 'a suggestion outside the usual five is still offered');
  });

  test('the required answers are named one at a time, then the follow-up is submitted as typed', async () => {
    const submitted = [];
    const r = await render(<FollowUpEditor {...props({ onSubmit: (...args) => submitted.push(args) })} />);
    await press(r, COPY.actions.createFollowUp);
    assert.ok(texts(r).includes(COPY.outcomes.invalid_title));
    await type(r, COPY.editor.title, 'Soccer registration');
    await press(r, COPY.actions.createFollowUp);
    assert.ok(texts(r).includes(COPY.outcomes.invalid_currency));
    await press(r, 'GBP');
    await press(r, COPY.actions.createFollowUp);
    assert.ok(texts(r).includes(COPY.outcomes.invalid_direction));
    await press(r, COPY.editor.directionOutflow);
    await press(r, COPY.actions.createFollowUp);
    assert.ok(texts(r).includes(COPY.outcomes.invalid_amount));
    await type(r, COPY.editor.amount, '80.50');
    await press(r, 'Josie');
    await press(r, COPY.actions.createFollowUp);
    assert.equal(submitted.length, 1);
    assert.deepEqual(submitted[0][0], { title: 'Soccer registration', childId: JOSIE, amountText: '80.50', currency: 'GBP', direction: 'outflow', followUpDate: '', notes: '' });
    assert.deepEqual(submitted[0][1], { kind: 'none' });
  });

  test('"Other" takes three letters, replaces the chosen chip, and the chip replaces the letters', async () => {
    const submitted = [];
    const r = await render(<FollowUpEditor {...props({ initial: { ...BLANK_FOLLOW_UP, title: 'Camp', amountText: '10', direction: 'inflow' }, onSubmit: (...args) => submitted.push(args) })} />);
    await press(r, 'USD');
    await type(r, COPY.editor.currencyOther, 'jpy');
    assert.equal(inputOf(r, COPY.editor.currencyOther).props.value, 'JPY');
    assert.ok(!isSelected(r, 'USD'), 'typing letters replaces the chip');
    await press(r, COPY.actions.createFollowUp);
    assert.equal(submitted[0][0].currency, 'JPY');
    await press(r, 'EUR');
    assert.equal(inputOf(r, COPY.editor.currencyOther).props.value, '', 'choosing a chip clears the letters');
    await press(r, COPY.actions.createFollowUp);
    assert.equal(submitted[1][0].currency, 'EUR');
  });

  test('edit opens on the recorded row, offers no person picker, passes "no one" and turns Save off when stale', async () => {
    const initial = { title: 'Soccer registration', childId: JOSIE, amountText: '80.00', currency: 'USD', direction: 'inflow', followUpDate: '2026-09-25', notes: '' };
    const r = await render(<FollowUpEditor {...props({ mode: 'edit', initial, stale: true })} />);
    assert.ok(isSelected(r, 'USD') && isSelected(r, COPY.editor.directionInflow) && isSelected(r, 'Josie'));
    assert.equal(inputOf(r, COPY.editor.amount).props.value, '80.00');
    assert.ok(!labels(r).includes(COPY.editor.responsibleAdd));
    assert.equal(pressables(r).find((p) => p.props.accessibilityLabel === COPY.actions.save).props.disabled, true);
    assert.ok(texts(r).includes(COPY.outcomes.stale));
  });
});

// ------------------------------------------------------------------------------------------------------ the household gate

describe('Availability', () => {
  const READY = { status: 'ready', state: {}, recovery: null };
  const SIGNED_IN = { kind: 'unauthenticated' };

  test('(e) a household that has not loaded, could not be read, or belongs to another account is never "ready"', () => {
    assert.equal(availabilityOf({ status: 'unhydrated', state: null, recovery: null }, SIGNED_IN).kind, 'loading');
    assert.equal(availabilityOf({ status: 'hydrating', state: null, recovery: null }, SIGNED_IN).kind, 'loading');
    assert.equal(availabilityOf({ ...READY, recovery: { reason: 'read_failed', quarantined: false } }, SIGNED_IN).kind, 'unrecovered');
    assert.equal(availabilityOf(READY, { kind: 'boundOther', session: {}, quarantinedAccountId: 'x' }).kind, 'other_account');
    assert.equal(availabilityOf(READY, { kind: 'authenticating' }).kind, 'loading');
    assert.equal(availabilityOf(READY, SIGNED_IN).kind, 'ready');
  });

  test('(e) a household that could not be read looks EMPTY to the projection — which is exactly why it must never be shown', async () => {
    const fresh = world();
    assert.equal(buildView(fresh).isEmpty, true, 'the fresh household the app starts over with is empty');
    const availability = availabilityOf({ status: 'recovery', state: fresh.state, recovery: { reason: 'read_failed', quarantined: true } }, SIGNED_IN);
    assert.equal(availability.kind, 'unrecovered');
    const r = await render(<AvailabilityNotice availability={availability} />);
    assert.ok(texts(r).includes(COPY.states.unrecoveredTitle));
    assert.ok(texts(r).includes(COPY.states.unrecoveredBody));
    assert.ok(!dump(r).includes(COPY.states.emptyTitle) && !dump(r).includes(COPY.states.emptyBody), 'never the empty state');
    assert.equal(pressables(r).length, 0, 'no create action, no hub');
    assert.ok(!dump(r).includes(COPY.actions.addHandoff));
  });

  test('loading shows the loading state alone; another account shows only that; ready shows nothing of its own', async () => {
    const loading = await render(<AvailabilityNotice availability={{ kind: 'loading' }} />);
    assert.ok(dump(loading).includes(COPY.states.loadingTitle) && dump(loading).includes(COPY.states.loadingBody));
    assert.ok(!dump(loading).includes(COPY.states.emptyTitle));
    assert.equal(pressables(loading).length, 0);

    const other = await render(<AvailabilityNotice availability={{ kind: 'other_account' }} />);
    assert.deepEqual(texts(other), [COPY.states.otherAccountTitle, COPY.states.otherAccountBody]);

    const ready = await render(<AvailabilityNotice availability={{ kind: 'ready' }} />);
    assert.equal(ready.toJSON(), null);
  });
});

// ------------------------------------------------------------------------------------------------------- claim words

describe('Words', () => {
  test('(g) no boundary or claim word is rendered anywhere on the hub or either detail, outside the sentences that name the boundary to deny it', async () => {
    const { w, ids } = richWorld();
    const covered = scenarioForWords();
    const screens = [
      await render(<HubView {...hubProps(w)} />),
      await render(<HubView {...hubProps(covered.w)} />),
      await render(<TransitionDetailView {...detailProps(w, ids.needsYou)} />),
      await render(<TransitionDetailView {...detailProps(w, ids.waiting)} />),
      await render(<TransitionDetailView {...detailProps(w, ids.review)} />),
      await render(<TransitionDetailView {...detailProps(covered.w, covered.id)} />),
      await render(<FollowUpDetailView {...followUpProps(w, ids.money)} />),
    ];
    assert.deepEqual(claimOffenders(screens, (i) => `screen ${i}`), []);
  });

  test('(g) the scan itself works: it catches a claim word, and lets the sentences that deny the boundary through', async () => {
    const { w } = richWorld();
    const { presentation } = hubOf(w);
    const claim = await render(<HubView {...hubProps(w, { presentation: { ...presentation, subtitle: 'They agreed to this schedule.' } })} />);
    assert.equal(claimOffenders([claim]).length, 1, 'a hub that says someone agreed is caught');
    const custody = await render(<HubView {...hubProps(w, { presentation: { ...presentation, hubHint: 'Custody is settled.' } })} />);
    assert.equal(claimOffenders([custody]).length, 1, 'a hub that says custody is settled is caught');
    const honest = await render(<HubView {...hubProps(w, { presentation: { ...presentation, footnote: COPY.screen.footnote } })} />);
    assert.deepEqual(claimOffenders([honest]), [], 'the footnote names the boundary only to deny it, and is allowed');
  });

  test('(g) the editors are clean too', async () => {
    const editors = [
      await render(<HandoffEditor mode="create" initial={BLANK_HANDOFF} childOptions={CHILDREN} people={[]} error={null} busy={false} stale={false} onSubmit={noop} />),
      await render(<PreparationEditor childOptions={CHILDREN} transitions={[]} initialLinkId={null} error={null} busy={false} onSubmit={noop} />),
      await render(<FollowUpEditor mode="create" initial={BLANK_FOLLOW_UP} childOptions={CHILDREN} people={[]} suggestedCurrency={null} error={null} busy={false} stale={false} onSubmit={noop} />),
    ];
    assert.deepEqual(claimOffenders(editors, (i) => `editor ${i}`), []);
    assert.ok(editors.some((r) => texts(r).includes(COPY.editor.repeatHelp)), 'the repeat note is on screen, and passes only because the copy list names it');
  });

  test('nothing renders that suggests a message, a notice or an invitation was sent, or that someone can see a record', async () => {
    const { w, ids } = richWorld();
    const screens = [await render(<HubView {...hubProps(w)} />), await render(<TransitionDetailView {...detailProps(w, ids.waiting)} />), await render(<FollowUpDetailView {...followUpProps(w, ids.money)} />)];
    const banned = /(shared with|can see this|visible to|sent to|\bsend\b|\bnotify\b|\binvite\b|\bshare\b|message (them|her|him)|coming soon|\bTODO\b|reliab|cooperat|conflict|score|%)/i;
    for (const r of screens) for (const text of [...texts(r), ...labels(r)]) assert.ok(!banned.test(text), `"${text}" reads like something that is not true here`);
  });
});

describe('Every state the feature can present', () => {
  test('the showcase household renders on the hub and on every handoff and follow-up, with accessible controls and no claim words', async () => {
    const { w, ids } = showcaseWorld();
    const hub = await render(<HubView {...hubProps(w)} />);
    const screens = [['hub', hub]];
    const handoffIds = [ids.requested, ids.acknowledged, ids.acceptedNeeds, ids.covered, ids.declined, ids.markedNeeds, ids.plain, ids.archived, ids.removedPrep, ids.noChild, ids.completedResp];
    for (const id of handoffIds) screens.push([`handoff ${id}`, await render(<TransitionDetailView {...detailProps(w, id)} />)]);
    const followUpIds = [ids.followOpen, ids.followNoCounterpart, ids.followDone, ids.followRemoved];
    for (const id of followUpIds) screens.push([`follow-up ${id}`, await render(<FollowUpDetailView {...followUpProps(w, id)} />)]);

    for (const [where, r] of screens) if (pressables(r).length > 0) everyPressableIsAccessible(r, where);
    assert.deepEqual(claimOffenders(screens.map(([, r]) => r), (i) => screens[i][0]), []);

    const everything = dump(hub);
    for (const secret of ['Elm St', "Dad's place"]) assert.ok(!everything.includes(secret), `"${secret}" is not on the hub`);
    assert.ok(headers(hub).every((text) => !/Alex|Jordan|June|Pat/.test(text)), 'no heading is the other adult');
  });

  test('a handoff with no child recorded says so and is flagged for review, and can still be opened for editing', async () => {
    const { w, ids } = showcaseWorld();
    const r = await render(<TransitionDetailView {...detailProps(w, ids.noChild)} />);
    assert.ok(texts(r).includes(COPY.child.notRecorded));
    assert.ok(texts(r).includes(COPY.review.child_not_recorded));
    assert.ok(labels(r).includes(COPY.actions.edit));
    const gate = handoffEditorGate(w.state, buildView(w), ids.noChild);
    assert.equal(gate.kind, 'ready');
    assert.equal(gate.seed.fields.childId, '', 'no child is chosen for her');
  });

  test('a handoff whose person is no longer available is flagged for review, with only the two safe recordings', async () => {
    const { w, ids } = showcaseWorld();
    const r = await render(<TransitionDetailView {...detailProps(w, ids.archived)} />);
    const recordings = labels(r).filter((l) => /^(Record|It )/.test(l) || l === COPY.actions.takeBack);
    assert.deepEqual(recordings, ['Record a different person', 'Take it back']);
    assert.ok(!texts(r).includes('COVERED') && !texts(r).some((t) => t.startsWith('Covered:')), 'an unavailable person never leaves a handoff covered');
  });
});

function scenarioForWords() {
  const w = world();
  const alex = w.person('Alex');
  const id = handoff(w);
  request(w, { kind: 'event', id }, alex);
  answer(w, w.state.responsibilities[0].id, 'accepted_covered');
  return { w, id };
}

// ------------------------------------------------------------------------------------ the containers' decisions, as functions

describe('Wiring (pure)', () => {
  test('the route reads its mode from params: unknown or repeated values never open an editor by accident', () => {
    assert.equal(resolveMode(undefined), 'hub');
    assert.equal(resolveMode(''), 'hub');
    assert.equal(resolveMode('nonsense'), 'hub');
    assert.equal(resolveMode(['edit-handoff', 'hub']), 'edit-handoff');
    for (const mode of ['handoff', 'followup', 'new-handoff', 'edit-handoff', 'new-prep', 'new-followup', 'edit-followup']) assert.equal(resolveMode(mode), mode);
    assert.equal(paramText([]), undefined);
    assert.equal(paramText('abc'), 'abc');
    assert.deepEqual([...MODES_NEEDING_ID].sort(), ['edit-followup', 'edit-handoff', 'followup', 'handoff']);
  });

  test('every view has a header title from COPY', () => {
    const titles = ['hub', 'handoff', 'followup', 'new-handoff', 'edit-handoff', 'new-prep', 'new-followup', 'edit-followup'].map((mode) => titleFor(mode));
    assert.equal(titles[0], COPY.screen.title);
    assert.ok(titles.every((title) => typeof title === 'string' && title.length > 0));
    assert.equal(new Set(titles).size, titles.length, 'no two views share a title');
  });

  test('every outcome a mutation can name has its own sentence, and an unknown one is "not saved" — never blank', () => {
    const outcomes = [
      'unchanged', 'no_category', 'category_archived', 'invalid_child', 'invalid_title', 'invalid_text', 'invalid_date', 'invalid_time', 'invalid_counterpart', 'missing', 'removed',
      'not_a_handoff', 'stale', 'not_a_coparent_record', 'already_recorded', 'counterpart_unavailable', 'not_allowed', 'invalid_link', 'link_refused', 'not_open',
      'not_a_follow_up', 'invalid_currency', 'invalid_direction', 'invalid_amount', 'not_saved',
    ];
    for (const outcome of outcomes) assert.ok(outcomeMessage(outcome).length > 0 && outcomeMessage(outcome) === COPY.outcomes[outcome], outcome);
    assert.equal(outcomeMessage('something_new'), COPY.outcomes.not_saved);
    assert.equal(outcomeMessage('constructor'), COPY.outcomes.not_saved);
  });

  test('a responsibility tap becomes the one mutation it means, against a real household', () => {
    const w = world();
    const alex = w.person('Alex');
    const sam = w.person('Sam');
    const id = handoff(w);
    const about = { kind: 'event', id };
    const view = () => buildView(w).transitions.find((t) => t.id === id).responsibility;

    assert.equal(responsibilityRun(about, view(), 'record_asked', null), null, 'a person is needed and none was chosen');
    w.run(responsibilityRun(about, view(), 'record_asked', { kind: 'person', personId: alex }));
    assert.equal(view().stage, 'requested');
    assert.equal(view().counterpart.personId, alex);

    w.run(responsibilityRun(about, view(), 'accepted_needs_me', null));
    assert.equal(view().stage, 'accepted');
    assert.equal(view().coverage, 'not_covered');
    w.run(responsibilityRun(about, view(), 'no_longer_needs_me', null));
    assert.equal(view().coverage, 'covered', 'covered only once she says it no longer needs her');
    w.run(responsibilityRun(about, view(), 'still_needs_me', null));
    assert.equal(view().coverage, 'not_covered');

    assert.equal(responsibilityRun(about, view(), 'reassign', null), null);
    w.run(responsibilityRun(about, view(), 'reassign', { kind: 'person', personId: sam }));
    assert.equal(view().counterpart.personId, sam);
    w.run(responsibilityRun(about, view(), 'returned', null));
    assert.equal(view().stage, 'with_you');
    assert.equal(responsibilityRun(about, { ...view(), responsibilityId: null }, 'completed', null), null, 'nothing recorded, nothing to answer');
  });

  test('a person added in the same tap goes through the canonical path, and nothing is contacted', () => {
    const w = world();
    const id = handoff(w);
    w.run(responsibilityRun({ kind: 'event', id }, buildView(w).transitions[0].responsibility, 'record_asked', { kind: 'new', displayName: 'Pat', relationship: 'neighbor' }));
    assert.equal(w.state.people.length, 1);
    assert.equal(w.state.people[0].displayName, 'Pat');
    assert.equal(buildView(w).transitions[0].responsibility.evidence.sent, false);
  });

  test('a handoff whose child was never recorded can still be opened for editing, with the child left unchosen', () => {
    const w = world();
    const id = handoff(w);
    const seeded = handoffSeedFor(w.state, id);
    assert.equal(seeded.fields.childId, JOSIE);
    const orphan = { ...w.state, events: w.state.events.map((e) => (e.id === id ? { ...e, subjectMemberId: null } : e)) };
    const seed = handoffSeedFor(orphan, id);
    assert.ok(seed, 'the editor opens');
    assert.equal(seed.fields.childId, '', 'no child is chosen for her');
    assert.equal(seed.fields.title, 'Pickup Josie');
    const row = orphan.events.find((e) => e.id === id);
    assert.equal(seed.baseUpdatedAt, handoffRevision(orphan, row), "the revision token is the real row's, so a save is not mistaken for a stale one");
    const saved = editHandoff(orphan, w.at(w.nowMs + 60_000), { eventId: id, baseUpdatedAt: seed.baseUpdatedAt, fields: { ...seed.fields, childId: JOSIE } });
    assert.equal(saved.outcome, 'saved', 'choosing the child is the fix, and it is accepted');
    assert.equal(saved.state.events.find((e) => e.id === id).subjectMemberId, JOSIE);
    assert.equal(handoffSeedFor(w.state, 'nope'), null);
  });

  test('editors open on a gate decided once: blocked households, missing and open-only records', () => {
    const none = world({ children: [] });
    assert.deepEqual(handoffEditorGate(none.state, buildView(none), undefined), { kind: 'blocked', codes: ['no_child'] });
    assert.deepEqual(preparationEditorGate(buildView(none)), { kind: 'blocked', codes: ['no_child'] });
    assert.equal(followUpEditorGate(none.state, buildView(none), undefined).kind, 'blocked');

    const w = world();
    const id = handoff(w);
    const taskId = followUp(w);
    const view = buildView(w);
    assert.equal(handoffEditorGate(w.state, view, undefined).kind, 'ready');
    assert.equal(handoffEditorGate(w.state, view, undefined).seed.fields.title, '', 'create opens blank');
    const edit = handoffEditorGate(w.state, view, id);
    assert.equal(edit.kind, 'ready');
    assert.equal(edit.seed.fields.title, 'Pickup Josie');
    assert.equal(edit.seed.baseUpdatedAt, handoffRevision(w.state, w.state.events.find((e) => e.id === id)), 'the row as it was when opened');
    assert.equal(handoffEditorGate(w.state, view, 'missing-id').kind, 'not_found');
    assert.equal(handoffEditorGate(w.state, view, taskId).kind, 'not_found');
    assert.equal(followUpEditorGate(w.state, view, taskId).kind, 'ready');
    assert.equal(followUpEditorGate(w.state, view, taskId).seed.fields.amountText, '80.00');
    assert.equal(followUpEditorGate(w.state, view, id).kind, 'not_found');
    assert.equal(followUpEditorGate(w.state, view, undefined).seed.fields.direction, null, 'no direction until she gives one');
  });

  test('a follow-up already marked done is not editable; a handoff she removed is not editable', () => {
    const w = world();
    const taskId = followUp(w);
    const id = handoff(w);
    finishFollowUp(w, taskId);
    w.run((s, ctx) => removeHandoff(s, ctx, id));
    const view = buildView(w);
    assert.equal(followUpEditorGate(w.state, view, taskId).kind, 'not_found');
    assert.equal(handoffEditorGate(w.state, view, id).kind, 'not_found');
  });

  test('handoff choices stay distinct when two handoffs share a title and a day', () => {
    const w = world({ children: [JOSIE, MILO] });
    const a = handoff(w, { title: 'Pickup', child: JOSIE, date: '2026-09-18' });
    const b = handoff(w, { title: 'Pickup', child: MILO, date: '2026-09-18' });
    const c = handoff(w, { title: 'Swim', child: JOSIE, date: '2026-09-18', startTime: '09:00', endTime: '09:30' });
    const d = handoff(w, { title: 'Swim', child: JOSIE, date: '2026-09-18', startTime: '11:00', endTime: '11:30' });
    const e = handoff(w, { title: 'Swim', child: JOSIE, date: '2026-09-18', startTime: '11:00', endTime: '11:30' });
    const choices = handoffChoices(buildView(w).transitions, DAY);
    const labelOf = (id) => choices.find((choice) => choice.id === id).label;
    assert.equal(new Set(choices.map((choice) => choice.label)).size, choices.length, 'no two chips read the same');
    assert.ok(labelOf(a).includes('Josie') && labelOf(b).includes('Milo'), 'the child tells two handoffs apart');
    assert.ok(labelOf(c).includes('9:00 AM') && labelOf(d).includes('11:00 AM'), 'then the time');
    assert.ok(labelOf(d) !== labelOf(e), 'and finally the order, for two that are identical');
    assert.ok(labelOf(a).startsWith('Pickup · '), 'a label is "title · day"');
  });

  test('"Add preparation" from a handoff whose time has passed still links to THAT handoff; a removed one is never offered', () => {
    const w = world();
    const past = handoff(w, { title: 'Earlier pickup', date: '2026-09-14' });
    const upcoming = handoff(w, { title: 'Later pickup', date: '2026-09-18' });
    const gone = handoff(w, { title: 'Cancelled pickup', date: '2026-09-19' });
    w.run((s, ctx) => removeHandoff(s, ctx, gone));
    const view = buildView(w);
    const idsOf = (arrivedFrom) => linkableTransitions(w.state, view, arrivedFrom).map((t) => t.id);
    assert.ok(!view.transitions.some((t) => t.id === past), 'a handoff whose time has passed is not on the coming-up list');
    assert.deepEqual(idsOf(undefined), [upcoming]);
    assert.deepEqual(idsOf(upcoming), [upcoming]);
    assert.deepEqual(idsOf(past), [upcoming, past], 'the one she arrived from is offered, so it can be pre-selected');
    assert.deepEqual(idsOf(gone), [upcoming]);
    assert.deepEqual(idsOf('not-a-handoff'), [upcoming]);
  });

  test('presence checks name the same outcome the mutation would, and check nothing else', () => {
    assert.equal(handoffPresenceIssue({ ...BLANK_HANDOFF }), 'invalid_child');
    assert.equal(handoffPresenceIssue({ ...BLANK_HANDOFF, childId: JOSIE }), 'invalid_title');
    assert.equal(handoffPresenceIssue({ ...BLANK_HANDOFF, childId: JOSIE, title: 'x' }), 'invalid_date');
    assert.equal(handoffPresenceIssue({ ...BLANK_HANDOFF, childId: JOSIE, title: 'x', date: 'not a date', startTime: 'nope', endTime: 'nope' }), null, 'whether it is a real date or time is the mutation\'s to say');
    assert.equal(preparationPresenceIssue({ childId: '', title: 'x', dueDate: '', notes: '', linkEventId: null }), 'invalid_child');
    assert.equal(preparationPresenceIssue({ childId: JOSIE, title: '  ', dueDate: '', notes: '', linkEventId: null }), 'invalid_title');
    assert.equal(followUpPresenceIssue({ ...BLANK_FOLLOW_UP, title: 'x' }), 'invalid_currency');
    assert.equal(followUpPresenceIssue({ ...BLANK_FOLLOW_UP, title: 'x', currency: 'USD' }), 'invalid_direction');
    assert.equal(followUpPresenceIssue({ ...BLANK_FOLLOW_UP, title: 'x', currency: 'USD', direction: 'inflow' }), 'invalid_amount');
    assert.equal(followUpPresenceIssue({ ...BLANK_FOLLOW_UP, title: 'x', currency: 'USD', direction: 'inflow', amountText: 'abc' }), null);
  });
});

// ------------------------------------------------------------------------------------------------------- source discipline

describe('Source discipline', () => {
  const UI_DIR = fileURLToPath(new URL('../../src/features/coparent/ui/', import.meta.url));
  const ROUTE = fileURLToPath(new URL('../../app/(app)/life/coparent.tsx', import.meta.url));
  const files = readdirSync(UI_DIR).filter((name) => /\.tsx?$/.test(name));
  const source = (name) => readFileSync(`${UI_DIR}${name}`, 'utf8');

  const PRESENTATIONAL = [
    'AvailabilityNotice.tsx', 'FollowUpDetailView.tsx', 'FollowUpEditor.tsx', 'HandoffEditor.tsx', 'HubView.tsx', 'PersonPicker.tsx',
    'PreparationEditor.tsx', 'RemoveControl.tsx', 'ResponsibilityActions.tsx', 'TransitionDetailView.tsx', 'TransitionRow.tsx', 'parts.tsx',
  ];

  test('presentational components import no router, no store, and never read the clock', () => {
    for (const name of PRESENTATIONAL) {
      const text = source(name);
      assert.ok(!/from 'expo-router'/.test(text), `${name} must not import expo-router`);
      assert.ok(!/store\/(AppStateProvider|AccountProvider)/.test(text), `${name} must not import a store hook`);
      assert.ok(!/Date\.now\(|new Date\(/.test(text), `${name} must not read the clock`);
    }
  });

  test('no UI source file (or the route) carries a claim word in code or comment', () => {
    const all = [...files.map((name) => [name, source(name)]), ['coparent.tsx (route)', readFileSync(ROUTE, 'utf8')]];
    const words = /\b(agreed|court|custody|owes|owed|settled|paid|complied|violation|shared|verified|legal)\b/i;
    for (const [name, text] of all) assert.ok(!words.test(text), `${name} contains a boundary word`);
  });

  const withoutComments = (text) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const jsxTextLines = (text) => text.split('\n').filter((line) => /<[A-Za-z]/.test(line)).filter((line) => />[ \t]*[A-Za-z][^<>{}]*</.test(line));
  const literalProp = /\b(label|title|placeholder|accessibilityLabel|accessibilityHint)=["'][^"']*["']/;

  test('no literal button label and no literal sentence in JSX: every string comes from COPY or a presentation', () => {
    for (const name of files.filter((n) => n.endsWith('.tsx'))) {
      const text = withoutComments(source(name));
      assert.ok(!literalProp.test(text), `${name} has a literal label, title, placeholder or hint`);
      assert.deepEqual(jsxTextLines(text), [], `${name} has text written straight into JSX`);
    }
  });

  test('the source checks above really catch what they look for', () => {
    assert.equal(jsxTextLines('<AppText variant="body">Hello there</AppText>').length, 1);
    assert.equal(jsxTextLines('<AppText variant="body">{COPY.x}</AppText>').length, 0);
    assert.equal(jsxTextLines('const [a, setA] = useState<Foo | null>(null);').length, 0);
    assert.ok(literalProp.test('<Button label="Send" onPress={go} />'));
    assert.ok(!literalProp.test('<Button label={COPY.actions.save} onPress={go} />'));
    assert.ok(FORBIDDEN.test('They agreed'));
  });

  test('the route file only composes the container and sets the header title', () => {
    const text = readFileSync(ROUTE, 'utf8');
    assert.ok(/export default function/.test(text));
    assert.ok(/useLocalSearchParams/.test(text) && /Stack\.Screen/.test(text) && /CoParentScreen/.test(text));
    assert.ok(!/useStoreSnapshot|useAppStore|useHouseholdState/.test(text));
  });
});
