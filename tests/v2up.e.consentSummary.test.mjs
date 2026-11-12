/**
 * V2UP-E — the AI-processing line in Your Account is a READ of the consent ledger, decided by the same `consentStatus` the gate uses.
 * It never writes, never defaults to "granted", is keyed by account, and cannot hang.
 */
import assert from 'node:assert/strict';
import { afterEach, describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';
import { HER_KEYS_CONSENT_VERSIONS } from '../src/domain/consent.ts';
import { aiConsentViewFromRead, boundedConsentRead } from '../src/features/consent/consentSummary.ts';
import { useAiConsentSummary } from '../src/features/consent/useAiConsentSummary.ts';
import { render } from './support/render.tsx';

const receipt = (consent_type, granted, recorded_at, policy_version = HER_KEYS_CONSENT_VERSIONS[consent_type]) => ({ consent_type, granted, recorded_at, policy_version });
const complete = (ai, at = '2026-10-01T10:00:00.000Z') => [receipt('terms', true, at), receipt('privacy', true, at), receipt('age18', true, at), receipt('ai_processing', ai, at)];

describe('aiConsentViewFromRead', () => {
  test('granted / declined / no decision, exactly as consentStatus decides', () => {
    assert.deepEqual(aiConsentViewFromRead({ kind: 'ok', receipts: complete(true) }), { kind: 'known', aiDecisionRecorded: true, aiPermitted: true });
    assert.deepEqual(aiConsentViewFromRead({ kind: 'ok', receipts: complete(false) }), { kind: 'known', aiDecisionRecorded: true, aiPermitted: false });
    assert.deepEqual(aiConsentViewFromRead({ kind: 'ok', receipts: [] }), { kind: 'known', aiDecisionRecorded: false, aiPermitted: false });
  });
  test('the LATEST decision wins (a later decline overrides an earlier grant), and an outdated policy version is not a decision', () => {
    const receipts = [...complete(true, '2026-10-01T10:00:00.000Z'), receipt('ai_processing', false, '2026-10-05T10:00:00.000Z')];
    assert.equal(aiConsentViewFromRead({ kind: 'ok', receipts }).aiPermitted, false);
    const outdated = [receipt('ai_processing', true, '2026-10-01T10:00:00.000Z', 'ai-data-processing-old')];
    assert.deepEqual(aiConsentViewFromRead({ kind: 'ok', receipts: outdated }), { kind: 'known', aiDecisionRecorded: false, aiPermitted: false });
  });
  test('an unanswered ledger is unavailable — never granted, never declined', () => {
    assert.deepEqual(aiConsentViewFromRead({ kind: 'unavailable' }), { kind: 'unavailable' });
  });
});

describe('boundedConsentRead', () => {
  test('passes an answer through; a rejection and a hang both become unavailable', async () => {
    assert.deepEqual(await boundedConsentRead(async () => ({ kind: 'ok', receipts: [] }), 50), { kind: 'ok', receipts: [] });
    assert.deepEqual(await boundedConsentRead(async () => { throw new Error('boom'); }, 50), { kind: 'unavailable' });
    assert.deepEqual(await boundedConsentRead(() => new Promise(() => {}), 20), { kind: 'unavailable' });
  });
});

describe('useAiConsentSummary', () => {
  const mounted = [];
  afterEach(async () => { for (const r of mounted.splice(0)) await TestRenderer.act(async () => { try { r.unmount(); } catch { /* gone */ } }); });
  const settle = () => TestRenderer.act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
  const seen = [];
  function Probe({ accountId, read }) {
    const { view, recheck } = useAiConsentSummary(accountId, read);
    seen.push(view.kind + (view.kind === 'known' ? `:${view.aiPermitted}` : ''));
    Probe.recheck = recheck;
    return null;
  }
  const mount = async (el) => { const r = await render(el); mounted.push(r); await settle(); return r; };
  const update = async (r, el) => { await TestRenderer.act(async () => { r.update(el); }); await settle(); };

  test('no account: nothing is read and the view is not-applicable', async () => {
    seen.length = 0;
    let reads = 0;
    await mount(<Probe accountId={null} read={async () => { reads += 1; return { kind: 'ok', receipts: [] }; }} />);
    assert.equal(reads, 0);
    assert.deepEqual([...new Set(seen)], ['not-applicable']);
  });

  test('checking, then the ledger answer', async () => {
    seen.length = 0;
    await mount(<Probe accountId="acct-a" read={async () => ({ kind: 'ok', receipts: complete(true) })} />);
    assert.equal(seen[0], 'checking');
    assert.equal(seen.at(-1), 'known:true');
  });

  test('a different account never shows the previous account\'s answer: it starts again from checking', async () => {
    seen.length = 0;
    const a = async () => ({ kind: 'ok', receipts: complete(true) });
    let release;
    const slowB = () => new Promise((resolve) => { release = () => resolve({ kind: 'ok', receipts: complete(false) }); });
    const r = await mount(<Probe accountId="acct-a" read={a} />);
    assert.equal(seen.at(-1), 'known:true');
    seen.length = 0;
    await update(r, <Probe accountId="acct-b" read={slowB} />);
    assert.ok(!seen.includes('known:true'), 'account A\'s grant is never rendered for account B');
    assert.equal(seen.at(-1), 'checking');
    await TestRenderer.act(async () => { release(); });
    await settle();
    assert.equal(seen.at(-1), 'known:false');
  });

  test('an answer that arrives after the account changed is discarded', async () => {
    seen.length = 0;
    let releaseA;
    const slowA = () => new Promise((resolve) => { releaseA = () => resolve({ kind: 'ok', receipts: complete(true) }); });
    const r = await mount(<Probe accountId="acct-a" read={slowA} />);
    await update(r, <Probe accountId="acct-b" read={async () => ({ kind: 'unavailable' })} />);
    assert.equal(seen.at(-1), 'unavailable');
    await TestRenderer.act(async () => { releaseA(); });
    await settle();
    assert.equal(seen.at(-1), 'unavailable', 'A\'s late grant did not overwrite B');
  });

  test('recheck goes back to checking and asks the ledger again', async () => {
    seen.length = 0;
    let n = 0;
    await mount(<Probe accountId="acct-a" read={async () => { n += 1; return n === 1 ? { kind: 'unavailable' } : { kind: 'ok', receipts: complete(true) }; }} />);
    assert.equal(seen.at(-1), 'unavailable');
    await TestRenderer.act(async () => { Probe.recheck(); });
    await settle();
    assert.equal(seen.at(-1), 'known:true');
    assert.equal(n, 2);
  });
});

describe('the summary is read-only', () => {
  test('neither module can write a consent or touch storage', async () => {
    const { readFileSync } = await import('node:fs');
    for (const file of ['src/features/consent/consentSummary.ts', 'src/features/consent/useAiConsentSummary.ts', 'src/features/account/accountStatusModel.ts', 'src/features/account/AccountStatusView.tsx']) {
      assert.doesNotMatch(readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1'), /\.record\(|insert\(|AsyncStorage|SecureStore|setItem|createConsentLedger/, file);
    }
  });
});
