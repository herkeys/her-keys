import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { registerHooks } from 'node:module';
import React, { useEffect, useState } from 'react';
import TestRenderer from 'react-test-renderer';
import { render } from './support/render.tsx';
import { gateFixture, publishGate } from './support/deletionGateBoundary.mjs';

// AE2E-D01 (Android emulator, 2026-10-21): restrict() publishes 'checking' on every AppState change, and the gate used to render
// its own screen INSTEAD of its children. Switching apps for a few seconds therefore unmounted AccountProvider and everything under
// it: the welcome flow restarted at Welcome, an in-flight sign-in lost its screen, and open editors lost their drafts.
const stub = new URL('./support/deletionGateBoundary.mjs', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.endsWith('/src/features/account/DeletionGate.tsx') &&
      (specifier === 'expo-router' || /(?:deletionRuntimeInstance|accountRuntimeInstance|AppStateProvider)$/.test(specifier))) return next(stub, context);
  return next(specifier, context);
} });
const { DeletionGate } = await import('../src/features/account/DeletionGate.tsx');

const act = fn => TestRenderer.act(async () => { await fn(); });
const trees = [];
afterEach(async () => {
  for (const tree of trees.splice(0)) await act(() => tree.unmount());
  gateFixture.gate = { kind: 'checking' };
  gateFixture.hydrated = true;
});

const life = { mounts: 0, unmounts: 0 };
/** Stands for the account tree: it counts its own mounts and keeps a typed draft in local state, like the welcome flow does. */
function AccountTree() {
  const [draft] = useState(() => `draft-${life.mounts + 1}`);
  useEffect(() => { life.mounts++; return () => { life.unmounts++; }; }, []);
  return React.createElement('Text', { testID: 'account-tree' }, draft);
}
async function mountGate() {
  life.mounts = 0; life.unmounts = 0;
  const r = await render(React.createElement(DeletionGate, null, React.createElement(AccountTree)));
  trees.push(r);
  return r;
}
const tree = r => r.root.findAll(n => n.props.testID === 'account-tree');
const text = r => JSON.stringify(r.toJSON());
const covered = r => r.root.findAll(n => n.type === 'View' && n.props.accessibilityElementsHidden === true && n.props.pointerEvents === 'none');

test('offline local access preserves the account tree and explains that synchronization is paused',async()=>{
 const r=await mountGate();await act(()=>publishGate({kind:'active'}));
 await act(()=>publishGate({kind:'offline_local'}));
 assert.equal(life.mounts,1);assert.equal(life.unmounts,0);assert.equal(covered(r).length,0);
 assert.match(text(r),/Sync is paused/);
 await act(()=>publishGate({kind:'checking'}));assert.equal(life.unmounts,0);assert.equal(covered(r).length,1);
 await act(()=>publishGate({kind:'pending'}));assert.equal(tree(r).length,0);
});

test('switching apps covers the account tree without remounting it, and keeps what she had typed', async () => {
  const r = await mountGate();
  assert.equal(tree(r).length, 0, 'nothing account-held renders before the first answer');
  await act(() => publishGate({ kind: 'active' }));
  assert.equal(life.mounts, 1);
  assert.match(text(r), /draft-1/);

  // Backgrounded: restrict() publishes 'checking'.
  await act(() => publishGate({ kind: 'checking' }));
  assert.equal(life.unmounts, 0, 'a background re-check must not unmount the account tree');
  assert.equal(covered(r).length, 1, 'the app is hidden from touch and from accessibility while covered');
  assert.match(text(r), /Checking account access/);

  // Foregrounded and re-checked.
  await act(() => publishGate({ kind: 'active' }));
  assert.equal(life.mounts, 1, 'the same tree is still mounted');
  assert.equal(covered(r).length, 0);
  assert.match(text(r), /draft-1/);
  assert.doesNotMatch(text(r), /Checking account access/);
});

for (const kind of ['pending', 'review', 'unavailable', 'purged', 'restored']) {
  test(`a '${kind}' answer still removes the app, exactly as before`, async () => {
    const r = await mountGate();
    await act(() => publishGate({ kind: 'active' }));
    await act(() => publishGate({ kind: 'checking' }));
    await act(() => publishGate({ kind }));
    assert.equal(life.unmounts, 1, `'${kind}' must unmount the account tree`);
    assert.equal(tree(r).length, 0);
    // A later 'checking' after a restricted answer does not bring the old tree back either.
    await act(() => publishGate({ kind: 'checking' }));
    assert.equal(tree(r).length, 0);
  });
}

test('the first check on launch shows the gate, not the household', async () => {
  const r = await mountGate();
  assert.equal(tree(r).length, 0);
  assert.match(text(r), /Checking account access/);
});

test('before hydration the children render uncovered, as before', async () => {
  gateFixture.hydrated = false;
  const r = await mountGate();
  assert.equal(tree(r).length, 1);
  assert.equal(covered(r).length, 0);
});
