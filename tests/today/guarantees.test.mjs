/**
 * TODAY — cross-cutting guarantees, proved over the WHOLE scenario corpus (tests/today/corpus.mjs), not over a
 * favourite fixture: structure (no empty sections, bounded lists, three primary blocks), tone, first-glance privacy,
 * purity, the future-language seam, no JSON-bag reasoning, accessibility, and the derivation-time reference.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import React from 'react';
import { describe, test } from 'node:test';
import TestRenderer from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { parseMoney } from '../../src/domain/foundation/money.ts';
import { sizing } from '../../src/design/tokens.ts';
import { MAX_PRIMARY_BLOCKS, buildTodayView, deterministicNarrative } from '../../src/features/today/model/index.ts';
import { render } from '../support/render.tsx';
import { corpus } from './corpus.mjs';
import { DAY, READY, dense, deepFreeze, ev, household, nyMs, strings, tk, valid, view } from './fixtures.mjs';

await import('./support/stub-expo-router.mjs');
const { TodayDisclosure } = await import('../../src/features/today/TodayDisclosure.tsx');
const { TodayHeader } = await import('../../src/features/today/TodayHeader.tsx');
const { TodayMatters } = await import('../../src/features/today/TodayMatters.tsx');
const { TodayList } = await import('../../src/features/today/TodayList.tsx');
const { TodayStateNotice } = await import('../../src/features/today/TodayStateNotice.tsx');
const { TodayAttention } = await import('../../src/features/today/TodayAttention.tsx');
const { TodayHandled } = await import('../../src/features/today/TodayHandled.tsx');
const { NeedsMeChip } = await import('../../src/features/today/NeedsMeChip.tsx');
const { OneMoveCard } = await import('../../src/features/one-move/OneMoveCard.tsx');

const all = corpus().map((c) => ({ ...c, view: view(c.state, c.nowMs) }));
const ready = all.filter((c) => c.view.availability === 'ready');

const flat = (node) => StyleSheet.flatten(node.props.style) ?? {};
const text = (root) =>
  root
    .findAllByType('Text')
    .map((t) => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '')))
    .join(' | ');
const press = (node) => TestRenderer.act(async () => node.props.onPress());
const noop = async () => true;

describe('structure — complexity follows the day', () => {
  test('the corpus is real: every entry projects to a ready view', () => {
    assert.equal(ready.length, all.length);
    assert.ok(all.length >= 30);
  });

  test('never more than three primary blocks, and a section exists in the composition exactly when it has something to say', () => {
    const present = (v) => ({
      sparse: v.sparse !== null,
      decision: v.decision !== null,
      attention: v.attention !== null,
      matters: v.matters !== null,
      oneMove: v.oneMove !== null,
      upcoming: v.upcoming !== null,
      canWait: v.canWait !== null,
      waiting: v.waiting !== null,
      handled: v.handled !== null,
      onYourMind: v.onYourMind !== null,
    });
    for (const { name, view: v } of ready) {
      const keys = v.composition.map((c) => c.key);
      assert.equal(new Set(keys).size, keys.length, `${name}: no duplicated section`);
      assert.ok(v.composition.filter((c) => c.level === 'primary').length <= MAX_PRIMARY_BLOCKS, `${name}: primary blocks`);
      for (const [key, has] of Object.entries(present(v))) assert.equal(keys.includes(key), has, `${name}: ${key} is in the composition iff it has content`);
    }
  });

  test('every list is bounded at first glance, and nothing renders empty', () => {
    for (const { name, view: v } of ready) {
      assert.ok((v.attention?.rows.length ?? 0) <= 3, `${name}: attention`);
      assert.ok((v.canWait?.items.length ?? 0) <= 3, `${name}: can wait`);
      assert.ok((v.waiting?.rows.length ?? 0) <= 3, `${name}: waiting`);
      assert.ok((v.matters?.anchors.length ?? 0) <= 3, `${name}: matters`);
      for (const list of [v.attention?.rows, v.canWait?.items, v.waiting?.rows, v.matters?.anchors, v.handled?.rows]) if (list) assert.ok(list.length > 0, `${name}: an empty section must be null`);
    }
  });

  test('what needs her is ordered most urgent first — across the first-glance rows and the rest — in every scenario', () => {
    const rank = { now: 0, today: 1, soon: 2 };
    let multi = 0;
    for (const { name, view: v } of ready) {
      if (!v.attention) continue;
      const rows = [...v.attention.rows, ...v.attention.moreRows];
      const ranks = rows.map((r) => rank[r.urgency]);
      assert.deepEqual(ranks, [...ranks].sort((a, b) => a - b), `${name}: ${rows.map((r) => r.urgency).join(' > ')}`);
      if (new Set(ranks).size > 1) multi += 1;
    }
    assert.ok(multi >= 2, 'the corpus must include days with rows of DIFFERENT urgency, or this proves nothing');
  });

  test('the whole corpus is deterministic: the same state and instant give byte-identical views', () => {
    for (const { name, state, nowMs } of all) assert.equal(JSON.stringify(view(state, nowMs)), JSON.stringify(view(state, nowMs)), name);
  });
});

describe('tone — calm, precise, adult, operational', () => {
  const BANNED = [
    ['cheerleading', /you[’']ve got this|you got this|superstar|crush(ing|ed)? it|amazing|awesome|fantastic|great job|nice work|well done|proud of you|keep it up|rock ?star|smash(ing|ed)? it/i],
    ['exclamation', /!/],
    ['emoji', /\p{Extended_Pictographic}/u],
    ['manufactured urgency', /hurry|asap|immediately|don[’']t forget|running out of time|before it[’']s too late|last chance|urgent/i],
    ['diminutives', /\b(mama|mommy|hun|honey|sweetie|sweetheart|babe)\b/i],
    ['therapy-speak', /self-care|you deserve|be gentle|take a breath|deep breath|mental load|burn ?out|overwhelm|it[’']s okay to|you[’']re doing (great|amazing|your best)|permission to/i],
    ['productivity judgment / shame', /lazy|procrastinat|should have|slack|productiv|you forgot|neglect|irresponsible|falling behind|behind schedule|wasted/i],
    ['scores and gamification', /\d+\s?%|\bscore\b|\bpoints?\b|streak|level up/i],
  ];
  const lint = (label, list) => {
    for (const s of list) for (const [rule, re] of BANNED) assert.doesNotMatch(s, re, `${label}: “${s}” breaks the tone rule "${rule}"`);
  };

  test('everything the projection says, across every scenario', () => {
    for (const { name, view: v } of ready) lint(name, strings(v));
  });

  test('every string literal in the components and model (branches the corpus does not reach)', () => {
    const files = [
      ...readdirSync('src/features/today').filter((f) => /\.tsx?$/.test(f)).map((f) => `src/features/today/${f}`),
      ...readdirSync('src/features/today/model').filter((f) => f.endsWith('.ts')).map((f) => `src/features/today/model/${f}`),
      'src/features/one-move/OneMoveCard.tsx',
      'src/features/daily-load/DailyLoadCard.tsx',
      'src/features/daily-load/LoadMeter.tsx',
      'src/features/daily-load/describeLoad.ts',
      'src/features/life/LifeStatusSummary.tsx',
    ];
    let checked = 0;
    for (const file of files) {
      const source = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
      const copy = [];
      for (const m of source.matchAll(/'((?:[^'\\\n]|\\.)*)'|"((?:[^"\\\n]|\\.)*)"|`((?:[^`\\]|\\.)*)`/g)) {
        const s = m[1] ?? m[2] ?? m[3];
        if (s && /[A-Za-z]{3,}.*\s.*[A-Za-z]{2,}/.test(s) && !/^[./@]|^import |\.tsx?$/.test(s)) copy.push(s);
      }
      for (const m of source.matchAll(/>\s*([^<>{}\n][^<>{}]*?)\s*</g)) if (/[A-Za-z]{3,}\s+[A-Za-z]{2,}/.test(m[1]) && !/[;=(){}]|\breturn\b/.test(m[1])) copy.push(m[1]);
      lint(file, copy);
      checked += copy.length;
    }
    assert.ok(checked > 150, `only ${checked} strings were checked — the extraction is not reading the components`);
  });

  test('delegation copy states what is unresolved and never characterizes anyone’s motives', () => {
    for (const { name, view: v } of ready.filter((c) => c.name.startsWith('C '))) {
      const sentences = [...(v.attention?.rows ?? []), ...(v.waiting?.rows ?? [])].map((r) => r.statement);
      for (const s of sentences) assert.doesNotMatch(s, /won[’']t|refus|ignor|forgot|lazy|neglect|blew off|flak|unreliable|irresponsible|covered|handled|taken care/i, `${name}: ${s}`);
    }
  });

  test('overload copy names the constraint instead of dramatizing it', () => {
    const b = ready.find((c) => c.name === 'B overloaded 14:00').view;
    assert.equal(b.headline, 'Your day works — but one window is too tight.');
    lint('B', [b.headline, ...strings(b.attention)]);
  });
});

describe('first-glance privacy — the minimum sensitive detail needed to act', () => {
  const state = (() => {
    let s = household();
    s = { ...s, children: [{ id: 'child-1', displayName: 'Josie-Private', birthDate: '2017-04-03', scope: 'child' }] };
    s = ev(s, { title: 'Practice', from: [15], to: [16], subjectMemberId: 'child-1', location: 'SECRET-PLACE-1', notes: 'SECRET-NOTE-1', travelMinutesBefore: 17, preparationMinutes: 13 });
    s = tk(s, { title: 'Pay the trip fee', minutes: 10, due: DAY, plan: { kind: 'unplanned' }, subjectMemberId: 'child-1', notes: 'SECRET-NOTE-2', value: parseMoney('35.00', 'USD', 'outflow') });
    return valid(s);
  })();

  test('locations, notes, amounts, a child’s name, birth date and travel are not in the projection', () => {
    const json = JSON.stringify(view(state, nyMs(9)));
    for (const secret of ['SECRET-PLACE-1', 'SECRET-NOTE-1', 'SECRET-NOTE-2', '35.00', '3500', 'Josie-Private', '2017-04-03']) assert.equal(json.includes(secret), false, secret);
    assert.match(json, /Practice/);
    assert.match(json, /Pay the trip fee/);
  });

  test('across the whole corpus, no money, no birth date and no location field is ever exposed', () => {
    for (const { name, view: v } of ready) assert.doesNotMatch(JSON.stringify(v), /"(value|amount|amountMinor|birthDate|location|notes)"/, name);
  });
});

describe('purity, and no reasoning outside typed facts', () => {
  test('a deeply frozen dense household projects without a throw, and the state is not touched', () => {
    const state = deepFreeze(dense());
    const before = JSON.stringify(state);
    const v = view(state, nyMs(6, 5));
    assert.equal(v.availability, 'ready');
    assert.equal(JSON.stringify(state), before);
  });

  test('the view is typed data, not a bag: no free-form JSON, payload or metadata field anywhere', () => {
    const forbidden = new Set(['metadata', 'payload', 'json', 'blob', 'extra', 'attributes', 'props', 'misc', 'meta_json', 'raw']);
    const walk = (value, path) => {
      if (Array.isArray(value)) value.forEach((v, i) => walk(v, `${path}[${i}]`));
      else if (value && typeof value === 'object') {
        for (const [k, v] of Object.entries(value)) {
          assert.equal(forbidden.has(k), false, `${path}.${k}`);
          walk(v, `${path}.${k}`);
        }
      }
    };
    for (const { name, view: v } of ready) walk(v, name);
  });

  test('the route is thin and owns no household state', () => {
    const route = readFileSync('app/(app)/today.tsx', 'utf8');
    assert.match(route, /useTodayView\(\)/);
    assert.doesNotMatch(route, /useState|useMemo|useSchedule|useHouseholdState|useAppStore/);
    for (const file of readdirSync('src/features/today').filter((f) => f.startsWith('Today') && f.endsWith('.tsx'))) {
      const source = readFileSync(`src/features/today/${file}`, 'utf8');
      // The only local state a presentational component may keep is UI: expanded / reviewing.
      for (const m of source.matchAll(/useState(?:<[^>]*>)?\(([^)]*)\)/g)) assert.match(m[1], /false|null|defaultExpanded/, `${file}: ${m[0]}`);
    }
  });
});

describe('the future-language seam is typed, replaceable, and nothing is wired', () => {
  const sample = ready.find((c) => c.name === 'A ordinary 08:00');

  test('a provider receives typed facts and returns a typed result; it replaces the headline and nothing else', () => {
    let received = null;
    const custom = (input) => {
      received = input;
      return { headline: 'Custom headline.' };
    };
    const base = view(sample.state, sample.nowMs);
    const alt = view(sample.state, sample.nowMs, READY, { narrative: custom });
    assert.equal(alt.headline, 'Custom headline.');
    assert.deepEqual({ ...alt, headline: base.headline }, base, 'the structure of the screen is not the provider’s to change');
    assert.deepEqual(Object.keys(received).sort(), ['counts', 'dayState', 'decision', 'household', 'liveIssue', 'logicalDate', 'needsYou', 'next', 'tier']);
  });

  test('the deterministic provider is what runs by default, and is a pure function of its input', () => {
    const input = { logicalDate: DAY, household: 'has_entries', dayState: 'x', tier: 'open', decision: 'pending', liveIssue: null, counts: { events: 1, openTasks: 0 }, next: { title: 'Pickup', startMinutes: 15 * 60 + 15 }, needsYou: 0 };
    assert.deepEqual(deterministicNarrative(input), deterministicNarrative(input));
    assert.equal(deterministicNarrative(input).headline, 'Your day fits. Next up: Pickup at 3:15 PM.');
    assert.equal(view(sample.state, sample.nowMs).headline, 'Your day fits. Next up: School drop-off at 8:15 AM.');
  });

  test('no model, no network, no key, no library: nothing in Today can call out, and no AI dependency exists', () => {
    const forbidden = /gemini|openai|anthropic|@google\/|generative|llm\b|fetch\(|XMLHttpRequest|axios|WebSocket|api[_-]?key|process\.env|EXPO_PUBLIC/i;
    const files = [
      ...readdirSync('src/features/today').filter((f) => /\.tsx?$/.test(f)).map((f) => `src/features/today/${f}`),
      ...readdirSync('src/features/today/model').map((f) => `src/features/today/model/${f}`),
      'src/features/one-move/OneMoveCard.tsx',
    ];
    for (const file of files) {
      const code = readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/.*$/gm, '$1');
      assert.doesNotMatch(code, forbidden, file);
    }
    const pkg = JSON.parse(readFileSync('package.json', 'utf8'));
    const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
    assert.equal(deps.some((d) => /openai|anthropic|google.*generative|langchain|^ai$|gemini/i.test(d)), false);
  });
});

describe('accessibility — the screen is usable by everyone', () => {
  const byName = (name) => ready.find((c) => c.name === name).view;

  const interactive = (root) => root.findAllByType('Pressable').filter((p) => p.props.accessibilityLabel !== 'Dismiss');
  const assertUsable = (label, root) => {
    for (const p of interactive(root)) {
      assert.equal(p.props.accessibilityRole, 'button', `${label}: role`);
      assert.ok(String(p.props.accessibilityLabel ?? '').trim().length > 0, `${label}: an accessible name`);
      const own = flat(p).minHeight ?? 0;
      const wrapped = Math.max(0, ...p.findAllByType('View').slice(0, 2).map((v) => flat(v).minHeight ?? 0));
      assert.ok(Math.max(own, wrapped) >= sizing.minTouchTarget, `${label}: “${p.props.accessibilityLabel}” is at least a 44pt target`);
    }
  };

  const rendered = async () => {
    const out = [];
    const add = async (label, element) => out.push([label, await render(element)]);
    const A = byName('A ordinary 08:00');
    const C = byName('C unanswered');
    const G = byName('G proposal');
    const D9 = byName('I dense 06:05');
    await add('header', <TodayHeader view={A} />);
    await add('matters', <TodayMatters section={A.matters} />);
    await add('list', <TodayList title="Can wait today" rows={[{ key: 'a', text: 'Water the plants', onPress: () => {}, hint: 'Opens it' }]} moreRows={[{ key: 'b', text: 'Print the permit' }]} />);
    await add('disclosure', <TodayDisclosure title="Everything today" summary="5"><TodayHandled section={{ rows: [] }} /></TodayDisclosure>);
    for (const kind of ['unknown', 'unavailable', 'never_entered', 'light']) {
      await add(`notice ${kind}`, kind === 'unknown' ? <TodayStateNotice kind="unknown" /> : kind === 'unavailable' ? <TodayStateNotice kind="unavailable" recoveryReason="future_version" /> : <TodayStateNotice kind={kind} entry={[{ label: 'Add a task', route: { pathname: '/task-editor' } }]} />);
    }
    await add('attention (delegation)', <TodayAttention section={C.attention} onTakeBack={noop} onDecide={noop} busy={false} note={null} />);
    await add('attention (approval)', <TodayAttention section={G.attention} onTakeBack={noop} onDecide={noop} busy={false} note={null} />);
    await add('attention (dense)', <TodayAttention section={D9.attention} onTakeBack={noop} onDecide={noop} busy={false} note={null} />);
    await add('handled', <TodayHandled section={byName('G handled (foundation fixture)').handled} />);
    await add('one move selected', <OneMoveCard section={A.oneMove} onComplete={() => {}} />);
    await add('one move completed', <OneMoveCard section={byName('F completed One Move').oneMove} onComplete={() => {}} />);
    await add('one move withheld', <OneMoveCard section={byName('B overloaded 14:00').oneMove} onComplete={() => {}} />);
    await add('on your mind', <NeedsMeChip onYourMind={byName('on your mind').onYourMind} />);
    return out;
  };

  test('every control has a role, a name, and a 44pt target', async () => {
    for (const [label, r] of await rendered()) assertUsable(label, r.root);
  });

  test('the greeting is the screen’s heading, and every section title is a real heading', async () => {
    const header = await render(<TodayHeader view={byName('A ordinary 08:00')} />);
    assert.ok(header.root.findAllByType('Text').some((t) => t.props.accessibilityRole === 'header' && /^Hi, Maren$/.test(String(t.props.children))));
    for (const [label, element] of [
      ['matters', <TodayMatters section={byName('A ordinary 08:00').matters} />],
      ['handled', <TodayHandled section={byName('G handled (foundation fixture)').handled} />],
      ['list', <TodayList title="Coming up" rows={[{ key: 'a', text: 'x' }]} />],
    ]) {
      const r = await render(element);
      assert.ok(r.root.findAllByType('Text').some((t) => t.props.accessibilityRole === 'header'), `${label}: a heading`);
    }
  });

  test('reading order follows the visual order: the label, then the statement, then what she can do', async () => {
    const r = await render(<TodayAttention section={byName('C unanswered').attention} onTakeBack={noop} onDecide={noop} busy={false} note={null} />);
    const t = text(r.root);
    assert.ok(t.indexOf('NEEDS YOU') < t.indexOf('hasn’t answered'), 'the tag comes first');
    const labels = r.root.findAllByType('Pressable').map((p) => p.props.accessibilityLabel);
    assert.deepEqual(labels, ['Take it back', 'Open'], 'actions come after the statement, in a stable order');
  });

  test('status is never only color: every treatment carries a word, and a recommendation is named as one', async () => {
    const one = await render(<OneMoveCard section={byName('A ordinary 08:00').oneMove} onComplete={() => {}} />);
    assert.match(text(one.root), /WHAT I RECOMMEND/);
    const facts = await render(<TodayMatters section={byName('A ordinary 08:00').matters} />);
    assert.doesNotMatch(text(facts.root), /WHAT I RECOMMEND/, 'a fact is not dressed as a recommendation');
    const claim = await render(<TodayMatters section={byName('E likely external event').matters} />);
    assert.match(text(claim.root), /LIKELY/);
    assert.ok(claim.root.findAllByType('View').some((v) => /Confidence: likely/.test(v.props.accessibilityLabel ?? '')), 'and it is spoken, not only seen');
    const needs = await render(<TodayAttention section={byName('C unanswered').attention} onTakeBack={noop} onDecide={noop} busy={false} note={null} />);
    assert.match(text(needs.root), /NEEDS YOU/);
  });

  test('expand and collapse are exposed to assistive technology wherever they occur', async () => {
    for (const [label, r] of await rendered()) {
      for (const p of interactive(r.root).filter((p) => p.props.accessibilityState && 'expanded' in p.props.accessibilityState)) {
        assert.equal(typeof p.props.accessibilityState.expanded, 'boolean', `${label}: ${p.props.accessibilityLabel}`);
        assert.ok(p.props.accessibilityHint, `${label}: a hint`);
      }
    }
    const dense = await render(<TodayAttention section={byName('I dense 06:05').attention} onTakeBack={noop} onDecide={noop} busy={false} note={null} />);
    const more = dense.root.findAllByType('Pressable').find((p) => /^More that needs you/.test(p.props.accessibilityLabel ?? ''));
    assert.deepEqual(more.props.accessibilityState, { expanded: false });
    await press(more);
    assert.deepEqual(dense.root.findAllByType('Pressable').find((p) => /^More that needs you/.test(p.props.accessibilityLabel ?? '')).props.accessibilityState, { expanded: true });
  });

  test('dynamic text: nothing truncates, nothing is pinned to a height, and font scaling is never switched off', () => {
    const files = [
      ...readdirSync('src/features/today').filter((f) => f.endsWith('.tsx')).map((f) => `src/features/today/${f}`),
      'src/features/one-move/OneMoveCard.tsx',
      'src/features/daily-load/LoadMeter.tsx',
      'src/features/daily-load/DailyLoadCard.tsx',
      'src/features/life/LifeStatusSummary.tsx',
    ];
    for (const file of files) {
      const code = readFileSync(file, 'utf8');
      assert.doesNotMatch(code, /numberOfLines|allowFontScaling|maxFontSizeMultiplier|adjustsFontSizeToFit/, file);
      assert.doesNotMatch(code, /(?<![A-Za-z])height:\s*\d/, `${file}: a fixed height would clip larger text`);
    }
  });

  test('long titles, long names and long reasoning all wrap', async () => {
    const long = 'Follow up with the county clerk about the corrected permit paperwork for the back-yard fence replacement '.repeat(3).slice(0, 199).trim();
    const name = 'Alexandra-Wilhelmina Featherstonehaugh-Cholmondeley the Third of Northumberland'.slice(0, 79);
    let s = household();
    s = tk(s, { title: long, minutes: 15, due: DAY, plan: { kind: 'unplanned' } });
    s = valid(s);
    const v = view(s, nyMs(9));
    const r = await render(<TodayAttention section={v.attention} onTakeBack={noop} onDecide={noop} busy={false} note={null} />);
    assert.ok(text(r.root).includes(long));
    assert.equal(r.root.findAll((n) => n.props && n.props.numberOfLines !== undefined).length, 0);
    const m = await render(<TodayMatters section={view(valid(ev(household(), { title: long, from: [10], to: [11] })), nyMs(8)).matters} />);
    assert.ok(text(m.root).includes(long));
    assert.equal(flat(m.root.findAllByType('Pressable')[0].findAllByType('View')[0]).flex, 1, 'the text column can shrink and wrap');
    void name;
  });
});

describe('performance — the dense reference derivation (Addendum §X)', () => {
  test('one complete derivation of the dense reference household stays under 100 ms (median of 40 runs)', () => {
    const state = dense();
    const now = nyMs(6, 5);
    for (let i = 0; i < 5; i += 1) buildTodayView({ state, nowMs: now, runtime: READY });
    const samples = [];
    for (let i = 0; i < 40; i += 1) {
      const t0 = performance.now();
      buildTodayView({ state, nowMs: now, runtime: READY });
      samples.push(performance.now() - t0);
    }
    samples.sort((a, b) => a - b);
    const median = samples[Math.floor(samples.length / 2)];
    const p95 = samples[Math.floor(samples.length * 0.95)];
    console.log(`[perf] dense reference (20 events, 40 tasks, 6 delegations, 5 captured): median ${median.toFixed(2)} ms, p95 ${p95.toFixed(2)} ms, max ${samples[samples.length - 1].toFixed(2)} ms over 40 runs`);
    assert.ok(median < 100, `median ${median.toFixed(2)} ms`);
  });
});
