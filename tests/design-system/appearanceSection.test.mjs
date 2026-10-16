/**
 * HK-FE-UI-02-DM — the Appearance selector in Your Account (the real AppearanceSection component, mounted under the real provider).
 *
 * Radio semantics for VoiceOver/TalkBack; exactly one option selected; selection is not colour-only (checkmark glyph + heavier outline);
 * the choice applies and persists immediately; the System row reports what the phone is currently using and follows it live.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { AppearanceProvider, serializePreference } from '../../src/design/theme/index.ts';
import { darkTheme, lightTheme } from '../../src/design/theme/palettes.ts';
import { AppearanceSection } from '../../src/features/account/AppearanceSection.tsx';
import { appearanceState, resetAppearance, setSystemColorScheme } from '../support/rn-stub.tsx';
import { render as renderRaw } from '../support/render.tsx';

const mounted = [];
const render = async (el) => { const r = await renderRaw(el); mounted.push(r); return r; };
afterEach(async () => {
  for (const r of mounted.splice(0)) await TestRenderer.act(async () => { try { r.unmount(); } catch { /* gone */ } });
  resetAppearance();
});
const act = async (f) => TestRenderer.act(async () => { await f(); });
const settle = async () => { for (let i = 0; i < 6; i += 1) await act(async () => { await new Promise((r) => setImmediate(r)); }); };

const store = (initial = null) => ({ value: initial, writes: [], read: async function read() { return this.value; }, write: async function write(v) { this.writes.push(v); this.value = v; } });
const radios = (r) => r.root.findAll((n) => n.props.accessibilityRole === 'radio' && typeof n.type !== 'string');
const press = async (node) => act(async () => node.props.onPress());
const mount = async (storage = store(), prefix = null) => {
  const r = await render(<AppearanceProvider storage={storage}>{prefix}<AppearanceSection /></AppearanceProvider>);
  await settle();
  return r;
};
const textOf = (r) => r.root.findAllByType('Text').map((t) => [t.props.children].flat().join('')).join(' | ');

describe('AppearanceSection semantics', () => {
  test('a labelled radiogroup with exactly three radios: Light, Dark, System — each with a hint', async () => {
    const r = await mount();
    assert.equal(r.root.findAll((n) => n.props.accessibilityRole === 'radiogroup' && n.props.accessibilityLabel === 'Appearance').length > 0, true);
    const rs = radios(r);
    assert.deepEqual(rs.map((n) => n.props.accessibilityLabel), ['Light', 'Dark', 'System']);
    for (const n of rs) assert.ok(String(n.props.accessibilityHint).length > 10, 'each radio explains itself');
  });

  test('exactly one radio is checked; a fresh install shows System', async () => {
    const r = await mount();
    const checked = radios(r).filter((n) => n.props.accessibilityState.checked);
    assert.equal(checked.length, 1);
    assert.equal(checked[0].props.accessibilityLabel, 'System');
  });

  test('selection is shown by a glyph and a heavier outline, not by colour alone', async () => {
    const r = await mount(store(serializePreference('dark')));
    const selected = radios(r).find((n) => n.props.accessibilityState.checked);
    assert.equal(selected.props.accessibilityLabel, 'Dark');
    const rowStyle = StyleSheet.flatten(selected.props.style({ pressed: false }));
    assert.equal(rowStyle.borderWidth, 2, 'the selected row has the stronger outline');
    const unselected = radios(r).find((n) => !n.props.accessibilityState.checked);
    assert.equal(StyleSheet.flatten(unselected.props.style({ pressed: false })).borderWidth, 1);
    const glyphs = (n) => n.findAll((x) => typeof x.type !== 'string' && (x.props.name === 'checkmark-circle' || x.props.name === 'ellipse-outline')).map((x) => x.props.name);
    assert.deepEqual(glyphs(selected), ['checkmark-circle']);
    assert.deepEqual(glyphs(unselected), ['ellipse-outline']);
  });

  test('every row meets the minimum touch target height', async () => {
    const r = await mount();
    for (const n of radios(r)) assert.ok(StyleSheet.flatten(n.props.style({ pressed: false })).minHeight >= 44);
  });
});

describe('AppearanceSection behaviour', () => {
  test('choosing Dark applies immediately, saves to the device store, and hands the native layer the override', async () => {
    const storage = store();
    const r = await mount(storage);
    await press(radios(r).find((n) => n.props.accessibilityLabel === 'Dark'));
    await settle();
    assert.equal(storage.value, serializePreference('dark'));
    assert.equal(appearanceState.override, 'dark');
    assert.equal(radios(r).find((n) => n.props.accessibilityState.checked).props.accessibilityLabel, 'Dark');
    // the section itself repaints in Dark
    const row = radios(r)[0];
    assert.equal(StyleSheet.flatten(row.props.style({ pressed: false })).backgroundColor, darkTheme.color.surface.primary);
  });

  test('choosing Light under a Dark phone stays Light; choosing System hands control back to the phone', async () => {
    setSystemColorScheme('dark');
    const storage = store();
    const r = await mount(storage);
    await press(radios(r).find((n) => n.props.accessibilityLabel === 'Light'));
    const lightRow = () => StyleSheet.flatten(radios(r)[1].props.style({ pressed: false })).backgroundColor;
    assert.equal(lightRow(), lightTheme.color.surface.primary);
    await press(radios(r).find((n) => n.props.accessibilityLabel === 'System'));
    assert.equal(lightRow(), darkTheme.color.surface.primary, 'System follows the Dark phone');
    assert.equal(appearanceState.override, null);
  });

  test('the System row tells her what the phone is using now and follows a live change', async () => {
    const r = await mount();
    assert.match(textOf(r), /Your phone is currently using Light\./);
    await act(async () => setSystemColorScheme('dark'));
    assert.match(textOf(r), /Your phone is currently using Dark\./);
    await press(radios(r).find((n) => n.props.accessibilityLabel === 'Dark'));
    assert.doesNotMatch(textOf(r), /Your phone is currently using/, 'the note only belongs to System');
  });

  test('it states that the choice is for this device only', async () => {
    assert.match(textOf(await mount()), /this device only/i);
  });

  test('a saved choice is shown as selected after a restart', async () => {
    const storage = store(serializePreference('light'));
    const r = await mount(storage);
    assert.equal(radios(r).find((n) => n.props.accessibilityState.checked).props.accessibilityLabel, 'Light');
  });
});
