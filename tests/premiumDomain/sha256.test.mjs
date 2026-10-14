import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { describe, test } from 'node:test';

import { sha256Hex } from '../../src/domain/premium/sha256.ts';

const reference = (text) => createHash('sha256').update(text, 'utf8').digest('hex');

describe('the pure SHA-256 used for proposal digests', () => {
  test('matches node:crypto on the standard vectors', () => {
    assert.equal(sha256Hex(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    assert.equal(sha256Hex('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    assert.equal(sha256Hex('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  });

  test('matches node:crypto across every padding boundary (0..200 bytes) and non-ASCII text', () => {
    for (let length = 0; length <= 200; length += 1) {
      const text = 'x'.repeat(length);
      assert.equal(sha256Hex(text), reference(text), `length ${length}`);
    }
    for (const text of ['héllo wörld', '日本語のテキスト', 'emoji 😀🏠 and 𝒳', 'task|day:2026-10-14|timed:2026-10-15T14:00:00.000Z']) assert.equal(sha256Hex(text), reference(text), text);
  });

  test('matches node:crypto on random long inputs', () => {
    for (let i = 0; i < 25; i += 1) {
      const text = randomBytes(10 + i * 137).toString('base64');
      assert.equal(sha256Hex(text), reference(text));
    }
  });

  test('is deterministic and a valid 64-char lowercase hex (the ledger digest format)', () => {
    assert.match(sha256Hex('same'), /^[0-9a-f]{64}$/);
    assert.equal(sha256Hex('same'), sha256Hex('same'));
    assert.notEqual(sha256Hex('same'), sha256Hex('Same'));
  });
});
