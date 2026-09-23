/**
 * Today's presentation components: render/props contract tests.
 *
 * Honest scope (see tests/support/rn-stub.tsx): layout and native behavior are verified in the running
 * app. What is provable here is the CONTRACT — what each component says, which accessibility role, label,
 * hint and state it exposes, what it sends her to when pressed, and what it refuses to say. Components are
 * fed real view models built by `buildTodayView`, never hand-made props.
 */
import assert from 'node:assert/strict';
import React from 'react';
import { describe, test } from 'node:test';
import TestRenderer from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { sizing } from '../../src/design/tokens.ts';
import { render } from '../support/render.tsx';
import { completeOneMove } from '../../src/domain/oneMove.ts';
import { demoState, onboardedState } from '../support/fixtures.mjs';
import { DAY, at, ev, facet, household, mkCtx, nyInstant, nyMs, tk, valid, view, withMove } from './fixtures.mjs';

await import('./support/stub-expo-router.mjs');
const { router } = await import('./support/expo-router-stub.mjs');
const { TodayDisclosure, SectionLabel } = await import('../../src/features/today/TodayDisclosure.tsx');
const { TodaySourceLine } = await import('../../src/features/today/TodaySourceLine.tsx');
const { TodayStateNotice } = await import('../../src/features/today/TodayStateNotice.tsx');
const { TodayMatters } = await import('../../src/features/today/TodayMatters.tsx');
const { TodayList } = await import('../../src/features/today/TodayList.tsx');
const { NeedsMeChip } = await import('../../src/features/today/NeedsMeChip.tsx');
const { LoadMeter } = await import('../../src/features/daily-load/LoadMeter.tsx');
const oneMoveModule = await import('../../src/features/one-move/OneMoveCard.tsx');

const flat = (node) => StyleSheet.flatten(node.props.style) ?? {};
const text = (root) =>
  root
    .findAllByType('Text')
    .map((t) => (Array.isArray(t.props.children) ? t.props.children.join('') : String(t.props.children ?? '')))
    .join(' | ');
const pressable = (root, label) => root.findAllByType('Pressable').find((p) => p.props.accessibilityLabel === label);
const press = (node) => TestRenderer.act(async () => node.props.onPress());

describe('TodayDisclosure — progressive disclosure, accessibly', () => {
  test('is collapsed by default, and its state is exposed to assistive technology', async () => {
    const r = await render(<TodayDisclosure title="Everything today" summary="5"><SectionLabel>inside</SectionLabel></TodayDisclosure>);
    const header = r.root.findByType('Pressable');
    assert.deepEqual(
      [header.props.accessibilityRole, header.props.accessibilityLabel, header.props.accessibilityState, header.props.accessibilityHint],
      ['button', 'Everything today, 5', { expanded: false }, 'Shows the detail']
    );
    assert.doesNotMatch(text(r.root), /INSIDE/);
  });

  test('expanding reveals the detail, flips the exposed state, and can be collapsed again', async () => {
    const r = await render(<TodayDisclosure title="Why this one?"><SectionLabel>the reasons</SectionLabel></TodayDisclosure>);
    await press(r.root.findByType('Pressable'));
    assert.match(text(r.root), /THE REASONS/);
    assert.deepEqual(r.root.findByType('Pressable').props.accessibilityState, { expanded: true });
    assert.equal(r.root.findByType('Pressable').props.accessibilityHint, 'Hides the detail');
    await press(r.root.findByType('Pressable'));
    assert.doesNotMatch(text(r.root), /THE REASONS/);
  });

  test('the whole header is the target and never below the 44pt touch floor; the chevron is hidden from a screen reader', async () => {
    const r = await render(<TodayDisclosure title="More"><SectionLabel>x</SectionLabel></TodayDisclosure>);
    assert.ok(flat(r.root.findByType('Pressable')).minHeight >= sizing.minTouchTarget);
    const chevron = r.root.findAllByType('Text').find((t) => t.props.children === '▸');
    assert.equal(chevron.props.accessibilityElementsHidden, true);
    assert.equal(chevron.props.importantForAccessibility, 'no');
  });

  test('a section label is a real heading', async () => {
    const r = await render(<SectionLabel>What matters today</SectionLabel>);
    assert.equal(r.root.findByType('Text').props.accessibilityRole, 'header');
  });
});

