/**
 * SC-04 — copy about returning users and new phones must state the rule the source actually implements.
 *
 * The rule (accountRuntime.ts bootstrap / `superseded_by_cloud` branch + composeAccountApp `canAdoptCloudHousehold`):
 *   - a phone with NOTHING set up that signs in to an account which already has a household ADOPTS it and pulls its synced records;
 *   - a phone that already holds its own household is NEVER merged into an existing account's (the server refuses the claim);
 *   - signing out keeps this phone's information, and the same account resumes it.
 * Earlier copy said new-phone restoration "is not available yet", contradicting adoption (IOS-S05, Android ledger case C).
 *
 * `src/features/welcome/` belongs to the Welcome Tree workstream: its strings are NOT changed here. They are listed in
 * WELCOME_OWNED so this guard keeps failing for any NEW occurrence elsewhere while the owner's proposed correction
 * (docs/audits/HK_BUILD2_SHARED_CONSUMER_REPAIR_LEDGER.md) is pending.
 */
import assert from 'node:assert/strict';
import { readdirSync, readFileSync } from 'node:fs';
import { test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { AccountPanel } from '../../src/features/account/AccountPanel.tsx';
import { render } from '../support/render.tsx';

const MODES = ['signIn', 'reconnect', 'connected', 'resolving', 'unavailable', 'quarantined'];
const textOf = (r) => r.root.findAllByType('Text').map((node) => [node.props.children].flat(Infinity).join('')).join(' ');
const UNSUPPORTED = /not (yet )?(available|supported)|isn[’']t (available|supported)/i;

async function panelText(mode) {
  const r = await render(<AccountPanel mode={mode} providers={['google']} busy={false} failed={false} onSignIn={() => {}} onSignOut={() => {}} onClose={() => {}} onRestore={() => {}} />);
  const text = textOf(r);
  await TestRenderer.act(async () => { r.unmount(); });
  return text;
}

test('SC-04: no account panel mode claims new-phone restoration is unavailable', async () => {
  for (const mode of MODES) {
    const text = await panelText(mode);
    assert.doesNotMatch(text, UNSUPPORTED, `${mode}: ${text}`);
    assert.doesNotMatch(text, /follows you to your next phone|new phone is not a fresh start/, 'the owner’s earlier guard still holds');
  }
});

test('SC-04: the signed-in and signing-in modes state the real new-phone rule, and promise no merge or full recovery', async () => {
  for (const mode of ['signIn', 'connected']) {
    const text = await panelText(mode);
    assert.match(text, /new phone with nothing set up yet/, mode);
    assert.match(text, /synced records/, `${mode}: scoped to what actually syncs`);
    assert.doesNotMatch(text, /merge|everything (comes|is restored)|all your (data|records)|recover/i, `${mode}: no over-promise`);
  }
  assert.match(await panelText('connected'), /Signing out keeps this phone’s information/);
});

test('SC-04: outside the Welcome Tree, no source string says household restoration on a new phone is unavailable', () => {
  const files = ['app', 'src']
    .flatMap((dir) => readdirSync(dir, { recursive: true }).map((f) => `${dir}/${String(f).replaceAll('\\', '/')}`))
    .filter((f) => /\.(ts|tsx)$/.test(f));
  const WELCOME_OWNED = new Map([
    ['src/features/welcome/copy.ts', 'Welcome Tree owner: accountChoice.lede'],
    // The shared Apple/Android disclosure is imported by the Welcome Tree copy and pinned by its tests (welcomeAuthShell), so it is the
    // Welcome owner's to reword together with accountChoice.lede.
    ['src/features/account/accountModel.ts', 'CROSS_PLATFORM_NOTE, shared into the Welcome Tree copy'],
  ]);
  const offenders = [];
  for (const file of files) {
    const source = readFileSync(file, 'utf8');
    for (const line of source.split(/\r?\n/)) {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) continue;
      if (/(restor\w*|new[- ]phone|different phone)/i.test(line) && /not (yet )?(available|supported)/i.test(line) && /household|phone/i.test(line)) offenders.push(`${file}: ${line.trim().slice(0, 120)}`);
    }
  }
  const unexplained = offenders.filter((o) => !WELCOME_OWNED.has(o.split(': ')[0]));
  assert.deepEqual(unexplained, [], 'new unavailable-restoration claims must be corrected or owned');
});
