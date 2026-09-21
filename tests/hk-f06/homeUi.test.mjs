/**
 * HK-FEATURE-06 / HM3-HM5 — THE SCREENS, rendered.
 *
 * The presentational components (`HomeScreenView`, `HomeItemDetailView`, `HomeItemRow`) are mounted with the project's React Native
 * stub. This proves the props contract — roles, labels, which state is shown, what is offered — not pixels: layout and native
 * behaviour are checked in the running app when a runtime is available (see the ledger's device evidence).
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import React from 'react';
import { describe, test } from 'node:test';
import { archiveCategory } from '../../src/domain/categories.ts';
import { HomeItemDetailView } from '../../src/features/home/ui/HomeItemDetailView.tsx';
import { HomeScreenView } from '../../src/features/home/ui/HomeScreenView.tsx';
import { HOME_COPY, NEVER_ASSERTED, describeItem } from '../../src/features/home/copy.ts';
import { buildHomeView } from '../../src/features/home/model/buildHomeView.ts';
import { homeReadiness, homeScreenState } from '../../src/features/home/model/readiness.ts';
import TestRenderer from 'react-test-renderer';
import { render } from '../support/render.tsx';
import { NOW, SAM, TODAY, TZ, accept, completeTask, delegate, fresh, homeTask, homeVisit, household, lastTask, repeating } from '../support/homeFixtures.mjs';

const ROOT = new URL('../..', import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1');
const copyContext = { today: TODAY, timeZone: TZ };
const texts = (root) => root.findAllByType('Text').map((t) => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '')));
const allText = (root) => texts(root).join(' | ');
const pressables = (root) => root.findAllByType('Pressable');
const labelled = (root, label) => pressables(root).filter((p) => p.props.accessibilityLabel === label);
// The RN stub renders a Modal's children even when it is not visible; on a device an unopened sheet renders nothing. So "what is on screen"
// excludes anything inside a Modal, and sheet interactions use `labelled` explicitly.
const insideModal = (node) => { for (let p = node.parent; p; p = p.parent) if (p.type === 'Modal') return true; return false; };
const onScreen = (root, label) => labelled(root, label).filter((p) => !insideModal(p));
const press = (node) => TestRenderer.act(async () => { node.props.onPress(); });

const ready = { settled: true, recovery: null, memoryOnly: false };
const noop = () => {};
const props = (state, over = {}) => {
  const readiness = over.readiness ?? ready;
  const view = over.view === undefined ? buildHomeView(state, NOW) : over.view;
  const screen = over.screen ?? homeScreenState(readiness, view);
  return {
    screen, view, readiness, copyContext: view === null ? null : copyContext, expanded: {}, busy: false, error: null,
    onToggleSection: noop, onOpenItem: noop, onAddTask: noop, onAddVisit: noop, onRestoreArea: noop, onOpenSystems: noop, ...over,
  };
};

const tasks = (n, prefix = 'Task') => { const ctx = fresh(); let s = household(); for (let i = 0; i < n; i += 1) s = homeTask(s, ctx, `${prefix} ${String(i).padStart(2, '0')}`); return s; };

describe('B / A / C / P — the screen states are distinct', () => {
  test('B. LOADING shows a progress state and no Home content, no empty copy, no create buttons', async () => {
    const r = await render(<HomeScreenView {...props(household(), { view: null, screen: { kind: 'loading' }, readiness: { settled: false, recovery: null, memoryOnly: false } })} />);
    assert.match(allText(r.root), /Loading Home…/);
    assert.ok(r.root.findAllByType('ActivityIndicator').length > 0);
    assert.doesNotMatch(allText(r.root), /Nothing is saved|Nothing open|Add a task/);
  });

  test('A. EMPTY says what Her Keys knows and does not know — and never that the house is fine', async () => {
    const r = await render(<HomeScreenView {...props(household())} />);
    const text = allText(r.root);
    assert.match(text, /Nothing is saved under Home yet/);
    assert.match(text, /only knows what you’ve added/);
    assert.match(text, /doesn’t mean nothing at home needs attention/);
    assert.match(text, /can’t see the house itself/);
    assert.doesNotMatch(text, NEVER_ASSERTED);
    assert.equal(labelled(r.root, 'Add a task').length, 1);
    assert.equal(labelled(r.root, 'Add a visit').length, 1);
  });

  test('C. RECOVERED (started over): the recovery is stated, the plain empty state is NOT shown, and she can still add', async () => {
    const readiness = { settled: true, recovery: { reason: 'invalid_state', quarantined: true }, memoryOnly: false };
    const r = await render(<HomeScreenView {...props(household(), { readiness })} />);
    const text = allText(r.root);
    assert.match(text, /Home can’t show what was saved/);
    assert.match(text, /kept aside, not deleted/);
    assert.match(text, /says nothing about the house itself/);
    assert.doesNotMatch(text, /Nothing is saved under Home yet|Nothing open/);
    assert.equal(labelled(r.root, 'Add a task').length, 1);
  });

  test('C. RECOVERED and she has since added a task: the recovery notice is STILL on screen beside the content (it never quietly disappears)', async () => {
    const readiness = { settled: true, recovery: { reason: 'invalid_state', quarantined: true }, memoryOnly: false };
    const r = await render(<HomeScreenView {...props(tasks(2), { readiness })} />);
    const text = allText(r.root);
    assert.match(text, /Home can’t show what was saved/);
    assert.match(text, /Task 00/);
    assert.doesNotMatch(text, /Nothing is saved|Nothing open/);
  });

  test('a memory-only session says so', async () => {
    const r = await render(<HomeScreenView {...props(household(), { readiness: { settled: true, recovery: null, memoryOnly: true } })} />);
    assert.match(allText(r.root), /may not be saved on this device/);
  });

  test('P. MISSING Home area: a notice, no empty state, and nothing can be added', async () => {
    const s = household();
    const missing = { ...s, categories: s.categories.filter((c) => c.id !== 'cat-home') };
    const r = await render(<HomeScreenView {...props(missing)} />);
    assert.match(allText(r.root), /Home isn’t set up on this device/);
    assert.doesNotMatch(allText(r.root), /Nothing is saved/);
    assert.equal(labelled(r.root, 'Add a task').length, 0);
  });

  test('P. ARCHIVED Home area: items still listed, the archive is stated, "Restore Home area" is offered, creation is not', async () => {
    const s = archiveCategory(tasks(2), 'cat-home');
    let restored = 0;
    const r = await render(<HomeScreenView {...props(s, { onRestoreArea: () => { restored += 1; } })} />);
    const text = allText(r.root);
    assert.match(text, /Your Home area is archived/);
    assert.match(text, /Task 00/);
    assert.equal(labelled(r.root, 'Add a task').length, 0, 'no Add control while archived');
    const [restore] = labelled(r.root, 'Restore Home area');
    restore.props.onPress();
    assert.equal(restored, 1);
  });

  test('a renamed Home area is named in the scope line — by what the household calls it', async () => {
    const s = tasks(1);
    const renamed = { ...s, categories: s.categories.map((c) => (c.id === 'cat-home' ? { ...c, name: 'House stuff' } : c)) };
    const r = await render(<HomeScreenView {...props(renamed)} />);
    assert.match(allText(r.root), /saved in Her Keys under House stuff/);
  });
});

describe('D / E / AG — the hub content', () => {
  test('sections are titled with counts, rows are buttons with the spoken label, and every stated fact is on screen as text', async () => {
    const ctx = fresh();
    let s = household();
    s = homeTask(s, ctx, 'Overdue thing', { dueDate: '2026-09-18' });
    s = homeTask(s, ctx, 'Change the furnace filter', { dueDate: '2026-09-25', durationMinutes: 15, durationSource: 'default' });
    s = repeating(s, ctx, lastTask(s).id, { frequency: 'monthly', interval: 3, anchorDate: '2026-09-25' });
    s = homeVisit(s, ctx, 'Plumber', { date: '2026-09-23' });
    const view = buildHomeView(s, NOW);
    const r = await render(<HomeScreenView {...props(s)} />);
    const text = allText(r.root);
    assert.match(text, /NEEDS ATTENTION · 1/);
    assert.match(text, /COMING UP · 2/);
    assert.match(text, /REPEATS · 1/);
    for (const item of view.items) {
      const copy = describeItem(item, copyContext);
      assert.ok(labelled(r.root, copy.accessibilityLabel).length >= 1, `a button carries the spoken label for ${item.title}`);
      for (const fact of copy.facts) assert.ok(text.includes(fact.text), `"${fact.text}" is visible`);
    }
    assert.ok(pressables(r.root).filter((p) => p.props.accessibilityRole === 'button').every((p) => typeof p.props.onPress === 'function'), 'no dead button');
  });

  test('progressive disclosure: 12 unresolved tasks show 5, "Show all 12" reveals every one, and nothing is dropped', async () => {
    const s = tasks(12);
    const collapsed = await render(<HomeScreenView {...props(s)} />);
    assert.equal(pressables(collapsed.root).filter((p) => /^Task: Task \d\d\./.test(p.props.accessibilityLabel ?? '')).length, 5);
    assert.equal(labelled(collapsed.root, 'Show all 12').length, 1);
    const expanded = await render(<HomeScreenView {...props(s, { expanded: { unresolved: true } })} />);
    assert.equal(pressables(expanded.root).filter((p) => /^Task: Task \d\d\./.test(p.props.accessibilityLabel ?? '')).length, 12);
    assert.equal(labelled(expanded.root, 'Show fewer').length, 1);
  });

  test('a section with nothing in it is not rendered, and a small household shows no "Show all"', async () => {
    const r = await render(<HomeScreenView {...props(tasks(3))} />);
    assert.doesNotMatch(allText(r.root), /NEEDS ATTENTION|WAITING ON SOMEONE|RECENTLY MARKED DONE|PAST VISITS/);
    assert.equal(pressables(r.root).filter((p) => /^Show all/.test(p.props.accessibilityLabel ?? '')).length, 0);
  });

  test('pressing a row opens that item by its typed reference', async () => {
    const opened = [];
    const s = tasks(1);
    const r = await render(<HomeScreenView {...props(s, { onOpenItem: (id) => opened.push(id) })} />);
    pressables(r.root).find((p) => /^Task: Task 00/.test(p.props.accessibilityLabel ?? '')).props.onPress();
    assert.match(opened[0], /^task:/);
  });

  test('a Home System is only a row: it links to Systems, and there is no run, step or completion control anywhere', async () => {
    const s = { ...household(), systems: [{ id: 'sys-1', name: 'Seasonal checks', description: '', categoryId: 'cat-home', subjectMemberId: null, automationMode: 'manual', effortMinutes: null, energyDemand: null, provenance: { producer: 'user-action', artifactId: null, confidence: null }, scope: 'household' }] };
    const r = await render(<HomeScreenView {...props(s)} />);
    assert.match(allText(r.root), /Seasonal checks/);
    assert.match(allText(r.root), /Routines are managed in Systems/);
    assert.equal(labelled(r.root, 'Open in Systems').length, 1);
    for (const banned of [/Mark done/, /Run/, /Start/, /Complete/, /Steps?\b/]) assert.doesNotMatch(allText(r.root), banned);
  });

  test('an error is announced as an alert', async () => {
    const r = await render(<HomeScreenView {...props(tasks(1), { error: HOME_COPY.saveFailed })} />);
    assert.ok(r.root.findAllByType('Text').some((t) => t.props.accessibilityRole === 'alert' && /couldn’t save/.test(String(t.props.children))));
  });
});

describe('detail — one item, in full, with what is NOT known', () => {
  const detail = async (state, pick, over = {}) => {
    const view = buildHomeView(state, NOW);
    const item = view.items.find(pick);
    return render(<HomeItemDetailView item={item ?? null} holders={view.holders} copyContext={copyContext} busy={false} error={null} onAction={over.onAction ?? noop} />);
  };

  test('an open task offers done / edit / ask / remove, and states what it does not know', async () => {
    const r = await detail(tasks(1), (i) => i.canonicalKind === 'task');
    const text = allText(r.root);
    assert.match(text, /Not marked done/);
    assert.match(text, /WHAT HER KEYS DOESN’T KNOW/);
    assert.match(text, /No due date/);
    for (const label of ['Mark done', 'Edit', 'Ask someone', 'Remove']) assert.equal(onScreen(r.root, label).length, 1, label);
    assert.equal(onScreen(r.root, 'It’s due again').length, 0, 'not offered on an open task');
  });

  test('a task she marked done says so, says Her Keys does not check the outcome, and offers "It’s due again" — not "Mark done"', async () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Replace the smoke detector battery');
    s = completeTask(s, ctx, lastTask(s).id);
    const r = await detail(s, (i) => i.canonicalKind === 'task');
    const text = allText(r.root);
    assert.match(text, /Marked done/);
    assert.match(text, /Whether the problem is actually fixed/);
    assert.equal(onScreen(r.root, 'It’s due again').length, 1);
    assert.equal(onScreen(r.root, 'Mark done').length, 0);
    assert.doesNotMatch(text.replace(/Whether the problem is actually fixed/g, '').replace(/doesn’t check that the problem is actually fixed/g, ''), NEVER_ASSERTED);
  });

  test('responsibility is shown as it is: asked is not covered, and the responder actions match the state', async () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Have the gutters cleaned');
    const id = lastTask(s).id;
    s = delegate(s, ctx, { about: { kind: 'task', id }, to: { kind: 'person', id: SAM(s) } });
    const r = await detail(s, (i) => i.canonicalKind === 'task');
    const text = allText(r.root);
    assert.match(text, /Asked Sam — no answer yet/);
    assert.match(text, /hasn’t verified who’s qualified|Who’s qualified for this/);
    for (const label of ['They’ve seen it', 'They said yes', 'They said no', 'Take it back']) assert.equal(onScreen(r.root, label).length, 1, label);
    assert.equal(onScreen(r.root, 'Ask someone').length, 0, 'one live request at a time');
  });

  test('"They said yes" asks whether it still needs her, and the answer is passed explicitly', async () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Have the gutters cleaned');
    s = delegate(s, ctx, { about: { kind: 'task', id: lastTask(s).id }, to: { kind: 'person', id: SAM(s) } });
    const calls = [];
    const r = await detail(s, (i) => i.canonicalKind === 'task', { onAction: (action, payload) => calls.push([action, payload]) });
    assert.match(allText(r.root), /Their yes doesn’t mean it’s done\. Does this still need you\?/);
    await press(labelled(r.root, 'No, it doesn’t need me any more')[0]);
    await press(labelled(r.root, 'Record it')[0]);
    assert.deepEqual(calls, [['record_accepted', { stillNeedsMe: false }]]);
  });

  test('"They said yes": if she does not choose, the answer is the CONSERVATIVE one — it still needs her', async () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Have the gutters cleaned');
    s = delegate(s, ctx, { about: { kind: 'task', id: lastTask(s).id }, to: { kind: 'person', id: SAM(s) } });
    const calls = [];
    const r = await detail(s, (i) => i.canonicalKind === 'task', { onAction: (action, payload) => calls.push([action, payload]) });
    await press(labelled(r.root, 'Record it')[0]);
    assert.deepEqual(calls, [['record_accepted', { stillNeedsMe: true }]], 'never "no longer needs me" unless she said so');
  });

  test('a covered task is worded as what she said — not as done, and not as handled', async () => {
    const ctx = fresh();
    let s = homeTask(household(), ctx, 'Have the gutters cleaned');
    s = delegate(s, ctx, { about: { kind: 'task', id: lastTask(s).id }, to: { kind: 'person', id: SAM(s) } });
    s = accept(s, ctx, s.responsibilities[0].id, false);
    const r = await detail(s, (i) => i.canonicalKind === 'task');
    const text = allText(r.root);
    assert.match(text, /said yes, and you’ve marked it as not needing you/);
    assert.match(text, /Not marked done/);
    assert.doesNotMatch(text, /covered|handled/i);
  });

  test('a past visit says Her Keys does not know whether it happened, and offers no "done"', async () => {
    const r = await detail(homeVisit(household(), fresh(), 'Electrician', { date: '2026-09-19' }), (i) => i.canonicalKind === 'event');
    const text = allText(r.root);
    assert.match(text, /Whether the visit happened, and what came of it/);
    assert.equal(onScreen(r.root, 'Mark done').length, 0);
  });

  test('a System offers only "Open in Systems"', async () => {
    const s = { ...household(), systems: [{ id: 'sys-1', name: 'Seasonal checks', description: 'Twice a year', categoryId: 'cat-home', subjectMemberId: null, automationMode: 'manual', effortMinutes: null, energyDemand: null, provenance: { producer: 'user-action', artifactId: null, confidence: null }, scope: 'household' }] };
    const r = await detail(s, (i) => i.canonicalKind === 'system');
    const buttons = pressables(r.root).filter((p) => !insideModal(p)).map((p) => p.props.accessibilityLabel).filter((l) => ['Mark done', 'Edit', 'Remove', 'Open in Systems', 'Ask someone'].includes(l));
    assert.deepEqual(buttons, ['Open in Systems']);
    assert.match(allText(r.root), /No completion is recorded/);
  });

  test('an item that is gone is said to be gone, not shown as empty', async () => {
    const r = await render(<HomeItemDetailView item={null} holders={[]} copyContext={copyContext} busy={false} error={null} onAction={noop} />);
    assert.match(allText(r.root), /That isn’t in Home any more/);
  });

  test('the item title is a header, groups are summaries with spoken labels, and errors are alerts', async () => {
    const view = buildHomeView(tasks(1), NOW);
    const r = await render(<HomeItemDetailView item={view.items[0]} holders={[]} copyContext={copyContext} busy={false} error="Nope." onAction={noop} />);
    assert.ok(r.root.findAllByType('Text').some((t) => t.props.accessibilityRole === 'header'));
    assert.ok(r.root.findAllByType('View').some((v) => v.props.accessibilityRole === 'summary' && /What Her Keys doesn’t know/.test(v.props.accessibilityLabel ?? '')));
    assert.ok(r.root.findAllByType('Text').some((t) => t.props.accessibilityRole === 'alert'));
  });

  test('while a change is being saved, every action is disabled (no double tap)', async () => {
    const view = buildHomeView(tasks(1), NOW);
    const r = await render(<HomeItemDetailView item={view.items[0]} holders={[]} copyContext={copyContext} busy error={null} onAction={noop} />);
    const actions = pressables(r.root).filter((p) => !insideModal(p) && ['Mark done', 'Edit', 'Remove'].includes(p.props.accessibilityLabel));
    assert.ok(actions.length >= 3);
    assert.ok(actions.every((p) => p.props.disabled === true || p.props.accessibilityState?.disabled === true));
  });
});

describe('source audit — every string in Home source, and no dead affordance', () => {
  const files = [];
  const walk = (dir) => { for (const e of readdirSync(dir)) { const f = join(dir, e); if (statSync(f).isDirectory()) walk(f); else if (/\.(ts|tsx)$/.test(e)) files.push(f); } };
  walk(join(ROOT, 'src/features/home'));

  // The only places a strong word may appear: an explicit statement that Home does NOT know / check that thing.
  const NOT_KNOWN = [/doesn’t check that the problem is actually fixed/, /Whether the problem is actually fixed/, /hasn’t verified who’s qualified/, /Who’s qualified for this/, /anyone has been booked/];

  test('no string literal in Home source asserts a fix, safety, verification, handled state or all-clear (except as "not known")', () => {
    const offenders = [];
    for (const file of files) {
      // Comments quote the forbidden words while explaining them, so they are not user-facing strings.
      const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|(^|[^:'"`])\/\/.*$/gm, '$1');
      for (const match of text.matchAll(/(['"`])((?:(?!\1)[^\\\n]|\\.){8,})\1|>\s*([^<>{}\n]{8,}?)\s*</g)) {
        const literal = match[2] ?? match[3] ?? '';
        if (NEVER_ASSERTED.test(literal) && !NOT_KNOWN.some((re) => re.test(literal))) offenders.push(`${file.replace(ROOT, '')}: ${literal.slice(0, 90)}`);
      }
    }
    assert.deepEqual(offenders, []);
  });

  test('affordance audit: no placeholder, fake reminder/notification/AI, TODO or dead control in any Home surface', () => {
    const banned = /\b(coming soon|TODO|TBD|not implemented|lorem|fake|placeholder text|notify me|reminder set|AI-powered|smart suggestion|Hey Her Keys)\b/i;
    const hits = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '');
      if (banned.test(text)) hits.push(file.replace(ROOT, ''));
      // A disabled control must be disabled for a stated reason: saving in progress, or a required choice not yet made.
      for (const m of text.matchAll(/disabled=\{([^}]+)\}/g)) if (!/busy|choice === null/.test(m[1])) hits.push(`${file.replace(ROOT, '')}: unexplained disabled={${m[1]}}`);
    }
    assert.deepEqual(hits, []);
  });

  test('no Home file logs household free text (privacy: Home data reveals routines, absences and private conditions)', () => {
    const hits = files.filter((f) => /console\.(log|info|warn|error|debug)\(/.test(readFileSync(f, 'utf8'))).map((f) => f.replace(ROOT, ''));
    assert.deepEqual(hits, []);
  });

  test('Home reaches no network, analytics, AI or Supabase client of its own', () => {
    const forbidden = /(@supabase\/|fetch\(|XMLHttpRequest|analytics|posthog|amplitude|sentry|gemini|openai|anthropic|@google\/)/i;
    const hits = files.filter((f) => forbidden.test(readFileSync(f, 'utf8'))).map((f) => f.replace(ROOT, ''));
    assert.deepEqual(hits, []);
  });

  test('routes compose screens and hold no domain reasoning', () => {
    for (const route of ['home', 'home-item', 'home-task-editor', 'home-visit-editor']) {
      const text = readFileSync(join(ROOT, `app/(app)/life/${route}.tsx`), 'utf8');
      assert.ok(text.split('\n').length < 12, route);
      assert.doesNotMatch(text, /state\.|\.filter\(|\.map\(/, route);
    }
  });
});

void SAM;