describe('TodaySourceLine — provenance and confidence in the permanent language', () => {
  test('says nothing about a stated fact at first glance', async () => {
    const r = await render(<TodaySourceLine source={{ producer: 'user-action', confidence: null, uncertain: false, userStated: true }} />);
    assert.equal(r.toJSON(), null);
  });

  test('shows Her Keys’ unconfirmed claim with its stored confidence and its honest source', async () => {
    const r = await render(<TodaySourceLine source={{ producer: 'ai-inference', confidence: 'possible', uncertain: true, userStated: false }} />);
    assert.match(text(r.root), /POSSIBLE/);
    assert.match(text(r.root), /Her Keys inferred this/);
    assert.equal(r.root.findAllByType('View')[0].props.accessibilityLabel, 'Her Keys inferred this. Confidence: possible');
  });

  test('at the detail level the honest source is shown even for a row with no confidence: legacy is “Source unknown”, never “You said”', async () => {
    const legacy = await render(<TodaySourceLine always source={{ producer: 'legacy-unknown', confidence: null, uncertain: false, userStated: false }} />);
    assert.match(text(legacy.root), /Source unknown/);
    assert.doesNotMatch(text(legacy.root), /You said/);
    const confirmed = await render(<TodaySourceLine always source={{ producer: 'ai-inference', confidence: 'established', uncertain: false, userStated: false }} />);
    assert.match(text(confirmed.root), /ESTABLISHED/);
  });
});

describe('TodayStateNotice — unknown and unavailable are never "light"', () => {
  test('unknown is a loading state, with no claim about the day at all', async () => {
    const r = await render(<TodayStateNotice kind="unknown" />);
    assert.equal(r.root.findAllByType('View').some((v) => v.props.accessibilityRole === 'progressbar'), true);
    assert.doesNotMatch(text(r.root), /light|nothing|empty|free/i);
  });

  test('a stand-in state withholds the briefing and says why, per recovery reason, without dramatizing', async () => {
    for (const [reason, phrase] of [
      ['future_version', /newer version of Her Keys/],
      ['read_failed', /couldn’t read what’s saved/],
      ['mode_mismatch', /different mode of the app/],
    ]) {
      const r = await render(<TodayStateNotice kind="unavailable" recoveryReason={reason} />);
      assert.match(text(r.root), /Her Keys can’t show your day right now/);
      assert.match(text(r.root), phrase);
      assert.match(text(r.root), /isn’t saving anything, so nothing you’ve saved has been changed/);
      assert.doesNotMatch(text(r.root), /light|nothing on your list|no events/i);
    }
  });

  test('a household that has never entered anything is told so once, with two existing places to begin', async () => {
    router.reset();
    const v = view(household(), nyMs(9));
    const r = await render(<TodayStateNotice kind="never_entered" entry={v.sparse.entry} />);
    assert.match(text(r.root), /Nothing entered yet\./);
    await press(pressable(r.root, 'Add a task'));
    await press(pressable(r.root, 'Add an event'));
    assert.deepEqual(router.calls.map((c) => c[0]), [{ pathname: '/task-editor' }, { pathname: '/event-editor' }]);
  });

  test('a genuinely light day is only a quiet way to begin: no card, no title, no pressure to fill it', async () => {
    const v = view(valid(ev(household(), { title: 'Yesterday', from: [10], to: [11], day: 15 })), nyMs(9));
    const r = await render(<TodayStateNotice kind="light" entry={v.sparse.entry} />);
    assert.deepEqual(r.root.findAllByType('Pressable').map((p) => p.props.accessibilityLabel), ['Add a task']);
    assert.doesNotMatch(text(r.root), /Nothing entered yet|light|fill|empty/i);
  });
});

