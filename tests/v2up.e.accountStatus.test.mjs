/**
 * V2UP-E — Your Account, at a glance: the status model derives each row from real state only, and says "checking" / "could not check"
 * instead of guessing; the view renders it with full spoken statements and real actions.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { StyleSheet } from 'react-native';
import { accountStatusGroups, describeLastSynced, statusRowSpeech } from '../src/features/account/accountStatusModel.ts';
import { AccountStatusView } from '../src/features/account/AccountStatusView.tsx';
import { render } from './support/render.tsx';

const NOW = Date.parse('2026-11-12T12:00:00.000Z');
const base = (over = {}) => ({
  mode: 'connected',
  accessCheckOffline: false,
  degradedReason: null,
  syncPhase: 'idle',
  sync: { pending: 0, attention: 0, backlog: false, lastSyncedAt: new Date(NOW - 5 * 60_000).toISOString() },
  ai: { kind: 'known', aiDecisionRecorded: true, aiPermitted: true },
  notifications: { enabled: true, permission: 'granted' },
  location: 'granted',
  now: NOW,
  ...over,
});
const rows = (input, canManageData = true) => Object.fromEntries(accountStatusGroups(input, { canManageData }).flatMap((g) => g.rows).map((r) => [r.key, r]));
const row = (input, key) => rows(input)[key];

describe('describeLastSynced', () => {
  test('buckets, and null for what cannot be read', () => {
    assert.equal(describeLastSynced(new Date(NOW - 10_000).toISOString(), NOW), 'just now');
    assert.equal(describeLastSynced(new Date(NOW - 5 * 60_000).toISOString(), NOW), '5 min ago');
    assert.equal(describeLastSynced(new Date(NOW - 3 * 3_600_000).toISOString(), NOW), '3 hr ago');
    assert.equal(typeof describeLastSynced(new Date(NOW - 3 * 86_400_000).toISOString(), NOW), 'string');
    assert.equal(describeLastSynced(null, NOW), null);
    assert.equal(describeLastSynced('not a date', NOW), null);
    assert.equal(describeLastSynced(new Date(NOW + 10 * 60_000).toISOString(), NOW), null, 'a future time is not invented into "just now"');
  });
});

describe('structure', () => {
  test('three groups in a fixed order; every row has a label and a value', () => {
    const groups = accountStatusGroups(base(), { canManageData: true });
    assert.deepEqual(groups.map((g) => g.key), ['setup', 'permissions', 'legal']);
    assert.deepEqual(groups.flatMap((g) => g.rows.map((r) => r.key)), ['account', 'sync', 'ai', 'notifications', 'location', 'media', 'terms', 'privacy', 'delete']);
    for (const r of groups.flatMap((g) => g.rows)) assert.ok(r.label && r.value, r.key);
  });
  test('the delete-account row exists only where its surface is reachable', () => {
    assert.equal(rows(base(), true).delete.action.id, 'delete-account');
    assert.equal(rows(base(), false).delete, undefined);
  });
  test('legal rows open the Terms and the Privacy Policy', () => {
    assert.equal(row(base(), 'terms').action.id, 'terms');
    assert.equal(row(base(), 'privacy').action.id, 'privacy');
  });
});

describe('account row, per state', () => {
  const cases = {
    connected: 'Signed in',
    reconnect: 'Sign in again',
    resolving: 'Connecting…',
    quarantined: 'A different account is signed in',
    unavailable: 'Not set up in this build',
    signIn: 'Not signed in',
  };
  for (const [mode, value] of Object.entries(cases)) {
    test(`${mode}`, () => assert.equal(row(base({ mode }), 'account').value, value));
  }
  test('reconnect and quarantine ask for her attention, in words', () => {
    assert.equal(row(base({ mode: 'reconnect' }), 'account').needsAttention, true);
    assert.equal(row(base({ mode: 'quarantined' }), 'account').needsAttention, true);
    assert.ok(!row(base(), 'account').needsAttention);
  });
});

describe('sync and offline come from real signals only', () => {
  test('connected and idle with a recent sync: up to date, with when', () => {
    const r = row(base(), 'sync');
    assert.equal(r.value, 'Up to date');
    assert.match(r.detail, /Last synced 5 min ago/);
    assert.ok(!r.needsAttention);
  });
  test('the account-access gate answering offline_local is Offline, and says why sync is paused', () => {
    const r = row(base({ accessCheckOffline: true }), 'sync');
    assert.equal(r.value, 'Offline');
    assert.match(r.detail, /paused until account access is checked online/i);
  });
  test('the sync runtime reporting offline is Offline; queued changes are counted honestly', () => {
    const none = row(base({ syncPhase: 'offline' }), 'sync');
    assert.equal(none.value, 'Offline');
    assert.match(none.detail, /saved on this phone/);
    const some = row(base({ syncPhase: 'offline', sync: { pending: 3, attention: 0, backlog: false, lastSyncedAt: null } }), 'sync');
    assert.match(some.detail, /^3 changes are waiting/);
    const one = row(base({ syncPhase: 'offline', sync: { pending: 1, attention: 0, backlog: false, lastSyncedAt: null } }), 'sync');
    assert.match(one.detail, /^1 change is waiting/);
  });
  test('offline is NOT claimed from nothing: idle, quiet, never synced reads "Not synced yet"', () => {
    const r = row(base({ sync: { pending: 0, attention: 0, backlog: false, lastSyncedAt: null } }), 'sync');
    assert.equal(r.value, 'Not synced yet');
    assert.doesNotMatch(r.value + (r.detail ?? ''), /offline/i);
  });
  test('waiting changes (online) are counted, singular and plural', () => {
    assert.equal(row(base({ sync: { pending: 1, attention: 0, backlog: false, lastSyncedAt: null } }), 'sync').value, '1 change waiting to sync');
    assert.equal(row(base({ sync: { pending: 4, attention: 0, backlog: false, lastSyncedAt: null } }), 'sync').value, '4 changes waiting to sync');
  });
  test('unresolved evidence reuses the one sync line and asks for attention; a backlog with none counted does not say "0"', () => {
    const evidence = row(base({ sync: { pending: 0, attention: 2, backlog: false, lastSyncedAt: null } }), 'sync');
    assert.equal(evidence.value, '2 changes need your attention.');
    assert.equal(evidence.needsAttention, true);
    const backlog = row(base({ sync: { pending: 0, attention: 0, backlog: true, lastSyncedAt: null } }), 'sync');
    assert.equal(backlog.value, 'Some changes need your attention.');
    assert.doesNotMatch(backlog.value, /\b0\b/);
  });
  test('a sync error is stated, kept safe on this phone, and asks for attention', () => {
    const r = row(base({ syncPhase: 'error' }), 'sync');
    assert.equal(r.value, 'Sync hit a problem');
    assert.match(r.detail, /saved on this phone/);
    assert.equal(r.needsAttention, true);
  });
  test('a cycle in flight is "Syncing…"', () => {
    assert.equal(row(base({ syncPhase: 'pushing' }), 'sync').value, 'Syncing…');
  });
  test('signed out: sync is off and this phone only; quarantined: off, nothing uploaded', () => {
    assert.equal(row(base({ mode: 'signIn', sync: null }), 'sync').value, 'Off — this phone only');
    assert.equal(row(base({ mode: 'unavailable', sync: null }), 'sync').value, 'Off — this phone only');
    const q = row(base({ mode: 'quarantined', sync: null }), 'sync');
    assert.equal(q.value, 'Off');
    assert.match(q.detail, /Nothing from this phone is uploaded/);
  });
  test('reconnect: offline only when the credential lapsed because the cloud was unreachable', () => {
    assert.equal(row(base({ mode: 'reconnect', degradedReason: 'offline' }), 'sync').value, 'Offline');
    assert.equal(row(base({ mode: 'reconnect', degradedReason: 'expired' }), 'sync').value, 'Paused until you sign in again');
  });
});

describe('AI processing mirrors the consent ledger and never invents a choice', () => {
  test('granted -> On, with the external-provider disclosure', () => {
    const r = row(base(), 'ai');
    assert.equal(r.value, 'On');
    assert.match(r.detail, /external AI providers, including Google Gemini/);
  });
  test('declined -> Off, and the rest of the app is said to work', () => {
    const r = row(base({ ai: { kind: 'known', aiDecisionRecorded: true, aiPermitted: false } }), 'ai');
    assert.equal(r.value, 'Off');
    assert.match(r.detail, /everything else works as usual/);
  });
  test('no recorded decision -> "Not chosen yet" (absence is never "On")', () => {
    const r = row(base({ ai: { kind: 'known', aiDecisionRecorded: false, aiPermitted: false } }), 'ai');
    assert.equal(r.value, 'Not chosen yet');
  });
  test('the ledger not answering is "could not check", fail-closed, never On or Off', () => {
    const r = row(base({ ai: { kind: 'unavailable' } }), 'ai');
    assert.equal(r.value, 'Could not check right now');
    assert.match(r.detail, /stay off until your choice can be confirmed/);
  });
  test('while checking: Checking…', () => {
    assert.equal(row(base({ ai: { kind: 'checking' } }), 'ai').value, 'Checking…');
  });
  test('without a connected account the ledger answer is ignored: signed out, quarantined, reconnecting', () => {
    const stale = { kind: 'known', aiDecisionRecorded: true, aiPermitted: true };
    for (const mode of ['signIn', 'unavailable', 'quarantined']) {
      const r = row(base({ mode, ai: stale }), 'ai');
      assert.equal(r.value, 'Off', mode);
    }
    assert.equal(row(base({ mode: 'reconnect', ai: stale }), 'ai').value, 'Sign in to check');
    assert.equal(row(base({ mode: 'resolving', ai: stale }), 'ai').value, 'Checking…');
  });
});

describe('permissions', () => {
  test('notifications: On / not turned on / off in settings (with the Settings action) / checking', () => {
    assert.equal(row(base(), 'notifications').value, 'On');
    assert.equal(row(base({ notifications: { enabled: false, permission: 'granted' } }), 'notifications').value, 'Not turned on');
    assert.equal(row(base({ notifications: { enabled: false, permission: 'undetermined' } }), 'notifications').value, 'Not turned on');
    const denied = row(base({ notifications: { enabled: true, permission: 'denied' } }), 'notifications');
    assert.equal(denied.value, 'Off in phone settings');
    assert.equal(denied.action.id, 'phone-settings');
    assert.equal(row(base({ notifications: null }), 'notifications').value, 'Checking…');
  });
  test('"On" needs both her preference and the OS permission', () => {
    assert.notEqual(row(base({ notifications: { enabled: true, permission: 'undetermined' } }), 'notifications').value, 'On');
  });
  test('location: allowed / denied (Settings action) / not asked / could not check / checking', () => {
    assert.equal(row(base({ location: 'granted' }), 'location').value, 'Allowed while you use the app');
    const denied = row(base({ location: 'denied' }), 'location');
    assert.equal(denied.value, 'Off in phone settings');
    assert.equal(denied.action.id, 'phone-settings');
    assert.equal(row(base({ location: 'undetermined' }), 'location').value, 'Not asked yet');
    assert.equal(row(base({ location: 'unknown' }), 'location').value, 'Could not check');
    assert.equal(row(base({ location: null }), 'location').value, 'Checking…');
  });
  test('camera and photos are not given a fabricated permission status', () => {
    const media = row(base(), 'media');
    assert.equal(media.value, 'Only when you scan');
    assert.equal(media.action, undefined);
    assert.doesNotMatch(media.value, /granted|allowed|denied|off|on\b/i);
  });
});

describe('spoken statement', () => {
  test('label, value and detail are one statement; no detail, no trailing sentence', () => {
    assert.equal(statusRowSpeech({ key: 'sync', label: 'Sync', value: 'Up to date', detail: 'Last synced 5 min ago.' }), 'Sync: Up to date. Last synced 5 min ago.');
    assert.equal(statusRowSpeech({ key: 'terms', label: 'Terms and Conditions', value: 'Read' }), 'Terms and Conditions: Read');
  });
});

describe('AccountStatusView', () => {
  const mounted = [];
  afterEach(async () => { for (const r of mounted.splice(0)) await TestRenderer.act(async () => { try { r.unmount(); } catch { /* gone */ } }); });
  const mount = async (el) => { const r = await render(el); mounted.push(r); return r; };
  const groups = () => accountStatusGroups(base({ location: 'denied' }), { canManageData: true });

  test('every row is one spoken statement; actionable rows are buttons/links with a hint, plain rows are not pressable', async () => {
    const r = await mount(<AccountStatusView groups={groups()} onAction={() => {}} />);
    const spoken = r.root.findAll((n) => typeof n.type === 'string' && n.props.accessibilityLabel && (n.type === 'View' || n.type === 'Pressable'));
    const labels = spoken.map((n) => n.props.accessibilityLabel);
    assert.ok(labels.includes('Sync: Up to date. Last synced 5 min ago.'));
    assert.ok(labels.some((l) => l.startsWith('AI processing: On. ')));
    const pressables = r.root.findAll((n) => n.type === 'Pressable');
    assert.deepEqual(pressables.map((p) => p.props.accessibilityRole).sort(), ['button', 'button', 'link', 'link']);
    for (const p of pressables) assert.ok(p.props.accessibilityHint.length > 10, p.props.accessibilityLabel);
  });

  test('pressing a row reports the action it asked for', async () => {
    const asked = [];
    const r = await mount(<AccountStatusView groups={groups()} onAction={(a) => asked.push(a)} />);
    for (const p of r.root.findAll((n) => n.type === 'Pressable')) await TestRenderer.act(async () => { p.props.onPress(); });
    assert.deepEqual(asked.sort(), ['delete-account', 'phone-settings', 'privacy', 'terms']);
  });

  test('group titles are headers; a link failure is stated, politely', async () => {
    const r = await mount(<AccountStatusView groups={groups()} onAction={() => {}} notice="That page could not be opened. Check your connection and try again." />);
    assert.equal(r.root.findAll((n) => n.type === 'View' && n.props.accessibilityRole === 'header').length, 3);
    const notice = r.root.findAllByType('Text').find((t) => String(t.props.children).startsWith('That page could not'));
    assert.equal(notice.props.accessibilityLiveRegion, 'polite');
  });

  test('rows meet the touch floor', async () => {
    const r = await mount(<AccountStatusView groups={groups()} onAction={() => {}} />);
    const floor = 44;
    for (const p of r.root.findAll((n) => n.type === 'Pressable')) {
      const content = p.findAll((n) => n.type === 'View').find((n) => StyleSheet.flatten(n.props.style)?.minHeight !== undefined);
      assert.ok(StyleSheet.flatten(content.props.style).minHeight >= floor);
    }
  });

  test('a needs-attention row is marked by a dot AND by words, never colour alone', async () => {
    const attention = accountStatusGroups(base({ mode: 'reconnect' }), { canManageData: false });
    const r = await mount(<AccountStatusView groups={attention} onAction={() => {}} />);
    const text = r.root.findAllByType('Text').map((t) => [t.props.children].flat().join('')).join(' | ');
    assert.match(text, /Sign in again/);
  });
});

