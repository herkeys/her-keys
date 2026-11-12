/**
 * V2UP-B - the review screen, as she operates it: "Save the ready ones" and "Open ..." after a save.
 * Real providers, real store, real coordinator, real local reader (the same harness as talkItOutCapture.ui.test.mjs).
 * Structure, copy and behaviour through the real components; layout and pixels are NOT proven here.
 */
import assert from 'node:assert/strict';
import React, { useEffect } from 'react';
import { after, describe, test } from 'node:test';
import TestRenderer from 'react-test-renderer';
import { CaptureGroup } from '../src/features/talk-it-out/capture/CaptureCards.tsx';
import { CaptureProvider, useCapture } from '../src/features/talk-it-out/capture/CaptureContext.tsx';
import { copy } from '../src/features/talk-it-out/capture/copy.ts';
import { AppStateProvider } from '../src/store/AppStateProvider.tsx';
import { startWorld } from './support/captureWorld.mjs';
import { render } from './support/render.tsx';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const settle = (ms = 40) => new Promise((resolve) => setTimeout(resolve, ms));

const mounted = [];
after(() => {
  for (const r of mounted) {
    try { r.unmount(); } catch { /* already unmounted */ }
  }
});

async function mount(world) {
  let cap;
  const now = () => world.clock.now;
  const Ready = () => {
    const c = useCapture();
    useEffect(() => { cap = c; }, [c]);
    return null;
  };
  const tree = (kids) => (
    <AppStateProvider store={world.store}>
      <CaptureProvider now={now}>
        <Ready />
        {kids}
      </CaptureProvider>
    </AppStateProvider>
  );
  const renderer = await render(tree(null));
  mounted.push(renderer);
  const submit = async (input) => {
    let result;
    await TestRenderer.act(async () => { result = await cap.coordinator.submit(input); });
    return result;
  };
  return { renderer, submit, show: async (kids) => TestRenderer.act(async () => renderer.update(tree(kids))) };
}

const texts = (renderer) =>
  renderer.root.findAllByType('Text').map((n) => [n.props.children].flat(Infinity).filter((c) => typeof c === 'string' || typeof c === 'number').join('')).filter(Boolean);
const has = (renderer, needle) => texts(renderer).some((t) => t.toLowerCase().includes(needle.toLowerCase()));
const pressables = (renderer) => renderer.root.findAllByType('Pressable');
const named = (renderer, label) => pressables(renderer).filter((p) => p.props.accessibilityLabel === label);
async function press(renderer, label) {
  const target = named(renderer, label).find((p) => !p.props.disabled);
  assert.ok(target, `no enabled control named “${label}”; controls: ${pressables(renderer).map((p) => p.props.accessibilityLabel).join(' | ')}`);
  await TestRenderer.act(async () => {
    target.props.onPress();
    await settle();
  });
}

const TWO = 'Water the plants by Friday and clean the garage by Saturday'; // a note and a to-do, nothing assumed, areas known
const ONE = 'Clean the garage by Saturday';

