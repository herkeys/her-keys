#!/usr/bin/env node
/**
 * HK-OCR-ASSIST — test-the-test: does each critical OCR Assist guarantee actually FAIL when it is broken?
 *
 *   node scripts-dev/ocr-assist-mutation-check.cjs              run every mutant
 *   node scripts-dev/ocr-assist-mutation-check.cjs OCR7 OCR11   run some
 *   DRY=1 node scripts-dev/ocr-assist-mutation-check.cjs        only check that every patch still applies to exactly one place
 *
 * Same method as `scripts-dev/life-admin-mutation-check.cjs`: each mutant breaks ONE thing in real source (a text patch that must
 * match exactly once), runs the tests that guard it, and requires a GENUINE assertion failure (a crash or an unparseable run is
 * BROKEN, not caught). It refuses to mutate a file with uncommitted changes and verifies the byte-for-byte restore. Mutant code is
 * never committed. The remaining required mutants (bypass confirmation, ai-inference provenance, raw-text persistence, a cloud
 * OCR call, transient image reaching AppState/sync) are proven by `tests/lifeAdmin/ocrArchitectureGuard.test.mjs` instead: they
 * are static-import guarantees, not behaviors a source patch here would meaningfully exercise.
 */
'use strict';
const { spawnSync, execFileSync } = require('node:child_process');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { pathToFileURL } = require('node:url');

const ROOT = path.resolve(__dirname, '..');
const T = (name) => `tests/lifeAdmin/${name}.test.mjs`;
const REVIEW = 'src/features/lifeAdmin/OcrReviewScreen.tsx';
const EXTRACT = 'src/features/lifeAdmin/ocrExtract.ts';

const MUTANTS = [
  { id: 'OCR5', guards: 'cancelling the scan saves nothing', what: 'Discard this scan also hands back values, as if she had confirmed',
    file: REVIEW, from: '<Button label={COPY.cancelScan} variant="ghost" onPress={onCancel} accessibilityHint={COPY.cancelScanHint} />',
    to: '<Button label={COPY.cancelScan} variant="ghost" onPress={() => { onUseValues({}); onCancel(); }} accessibilityHint={COPY.cancelScanHint} />',
    tests: [T('ocrReview')] },
  { id: 'OCR7', guards: 'nearby "Expires" text never auto-assigns the expiration field', what: 'the field she never touched is pre-filled from a date whose context says "Expires"',
    file: REVIEW, from: 'const [assignment, setAssignment] = useState<OcrAssignment>(EMPTY_OCR_ASSIGNMENT);',
    to: "const [assignment, setAssignment] = useState<OcrAssignment>(() => ({ ...EMPTY_OCR_ASSIGNMENT, expiresOn: candidate.dates.find((d) => (d.context ?? '').includes('Expires'))?.date ?? null }));",
    tests: [T('ocrReview')] },
  { id: 'OCR8', guards: 'ambiguous dates are never auto-picked to the earliest', what: 'the expiration field is pre-filled with the earliest candidate date',
    file: REVIEW, from: 'const [assignment, setAssignment] = useState<OcrAssignment>(EMPTY_OCR_ASSIGNMENT);',
    to: "const [assignment, setAssignment] = useState<OcrAssignment>(() => ({ ...EMPTY_OCR_ASSIGNMENT, expiresOn: [...candidate.dates].map((d) => d.date).sort()[0] ?? null }));",
    tests: [T('ocrReview')] },
  { id: 'OCR9', guards: 'ambiguous dates are never auto-picked to the first recognized', what: 'the expiration field is pre-filled with the first-read candidate date',
    file: REVIEW, from: 'const [assignment, setAssignment] = useState<OcrAssignment>(EMPTY_OCR_ASSIGNMENT);',
    to: "const [assignment, setAssignment] = useState<OcrAssignment>(() => ({ ...EMPTY_OCR_ASSIGNMENT, expiresOn: candidate.dates[0]?.date ?? null }));",
    tests: [T('ocrReview')] },
  { id: 'OCR10', guards: 'a name candidate never auto-populates the issuer field', what: 'the issuer text starts pre-filled with the first recognized name-like line',
    file: REVIEW, from: "const [issuerText, setIssuerText] = useState('');",
    to: "const [issuerText, setIssuerText] = useState(candidate.issuers[0]?.text ?? '');",
    tests: [T('ocrReview')] },
  { id: 'OCR11', guards: 'a sensitive reference candidate stays masked until Reveal', what: 'the reference chip shows the value in full before Reveal is tapped',
    file: REVIEW, from: 'const shown = revealedReference.has(c.text) ? c.text : (maskReference(c.text) ?? c.text);',
    to: 'const shown = c.text;',
    tests: [T('ocrReview')] },
  { id: 'OCR12', guards: 'multiple recognized dates are all offered', what: 'only the first recognized date candidate survives extraction',
    file: EXTRACT, from: '    out.push({ date: m.iso, context: contextAround(recognizedText, m.index, m.length) });\n    if (out.length >= MAX_DATE_CANDIDATES) break;\n  }\n  return out;',
    to: '    out.push({ date: m.iso, context: contextAround(recognizedText, m.index, m.length) });\n    if (out.length >= MAX_DATE_CANDIDATES) break;\n  }\n  return out.slice(0, 1);',
    tests: [T('ocrExtract')] },
  { id: 'OCR13', guards: 'manual entry is never blocked from the review screen', what: 'the "Enter manually" action on the review screen is wired to do nothing',
    file: REVIEW, from: '<Button label={COPY.enterManuallyInstead} variant="secondary" onPress={onManualEntry} />',
    to: '<Button label={COPY.enterManuallyInstead} variant="secondary" onPress={() => {}} />',
    tests: [T('ocrReview')] },
  { id: 'OCR14', guards: 'a candidate date carries a real accessibility state, not just a visual difference', what: 'the unconfirmed announcement is removed from a candidate date, leaving only its plain visible text',
    file: REVIEW, from: 'accessibilityLabel={COPY.unconfirmedCandidate(recordDateLong(d.date))}',
    to: '',
    tests: [T('ocrReview')] },
];