describe('TodayMatters — the anchors, openable, never the whole day', () => {
  const build = () => {
    let s = household();
    s = ev(s, { title: 'School drop-off', from: [8, 15], to: [8, 45] });
    s = ev(s, { title: 'Work meeting', from: [11], to: [12], category: 'cat-work' });
    s = ev(s, { title: 'Pickup', from: [15, 15], to: [15, 45] });
    s = ev(s, { title: 'Book club', from: [19], to: [20], commitment: 'flexible', category: 'cat-relationships' });
    s = ev(s, { title: 'Dentist', from: [17], to: [17, 30], provenance: { producer: 'import-sync', artifactId: null, confidence: 'likely' } });
    return withMove(valid(s));
  };
  const v = view(build(), nyMs(8));

  test('each row names the thing and its time, marks the next one in words, and says what tapping does', async () => {
    const r = await render(<TodayMatters section={v.matters} />);
    const first = pressable(r.root, 'School drop-off, 8:15 AM, next up');
    assert.ok(first, r.root.findAllByType('Pressable').map((p) => p.props.accessibilityLabel).join(' / '));
    assert.equal(first.props.accessibilityHint, 'Opens it so you can check or change it');
    assert.equal(first.props.accessibilityRole, 'button');
    assert.ok(flat(first).minHeight >= sizing.minTouchTarget, 'a 44pt touch target');
    assert.match(text(r.root), /Next up/, 'status is text, never only color');
  });

  test('bounded at three, with the rest counted', async () => {
    const r = await render(<TodayMatters section={v.matters} />);
    assert.equal(r.root.findAllByType('Pressable').length, 3);
    assert.match(text(r.root), /and 2 more/);
  });

  test('tapping opens the item through its existing editor route', async () => {
    router.reset();
    const r = await render(<TodayMatters section={v.matters} />);
    await press(r.root.findAllByType('Pressable')[0]);
    assert.equal(router.calls[0][0].pathname, '/event-editor');
    assert.ok(router.calls[0][0].params.eventId);
  });

  test('an unconfirmed claim carries the permanent badge; a stated fact carries none', async () => {
    const dentist = view(build(), nyMs(8)).matters;
    const wide = { ...dentist, anchors: [...dentist.anchors] };
    const all = view(build(), nyMs(16, 45)); // only the dentist and the club are still ahead
    const r = await render(<TodayMatters section={all.matters} />);
    assert.match(text(r.root), /LIKELY/);
    const stated = await render(<TodayMatters section={wide} />);
    assert.doesNotMatch(text(stated.root), /LIKELY|POSSIBLE/);
  });
});

describe('TodayList — the quiet rung', () => {
  test('rows beyond the first-glance bound are counted and one disclosure away', async () => {
    const rows = [1, 2, 3].map((n) => ({ key: `r${n}`, text: `Row ${n}` }));
    const more = [4, 5].map((n) => ({ key: `r${n}`, text: `Row ${n}` }));
    const r = await render(<TodayList title="Can wait today" rows={rows} moreRows={more} />);
    assert.match(text(r.root), /CAN WAIT TODAY/);
    assert.match(text(r.root), /2 MORE/);
    assert.doesNotMatch(text(r.root), /Row 4/);
    await press(r.root.findAllByType('Pressable').find((p) => p.props.accessibilityLabel === '2 more'));
    assert.match(text(r.root), /Row 4/);
  });

  test('a row is a button only when it goes somewhere', async () => {
    const r = await render(<TodayList title="Coming up" rows={[{ key: 'a', text: 'Info only' }, { key: 'b', text: 'Opens', onPress: () => {}, hint: 'Opens the thing to do first' }]} />);
    assert.deepEqual(r.root.findAllByType('Pressable').map((p) => p.props.accessibilityLabel), ['Opens']);
  });
});

