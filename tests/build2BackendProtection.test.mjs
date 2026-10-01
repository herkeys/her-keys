import assert from 'node:assert/strict';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { describe, test } from 'node:test';

const read = (path) => readFileSync(path, 'utf8');

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(ts|tsx|js|jsx|mjs|cjs|json|yml|yaml)$/.test(name)) out.push(path.replace(/\\/g, '/'));
  }
  return out;
}

describe('Build 2 backend environment protection', () => {
  test('internal development and preview builds point at staging only', () => {
    const eas = JSON.parse(read('eas.json'));
    assert.equal(eas.build.development.env.EXPO_PUBLIC_HERKEYS_BACKEND, 'staging');
    assert.equal(eas.build.preview.env.EXPO_PUBLIC_HERKEYS_BACKEND, 'staging');
    assert.equal(eas.build.production.env.EXPO_PUBLIC_HERKEYS_BACKEND, 'production');
  });

  test('Gemini credentials and provider endpoint stay server-side', () => {
    const clientFiles = [...walk('src'), ...walk('app'), '.env.example'];
    for (const file of clientFiles) {
      const source = read(file);
      assert.doesNotMatch(source, /EXPO_PUBLIC_GEMINI|GEMINI_API_KEY|generativelanguage\.googleapis\.com/i, `${file} exposes provider configuration`);
    }

    const edge = read('supabase/functions/herkeys-ai/index.ts');
    assert.match(edge, /Deno\.env\.get\('GEMINI_API_KEY'\)/);
    assert.match(edge, /generativelanguage\.googleapis\.com\/v1\/interactions/);
    assert.doesNotMatch(edge, /EXPO_PUBLIC_/);
  });

  test('Her Keys AI requires a signed-in user at the Edge Function boundary', () => {
    const config = read('supabase/config.toml');
    assert.match(config, /\[functions\.herkeys-ai\][\s\S]*?verify_jwt\s*=\s*true/);
    const edge = read('supabase/functions/herkeys-ai/index.ts');
    assert.match(edge, /await requireUser\(req\)/);
  });

  test('the Build 2 validation workflow never deploys or mutates Supabase', () => {
    const workflow = read('.github/workflows/build2-validation-temporary.yml');
    assert.match(workflow, /pull_request:[\s\S]*?build\/02-gemini-integration/);
    assert.doesNotMatch(workflow, /supabase\s+(functions\s+deploy|db\s+(push|reset)|migration\s+up|secrets\s+set)/i);
    assert.doesNotMatch(workflow, /SUPABASE_ACCESS_TOKEN|SUPABASE_DB_PASSWORD/);
  });

  test('client-safe environment template contains no public Gemini secret slot', () => {
    assert.doesNotMatch(read('.env.example'), /^EXPO_PUBLIC_.*GEMINI.*=/mi);
  });
});
