/**
 * HK-FE-UI-02-DM — the appearance PREFERENCE, its resolution, its persistence, and the provider that publishes it.
 *
 * Covers the brief's theme-selection matrix: fresh install = System; a manual choice overrides the device in both directions; System
 * tracks device changes; switching is immediate; the choice persists across a restart; a corrupt/missing/failing/hung store resolves to
 * System without trapping startup; rapid switching converges on the latest choice; a change does not remount the tree.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import React, { useEffect, useState } from 'react';
import TestRenderer from 'react-test-renderer';
import { Text, View } from 'react-native';
import {
  APPEARANCE_STORAGE_KEY,
  AppearanceProvider,
  DEFAULT_APPEARANCE_PREFERENCE,
  createThemedStyles,
  loadPreference,
  parseStoredPreference,
  resolveScheme,
  savePreference,
  serializePreference,
  themed,
  useAppearance,
  useTheme,
} from '../../src/design/theme/index.ts';
import { darkTheme, lightTheme } from '../../src/design/theme/palettes.ts';
import { appearanceState, resetAppearance, setSystemColorScheme } from '../support/rn-stub.tsx';
import { render as renderRaw } from '../support/render.tsx';

// Every tree a test mounts is unmounted afterwards: a leaked provider keeps listening to the device scheme and would overwrite `probe`.
const mountedTrees = [];
const render = async (element) => {
  const r = await renderRaw(element);
  mountedTrees.push(r);
  return r;
};
afterEach(async () => {
  for (const r of mountedTrees.splice(0)) await TestRenderer.act(async () => { try { r.unmount(); } catch { /* already unmounted */ } });
  resetAppearance();
});

const act = async (f) => TestRenderer.act(async () => { await f(); });
const settle = async (n = 6) => { for (let i = 0; i < n; i += 1) await act(async () => { await new Promise((r) => setImmediate(r)); }); };

/** A fake device-local store that records every write. */
function fakeStorage(initial = null, { failRead = false, failWrite = false, hang = false } = {}) {
  const writes = [];
  let value = initial;
  return {
    writes,
    get value() { return value; },
    read: () => (hang ? new Promise(() => {}) : failRead ? Promise.reject(new Error('read failed')) : Promise.resolve(value)),
    write: (v) => { if (failWrite) return Promise.reject(new Error('write failed')); writes.push(v); value = v; return Promise.resolve(); },
  };
}

let probe;
function Probe() {
  probe = useAppearance();
  return <Text>{probe.scheme}</Text>;
}
const mounted = async (props = {}) => {
  const r = await render(<AppearanceProvider {...props}><Probe /></AppearanceProvider>);
  await settle();
  return r;
};

describe('preference parsing and resolution (pure)', () => {
  test('the default is System, and only the exact stored shape is accepted', () => {
    assert.equal(DEFAULT_APPEARANCE_PREFERENCE, 'system');
    for (const p of ['light', 'dark', 'system']) assert.equal(parseStoredPreference(serializePreference(p)), p);
    for (const bad of [null, undefined, '', 'dark', '{"v":1}', '{"v":2,"preference":"dark"}', '{"v":1,"preference":"sepia"}', '{"v":1,"preference":null}', '[1]', '{{{', 42, {}]) {
      assert.equal(parseStoredPreference(bad), 'system', `rejects ${JSON.stringify(bad)}`);
    }
  });

  test('a manual choice overrides the device; System follows it; an unknown device is Light', () => {
    assert.equal(resolveScheme('light', 'dark'), 'light');
    assert.equal(resolveScheme('dark', 'light'), 'dark');
    assert.equal(resolveScheme('system', 'dark'), 'dark');
    assert.equal(resolveScheme('system', 'light'), 'light');
    assert.equal(resolveScheme('system', null), 'light');
    assert.equal(resolveScheme('system', undefined), 'light');
  });
});

