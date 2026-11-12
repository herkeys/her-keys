/**
 * V2UP-E — native UX and accessibility defects found in the audit:
 *  1. DeletionGate's two entry fields were unthemed (no text colour, no surface, default black border): unreadable in Dark.
 *  2. The Sheet scrim had a label but no role, so a screen reader did not present it as something that can be activated.
 *  3. Every raw `<TextInput>` outside the TextField primitive must be themed (the class of defect in 1).
 *  4. The Your Account status surface uses only token pairs that pass WCAG AA in BOTH schemes, and keeps the touch floor.
 */
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { registerHooks } from 'node:module';
import { afterEach, describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { AppearanceProvider, serializePreference } from '../src/design/theme/index.ts';
import { darkTheme, lightTheme } from '../src/design/theme/palettes.ts';
import { Sheet } from '../src/design/components/index.ts';
import { ratio, NORMAL_TEXT_FLOOR } from './design-system/contrastPairs.mjs';
import { gateFixture, publishGate } from './support/deletionGateBoundary.mjs';
import { render } from './support/render.tsx';

const stub = new URL('./support/deletionGateBoundary.mjs', import.meta.url).href;
registerHooks({ resolve(specifier, context, next) {
  if (context.parentURL?.endsWith('/src/features/account/DeletionGate.tsx') &&
      (specifier === 'expo-router' || /(?:deletionRuntimeInstance|accountRuntimeInstance|AppStateProvider)$/.test(specifier))) return next(stub, context);
  return next(specifier, context);
} });
const { DeletionGate } = await import('../src/features/account/DeletionGate.tsx');

const mounted = [];
afterEach(async () => {
  for (const r of mounted.splice(0)) await TestRenderer.act(async () => { try { r.unmount(); } catch { /* gone */ } });
  gateFixture.gate = { kind: 'checking' };
  gateFixture.hydrated = true;
});
const mount = async (el) => { const r = await render(el); mounted.push(r); return r; };
const settle = () => TestRenderer.act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
const store = (initial = null) => ({ value: initial, read: async function read() { return this.value; }, write: async function write(v) { this.value = v; } });

describe('DeletionGate entry fields are themed (Light and Dark)', () => {
  const receiptField = (r) => r.root.findAll((n) => n.type === 'TextInput' && n.props.accessibilityLabel === 'Private deletion receipt')[0];

  for (const [scheme, theme, preference] of [['light', lightTheme, 'light'], ['dark', darkTheme, 'dark']]) {
    test(`${scheme}: text, surface and control border come from the theme tokens, not platform defaults`, async () => {
      gateFixture.gate = { kind: 'unavailable' };
      const r = await mount(<AppearanceProvider storage={store(serializePreference(preference))}><DeletionGate><React.Fragment /></DeletionGate></AppearanceProvider>);
      await settle();
      await TestRenderer.act(async () => { publishGate({ kind: 'unavailable' }); });
      const input = receiptField(r);
      assert.ok(input, 'the receipt field is shown for an unavailable gate');
      const style = StyleSheet.flatten(input.props.style);
      assert.equal(style.color, theme.color.text.primary);
      assert.equal(style.backgroundColor, theme.color.surface.primary);
      assert.equal(style.borderColor, theme.color.border.control);
      assert.equal(style.borderWidth, 1);
      assert.ok(style.padding >= 14, 'keeps a comfortable target');
    });
  }

  test('both fields in the source share the themed style (no inline unthemed style remains)', () => {
    const source = readFileSync('src/features/account/DeletionGate.tsx', 'utf8');
    assert.equal((source.match(/style=\{fieldStyle\}/g) ?? []).length, 2);
    assert.doesNotMatch(source, /style=\{\{borderWidth/);
  });
});

describe('Sheet scrim', () => {
  test('is a button with a hint, still labelled Dismiss, and closes the sheet', async () => {
    let closed = 0;
    const r = await mount(<Sheet visible onClose={() => closed++} accessibilityLabel="Why this move"><React.Fragment /></Sheet>);
    const scrim = r.root.findByType('Pressable');
    assert.equal(scrim.props.accessibilityRole, 'button');
    assert.equal(scrim.props.accessibilityLabel, 'Dismiss');
    assert.match(scrim.props.accessibilityHint, /closes/i);
    await TestRenderer.act(async () => { scrim.props.onPress(); });
    assert.equal(closed, 1);
  });
});

describe('no unthemed raw TextInput anywhere in the app', () => {
  const walk = (dir) => readdirSync(dir).flatMap((name) => {
    const path = join(dir, name).split('\\').join('/');
    return statSync(path).isDirectory() ? walk(path) : /\.tsx$/.test(path) ? [path] : [];
  });
  const raw = [...walk('src'), ...walk('app')].filter((f) => f !== 'src/design/components/TextField.tsx' && /<TextInput\b/.test(readFileSync(f, 'utf8')));

  test('the raw inputs are the known few', () => {
    assert.deepEqual(raw.sort(), ['src/features/account/DeleteAccountPanel.tsx', 'src/features/account/DeletionGate.tsx', 'src/features/talk-it-out/TalkItOutView.tsx']);
  });
  test('each one reads the theme for its text colour and border, and none uses an inline static style object', () => {
    for (const file of raw) {
      const source = readFileSync(file, 'utf8');
      assert.match(source, /useTheme|createThemedStyles|themed\(/, `${file} reads the theme`);
      assert.doesNotMatch(source, /<TextInput[^>]*style=\{\{/, `${file} has an inline unthemed TextInput style`);
    }
  });
});

describe('Your Account status surface: contrast in both schemes', () => {
  // Text tokens the status rows use, on the surface they sit on (surface.primary) — each is also an approved pairing in the HK-FE-UI-02 matrix.
  const PAIRS = [
    ['text.primary', (c) => c.text.primary], ['text.secondary', (c) => c.text.secondary], ['text.muted', (c) => c.text.muted], ['status.attention', (c) => c.status.attention],
  ];
  for (const [scheme, theme] of [['light', lightTheme], ['dark', darkTheme]]) {
    for (const [name, pick] of PAIRS) {
      test(`${scheme}: ${name} on surface.primary meets ${NORMAL_TEXT_FLOOR}:1`, () => {
        const value = ratio(pick(theme.color), theme.color.surface.primary);
        assert.ok(value >= NORMAL_TEXT_FLOOR, `${scheme} ${name}: ${value.toFixed(2)}:1`);
      });
    }
  }
});