const { auditContrast } = await import('./support/contrastAudit.ts');
const { AppearanceProvider, serializePreference } = await import('../src/design/theme/index.ts');
const { darkTheme, lightTheme } = await import('../src/design/theme/palettes.ts');
const { View } = await import('react-native');

describe('AccountStatusView rendered contrast (the real audit, both schemes)', () => {
  const store = (initial) => ({ value: initial, read: async function read() { return this.value; }, write: async function write(v) { this.value = v; } });
  // Rows in their most demanding states: an attention row, a denied-permission row, long details.
  const demanding = [
    ...accountStatusGroups(base({ mode: 'reconnect', location: 'denied', notifications: { enabled: true, permission: 'denied' }, ai: { kind: 'unavailable' } }), { canManageData: false }),
    ...accountStatusGroups(base({ sync: { pending: 0, attention: 2, backlog: false, lastSyncedAt: null } }), { canManageData: true }),
  ];
  for (const [scheme, theme] of [['light', lightTheme], ['dark', darkTheme]]) {
    test(`${scheme}: no text pairing falls below its WCAG AA floor`, async () => {
      const r = await render(
        <AppearanceProvider storage={store(serializePreference(scheme))}>
          <View style={{ backgroundColor: theme.color.background }}><AccountStatusView groups={demanding} onAction={() => {}} /></View>
        </AppearanceProvider>,
      );
      await TestRenderer.act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
      const { findings, measured } = auditContrast(r.root);
      assert.ok(measured > 20, `measured ${measured} text nodes`);
      assert.deepEqual(findings, []);
    });
  }
});