describe('persistence port never traps startup', () => {
  test('a corrupt value, a failing read and a read that never answers all resolve to System', async () => {
    assert.equal(await loadPreference(fakeStorage('not json')), 'system');
    assert.equal(await loadPreference(fakeStorage(null, { failRead: true })), 'system');
    const started = Date.now();
    assert.equal(await loadPreference(fakeStorage(null, { hang: true }), 25), 'system');
    assert.ok(Date.now() - started < 1000, 'the bound is honoured');
    assert.equal(await loadPreference(null), 'system');
  });

  test('a failing write is reported as false and never throws into the UI', async () => {
    assert.equal(await savePreference(fakeStorage(null, { failWrite: true }), 'dark'), false);
    assert.equal(await savePreference(null, 'dark'), false);
    const ok = fakeStorage();
    assert.equal(await savePreference(ok, 'dark'), true);
    assert.deepEqual(ok.writes, ['{"v":1,"preference":"dark"}']);
  });

  test('the key is device-local and namespaced, not an account or household key', () => {
    assert.equal(APPEARANCE_STORAGE_KEY, 'herkeys.appearance.preference.v1');
  });
});

describe('theme selection through the provider', () => {
  test('fresh install defaults to System and follows the device', async () => {
    const storage = fakeStorage(null);
    await mounted({ storage });
    assert.equal(probe.preference, 'system');
    assert.equal(probe.scheme, 'light');
    await act(async () => setSystemColorScheme('dark'));
    assert.equal(probe.scheme, 'dark', 'System tracks the device live');
    await act(async () => setSystemColorScheme('light'));
    assert.equal(probe.scheme, 'light');
  });

  test('Light stays Light under a Dark device, Dark stays Dark under a Light device', async () => {
    setSystemColorScheme('dark');
    await mounted({ storage: fakeStorage(serializePreference('light')) });
    assert.equal(probe.scheme, 'light');
    await act(async () => setSystemColorScheme('light'));
    await act(async () => probe.setPreference('dark'));
    assert.equal(probe.scheme, 'dark');
    await act(async () => setSystemColorScheme('dark'));
    await act(async () => setSystemColorScheme('light'));
    assert.equal(probe.scheme, 'dark', 'a manual choice ignores device changes');
  });

  test('switching is immediate, hands the native layer the override, and System hands control back to the device', async () => {
    await mounted({ storage: fakeStorage(null) });
    await act(async () => probe.setPreference('dark'));
    assert.equal(probe.scheme, 'dark');
    assert.equal(appearanceState.override, 'dark', 'native alerts/keyboards/status bar follow the manual choice');
    await act(async () => probe.setPreference('system'));
    assert.equal(appearanceState.override, null);
  });

  test('the choice persists: a fresh provider on the same store reads it back', async () => {
    const storage = fakeStorage(null);
    const first = await mounted({ storage });
    await act(async () => probe.setPreference('dark'));
    await settle();
    assert.equal(storage.value, serializePreference('dark'));
    await act(async () => first.unmount());
    resetAppearance();
    await mounted({ storage });
    assert.equal(probe.preference, 'dark');
    assert.equal(probe.scheme, 'dark', 'after a restart');
  });

  test('a corrupt stored value, a failing store and a hung store all start on System', async () => {
    for (const storage of [fakeStorage('garbage'), fakeStorage(null, { failRead: true }), fakeStorage(null, { hang: true })]) {
      await mounted({ storage, hydrationTimeoutMs: 20 });
      await new Promise((r) => setTimeout(r, 60));
      await settle();
      assert.equal(probe.preference, 'system');
      assert.equal(probe.hydrated, true, 'startup is never trapped waiting on storage');
    }
  });

  test('while the stored value is still being read the first frame is covered, then revealed', async () => {
    let release;
    const storage = { read: () => new Promise((resolve) => { release = resolve; }), write: async () => {} };
    const veils = (r) => r.root.findAll((n) => typeof n.type === 'string' && n.props.pointerEvents === 'auto' && n.props.accessibilityElementsHidden === true);
    const r = await render(<AppearanceProvider storage={storage}><Probe /></AppearanceProvider>);
    // children mount immediately (account init is never waiting on appearance); an opaque ground-coloured veil hides the first frame
    assert.equal(r.root.findAllByType('Text').length, 1, 'the tree is mounted while hydration is pending');
    assert.equal(veils(r).length, 1, 'no Light flash before a saved Dark preference is known');
    await act(async () => release(serializePreference('dark')));
    await settle();
    assert.equal(veils(r).length, 0, 'veil removed once hydrated');
    assert.equal(probe.scheme, 'dark');
  });

  test('a choice made while the stored value is still loading wins over what the store returns', async () => {
    let release;
    const storage = { read: () => new Promise((resolve) => { release = resolve; }), write: async () => {} };
    await mounted({ storage });
    await act(async () => probe.setPreference('light'));
    await act(async () => release(serializePreference('dark')));
    await settle();
    assert.equal(probe.preference, 'light');
  });

  test('rapid switching converges on the LATEST choice, in memory and in storage', async () => {
    const storage = fakeStorage(null);
    await mounted({ storage });
    await act(async () => {
      probe.setPreference('light');
      probe.setPreference('dark');
      probe.setPreference('system');
      probe.setPreference('dark');
    });
    await settle();
    assert.equal(probe.preference, 'dark');
    assert.equal(storage.value, serializePreference('dark'));
    assert.ok(storage.writes.length <= 4 && storage.writes.at(-1) === serializePreference('dark'));
  });

  test('a failing write leaves the session on the choice she made', async () => {
    await mounted({ storage: fakeStorage(null, { failWrite: true }) });
    await act(async () => probe.setPreference('dark'));
    await settle();
    assert.equal(probe.scheme, 'dark');
  });
});

