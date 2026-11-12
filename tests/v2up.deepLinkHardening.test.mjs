import assert from 'node:assert/strict';
import { describe, test } from 'node:test';

/**
 * V2UP-SEC-01 — the Expo Router deep-link parser must never be handed input that makes it freeze.
 *
 * Advisory GHSA-vcc3-ghjq-m6fr: `query-string@7.1.3` (Expo Router's link parser) uses `decode-uri-component@0.2.2`, whose decoding
 * time explodes on percent-escapes that are not well-formed UTF-8. Measured on the installed version: 1,025 characters of '%E0' took
 * 7.1 s to parse and 2,048 took 28.7 s — a frozen app from one crafted link. Fixing the dependency is a major Expo Router upgrade this
 * pass does not make, so every external link is checked at the single place it passes before the router (`app/+native-intent.tsx`
 * -> `routerPathForIncomingLink`). These tests run the REAL hook.
 */

const { redirectSystemPath } = await import('../app/+native-intent.tsx');
const { MAX_INCOMING_LINK_LENGTH, isUnparseableLink, routerPathForIncomingLink } = await import('../src/platform/systemLinks.ts');

const both = (path) => [redirectSystemPath({ path, initial: true }), redirectSystemPath({ path, initial: false })];

describe('V2UP-SEC-01: hostile links never reach the router', () => {
  const hostile = {
    'the measured 7-second payload (1,025 chars of %E0)': `/today?a=${'%E0'.repeat(341)}`,
    'the measured 28-second payload (2,048 chars of %E0)': `herkeys://today?a=${'%E0'.repeat(680)}`,
    'a short run of %E0 (still the slow shape)': `/today?a=${'%E0'.repeat(40)}`,
    'a lone percent sign': '/today?a=%',
    'a percent with one hex digit': '/today?a=%4',
    'a percent with non-hex digits': '/today?a=%zz',
    'a truncated four-byte sequence': '/today?a=%F0%9F%98',
    'a lead byte with a stray continuation': '/today?a=%C3%28',
    'an absurdly long but otherwise valid link': `/today?a=${'x'.repeat(MAX_INCOMING_LINK_LENGTH)}`,
    'an enormous link': `/today?a=${'%20'.repeat(200_000)}`,
  };

  for (const [label, path] of Object.entries(hostile)) {
    test(`the router stays where it is for ${label}`, () => {
      assert.equal(isUnparseableLink(path), true);
      assert.deepEqual(both(path), [null, null], 'cold start and warm both refuse it');
    });
  }

  test('refusing is cheap even for a 600,000-character link (it never reaches the parser)', () => {
    const started = process.hrtime.bigint();
    assert.equal(redirectSystemPath({ path: `/a?b=${'%E0'.repeat(200_000)}`, initial: false }), null);
    const ms = Number(process.hrtime.bigint() - started) / 1e6;
    assert.ok(ms < 250, `refused in ${ms.toFixed(1)} ms`);
  });
});

describe('V2UP-SEC-01: negative controls — ordinary links are untouched', () => {
  const fine = [
    '/today',
    '/life/kids',
    '/task-editor?taskId=abc123',
    '/life/person?id=a%20b',
    '/life/person?name=Zo%C3%AB',
    '/talk-it-out?x=%F0%9F%98%80',
    'herkeys://life',
    '/calendar?date=2026-11-12',
  ];
  for (const path of fine) {
    test(`passes ${path} through unchanged`, () => {
      assert.equal(isUnparseableLink(path), false);
      assert.deepEqual(both(path), [path, path]);
    });
  }

  test('the length cap is exact: a link of the maximum length passes, one character more is refused', () => {
    const atCap = `/today?a=${'x'.repeat(MAX_INCOMING_LINK_LENGTH - '/today?a='.length)}`;
    assert.equal(atCap.length, MAX_INCOMING_LINK_LENGTH);
    assert.equal(routerPathForIncomingLink(atCap), atCap);
    assert.equal(routerPathForIncomingLink(`${atCap}x`), null);
  });

  test('the OAuth returns are still swallowed exactly as before (PP-D01 unchanged)', () => {
    for (const path of ['herkeys://calendar-connected?status=connected', 'herkeys://auth/callback?code=abc', '/auth/callback?code=abc']) {
      assert.deepEqual(both(path), [null, null]);
    }
  });

  test('an OAuth-shaped link with hostile encoding is refused rather than parsed', () => {
    assert.deepEqual(both(`herkeys://auth/callback?code=${'%E0'.repeat(500)}`), [null, null]);
  });
});
