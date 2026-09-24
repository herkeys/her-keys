import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { assertBackendMatchesUrl, isSupabaseConfigured } from '../src/config/supabase.ts';

describe('Her Keys backend environment guard', () => {
  test('production accepts only the Her Keys Production project ref', () => {
    const good = {
      backend: 'production',
      url: 'https://npykvnxnehlsdlbumzwk.supabase.co',
      anonKey: 'publishable',
    };
    assert.doesNotThrow(() => assertBackendMatchesUrl(good));
    assert.equal(isSupabaseConfigured(good), true);

    assert.throws(
      () =>
        assertBackendMatchesUrl({
          backend: 'production',
          url: 'https://fhhudicklmpofuzkxeqe.supabase.co',
          anonKey: 'publishable',
        }),
      /wrong Supabase project/
    );
  });

  test('staging accepts only the Her Keys Staging project ref', () => {
    assert.doesNotThrow(() =>
      assertBackendMatchesUrl({
        backend: 'staging',
        url: 'https://fhhudicklmpofuzkxeqe.supabase.co',
        anonKey: 'publishable',
      })
    );
  });

  test('an unconfigured local build remains allowed to run local-only', () => {
    assert.equal(isSupabaseConfigured({ backend: undefined, url: undefined, anonKey: undefined }), false);
  });
});