describe('a theme change re-renders consumers in place — it never remounts the tree', () => {
  test('component state and mount counts survive Light → Dark → System', async () => {
    const events = { mounts: 0 };
    function Stateful() {
      const [count, setCount] = useState(0);
      useEffect(() => { events.mounts += 1; }, []);
      const { color } = useTheme();
      return (
        <View style={{ backgroundColor: color.background }}>
          <Text onPress={() => setCount((c) => c + 1)}>{`n=${count}`}</Text>
        </View>
      );
    }
    let api;
    function Grab() { api = useAppearance(); return null; }
    const r = await render(<AppearanceProvider initialPreference="light"><Grab /><Stateful /></AppearanceProvider>);
    await settle();
    const bump = () => r.root.findByType('Text').props.onPress();
    await act(async () => bump());
    await act(async () => bump());
    const bg = () => r.root.findAllByType('View')[0].props.style.backgroundColor;
    assert.equal(bg(), lightTheme.color.background);
    await act(async () => api.setPreference('dark'));
    assert.equal(bg(), darkTheme.color.background, 'repainted in place');
    await act(async () => api.setPreference('system'));
    assert.equal(events.mounts, 1, 'mounted exactly once across three appearance changes');
    assert.equal(r.root.findByType('Text').props.children, 'n=2', 'local state (a form entry, a counter) is preserved');
  });
});

describe('theme-derived styles', () => {
  test('createThemedStyles builds one stylesheet per scheme, caches it, and switches with the provider', async () => {
    let builds = 0;
    const useStyles = createThemedStyles(({ color }) => { builds += 1; return { box: { backgroundColor: color.surface.primary } }; });
    let seen;
    function C() { seen = useStyles(); return null; }
    let api;
    function Grab() { api = useAppearance(); return null; }
    await render(<AppearanceProvider initialPreference="light"><Grab /><C /></AppearanceProvider>);
    const light = seen;
    assert.equal(light.box.backgroundColor, lightTheme.color.surface.primary);
    await act(async () => api.setPreference('dark'));
    assert.equal(seen.box.backgroundColor, darkTheme.color.surface.primary);
    await act(async () => api.setPreference('light'));
    assert.equal(seen, light, 'the Light sheet is the cached object, not rebuilt');
    assert.equal(builds, 2);
  });

  test('themed() memoises a module-scope value per scheme', () => {
    let calls = 0;
    const toneFor = themed(({ color }) => { calls += 1; return { fg: color.text.primary }; });
    assert.equal(toneFor(lightTheme).fg, lightTheme.color.text.primary);
    assert.equal(toneFor(darkTheme).fg, darkTheme.color.text.primary);
    assert.equal(toneFor(lightTheme), toneFor(lightTheme));
    assert.equal(calls, 2);
  });
});
