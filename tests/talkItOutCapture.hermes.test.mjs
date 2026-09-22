/**
 * Engine-level regex compatibility, without a device.
 *
 * The reader is a pile of regular expressions, and the app runs on Hermes, not V8. Hermes precompiles regexes, so
 * compiling them with the real `hermesc` (shipped in `hermes-compiler`, the same compiler the app build uses) proves
 * its regex compiler accepts every pattern — lookbehind, lazy quantifiers, flags — before anything reaches a phone.
 * A negative control proves the check can fail.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, writeFileSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, test } from 'node:test';
import { buildSync } from 'esbuild';

const BIN = { win32: 'win64-bin/hermesc.exe', linux: 'linux64-bin/hermesc', darwin: 'osx-bin/hermesc' }[process.platform];
const HERMESC = BIN ? join('node_modules', 'hermes-compiler', 'hermesc', BIN) : null;
const available = HERMESC !== null && existsSync(HERMESC);

function compile(dir, name, source) {
  const file = join(dir, `${name}.js`);
  writeFileSync(file, source);
  try {
    execFileSync(HERMESC, ['-emit-binary', '-out', join(dir, `${name}.hbc`), file], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
    return { ok: true, message: '' };
  } catch (error) {
    return { ok: false, message: String(error.stderr || error.stdout || error.message) };
  }
}

describe('the reader\'s regular expressions compile under the real Hermes compiler', { skip: available ? false : 'hermesc is not available on this platform' }, () => {
  const dir = mkdtempSync(join(tmpdir(), 'hk-hermes-'));

  test('negative control: an invalid regular expression is rejected, so a pass here means something', () => {
    const bad = compile(dir, 'bad', 'var broken = /(unclosed/;\n');
    assert.equal(bad.ok, false);
    assert.match(bad.message, /Invalid regular expression/);
  });

  test('positive control: lookbehind and lazy quantifiers, which the reader relies on, are accepted', () => {
    const good = compile(dir, 'good', 'var a = /(?<![\\d/.$])\\b(\\d{1,2})(?::(\\d{2}))?\\s*(a\\.?m\\.?|p\\.?m\\.?)(?![a-z0-9])/gi;\nvar b = /a.*?b/;\n');
    assert.equal(good.ok, true, good.message);
  });

  test('every regular expression literal in the reader (bundled as one script) compiles', () => {
    const out = join(dir, 'reader.bundle.js');
    buildSync({
      entryPoints: ['src/features/talk-it-out/capture/port.ts'],
      bundle: true,
      format: 'iife',
      target: 'es2020', // lookbehind is ES2018, so literals stay literals instead of being rewritten into new RegExp(...)
      platform: 'neutral',
      packages: 'external',
      outfile: out,
      logLevel: 'error',
    });
    const source = readFileSync(out, 'utf8');
    assert.ok(source.length > 20_000, 'the bundle holds the reader');
    const result = compile(dir, 'reader', source);
    assert.equal(result.ok, true, result.message);
  });

  test('every regular expression the reader builds at runtime compiles too', async () => {
    const seen = new Map();
    const Native = globalThis.RegExp;
    globalThis.RegExp = new Proxy(Native, {
      construct(target, args, newTarget) {
        const made = Reflect.construct(target, args, newTarget);
        seen.set(`${made.source}/${made.flags}`, made);
        return made;
      },
    });
    try {
      const { read } = await import('./support/capture.mjs');
      const { CAPABILITY_ENVELOPE } = await import('../src/features/talk-it-out/capture/local/envelope.ts');
      for (const text of [
        ...CAPABILITY_ENVELOPE.flatMap((r) => r.variants),
        'Picture day is Thursday, I need to send $20, and I think practice moved to 6.',
        'Jordan will pick up Ayden at 5', 'Ask Sam to take him to practice at 5', 'Talk to Jordan about the $85',
      ]) read(text);
    } finally {
      globalThis.RegExp = Native;
    }
    assert.ok(seen.size >= 20, `${seen.size} runtime-built expressions captured`);
    const literals = [...seen.values()].map((r, i) => `var r${i} = /${r.source}/${r.flags};`).join('\n');
    const result = compile(dir, 'dynamic', `${literals}\n`);
    assert.equal(result.ok, true, result.message);
  });
});
