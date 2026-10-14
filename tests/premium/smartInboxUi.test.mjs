/**
 * Rendered review of a Smart Inbox (Premium) reading, on the real providers, store and coordinator. Honest scope (see
 * tests/support/rn-stub.tsx): structure, copy, roles and behaviour through the real components; layout and pixels are NOT proven here.
 */
import assert from 'node:assert/strict';
import React, { useEffect } from 'react';
import { after, describe, test } from 'node:test';
import TestRenderer from 'react-test-renderer';
import { CaptureGroup } from '../../src/features/talk-it-out/capture/CaptureCards.tsx';
import { CaptureProvider, useCapture } from '../../src/features/talk-it-out/capture/CaptureContext.tsx';
import { copy } from '../../src/features/talk-it-out/capture/copy.ts';
import { PremiumReaderContext } from '../../src/features/smart-inbox/premiumReaderContext.ts';
import { AppStateProvider } from '../../src/store/AppStateProvider.tsx';
import { startWorld } from '../support/captureWorld.mjs';
import { render } from '../support/render.tsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const settle = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));
const mounted = [];
after(() => {
  for (const r of mounted) {
    try {
      r.unmount();
    } catch {
      // already unmounted
    }
  }
});

const proposal = (over = {}) => ({
  key: 'p1',
  kind: 'event',
  title: 'Dentist',
  quote: 'Dentist Friday at 3pm',
  span: { start: 0, end: 21 },
  date: '2026-09-18',
  startMinutes: 900,
  endMinutes: null,
  durationMinutes: null,
  amount: null,
  direction: null,
  childRef: null,
  childAmbiguous: false,
  category: 'home',
  hedged: false,
  ambiguity: [],
  ...over,
});

async function mount(world, view) {
  let cap;
  const now = () => world.clock.now;
  const Ready = () => {
    const c = useCapture();
    useEffect(() => {
      cap = c;
    }, [c]);
    return null;
  };
  const tree = (kids) => (
    <AppStateProvider store={world.store}>
      <PremiumReaderContext.Provider value={view}>
        <CaptureProvider now={now}>
          <Ready />
          {kids}
        </CaptureProvider>
      </PremiumReaderContext.Provider>
    </AppStateProvider>
  );
  const renderer = await render(tree(null));
  mounted.push(renderer);
  const submit = async (text, key) => {
    let out;
    await TestRenderer.act(async () => {
      out = await cap.coordinator.submit({ text, submissionKey: key });
    });
    return out;
  };
  return { renderer, submit, show: async (kids) => TestRenderer.act(async () => renderer.update(tree(kids))) };
}

const texts = (renderer) =>
  renderer.root
    .findAllByType('Text')
    .map((n) => [n.props.children].flat(Infinity).filter((c) => typeof c === 'string' || typeof c === 'number').join(''))
    .filter(Boolean);
const has = (renderer, needle) => texts(renderer).some((t) => t.toLowerCase().includes(needle.toLowerCase()));
const named = (renderer, label) => renderer.root.findAllByType('Pressable').filter((p) => p.props.accessibilityLabel === label);

const entitledView = (extract) => ({ accountBound: true, householdId: 'h1', entitled: true, appVersion: '1.0.0', extract });
const ok = (proposals) => async () => ({ kind: 'ok', extraction: { proposals, unsupported: [], dropped: 0 }, via: 'premium' });

describe('SI-UI — the review of a Premium reading', () => {
  test('it looks like every other review: her words, the reading, POSSIBLE, and the same three honest actions', async () => {
    const world = await startWorld();
    const ui = await mount(world, entitledView(ok([proposal()])));
    const out = await ui.submit('Dentist Friday at 3pm', 'a');
    await ui.show(<CaptureGroup captureId={out.captureId} />);

    for (const expected of [copy.review.sourceLabel, 'Dentist Friday at 3pm', 'Fri, Sep 18 · 3:00 PM–3:30 PM', 'POSSIBLE', copy.review.assumption('premium-reading'), copy.review.assumption('end-time-assumed')]) {
      assert.ok(has(ui.renderer, expected), `missing “${expected}”; screen: ${texts(ui.renderer).join(' / ')}`);
    }
    for (const label of [copy.review.accept, copy.review.reject, copy.review.fix]) assert.ok(named(ui.renderer, label).length > 0, label);
    assert.equal(world.state().events.length, 0, 'showing a Premium review saves nothing');
  });

  test('only her explicit accept creates the event', async () => {
    const world = await startWorld();
    const ui = await mount(world, entitledView(ok([proposal()])));
    const out = await ui.submit('Dentist Friday at 3pm', 'a');
    await ui.show(<CaptureGroup captureId={out.captureId} />);
    await settle(60);
    assert.equal(world.state().events.length, 0);
    const accept = named(ui.renderer, copy.review.accept).find((p) => !p.props.disabled);
    await TestRenderer.act(async () => {
      accept.props.onPress();
      await settle();
    });
    assert.equal(world.state().events.length, 1);
  });

  test('a possible duplicate is shown as a plain warning she can ignore — never a block', async () => {
    const world = await startWorld();
    const ui = await mount(world, entitledView(ok([proposal()])));
    const first = await ui.submit('Dentist Friday at 3pm', 'a');
    await ui.show(<CaptureGroup captureId={first.captureId} />);
    await TestRenderer.act(async () => {
      named(ui.renderer, copy.review.accept)[0].props.onPress();
      await settle();
    });
    const second = await ui.submit('Dentist Friday at 3pm again', 'b');
    await ui.show(<CaptureGroup captureId={second.captureId} />);
    assert.ok(has(ui.renderer, copy.review.assumption('possible-duplicate')), texts(ui.renderer).join(' / '));
    assert.ok(named(ui.renderer, copy.review.accept).some((p) => !p.props.disabled), 'she can still accept it');
  });

  test('when Premium could not read it, the review says so plainly and still shows the basic reading', async () => {
    const world = await startWorld();
    const ui = await mount(world, entitledView(async () => ({ kind: 'unavailable', reason: 'transport' })));
    const out = await ui.submit('Dentist Friday at 3pm', 'a');
    await ui.show(<CaptureGroup captureId={out.captureId} />);
    assert.ok(has(ui.renderer, copy.review.premiumNotUsed.unavailable), texts(ui.renderer).join(' / '));
    assert.ok(has(ui.renderer, 'Dentist Friday at 3pm'));
    assert.ok(named(ui.renderer, copy.review.accept).length > 0);
  });

  test('with no Premium mounted at all, the review shows no Premium wording anywhere', async () => {
    const world = await startWorld();
    const ui = await mount(world, null);
    const out = await ui.submit('Dentist Friday at 3pm', 'a');
    await ui.show(<CaptureGroup captureId={out.captureId} />);
    assert.ok(!texts(ui.renderer).some((t) => /premium/i.test(t)), texts(ui.renderer).join(' / '));
  });
});
