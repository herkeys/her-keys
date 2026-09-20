import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { describe, test } from 'node:test';

/**
 * B4-FOUNDATION-BUILDOUT-01 section 4 (reconciliation), made executable.
 *
 * The 27-row register is derived from the audit's matrix, not from its summary,
 * and this test re-derives both sides on every run. A row that quietly appears,
 * disappears, or maps twice fails here rather than in a report.
 */

const AUDIT = readFileSync(new URL('../docs/builds/BUILD4_FEATURE_ACCEPTANCE.md', import.meta.url), 'utf8').split(/\r?\n/);
const LEDGER = readFileSync(new URL('../docs/builds/BUILD4_FOUNDATION_BUILDOUT.md', import.meta.url), 'utf8').split(/\r?\n/);

const CLASSES = ['FOUNDATION EXPANSION REQUIRED', 'EXTENSION', 'ACCEPTED', 'BLOCKED'];

function auditMatrix() {
  const start = AUDIT.findIndex((line) => line.startsWith('## 6. Feature Acceptance Matrix'));
  const end = AUDIT.findIndex((line) => line.startsWith('## 7. Counts'));
  assert.ok(start >= 0 && end > start, 'the audit matrix bounds must be found');

  const rows = [];
  for (let i = start; i < end; i += 1) {
    const match = /^\|\s*(\d+)\s*\|\s*\*\*(.+?)\*\*/.exec(AUDIT[i]);
    if (!match) continue;
    const classCells = AUDIT[i].split('|').map((cell) => cell.trim()).filter((cell) => CLASSES.some((k) => cell === `**${k}**`));
    assert.equal(classCells.length, 1, `audit row ${match[1]} must carry exactly one classification`);
    rows.push({ num: Number(match[1]), capability: match[2], klass: classCells[0].replace(/\*/g, '') });
  }
  return rows;
}

const PROGRESS = ['NOT STARTED', 'IN PROGRESS', 'IMPLEMENTED', 'VERIFIED', 'STOPPED'];
const FIELDS = [
  'AUDIT ROW',
  'AUDIT CAPABILITY',
  'USER JOB',
  'CURRENT GAP',
  'MISSING PRIMITIVE(S)',
  'DOMAIN IMPACT',
  'LOCAL-PERSISTENCE IMPACT',
  'CLOUD/SCHEMA IMPACT',
  'SYNC IMPACT',
  'SECURITY IMPACT',
  'ACTION/AUTONOMY IMPACT',
  'IMPLEMENTATION APPROACH',
  'STATUS',
];

function ledgerRegister() {
  const blocks = [];
  let current = null;
  for (const line of LEDGER) {
    const heading = /^### (FE-\d\d) — (.+)$/.exec(line);
    if (heading) {
      current = { id: heading[1], title: heading[2], fields: new Map() };
      blocks.push(current);
      continue;
    }
    if (/^## /.test(line)) current = null;
    if (!current) continue;
    const field = /^- ([A-Z][A-Z/() \-]+): (.*)$/.exec(line);
    if (field) current.fields.set(field[1], field[2]);
  }
  return blocks;
}

describe('B4-FOUNDATION-BUILDOUT-01 register reconciliation', () => {
  const matrix = auditMatrix();
  const expansion = matrix.filter((row) => row.klass === 'FOUNDATION EXPANSION REQUIRED');
  const register = ledgerRegister();

  test('the audit matrix has 39 rows and exactly 27 are FOUNDATION EXPANSION REQUIRED', () => {
    assert.equal(matrix.length, 39);
    assert.equal(expansion.length, 27);
    assert.equal(new Set(matrix.map((row) => row.num)).size, 39, 'no duplicate audit row numbers');
  });

  test('the register has exactly 27 rows, numbered FE-01..FE-27 with no gap', () => {
    assert.equal(register.length, 27);
    assert.deepEqual(register.map((block) => block.id), Array.from({ length: 27 }, (_, i) => `FE-${String(i + 1).padStart(2, '0')}`));
  });

  test('every audit expansion row maps to exactly one FE row, and no FE row maps to anything else', () => {
    const mapped = register.map((block) => Number(/#(\d+)/.exec(block.fields.get('AUDIT ROW') ?? '')?.[1]));
    assert.ok(mapped.every(Number.isInteger), 'every FE row must name an audit row');
    assert.equal(new Set(mapped).size, 27, 'no audit row is mapped twice');
    assert.deepEqual([...mapped].sort((a, b) => a - b), expansion.map((row) => row.num).sort((a, b) => a - b));
  });

  test('each FE row carries the audit capability it claims', () => {
    const byNum = new Map(matrix.map((row) => [row.num, row]));
    for (const block of register) {
      const num = Number(/#(\d+)/.exec(block.fields.get('AUDIT ROW'))?.[1]);
      const audit = byNum.get(num);
      const stated = (block.fields.get('AUDIT CAPABILITY') ?? '').replace(/\s*\(§\d+\)$/, '');
      const expected = audit.capability.replace(/\s*\(§\d+\)$/, '');
      assert.equal(stated, expected, `${block.id} must restate audit row #${num}`);
    }
  });

  test('every FE row records all thirteen required fields', () => {
    for (const block of register) {
      for (const field of FIELDS) {
        assert.ok(block.fields.has(field), `${block.id} is missing ${field}`);
        assert.ok((block.fields.get(field) ?? '').trim().length > 0, `${block.id} has an empty ${field}`);
      }
    }
  });

  test('row status uses only the defined progress states', () => {
    for (const block of register) {
      assert.ok(PROGRESS.includes(block.fields.get('STATUS')), `${block.id} has status "${block.fields.get('STATUS')}"`);
    }
  });

  test('the ledger never uses a row-state word outside the three final classifications', () => {
    const body = LEDGER.join('\n');
    for (const forbidden of ['PARTIAL', 'DEFERRED', 'RECLASSIFIED', 'OUT OF SCOPE']) {
      const rows = LEDGER.filter((line) => line.startsWith('- STATUS:') && line.includes(forbidden));
      assert.equal(rows.length, 0, `${forbidden} is not a row state`);
    }
    assert.ok(body.includes('ACCEPTED') && body.includes('EXTENSION') && body.includes('STOPPED'));
  });

  test('every governance ID referenced in the register is defined in the governance table', () => {
    const defined = new Set([...LEDGER.join('\n').matchAll(/^\| (B4-FE01-\d{3}) \|/gm)].map((m) => m[1]));
    assert.ok(defined.size >= 30, `expected the governance table to define the primitives, found ${defined.size}`);
    const used = new Set();
    for (const block of register) {
      const text = block.fields.get('MISSING PRIMITIVE(S)');
      for (const m of text.matchAll(/B4-FE01-(\d{3})(?:\.\.(\d{3}))?|-(\d{3})/g)) {
        const lo = Number(m[1] ?? m[3]);
        const hi = m[2] ? Number(m[2]) : lo;
        for (let n = lo; n <= hi; n += 1) used.add(`B4-FE01-${String(n).padStart(3, '0')}`);
      }
    }
    for (const id of used) assert.ok(defined.has(id), `${id} is used by the register but not defined`);
  });
});
