import assert from 'node:assert/strict';
import { test } from 'node:test';
import { startWorld } from './support/captureWorld.mjs';

test('reset aborts the capture enhancer and its late answer cannot write a reading', async () => {
  let started; let finish; let signal;
  const ready = new Promise(resolve => { started = resolve; });
  const world = await startWorld({ enhance: input => {
    signal = input.signal; started();
    return new Promise(resolve => { finish = resolve; });
  } });
  const sent = world.coordinator.submit({ text: 'Call the dentist tomorrow', submissionKey: 'cancelled-capture' });
  await ready;
  assert.equal(signal.aborted, false);
  await world.store.reset();
  assert.equal(signal.aborted, true);
  finish({ kind: 'kept-local', skipped: null });
  assert.deepEqual(await sent, { kind: 'not-saved' });
  assert.equal(world.state().interpretations.length, 0);
  assert.equal(world.state().sourceArtifacts.length, 0);
});
