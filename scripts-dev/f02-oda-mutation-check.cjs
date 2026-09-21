// HK-IR01 / Feature 02 - test-the-test for owner decision OD-A. Run from the repository root:  node scripts-dev/f02-oda-mutation-check.cjs
//
// Each mutant puts one of the ways her words could reach the cloud back, or removes one of the guards on a reading that arrived
// unnamed, and runs Feature 02's OWN tests. A surviving mutant is a regression test that proves nothing. Files are restored byte for
// byte; the script exits non-zero if anything survives, does not apply exactly once, or is not restored.
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = process.cwd();
const ACCOUNT = 'tests/talkItOutCapture.account.test.mjs';
const ROUNDTRIP = 'tests/talkItOutCapture.roundtrip.test.mjs';
const CAPTURE = 'src/features/talk-it-out/capture/';

const MUTANTS = [
  { id: 'F1', what: 'the sync projection sends a reading\'s own title before she accepts it',
    file: 'src/domain/sync/foundationProjection.ts', from: "if (kind === 'interpretation') out.title = titleForCloud(row as unknown as Interpretation);", to: '/* the derived title travels */', tests: [ACCOUNT, ROUNDTRIP] },
  { id: 'F2', what: 'a clarifying, rejected or superseded reading releases its title (only a pending one stays neutral)',
    file: 'src/domain/foundation/interpretation.ts', from: "reading.state === 'accepted' ? reading.title", to: "reading.state !== 'pending' ? reading.title", tests: [ACCOUNT, ROUNDTRIP] },
  { id: 'F3', what: 'the neutral label carries a slice of her title (quasi-verbatim)',
    file: 'src/domain/foundation/interpretation.ts', from: ': UNDECIDED_READING_TITLE[reading.proposedKind];', to: ': `${UNDECIDED_READING_TITLE[reading.proposedKind]}: ${reading.title.slice(0, 20)}`;', tests: [ACCOUNT] },
  { id: 'F4', what: 'the coordinator saves a reading that arrived unnamed (a row called "To-do to review")',
    file: `${CAPTURE}coordinator.ts`, from: "if (isUndecidedReadingTitle(reading.title)) return { kind: 'needs-title' };", to: '', tests: [ROUNDTRIP] },
  { id: 'F5', what: 'the card offers a save for a reading that arrived unnamed',
    file: `${CAPTURE}viewModel.ts`, from: "canAccept: reading.state === 'pending' && !isUndecidedReadingTitle(reading.title) &&", to: "canAccept: reading.state === 'pending' &&", tests: [ROUNDTRIP] },
  { id: 'F6', what: 'the card says nothing about why an unnamed reading cannot be saved',
    file: `${CAPTURE}viewModel.ts`, from: '    if (isUndecidedReadingTitle(reading.title)) notes.push(copy.review.titleNeeded);\n', to: '', tests: [ROUNDTRIP] },
];

function runTests(files) {
  try {
    const out = execFileSync('node', ['--import', './tests/support/register-ts.mjs', '--import', './tests/support/register-jsx.mjs', '--test', '--test-concurrency=1', ...files], { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 300000 });
    return { fail: Number(/ℹ fail (\d+)/.exec(out)?.[1] ?? NaN) };
  } catch (error) {
    return { fail: Number(/ℹ fail (\d+)/.exec(`${error.stdout ?? ''}`)?.[1] ?? 1) };
  }
}

let bad = 0;
for (const mutant of MUTANTS) {
  const target = path.join(ROOT, mutant.file);
  const original = fs.readFileSync(target, 'utf8');
  const crlf = original.includes('\r\n');
  const normalised = crlf ? original.replace(/\r\n/g, '\n') : original;
  if (normalised.split(mutant.from).length - 1 !== 1) {
    bad += 1;
    console.log(`${mutant.id}  DID NOT APPLY  ${mutant.what}`);
    continue;
  }
  if (process.env.DRY) {
    console.log(`${mutant.id}  applies exactly once`);
    continue;
  }
  const mutated = normalised.replace(mutant.from, () => mutant.to);
  fs.writeFileSync(target, crlf ? mutated.replace(/\n/g, '\r\n') : mutated);
  let result;
  try {
    result = runTests(mutant.tests);
  } finally {
    fs.writeFileSync(target, original);
  }
  const restored = fs.readFileSync(target, 'utf8') === original;
  const caught = result.fail !== 0;
  if (!caught || !restored) bad += 1;
  console.log(`${mutant.id}  ${caught ? 'CAUGHT   ' : 'SURVIVED '} (${String(result.fail).padStart(2)} failing)  ${mutant.what}${restored ? '' : '   !! NOT RESTORED'}`);
}
console.log(process.env.DRY ? '\ndry run' : `\n${MUTANTS.length - bad} caught, ${bad} survived / broken`);
process.exit(bad === 0 ? 0 : 1);
