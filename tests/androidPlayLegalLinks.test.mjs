import assert from 'node:assert/strict';
import { test } from 'node:test';
import { Platform } from 'react-native';
import { HER_KEYS_LEGAL_URLS, legalUrlsForPlatform } from '../src/config/legal.ts';

test('Android Play legal entry points use the complete HTML policies on the published domain', () => {
  const urls = legalUrlsForPlatform('android');
  assert.deepEqual(urls, {
    terms: 'https://herkeys.app/legal/her-keys-full-terms-and-conditions.html',
    privacy: 'https://herkeys.app/legal/her-keys-full-privacy-policy.html',
  });
  for (const url of Object.values(urls)) {
    assert.equal(new URL(url).protocol, 'https:');
    assert.equal(new URL(url).hostname, 'herkeys.app');
    assert.ok(url.endsWith('.html'), 'Android must not open an older PDF legal artifact');
  }
});

test('iOS and web retain their previously published policy destinations', () => {
  for (const platform of ['ios', 'web']) {
    assert.deepEqual(legalUrlsForPlatform(platform), {
      terms: 'https://npykvnxnehlsdlbumzwk.supabase.co/storage/v1/object/public/Legal%20docs/her-keys-terms.pdf',
      privacy: 'https://npykvnxnehlsdlbumzwk.supabase.co/storage/v1/object/public/Legal%20docs/her-keys-policy.pdf',
    });
  }
});

test('the public legal entry points are selected by the current native platform', () => {
  assert.deepEqual(HER_KEYS_LEGAL_URLS, legalUrlsForPlatform(Platform.OS));
});