describe('SAVE THE READY ONES, as she sees it', () => {
  test('two ready readings: the step is offered with what it will skip; one press saves both, says so only after they are saved, and opens nothing by itself', async () => {
    const world = await startWorld({ kids: [] });
    const ui = await mount(world);
    const out = await ui.submit({ text: TWO, submissionKey: 'a' });
    const opened = [];
    await ui.show(<CaptureGroup captureId={out.captureId} onOpenRecord={(t) => opened.push(t)} />);
    const label = copy.bulk.saveReady(2);
    assert.equal(named(ui.renderer, label).length, 1, `controls: ${pressables(ui.renderer).map((p) => p.props.accessibilityLabel).join(' | ')}`);
    assert.ok(has(ui.renderer, copy.bulk.saveReadyHint), 'it says what it leaves for her');
    assert.equal(named(ui.renderer, label)[0].props.accessibilityHint, copy.bulk.saveReadyHint);
    assert.deepEqual([world.state().tasks.length, world.state().needsMe.length], [0, 0], 'showing it saved nothing');

    await press(ui.renderer, label);
    assert.deepEqual([world.state().tasks.length, world.state().needsMe.length], [1, 1]);
    assert.ok(has(ui.renderer, 'Saved 2 items.'));
    assert.equal(named(ui.renderer, label).length, 0, 'nothing left to save');
    assert.deepEqual(opened, []);
  });

  test('after the save each reading offers its record, and pressing it opens exactly that record', async () => {
    const world = await startWorld({ kids: [] });
    const ui = await mount(world);
    const out = await ui.submit({ text: TWO, submissionKey: 'a' });
    const opened = [];
    await ui.show(<CaptureGroup captureId={out.captureId} onOpenRecord={(t) => opened.push(t)} />);
    await press(ui.renderer, copy.bulk.saveReady(2));
    await press(ui.renderer, copy.review.openRecord('needsMe'));
    await press(ui.renderer, copy.review.openRecord('task'));
    assert.deepEqual(opened.map((t) => [t.kind, t.id]), [['needsMe', world.state().needsMe[0].id], ['task', world.state().tasks[0].id]]);
  });

  test('without a destination from the screen there is no "Open" control: no dead button', async () => {
    const world = await startWorld({ kids: [] });
    const ui = await mount(world);
    const out = await ui.submit({ text: TWO, submissionKey: 'a' });
    await ui.show(<CaptureGroup captureId={out.captureId} />);
    await press(ui.renderer, copy.bulk.saveReady(2));
    assert.equal(named(ui.renderer, copy.review.openRecord('task')).length + named(ui.renderer, copy.review.openRecord('needsMe')).length, 0);
  });

  test('one ready reading has only its own Save: the step exists for more than one', async () => {
    const world = await startWorld({ kids: [] });
    const ui = await mount(world);
    const out = await ui.submit({ text: ONE, submissionKey: 'a' });
    await ui.show(<CaptureGroup captureId={out.captureId} />);
    assert.equal(pressables(ui.renderer).filter((p) => /^Save the \d+ that/.test(p.props.accessibilityLabel ?? '')).length, 0);
    assert.equal(named(ui.renderer, copy.review.accept).length, 1);
  });

  test('a reading with a guessed detail is not in the count and keeps its own Save', async () => {
    const world = await startWorld({ kids: [] });
    const ui = await mount(world);
    const out = await ui.submit({ text: `${TWO}. Dentist Friday at 3pm`, submissionKey: 'a' });
    await ui.show(<CaptureGroup captureId={out.captureId} />);
    assert.equal(named(ui.renderer, copy.bulk.saveReady(2)).length, 1, 'the appointment (end time assumed) is not counted');
    await press(ui.renderer, copy.bulk.saveReady(2));
    assert.equal(world.state().events.length, 0, 'the appointment was left for her to check');
    assert.equal(named(ui.renderer, copy.review.accept).length, 1, 'and it still has its own Save');
  });

  test('when one cannot be saved the screen says exactly that, the other stays saved, and the failed one keeps its own Save', async () => {
    const world = await startWorld({ kids: [] });
    const ui = await mount(world);
    const out = await ui.submit({ text: TWO, submissionKey: 'a' });
    await ui.show(<CaptureGroup captureId={out.captureId} onOpenRecord={() => {}} />);
    // Any write that would contain a SECOND new record fails, so the first save lands and the next cannot.
    world.control.failWhen = (_key, value) => {
      try {
        const data = JSON.parse(value).data;
        return data.tasks.length + data.needsMe.length >= 2;
      } catch {
        return false;
      }
    };
    await press(ui.renderer, copy.bulk.saveReady(2));
    assert.equal(world.state().tasks.length + world.state().needsMe.length, 1, 'only what was durably saved');
    assert.ok(has(ui.renderer, copy.bulk.result(1, 1)), texts(ui.renderer).join(' / '));
    assert.equal(named(ui.renderer, copy.review.accept).length, 1, 'the one that failed can be saved on its own');

    world.control.failWhen = null;
    await press(ui.renderer, copy.review.accept);
    assert.equal(world.state().tasks.length + world.state().needsMe.length, 2);
  });
});
