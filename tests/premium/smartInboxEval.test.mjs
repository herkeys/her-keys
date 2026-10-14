import assert from 'node:assert/strict';
import { describe, test } from 'node:test';
import { buildExtractRequest, mapExtraction } from '../../src/features/smart-inbox/smartInboxMap.ts';
import { localInterpreter } from '../../src/features/talk-it-out/capture/port.ts';
import { SYSTEM_ROLES, validateExtraction } from '../../supabase/functions/_shared/premium/smartInbox/contract.ts';
import { DAY, MORNING, TZ } from '../support/fixtures.mjs';
import { CORPUS, modelOutputFor } from './smartInboxEval/corpus.mjs';
import { pct, scoreScenario, sumScores, summarise } from './smartInboxEval/score.mjs';

/**
 * Smart Inbox evaluation. READ THE PROVENANCE NOTE IN corpus.mjs: labels and "model outputs" are agent-authored. This suite measures
 *   LOCAL    — the deterministic Free reader against hand labels (a real measurement of that reader), and
 *   PIPELINE — the Premium server validator + client mapper over authored model outputs (fidelity and safety, NOT model accuracy).
 * Nothing here says how well a live model reads. That is `scripts-dev/smart-inbox-live-eval.mjs`, which has NOT been run.
 */

const CONTEXT = {
  nowMs: MORNING,
  timeZone: TZ,
  today: DAY,
  children: [
    { id: 'kid-alexa', displayName: 'Alexa' },
    { id: 'kid-ayden', displayName: 'Ayden' },
  ],
  people: [],
  areas: [...SYSTEM_ROLES],
};

const localResult = (s) => localInterpreter.interpret({ captureId: s.id, text: s.text, context: CONTEXT });

function pipelineResult(s) {
  const { request, refs } = buildExtractRequest({ text: s.text, householdId: 'h1', idempotencyKey: `smart-inbox-${s.id}`, context: CONTEXT });
  const validated = validateExtraction(modelOutputFor(s), request);
  assert.equal(validated.ok, true, `${s.id}: authored model output must be well-formed JSON of the right shape`);
  return mapExtraction({ extraction: validated.extraction, text: s.text, context: CONTEXT, refs, existing: [], captureId: s.id });
}

const run = (reader, scenarios = CORPUS) => {
  const rows = scenarios.map((s) => ({ s, score: scoreScenario(s, reader(s), TZ) }));
  return { rows, summary: summarise(sumScores(rows.map((r) => r.score))) };
};

function report(name, { summary }) {
  const f = summary.fieldAccuracy;
  const line = (k) => `${k}=${pct(f[k].accuracy)}(wrong ${f[k].wrong}, invented ${f[k].invented}, missed ${f[k].missed})`;
  console.log(
    [
      `\n[smart-inbox-eval] ${name} over ${CORPUS.length} scenarios`,
      `  items: precision ${pct(summary.itemPrecision)}  recall ${pct(summary.itemRecall)}`,
      `  fields: ${['kind', 'date', 'time', 'child', 'amount', 'direction'].map(line).join('  ')}`,
      `  asks-when-she-should: ${pct(summary.askRecall)}  guesses-instead-of-asking: ${summary.guessesInsteadOfAsking}`,
      `  unsupported flagged: ${pct(summary.unsupportedRecall)}  unsupported extra: ${summary.unsupportedExtra}`,
    ].join('\n'),
  );
}

describe('SI-EVAL — corpus integrity', () => {
  test('the corpus has at least 30 scenarios, unique ids, and every anchor is really in its text', () => {
    assert.ok(CORPUS.length >= 30, `${CORPUS.length} scenarios`);
    assert.equal(new Set(CORPUS.map((s) => s.id)).size, CORPUS.length);
    for (const s of CORPUS) for (const item of s.items) assert.ok(s.text.includes(item.anchor), `${s.id}: anchor not in text`);
  });

  test('it covers every group the product promises to handle, including adversarial model behaviour', () => {
    const groups = new Set(CORPUS.map((s) => s.group));
    for (const g of ['appointment', 'dated task', 'undated task', 'money', 'who', 'ambiguous day', 'unsupported', 'multi', 'nothing', 'adversarial']) assert.ok(groups.has(g), g);
  });
});

describe('SI-EVAL — LOCAL reader baseline (real measurement of the Free reader, against agent-authored labels)', () => {
  const local = run(localResult);
  test('prints the baseline', () => report('LOCAL reader (Free baseline)', local));

  test('regression floors on the baseline (floors, not quality claims)', () => {
    const s = local.summary;
    assert.ok(s.itemPrecision >= FLOORS.local.precision, `precision ${pct(s.itemPrecision)}`);
    assert.ok(s.itemRecall >= FLOORS.local.recall, `recall ${pct(s.itemRecall)}`);
  });
});

describe('SI-EVAL — Premium PIPELINE over authored model outputs (fidelity and safety, NOT model accuracy)', () => {
  const nonAdversarial = CORPUS.filter((s) => !s.adversarial);
  const clean = run(pipelineResult, nonAdversarial);
  const all = run(pipelineResult);

  test('prints the pipeline result', () => {
    report('PIPELINE, competent-model fixtures only', clean);
    report('PIPELINE, including adversarial fixtures', all);
  });

  test('a competent model answer survives the validator and mapper without loss or invention', () => {
    const s = clean.summary;
    assert.equal(s.itemPrecision, 1, 'no item invented by the pipeline');
    assert.equal(s.itemRecall, 1, 'no item lost by the pipeline');
    assert.equal(s.guessesInsteadOfAsking, 0);
    assert.equal(s.askRecall, 1);
    assert.equal(s.unsupportedRecall, 1);
    for (const f of ['kind', 'date', 'time', 'child', 'amount', 'direction']) assert.equal(s.fieldAccuracy[f].invented + s.fieldAccuracy[f].wrong, 0, `field ${f}`);
  });

  test('adversarial scenarios each end in the SAFE outcome (or are recorded as a known limit)', () => {
    for (const { s, score } of all.rows.filter((r) => r.s.adversarial)) {
      if (s.knownLimit) continue; // asserted separately below
      assert.equal(score.itemFP, 0, `${s.id}: an unlabelled item was produced`);
      assert.equal(score.itemFN, 0, `${s.id}: a labelled item was lost`);
      assert.equal(score.asks.guessed, 0, `${s.id}: guessed instead of asking`);
      assert.equal(score.asks.did, score.asks.should, `${s.id}: did not ask`);
    }
  });

  test('KNOWN LIMIT: a plausible invented time passes through to review — the pipeline cannot know it was never said', () => {
    const j4 = all.rows.find((r) => r.s.id === 'J4');
    assert.ok(j4.score.field.time.invented + j4.score.field.kind.wrong >= 1, 'if this starts passing, the limitation was fixed: update the register');
  });

  test('every produced proposal, from either reader, still requires her explicit review', () => {
    for (const s of CORPUS) for (const result of [localResult(s), pipelineResult(s)]) for (const p of result.proposals) assert.equal(p.requiresExplicitReview, true);
  });
});

/** Regression floors, taken from a measured run and rounded DOWN. They guard against regressions; they are not a quality claim. */
const FLOORS = { local: { precision: 0.75, recall: 0.9 } };
