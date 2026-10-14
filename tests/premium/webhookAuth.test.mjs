import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { describe, test } from 'node:test';

import {
  constantTimeEqual,
  looksLikePublicSdkKey,
  parseSignatureHeader,
  verifyWebhookRequest,
  webhookConfigProblem,
} from '../../supabase/functions/_shared/premium/webhookAuth.ts';
import { AUTH_SECRET, HMAC_SECRET, NOW, bytes, rcBody, signature } from '../support/premium/harness.mjs';

const config = { authorizationSecret: AUTH_SECRET, hmacSecret: HMAC_SECRET, requireHmac: false, toleranceSeconds: 300 };
const raw = bytes(rcBody());
const verify = (overrides = {}) =>
  verifyWebhookRequest({
    rawBody: raw,
    authorizationHeader: AUTH_SECRET,
    signatureHeader: signature(raw),
    config,
    nowMs: NOW,
    ...overrides,
  });

describe('RevenueCat webhook authentication', () => {
  test('a correctly authorized, correctly signed request passes and reports that HMAC was verified', async () => {
    assert.deepEqual(await verify(), { ok: true, hmacVerified: true });
  });

  test('the signature is HMAC-SHA256 over "<t>.<raw body>" — matched against an independent node:crypto implementation', async () => {
    const t = Math.floor(NOW / 1000);
    const expected = createHmac('sha256', HMAC_SECRET).update(`${t}.${new TextDecoder().decode(raw)}`).digest('hex');
    assert.equal(signature(raw), `t=${t},v1=${expected}`);
    assert.equal((await verify()).ok, true);
  });

  test('a missing Authorization header is rejected (and says so only as a code)', async () => {
    assert.deepEqual(await verify({ authorizationHeader: null }), { ok: false, reason: 'missing_authorization' });
  });

  test('a wrong Authorization value is rejected even when the signature is perfect', async () => {
    assert.deepEqual(await verify({ authorizationHeader: `${AUTH_SECRET}x` }), { ok: false, reason: 'bad_authorization' });
    assert.deepEqual(await verify({ authorizationHeader: 'Bearer something-else' }), { ok: false, reason: 'bad_authorization' });
  });

  test('the client-public SDK key is never accepted as a credential, and cannot be configured as one', async () => {
    const sdkKey = 'appl_AbCdEfGhIjKlMnOp';
    assert.equal(looksLikePublicSdkKey(sdkKey), true);
    assert.equal(looksLikePublicSdkKey('goog_AbCdEfGhIjKlMnOp'), true);
    assert.equal(looksLikePublicSdkKey(AUTH_SECRET), false);
    const bad = { ...config, authorizationSecret: sdkKey };
    assert.match(webhookConfigProblem(bad) ?? '', /public SDK key/);
    assert.deepEqual(await verify({ config: bad, authorizationHeader: sdkKey }), { ok: false, reason: 'misconfigured' });
  });

  test('a missing signature is rejected when HMAC signing is configured', async () => {
    assert.deepEqual(await verify({ signatureHeader: null }), { ok: false, reason: 'missing_signature' });
  });

  test('a malformed signature header is rejected', async () => {
    for (const header of ['', 'garbage', 't=abc,v1=00', `t=${Math.floor(NOW / 1000)}`, `v1=${'a'.repeat(64)}`, `t=1,v1=${'z'.repeat(64)}`]) {
      const result = await verify({ signatureHeader: header });
      assert.equal(result.ok, false, header);
      assert.ok(['malformed_signature', 'missing_signature'].includes(result.reason), `${header} -> ${result.reason}`);
    }
  });

  test('a signature made with the wrong secret is rejected', async () => {
    assert.deepEqual(await verify({ signatureHeader: signature(raw, { secret: `${HMAC_SECRET}-other` }) }), { ok: false, reason: 'bad_signature' });
  });

  test('a signed request replayed outside the tolerance window is rejected, in both directions', async () => {
    const old = signature(raw, { t: Math.floor(NOW / 1000) - 301 });
    const future = signature(raw, { t: Math.floor(NOW / 1000) + 301 });
    assert.deepEqual(await verify({ signatureHeader: old }), { ok: false, reason: 'stale_signature' });
    assert.deepEqual(await verify({ signatureHeader: future }), { ok: false, reason: 'stale_signature' });
    assert.equal((await verify({ signatureHeader: signature(raw, { t: Math.floor(NOW / 1000) - 299 }) })).ok, true);
  });

  test('the signature covers the ORIGINAL bytes: a re-serialised body does not verify (a parsed-and-restringified body is a defect)', async () => {
    const original = new TextEncoder().encode(`{ "api_version":"1.0",   "event": ${JSON.stringify(rcBody().event)} }`);
    const sig = signature(original);
    assert.equal((await verify({ rawBody: original, signatureHeader: sig })).ok, true);
    const reserialised = bytes(JSON.parse(new TextDecoder().decode(original)));
    assert.deepEqual(await verify({ rawBody: reserialised, signatureHeader: sig }), { ok: false, reason: 'bad_signature' });
  });

  test('a tampered body fails verification', async () => {
    const tampered = bytes(rcBody({ type: 'RENEWAL' }));
    assert.deepEqual(await verify({ rawBody: tampered }), { ok: false, reason: 'bad_signature' });
  });

  test('a rotation window accepts any matching v1 value', async () => {
    const good = signature(raw).split('v1=')[1];
    const header = `t=${Math.floor(NOW / 1000)},v1=${'0'.repeat(64)},v1=${good}`;
    assert.equal((await verify({ signatureHeader: header })).ok, true);
    assert.deepEqual(parseSignatureHeader(header)?.v1.length, 2);
  });

  test('without an HMAC secret only the Authorization header is checked — except in production, where signing is required', async () => {
    const authOnly = { ...config, hmacSecret: null };
    assert.deepEqual(await verify({ config: authOnly, signatureHeader: null }), { ok: true, hmacVerified: false });
    const production = { ...authOnly, requireHmac: true };
    assert.match(webhookConfigProblem(production) ?? '', /hmac signing is required/);
    assert.deepEqual(await verify({ config: production, signatureHeader: null }), { ok: false, reason: 'misconfigured' });
  });

  test('a short or absent authorization secret is a configuration error, never an open endpoint', async () => {
    for (const authorizationSecret of [null, '', 'short']) {
      assert.deepEqual(await verify({ config: { ...config, authorizationSecret }, authorizationHeader: authorizationSecret ?? 'x' }), { ok: false, reason: 'misconfigured' });
    }
  });

  test('constantTimeEqual is correct for equal, unequal and different-length inputs', async () => {
    assert.equal(await constantTimeEqual('abc', 'abc'), true);
    assert.equal(await constantTimeEqual('abc', 'abd'), false);
    assert.equal(await constantTimeEqual('abc', 'abcd'), false);
    assert.equal(await constantTimeEqual('', ''), true);
  });
});