const git = (...args) => execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' });
const sha = (buffer) => crypto.createHash('sha256').update(buffer).digest('hex');
const imports = ['register-ts.mjs', 'register-jsx.mjs'].flatMap((f) => ['--import', pathToFileURL(path.join(ROOT, 'tests', 'support', f)).href]);

function runTests(files) {
  const run = spawnSync(process.execPath, [...imports, '--test', '--test-concurrency=1', ...files], { cwd: ROOT, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024, timeout: 900000 });
  const out = `${run.stdout ?? ''}${run.stderr ?? ''}`;
  const pass = Number((out.match(/# pass (\d+)/) ?? [])[1]);
  const fail = Number((out.match(/# fail (\d+)/) ?? [])[1]);
  return { out, pass, fail, parsed: Number.isFinite(pass) && Number.isFinite(fail), assertion: /AssertionError/.test(out) };
}

function verdictOf(result) {
  if (!result.parsed || result.pass + result.fail === 0) return ['BROKEN', 'the run produced no parseable test result'];
  if (result.fail === 0) return ['SURVIVED', `${result.pass} passed, 0 failed`];
  if (!result.assertion) return ['BROKEN', `${result.fail} failed but none by assertion (a crash, not a caught mutant)`];
  return ['CAUGHT', `${result.fail} failed, ${result.pass} passed`];
}

function patch(mutant) {
  const file = path.join(ROOT, mutant.file);
  const original = fs.readFileSync(file);
  const text = original.toString('utf8');
  const crlf = text.includes('\r\n');
  const normal = text.replace(/\r\n/g, '\n');
  const count = normal.split(mutant.from).length - 1;
  if (count !== 1) return { error: `patch matches ${count} places (must be exactly 1)` };
  const mutated = normal.replace(mutant.from, () => mutant.to);
  return { original, next: Buffer.from(crlf ? mutated.replace(/\n/g, '\r\n') : mutated, 'utf8'), file };
}

function runMutant(mutant) {
  const rel = mutant.file.replace(/\\/g, '/');
  if (git('status', '--porcelain', '--', rel).trim() !== '') return ['BROKEN', `${rel} has uncommitted changes; commit before mutating`];
  const prepared = patch(mutant);
  if (prepared.error) return ['BROKEN', prepared.error];
  if (process.env.DRY) return ['READY', 'patch applies exactly once'];
  fs.writeFileSync(prepared.file, prepared.next);
  try {
    return verdictOf(runTests(mutant.tests));
  } finally {
    fs.writeFileSync(prepared.file, prepared.original);
    if (sha(fs.readFileSync(prepared.file)) !== sha(prepared.original)) {
      console.error(`FATAL: ${rel} was not restored byte for byte; run git checkout -- ${rel}`);
      process.exit(2);
    }
  }
}

const wanted = process.argv.slice(2);
const chosen = MUTANTS.filter((m) => wanted.length === 0 || wanted.includes(m.id));
const rows = [];
for (const mutant of chosen) {
  process.stdout.write(`${mutant.id.padEnd(6)} ${mutant.guards.padEnd(56)} `);
  const [verdict, detail] = runMutant(mutant);
  rows.push({ id: mutant.id, guards: mutant.guards, what: mutant.what, verdict, detail });
  console.log(`${verdict.padEnd(9)} ${detail}`);
}
const bad = rows.filter((r) => !['CAUGHT', 'READY'].includes(r.verdict));
const caught = rows.filter((r) => r.verdict === 'CAUGHT').length;
console.log(`\n${process.env.DRY ? `${rows.length - bad.length} / ${rows.length} patches ready` : `${caught} / ${rows.length} mutants caught`}${bad.length ? `; NOT caught: ${bad.map((r) => `${r.id} (${r.verdict})`).join(', ')}` : ''}`);
process.exit(bad.length === 0 ? 0 : 1);
