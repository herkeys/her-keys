/**
 * HK-FEATURE-05 — the Kids screens, rendered (scenarios AU, AV, AW, C, AN and the accessibility contract).
 * Rendered under the RN stub: this proves the props contract (roles, labels, states, what text is present), not pixels.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { describe, test } from 'node:test';
import { StyleSheet } from 'react-native';
import { sizing } from '../../src/design/tokens.ts';
import { NOT_AUTHORIZATION, PLAN_STEP_ACTION } from '../../src/features/kids/copy.ts';
import { buildChildDetail, buildKidsView } from '../../src/features/kids/projection.ts';
import { UNBOUND_IDENTITY } from '../../src/domain/account/binding.ts';
import { canAddChild, recordAccepted, recordDeclined } from '../../src/features/kids/mutations.ts';
import { AddChildView } from '../../src/features/kids/views/AddChildView.tsx';
import { ChildDetailView } from '../../src/features/kids/views/ChildDetailView.tsx';
import { ItemEditorView } from '../../src/features/kids/views/ItemEditorView.tsx';
import { KidsHubView } from '../../src/features/kids/views/KidsHubView.tsx';
import { ResponsibilityPanel } from '../../src/features/kids/views/ResponsibilityPanel.tsx';
import { labelChildren } from '../../src/features/kids/identity.ts';
import { render } from '../support/render.tsx';
import { NOW, TODAY, addEventFor, addTaskFor, askNewPerson, emptyHousehold, idOf, makeCtx, responsibilityOf, withChildren } from './support.mjs';

const textOf = (node) => {
  const kids = node.props.children;
  const flat = (v) => (Array.isArray(v) ? v.flatMap(flat) : v === null || v === undefined || v === false ? [] : [String(v)]);
  return flat(kids).join('');
};
const allText = (r) => r.root.findAllByType('Text').map(textOf).join('\n');
const pressables = (r) => r.root.findAllByType('Pressable');
const byLabel = (r, label) => pressables(r).find((p) => p.props.accessibilityLabel === label);
const flat = (node) => StyleSheet.flatten(node.props.style) ?? {};

const view = (s) => buildKidsView(s, s.household.id, { nowMs: NOW });
const detail = (s, id) => buildChildDetail(s, s.household.id, id, { nowMs: NOW });

function household() {
  const c = makeCtx();
  const s = withChildren(emptyHousehold(), c, [['Sam', '2018-03-03'], ['Ivy', '2021-06-10']]);
  return { s, c, sam: idOf(s, 'Sam'), ivy: idOf(s, 'Ivy') };
}
const noop = () => {};

describe('hub', () => {
  test('AW. empty: calm, no shaming, no demand; offers to add a child only while that is allowed', async () => {
    const empty = view(emptyHousehold());
    const allowed = await render(<KidsHubView view={empty} canAddChild onOpenChild={noop} onAddChild={noop} />);
    const text = allText(allowed);
    assert.match(text, /Your children will show up here/);
    assert.match(text, /Add a child and Her Keys can hold their practices, forms and pickups in one place/);
    for (const banned of [/get organized/i, /stay on top/i, /falling behind/i, /you should/i, /forgot/i]) assert.doesNotMatch(text, banned);
    assert.ok(byLabel(allowed, 'Add a child'));

    const otherAccounts = await render(<KidsHubView view={empty} canAddChild={false} onOpenChild={noop} onAddChild={noop} />);
    assert.equal(byLabel(otherAccounts, 'Add a child'), undefined, 'no button that cannot work');
    assert.match(allText(otherAccounts), /belongs to another account/);
    assert.doesNotMatch(allText(otherAccounts), /before you sign in|isn't available yet/, 'a signed-in household is no longer told it cannot add a child');
  });

  test('AW2. a household bound to an account is offered "Add a child" through the very same hub view (OC-01 resolved), and the button works', async () => {
    // The prop is derived exactly as the container derives it: from the household's identity record.
    const bound = { ...UNBOUND_IDENTITY, binding: { accountId: '11111111-1111-4111-8111-111111111111', householdId: '22222222-2222-4222-8222-222222222222', boundAt: '2026-09-21T15:00:00.000Z', kind: 'claim', idMap: {} } };
    let opened = 0;
    const r = await render(<KidsHubView view={view(emptyHousehold())} canAddChild={canAddChild(bound)} onOpenChild={noop} onAddChild={() => { opened += 1; }} />);
    const button = byLabel(r, 'Add a child');
    assert.ok(button, 'the same control an unbound household gets');
    button.props.onPress();
    assert.equal(opened, 1);
    assert.doesNotMatch(allText(r), /before you sign in|isn't available yet|belongs to another account/);

    const { s } = household();
    const withChildren = await render(<KidsHubView view={view(s)} canAddChild={canAddChild(bound)} onOpenChild={noop} onAddChild={noop} />);
    assert.ok(byLabel(withChildren, 'Add a child'), 'and so is a household that already has children (a second one, after binding)');
  });

  test('cards: identity, what is next, and only the facts that need her; each is one accessible button', async () => {
    const { s, c, sam } = household();
    let w = addEventFor(s, c, sam, 'Soccer practice', { location: 'Riverside' });
    const asked = askNewPerson(w.state, c, { kind: 'event', id: w.id });
    const declined = recordDeclined(asked.state, c, responsibilityOf(asked.state, { kind: 'event', id: w.id }).id).state;
    const r = await render(<KidsHubView view={view(declined)} canAddChild onOpenChild={noop} onAddChild={noop} />);
    const card = pressables(r).find((p) => /Sam, 8/.test(p.props.accessibilityLabel));
    assert.ok(card);
    assert.equal(card.props.accessibilityRole, 'button');
    assert.match(card.props.accessibilityLabel, /Next: Soccer practice · Tomorrow, 5:00–6:00 PM/);
    assert.match(card.props.accessibilityLabel, /1 need a plan/, 'the plan gap is announced, not only drawn');
    assert.ok((flat(card).minHeight ?? 0) >= sizing.minTouchTarget);
    const quiet = pressables(r).find((p) => /Ivy, 5/.test(p.props.accessibilityLabel));
    assert.match(quiet.props.accessibilityLabel, /Nothing recorded yet/);
  });

  test('C. two children with the same first name: each card carries the context that tells them apart', async () => {
    const c = makeCtx();
    const s = withChildren(emptyHousehold(), c, [['Sam', '2018-03-03'], ['Sam', '2020-07-07']]);
    const r = await render(<KidsHubView view={view(s)} canAddChild onOpenChild={noop} onAddChild={noop} />);
    const labels = pressables(r).filter((p) => /Sam/.test(p.props.accessibilityLabel ?? '')).map((p) => p.props.accessibilityLabel);
    assert.equal(labels.length, 2);
    assert.match(labels[0], /born Mar 3, 2018/);
    assert.match(labels[1], /born Jul 7, 2020/);
    for (const label of labels) for (const child of s.children) assert.equal(label.includes(child.id), false, 'no internal id');
  });

  test('a household mismatch shows nothing of the state', async () => {
    const { s } = household();
    const r = await render(<KidsHubView view={buildKidsView(s, 'not-this-household', { nowMs: NOW })} canAddChild onOpenChild={noop} onAddChild={noop} />);
    assert.match(allText(r), /Nothing is shown/);
    assert.doesNotMatch(allText(r), /Sam|Ivy/);
  });

  test('pressing a card opens that child by id', async () => {
    const { s, ivy } = household();
    let opened = null;
    const r = await render(<KidsHubView view={view(s)} canAddChild onOpenChild={(id) => { opened = id; }} onAddChild={noop} />);
    pressables(r).find((p) => /Ivy/.test(p.props.accessibilityLabel)).props.onPress();
    assert.equal(opened, ivy);
  });
});

describe('child detail', () => {
  function pickup() {
    const { s, c, sam } = household();
    const ev = addEventFor(s, c, sam, 'Tuesday pickup', { location: 'Lincoln Elementary' });
    return { s: ev.state, c, sam, ref: { kind: 'event', id: ev.id } };
  }
  const props = (s, sam, extra = {}) => ({ detail: detail(s, sam), today: TODAY, onOpenItem: noop, onAddTask: noop, onAddEvent: noop, onAddPlanStep: noop, ...extra });

  test('AV. a row tells a screen reader who it is for, when, where, who has it, and what is not recorded', async () => {
    const { s, sam } = pickup();
    const r = await render(<ChildDetailView {...props(s, sam)} />);
    const row = pressables(r).find((p) => /Tuesday pickup/.test(p.props.accessibilityLabel ?? '') && /Event for Sam/.test(p.props.accessibilityLabel ?? ''));
    assert.ok(row);
    for (const part of [/Event for Sam/, /Tomorrow, 5:00–6:00 PM/, /At Lincoln Elementary/, /Nobody is recorded as handling this/, /Not enough known/]) {
      assert.match(row.props.accessibilityLabel, part);
    }
    assert.ok((flat(row).minHeight ?? 0) >= sizing.minTouchTarget);
  });

  test('AV. an estimated length says it is an estimate; a stated one does not', async () => {
    const { s, c, sam } = household();
    const a = addTaskFor(s, c, sam, 'Untouched length');
    const b = addTaskFor(a.state, c, sam, 'Stated length', { durationText: '20', durationTouched: true });
    const r = await render(<ChildDetailView {...props(b.state, sam)} />);
    const text = allText(r);
    assert.match(text, /About 15 minutes \(an estimate\)/);
    assert.match(text, /20 minutes/);
    assert.doesNotMatch(text, /20 minutes \(/);
  });

  test('AU. responsibility state is text, not colour: asked, accepted-still-yours and covered each read differently', async () => {
    const { s, c, sam } = household();
    const t = addTaskFor(s, c, sam, 'Costume');
    const ref = { kind: 'task', id: t.id };
    const asked = askNewPerson(t.state, c, ref);
    const rid = responsibilityOf(asked.state, ref).id;
    const texts = [];
    for (const state of [asked.state, recordAccepted(asked.state, c, rid, true).state, recordAccepted(asked.state, c, rid, false).state]) {
      texts.push(allText(await render(<ChildDetailView {...props(state, sam)} />)));
    }
    assert.match(texts[0], /You asked Alex\. Nothing is recorded back yet\./);
    assert.match(texts[1], /Alex said yes\. It's marked as still needing you\./);
    assert.match(texts[2], /Alex said yes, and it's marked as off your list\./);
    assert.match(texts[2], /COVERED/i);
    assert.doesNotMatch(texts[0], /covered/i);
    assert.doesNotMatch(texts[1], /covered/i);
  });

  test('the fallback section always carries the planning-only note, and never a legal claim', async () => {
    const { s, sam } = pickup();
    const text = allText(await render(<ChildDetailView {...props(s, sam)} />));
    assert.ok(text.includes(NOT_AUTHORIZATION));
    for (const banned of [/authorized to/i, /approved (pickup|person)/i, /verified/i, /official/i, /legally/i]) assert.doesNotMatch(text.replace(NOT_AUTHORIZATION, ''), banned);
  });

  test('AC. a gap offers a step; once a step exists it is OPENED, not duplicated, and the label does not change', async () => {
    const { s, c, sam, ref } = pickup();
    const before = await render(<ChildDetailView {...props(s, sam)} />);
    assert.ok(byLabel(before, PLAN_STEP_ACTION));
    const step = addTaskFor(s, c, sam, 'Arrange backup pickup', { partOf: ref });
    const after = await render(<ChildDetailView {...props(step.state, sam)} />);
    assert.equal(byLabel(after, PLAN_STEP_ACTION), undefined, 'no second "add" beside an open step');
    assert.ok(byLabel(after, 'Open step: Arrange backup pickup'));
    assert.match(allText(after), /NOT ENOUGH KNOWN/i);
    assert.doesNotMatch(allText(after), /PLAN IN PLACE/i);
  });

  test('a plan in place offers no further step; a declined one shows why and offers one', async () => {
    const { s, c, sam, ref } = pickup();
    const asked = askNewPerson(s, c, ref);
    const rid = responsibilityOf(asked.state, ref).id;
    const ok = await render(<ChildDetailView {...props(recordAccepted(asked.state, c, rid, false).state, sam)} />);
    assert.match(allText(ok), /PLAN IN PLACE/i);
    assert.equal(byLabel(ok, PLAN_STEP_ACTION), undefined);
    const no = await render(<ChildDetailView {...props(recordDeclined(asked.state, c, rid).state, sam)} />);
    assert.match(allText(no), /NEEDS A PLAN/i);
    assert.match(allText(no), /Alex said no/);
    assert.ok(byLabel(no, PLAN_STEP_ACTION));
  });

  test('a long "coming up" list is folded behind a labelled toggle that announces its state', async () => {
    const { s, c, sam } = household();
    let w = s;
    for (let i = 0; i < 8; i += 1) w = addEventFor(w, c, sam, `Event ${i}`, { startText: `${1 + i}:00 PM`, endText: `${1 + i}:30 PM` }).state;
    const r = await render(<ChildDetailView {...props(w, sam)} />);
    const toggle = pressables(r).find((p) => p.props.accessibilityState && 'expanded' in p.props.accessibilityState);
    assert.ok(toggle);
    assert.equal(toggle.props.accessibilityState.expanded, false);
    assert.match(toggle.props.accessibilityLabel, /Show 3 more/);
  });

  test('a child with nothing recorded says so plainly and offers to add', async () => {
    const { s, sam } = household();
    const r = await render(<ChildDetailView {...props(s, sam)} />);
    assert.match(allText(r), /Nothing recorded for this child yet/);
    assert.ok(byLabel(r, 'Add a task') && byLabel(r, 'Add an event'));
  });

  test('no placeholder, fake or disabled affordance is rendered', async () => {
    const { s, sam } = pickup();
    const text = allText(await render(<ChildDetailView {...props(s, sam)} />));
    for (const banned of [/coming soon/i, /\bTODO\b/, /\bTBD\b/, /not implemented/i, /lorem/i]) assert.doesNotMatch(text, banned);
  });
});

describe('responsibility panel', () => {
  const facts = (s, ref) => detail(s, s.tasks.concat(s.events).find((x) => x.id === ref.id).subjectMemberId);
  function panelFor(state, ref, extra = {}) {
    const d = facts(state, ref);
    const item = [...d.upcoming, ...Object.values(d.openWork).flat()].find((i) => i.ref.id === ref.id);
    return { facts: item.responsibility, actions: item.actions, people: [], busy: false, message: null, onAskPerson: noop, onAskNewPerson: noop, onSeen: noop, onAccepted: noop, onDeclined: noop, onTakeBack: noop, ...extra };
  }

  test('accepting demands an explicit choice: Save stays off until one is made, and the answer is reported as a boolean', async () => {
    const { s, c, sam } = household();
    const t = addTaskFor(s, c, sam, 'Costume');
    const ref = { kind: 'task', id: t.id };
    const asked = askNewPerson(t.state, c, ref);
    let answer;
    const r = await render(<ResponsibilityPanel {...panelFor(asked.state, ref, { onAccepted: (v) => { answer = v; } })} />);
    const TestRenderer = (await import('react-test-renderer')).default;
    await TestRenderer.act(async () => byLabel(r, 'Alex said yes').props.onPress());
    const save = byLabel(r, 'Save');
    assert.equal(save.props.accessibilityState.disabled, true, 'no default answer: nothing to save yet');
    await TestRenderer.act(async () => byLabel(r, 'Off my list').props.onPress());
    await TestRenderer.act(async () => byLabel(r, 'Save').props.onPress());
    assert.strictEqual(answer, false, 'off my list -> stillNeedsMe false, said explicitly');
  });

  test('offers only the steps that apply to where the handoff has got to', async () => {
    const { s, c, sam } = household();
    const t = addTaskFor(s, c, sam, 'Costume');
    const ref = { kind: 'task', id: t.id };
    const none = await render(<ResponsibilityPanel {...panelFor(t.state, ref)} />);
    assert.ok(byLabel(none, 'Ask someone to take this'));
    assert.equal(byLabel(none, 'Take it back'), undefined);

    const asked = askNewPerson(t.state, c, ref);
    const requested = await render(<ResponsibilityPanel {...panelFor(asked.state, ref)} />);
    for (const label of ['Alex has seen it', 'Alex said yes', 'Alex said no', 'Take it back']) assert.ok(byLabel(requested, label), label);
    assert.equal(byLabel(requested, 'Ask someone to take this'), undefined, 'one live handoff per thing');
  });
});

describe('editor', () => {
  const base = { kind: 'task', mode: 'create', timeZone: 'America/Chicago', durationKnowledge: null, planStepFor: null, people: [], responsibility: null, notice: null, onReload: noop };
  const initial = { childId: null, title: '', dueDate: '', durationText: '15', durationTouched: false, notes: '', commitment: 'flexible', date: '', startText: '', endText: '', where: '', handoffToPersonId: null };

  test('two colliding children are chosen by name AND context, never by id', async () => {
    const c = makeCtx();
    const s = withChildren(emptyHousehold(), c, [['Sam', '2018-03-03'], ['Sam', '2020-07-07']]);
    const r = await render(<ItemEditorView {...base} childChoices={labelChildren(s.children, TODAY)} initial={{ ...initial, childId: s.children[0].id }} onSubmit={async () => ({ ok: true })} />);
    const labels = pressables(r).map((p) => p.props.accessibilityLabel).filter((l) => /^Sam/.test(l ?? ''));
    assert.deepEqual(labels, ['Sam, 8 · born Mar 3, 2018', 'Sam, 6 · born Jul 7, 2020']);
    assert.equal(pressables(r).find((p) => p.props.accessibilityLabel === labels[0]).props.accessibilityState.selected, true);
  });

  test('the prefilled length is called an estimate until she touches it, and touching it is reported', async () => {
    const { s } = household();
    let seen;
    const TestRenderer = (await import('react-test-renderer')).default;
    const r = await render(<ItemEditorView {...base} childChoices={labelChildren(s.children, TODAY)} initial={{ ...initial, childId: s.children[0].id, title: 'Slip' }} onSubmit={async (v) => { seen = v; return { ok: true }; }} />);
    assert.match(allText(r), /This is an estimate until you change it/);
    await TestRenderer.act(async () => byLabel(r, 'Add task').props.onPress());
    assert.equal(seen.durationTouched, false, 'untouched: the default she was shown');

    const length = r.root.findAllByType('TextInput').find((n) => n.props.value === '15');
    await TestRenderer.act(async () => length.props.onChangeText('20'));
    assert.doesNotMatch(allText(r), /This is an estimate until you change it/);
    await TestRenderer.act(async () => byLabel(r, 'Add task').props.onPress());
    assert.deepEqual([seen.durationTouched, seen.durationText], [true, '20']);
  });

  test('AN. a second tap in the same frame does not save twice', async () => {
    const { s } = household();
    let calls = 0;
    let release;
    const gate = new Promise((resolve) => { release = resolve; });
    const TestRenderer = (await import('react-test-renderer')).default;
    const r = await render(<ItemEditorView {...base} childChoices={labelChildren(s.children, TODAY)} initial={{ ...initial, childId: s.children[0].id, title: 'Slip' }} onSubmit={async () => { calls += 1; await gate; return { ok: true }; }} />);
    const press = byLabel(r, 'Add task').props.onPress;
    await TestRenderer.act(async () => { press(); press(); press(); });
    release();
    await TestRenderer.act(async () => { await gate; });
    assert.equal(calls, 1);
  });

  test('a refused save shows its reason as an alert and keeps what she typed', async () => {
    const { s } = household();
    const TestRenderer = (await import('react-test-renderer')).default;
    const r = await render(<ItemEditorView {...base} childChoices={labelChildren(s.children, TODAY)} initial={{ ...initial, childId: s.children[0].id }} onSubmit={async () => ({ ok: false, message: 'Give it a title.' })} />);
    await TestRenderer.act(async () => byLabel(r, 'Add task').props.onPress());
    const alert = r.root.findAll((n) => n.props.accessibilityRole === 'alert');
    assert.equal(alert.length > 0, true);
    assert.match(allText(r), /Give it a title\./);
  });

  test('a stale save says nothing was saved and offers the newer version', async () => {
    const { s } = household();
    let reloaded = 0;
    const r = await render(<ItemEditorView {...base} mode="edit" notice="This changed while you were editing, so nothing was saved. The newer version is shown." onReload={() => { reloaded += 1; }} childChoices={labelChildren(s.children, TODAY)} initial={{ ...initial, childId: s.children[0].id }} onSubmit={async () => ({ ok: true })} />);
    assert.match(allText(r), /nothing was saved/i);
    byLabel(r, 'Show the newer version').props.onPress();
    assert.equal(reloaded, 1);
  });

  test('a time that does not exist is explained while she types (spring forward)', async () => {
    const c = makeCtx();
    const s = withChildren(emptyHousehold('America/New_York'), c, [['Sam', '2018-03-03']]);
    const r = await render(<ItemEditorView {...base} kind="event" timeZone="America/New_York" childChoices={labelChildren(s.children, TODAY)} initial={{ ...initial, childId: s.children[0].id, date: '2026-03-08', startText: '2:30 AM', endText: '4:00 AM' }} onSubmit={async () => ({ ok: true })} />);
    assert.match(allText(r), /doesn't exist that day, because the clocks move forward\. It will be 3:30 AM\./);
  });

  test('add a child: name and birth date are handed over as typed', async () => {
    let got;
    const TestRenderer = (await import('react-test-renderer')).default;
    const r = await render(<AddChildView onSubmit={async (name, birth) => { got = [name, birth]; return { ok: true }; }} />);
    const inputs = r.root.findAllByType('TextInput');
    await TestRenderer.act(async () => inputs[0].props.onChangeText('Sam'));
    await TestRenderer.act(async () => inputs[1].props.onChangeText(' 2018-03-03 '));
    await TestRenderer.act(async () => byLabel(r, 'Add child').props.onPress());
    assert.deepEqual(got, ['Sam', '2018-03-03']);
  });
});
