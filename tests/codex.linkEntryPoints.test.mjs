import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { runInNewContext } from 'node:vm';
import { test } from 'node:test';
import { installWebLinkGuard } from '../src/platform/webLinkGuard.ts';
import { parseOAuthCallback } from '../src/platform/googleIdentityOAuth.ts';
import { redirectSystemPath } from '../app/+native-intent.tsx';

function browserFor(path, { historyFails = false } = {}) {
  let url = new URL(path, 'https://app.invalid');
  const events = new Map(), replacements = [];
  const browser = {
    location: { get pathname() { return url.pathname; }, get search() { return url.search; }, get hash() { return url.hash; }, replace(to) { replacements.push(to); } },
    history: { replaceState(_data, _unused, to) { if (historyFails) throw Error('blocked'); url = new URL(to, url); } },
    addEventListener(type, fn, capture) { assert.equal(capture, true); events.set(type, fn); },
  };
  return { browser, events, replacements, current: () => url.pathname + url.search + url.hash, navigate: to => { url = new URL(to, url); } };
}
const hostile = ['/today?a=' + '%E0'.repeat(500), '/today?a=%', '/today?' + 'a'.repeat(4000), '/today#%F0%9F'];

test('real application entry loads guards before Router and cannot load Router if sanitizing fails', () => {
  const source = readFileSync(JSON.parse(readFileSync('package.json')).main, 'utf8');
  for (const permitted of [true, false]) {
    const seen = [];
    runInNewContext(source, { require(name) {
      if (name === './src/platform/webLinkGuard') return { installWebLinkGuard() { seen.push('guard'); return permitted; } };
      assert.equal(name, 'expo-router/entry'); seen.push('router');
    } });
    assert.deepEqual(seen, permitted ? ['guard', 'router'] : ['guard']);
  }
});

test('web cold starts sanitize hostile input before Router reads the initial URL', () => {
  for (const path of hostile) {
    const fixture = browserFor(path);
    assert.equal(installWebLinkGuard(fixture.browser), true);
    assert.equal(fixture.current(), '/');
    assert.equal(fixture.events.size, 2);
  }
});

test('failed browser sanitizing blocks startup instead of passing the URL through', () => {
  const fixture = browserFor(hostile[0], { historyFails: true });
  assert.equal(installWebLinkGuard(fixture.browser), false);
  assert.deepEqual(fixture.replacements, ['/']);
  assert.equal(fixture.events.size, 0);
});

test('browser history and hash changes stop Router listeners before a clean reload', () => {
  for (const event of ['popstate', 'hashchange']) {
    const fixture = browserFor('/today');
    installWebLinkGuard(fixture.browser);
    fixture.navigate(hostile[0]);
    let stopped = false;
    fixture.events.get(event)({ stopImmediatePropagation() { stopped = true; } });
    assert.equal(stopped, true);
    assert.deepEqual(fixture.replacements, ['/']);
  }
});

test('ordinary routes, encoded Unicode, literal percent values and PKCE redirects pass unchanged', () => {
  for (const path of ['/today', '/life/person?name=Zo%C3%AB', '/today?note=25%25', '/auth/callback?code=abc-123', '/calendar?label=a%20b#day']) {
    const fixture = browserFor(path);
    assert.equal(installWebLinkGuard(fixture.browser), true);
    assert.equal(fixture.current(), path);
    fixture.events.get('popstate')({ stopImmediatePropagation() { assert.fail('valid history was blocked'); } });
    assert.deepEqual(fixture.replacements, []);
  }
  assert.equal(installWebLinkGuard(null), true, 'native and server exports have no browser side effects');
  assert.equal(parseOAuthCallback('herkeys://auth/callback?code=valid-code').code, 'valid-code');
  assert.equal(redirectSystemPath({ path: 'herkeys://auth/callback?code=valid-code', initial: true }), null, 'callback still belongs to its auth session');
});

test('Google parser rejects malformed/oversized input; arbitrary native intent values fail closed', () => {
  for (const path of hostile) assert.equal(parseOAuthCallback(path).error, 'invalid_callback');
  for (const path of [undefined, null, {}, 42]) assert.equal(redirectSystemPath({ path, initial: true }), null);
  const started = performance.now();
  assert.equal(parseOAuthCallback('herkeys://auth/callback?code=' + '%E0'.repeat(200_000)).error, 'invalid_callback');
  assert.ok(performance.now() - started < 250);
});

test('installed SDK 57 primary query parser handles nested encoding without a slow fallback', () => {
  const require = createRequire(import.meta.url);
  const { parseQueryParams } = require('expo-router/build/fork/getStateFromPath-forks');
  const started = performance.now();
  for (const encoded of ['%E0'.repeat(500), '%25E0'.repeat(300)]) {
    const parsed = parseQueryParams('/today?a=' + encoded, { params: {} });
    assert.equal(typeof parsed.a, 'string');
  }
  assert.ok(performance.now() - started < 250);
});