describe('NeedsMeChip and LoadMeter', () => {
  test('the chip is a bounded pointer with a full label and a hint, and opens the Needs Me inbox', async () => {
    router.reset();
    const r = await render(<NeedsMeChip onYourMind={{ count: 3, oldestTitle: 'Renew passport' }} />);
    const chip = r.root.findByType('Pressable');
    assert.equal(chip.props.accessibilityLabel, 'On your mind: 3 captured, starting with Renew passport');
    assert.equal(chip.props.accessibilityHint, 'Opens the list of things you’ve captured');
    assert.match(text(r.root), /On your mind: Renew passport \(\+2 more\)/);
    assert.ok(flat(chip).minHeight >= sizing.minTouchTarget);
    await press(chip);
    assert.equal(router.calls[0][0], '/life/needs-me');
  });

  test('the load meter renders a coarse label with no number, and says which day it used when it is not her own', async () => {
    const load = { level: 'tight', label: 'Tight', caption: 'One window is short on room. The rest of the day has space.', filled: 3, total: 4 };
    const r = await render(<LoadMeter load={load} note="Her Keys is reading this against its default day." />);
    assert.match(text(r.root), /Tight/);
    assert.match(text(r.root), /default day/);
    assert.doesNotMatch(text(r.root), /\d+\s?%|score/i, 'no percentage and no score');
    assert.equal(r.root.findAllByType('View').find((v) => v.props.accessible).props.accessibilityLabel, 'Estimated load: Tight. One window is short on room. The rest of the day has space.');
  });
});

