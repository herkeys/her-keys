/**
 * V2UP-E — spoken status changes on iOS.
 *
 * `accessibilityLiveRegion` is Android-only in React Native, so VoiceOver heard none of the app's polite status lines. The hook posts the
 * same sentence through the native announcement API on iOS only, once per NEW message; Android keeps its live region and hears it once.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { AccessibilityInfo, Platform } from 'react-native';
import { announcementToSpeak, useAnnounceOnIOS } from '../src/design/announce.ts';
import { TextField } from '../src/design/components/index.ts';
import { render } from './support/render.tsx';

const spoken = [];
AccessibilityInfo.announceForAccessibility = (message) => { spoken.push(message); };
const mounted = [];
afterEach(async () => {
  for (const r of mounted.splice(0)) await TestRenderer.act(async () => { try { r.unmount(); } catch { /* gone */ } });
  spoken.length = 0;
  Platform.OS = 'ios';
});
const mount = async (el) => { const r = await render(el); mounted.push(r); return r; };
const update = async (r, el) => TestRenderer.act(async () => { r.update(el); });

function Probe({ message }) {
  useAnnounceOnIOS(message);
  return null;
}

describe('announcementToSpeak (pure)', () => {
  test('a new non-empty message is spoken, trimmed', () => {
    assert.equal(announcementToSpeak(null, '  Something went wrong. '), 'Something went wrong.');
    assert.equal(announcementToSpeak('Old', 'New'), 'New');
  });
  test('silence for: unchanged, cleared, blank, absent', () => {
    assert.equal(announcementToSpeak('Same', 'Same'), null);
    assert.equal(announcementToSpeak('Same', ' Same '), null);
    assert.equal(announcementToSpeak('Was here', ''), null);
    assert.equal(announcementToSpeak('Was here', null), null);
    assert.equal(announcementToSpeak(null, '   '), null);
    assert.equal(announcementToSpeak(undefined, undefined), null);
  });
});

describe('useAnnounceOnIOS', () => {
  test('iOS: speaks a message when it appears and again only when it changes', async () => {
    Platform.OS = 'ios';
    const r = await mount(<Probe message={null} />);
    assert.deepEqual(spoken, [], 'nothing on mount with no message');
    await update(r, <Probe message="Check your email for a sign-in code." />);
    assert.deepEqual(spoken, ['Check your email for a sign-in code.']);
    await update(r, <Probe message="Check your email for a sign-in code." />);
    assert.equal(spoken.length, 1, 're-rendering an unchanged message is silent');
    await update(r, <Probe message={null} />);
    assert.equal(spoken.length, 1, 'clearing is silent');
    await update(r, <Probe message="Verification did not complete." />);
    assert.deepEqual(spoken, ['Check your email for a sign-in code.', 'Verification did not complete.']);
  });

  test('a message already on screen at mount is not shouted at her', async () => {
    Platform.OS = 'ios';
    await mount(<Probe message="Already here" />);
    assert.deepEqual(spoken, []);
  });

  test('Android: never announced through the API (its live region speaks it, so nothing is doubled)', async () => {
    Platform.OS = 'android';
    const r = await mount(<Probe message={null} />);
    await update(r, <Probe message="That did not go through." />);
    assert.deepEqual(spoken, []);
  });
});

describe('TextField errors are heard', () => {
  const field = (error) => <TextField label="Amount (USD)" value="x" onChangeText={() => {}} error={error} />;
  const errorNode = (r, text) => r.root.findAllByType('Text').find((t) => t.props.children === text);

  test('the error is a polite live region by default (Android)', async () => {
    const r = await mount(field('Enter a number, like 12.50.'));
    assert.equal(errorNode(r, 'Enter a number, like 12.50.').props.accessibilityLiveRegion, 'polite');
  });

  test('a caller may still choose the live-region level', async () => {
    const r = await mount(<TextField label="Code" value="" onChangeText={() => {}} error="Too short." errorAccessibilityLiveRegion="assertive" />);
    assert.equal(errorNode(r, 'Too short.').props.accessibilityLiveRegion, 'assertive');
  });

  test('iOS: a NEW validation error is announced once; an error already showing at mount is not', async () => {
    Platform.OS = 'ios';
    const r = await mount(field(null));
    await update(r, field('Enter a number, like 12.50.'));
    assert.deepEqual(spoken, ['Enter a number, like 12.50.']);
    const pre = await mount(field('Present from the start'));
    assert.ok(pre);
    assert.deepEqual(spoken, ['Enter a number, like 12.50.']);
  });
});
