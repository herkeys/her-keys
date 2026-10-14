import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

import { concernsPremium, evidencePayload, parseWebhookBody } from '../../supabase/functions/_shared/premium/events.ts';
import { ACCOUNT_A, NOW, bytes, rcBody } from '../support/premium/harness.mjs';

const parse = (body) => parseWebhookBody(typeof body === 'string' || body instanceof Uint8Array ? bytes(body) : bytes(body));

describe('webhook payload parsing', () => {
  test('keeps only what Her Keys may keep: prices, currency, country, e-mail, attributes and transaction ids never survive', () => {
    const result = parse(rcBody());
    assert.equal(result.ok, true);
    const everything = JSON.stringify([result.event, evidencePayload(result.event)]);
    for (const secret of ['9.99', 'USD', 'mom@example.com', 'Mom', 'tx-secret-1', 'otx-secret-1', 'subscriber_attributes', 'country_code', 'price']) {
      assert.equal(everything.includes(secret), false, `${secret} leaked into the stored shape`);
    }
    assert.equal(result.event.app_user_id, ACCOUNT_A);
    assert.equal(result.event.expiration_at_ms, NOW + 30 * 86_400_000);
  });

  test('tolerates unknown event types and unknown fields (RevenueCat adds both without a version change)', () => {
    const result = parse(rcBody({ type: 'SOMETHING_NEW_IN_2027', brand_new_field: { nested: [1, 2, 3] } }));
    assert.equal(result.ok, true);
    assert.equal(result.event.event_type, 'SOMETHING_NEW_IN_2027');
  });

  test('missing optional fields are null, not errors', () => {
    const result = parse({ api_version: '1.0', event: { id: 'e1', type: 'EXPIRATION', environment: 'PRODUCTION' } });
    assert.equal(result.ok, true);
    assert.equal(result.event.app_user_id, null);
    assert.equal(result.event.event_timestamp_ms, null);
    assert.equal(result.event.entitlement_ids, null);
    assert.deepEqual(result.event.aliases, []);
  });

  test('rejects structurally invalid bodies with a reason code', () => {
    assert.deepEqual(parse(''), { ok: false, reason: 'empty_body' });
    assert.deepEqual(parse('not json'), { ok: false, reason: 'invalid_json' });
    assert.deepEqual(parse('[]'), { ok: false, reason: 'missing_event' });
    assert.deepEqual(parse({ event: 'x' }), { ok: false, reason: 'missing_event' });
    assert.deepEqual(parse({ event: { type: 'RENEWAL', environment: 'SANDBOX' } }), { ok: false, reason: 'missing_event_id' });
    assert.deepEqual(parse({ event: { id: 'e', environment: 'SANDBOX' } }), { ok: false, reason: 'missing_event_type' });
    assert.deepEqual(parse({ event: { id: 'e', type: 'RENEWAL' } }), { ok: false, reason: 'invalid_environment' });
    assert.deepEqual(parse({ event: { id: 'e', type: 'RENEWAL', environment: 'STAGING' } }), { ok: false, reason: 'invalid_environment' });
    assert.deepEqual(parseWebhookBody(new Uint8Array([0xff, 0xfe, 0x7b])), { ok: false, reason: 'invalid_json' });
  });

  test('rejects an oversized body before parsing it', () => {
    const huge = new Uint8Array(256 * 1024 + 1).fill(32);
    assert.deepEqual(parseWebhookBody(huge), { ok: false, reason: 'body_too_large' });
  });

  test('implausible timestamps are dropped, not trusted', () => {
    for (const value of [0, -5, 1.5, '1700000000000', 99_999_999_999_999_999]) {
      const result = parse(rcBody({ event_timestamp_ms: value, expiration_at_ms: value }));
      assert.equal(result.event.event_timestamp_ms, null, String(value));
      assert.equal(result.event.expiration_at_ms, null, String(value));
    }
  });

  test('bounds list sizes and element lengths', () => {
    const aliases = Array.from({ length: 200 }, (_, i) => `alias-${i}`);
    const result = parse(rcBody({ aliases, entitlement_ids: ['x'.repeat(500), 'her_keys_plus'] }));
    assert.equal(result.event.aliases.length, 50);
    assert.deepEqual(result.event.entitlement_ids, ['her_keys_plus']);
  });

  test('the deprecated singular entitlement_id is still understood', () => {
    const result = parse(rcBody({ entitlement_ids: undefined, entitlement_id: 'her_keys_plus' }));
    assert.deepEqual(result.event.entitlement_ids, ['her_keys_plus']);
    assert.equal(concernsPremium(result.event), 'yes');
  });

  test('an event for some OTHER entitlement does not concern Premium; an unspecified one is flagged for reconcile', () => {
    assert.equal(concernsPremium(parse(rcBody({ entitlement_ids: ['other'] })).event), 'no');
    assert.equal(concernsPremium(parse(rcBody({ entitlement_ids: null })).event), 'unspecified');
  });
});