describe('OneMoveCard — the lifecycle, and “why” that opens in stages', () => {
  const { OneMoveCard } = oneMoveModule;
  const noop = () => {};
  const labels = (r) => r.root.findAllByType('Pressable').map((p) => p.props.accessibilityLabel);

  const selectedView = (opts = {}) => {
    let s = household();
    // Her own 30 minutes (`user`): only a duration she gave is ever quoted back as "about 30 minutes" (HA-010, HK13-D12).
    s = tk(s, { title: 'File the insurance claim', minutes: 30, durationSource: 'user', due: DAY, plan: { kind: 'unplanned' }, category: 'cat-money', ...opts });
    s = facet(s, 'File the insurance claim', { consequence: 'high' });
    return view(withMove(valid(s)), nyMs(9)).oneMove;
  };

  test('first glance is the recommendation and one button; there is no “not today” and no “show another”', async () => {
    let done = 0;
    const r = await render(<OneMoveCard section={selectedView()} onComplete={() => { done += 1; }} />);
    assert.match(text(r.root), /WHAT I RECOMMEND/);
    assert.match(text(r.root), /File the insurance claim/);
    assert.match(text(r.root), /ABOUT 30 MINUTES/);
    assert.deepEqual(labels(r), ['I did it', 'See why']);
    assert.doesNotMatch(text(r.root), /Not today|Show another|WHY THIS/);
    await press(pressable(r.root, 'I did it'));
    assert.equal(done, 1);
  });

  test('“See why” opens the reasons and says what “I did it” will do; the evidence is one level further down', async () => {
    router.reset();
    const r = await render(<OneMoveCard section={selectedView()} onComplete={noop} />);
    await press(pressable(r.root, 'See why'));
    assert.match(text(r.root), /WHY THIS/);
    assert.match(text(r.root), /It’s due today\./);
    assert.match(text(r.root), /If this slips, the cost is high\./);
    assert.match(text(r.root), /Marking it done also completes the task on your list\./);
    assert.doesNotMatch(text(r.root), /Deadline —/, 'the structured evidence is deeper still');

    await press(pressable(r.root, 'Evidence and source'));
    assert.match(text(r.root), /Deadline — File the insurance claim/);
    assert.match(text(r.root), /You said/, 'a stated task says so');
    await press(pressable(r.root, 'Open it'));
    assert.equal(router.calls[0][0].pathname, '/task-editor');
  });

  test('a kind with no completion effect of its own says so plainly and never claims to finish a row', async () => {
    let s = ev(household(), { title: 'Parent conference', from: [16], to: [17] });
    const e = s.events[0];
    s = valid({ ...s, oneMoves: [{ id: `onemove-${DAY}`, forDate: DAY, targetId: e.id, targetType: 'event', status: 'selected', decidedAt: nyInstant(7), completedAt: null, provenance: { producer: 'system-derived', artifactId: null, confidence: null }, scope: 'personal' }] });
    const r = await render(<OneMoveCard section={view(s, nyMs(9)).oneMove} onComplete={noop} />);
    await press(pressable(r.root, 'See why'));
    assert.match(text(r.root), /Marking it done records that you did it\. Nothing else changes\./);
    assert.doesNotMatch(text(r.root), /completes|resolves/);
  });

  test('a completed move asks for nothing: there is no button left to press', async () => {
    let s = withMove(valid(tk(household(), { title: 'Renew library card' })));
    s = completeOneMove(s, mkCtx(nyMs(9)));
    const r = await render(<OneMoveCard section={view(s, nyMs(9, 5)).oneMove} onComplete={noop} />);
    assert.match(text(r.root), /Done\. That’s enough for today\./);
    assert.deepEqual(labels(r), []);
  });

  test('a withheld move is Her Keys noticing the day is full — named as an observation, with nothing to press', async () => {
    let s = household();
    s = ev(s, { title: 'Work call', from: [15], to: [16, 30], category: 'cat-work' });
    s = ev(s, { title: 'Soccer practice', from: [17], to: [18, 30] });
    s = tk(s, { title: 'Prep dinner', minutes: 40, plan: { kind: 'timed', startsAt: at(16, 30) } });
    const r = await render(<OneMoveCard section={view(withMove(valid(s)), nyMs(14)).oneMove} onComplete={noop} />);
    assert.match(text(r.root), /HER KEYS NOTICED/);
    assert.match(text(r.root), /Today is already full, so Her Keys isn’t adding anything\./);
    assert.deepEqual(labels(r), []);
  });

  test('a move pointing at an unconfirmed claim carries the permanent badge at first glance', async () => {
    const inferred = { producer: 'ai-inference', artifactId: null, confidence: 'possible' };
    const section = selectedView({ provenance: inferred });
    const r = await render(<OneMoveCard section={section} onComplete={noop} />);
    assert.match(text(r.root), /POSSIBLE/);
    assert.match(text(r.root), /Her Keys inferred this/);
  });

  test('a demo move shows its own observation as the reason, with no evidence and no route invented', async () => {
    const s = onboardedState(demoState());
    const r = await render(<OneMoveCard section={view(s, nyMs(9)).oneMove} onComplete={noop} />);
    await press(pressable(r.root, 'See why'));
    assert.match(text(r.root), /Mail has been piling up/);
    assert.equal(labels(r).includes('Evidence and source'), false);
    assert.equal(labels(r).includes('Open it'), false);
  });

  test('long titles and long reasoning wrap instead of being cut off', async () => {
    // The longest title the stored shape allows (200 characters) — the layout must hold at the limit.
    const long = 'Follow up with the county clerk about the corrected permit paperwork for the back-yard fence replacement '.repeat(3).slice(0, 199).trim();
    const r = await render(<OneMoveCard section={selectedView({ title: long })} onComplete={noop} />);
    await press(pressable(r.root, 'See why'));
    assert.match(text(r.root), /Follow up with the county clerk/);
    assert.equal(r.root.findAll((n) => n.props && n.props.numberOfLines !== undefined).length, 0, 'nothing truncates');
  });
});
