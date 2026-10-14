/**
 * SMART INBOX — LIVE PROVIDER EVALUATION. GATED. NOT RUN IN STAGE 1.
 *
 * This is the only thing in the repository that measures how well a real language model reads the evaluation corpus. The CI suite
 * (tests/premium/smartInboxEval.test.mjs) measures the deterministic local reader and the Premium pipeline over AUTHORED model outputs; it
 * says nothing about model accuracy. Until this script has been run and its numbers recorded, Smart Inbox accuracy is UNMEASURED.
 *
 * It calls a paid third-party API with the corpus text (agent-authored sample notes, no real household data). It therefore refuses to run
 * unless BOTH are set:
 *   GEMINI_API_KEY=<a key you are authorised to spend>
 *   SMART_INBOX_LIVE_EVAL=yes-spend-money
 * Optional: GEMINI_MODEL (default is the Edge Function's default).
 *
 *   node --import ./tests/support/register-ts.mjs scripts-dev/smart-inbox-live-eval.mjs
 *
 * It does NOT touch Supabase, RevenueCat, quotas or any household. It reports the same field-level precision/recall as the CI suite so the
 * two are directly comparable, over the competent-model scenarios only (adversarial fixtures script a model's misbehaviour and have no live
 * equivalent here). Output is printed; nothing is written to disk.
 */
import { buildExtractRequest, mapExtraction } from '../src/features/smart-inbox/smartInboxMap.ts';
import { RESPONSE_JSON_SCHEMA, SYSTEM_ROLES, buildPrompt, validateExtraction } from '../supabase/functions/_shared/premium/smartInbox/contract.ts';
import { createGeminiProvider } from '../supabase/functions/_shared/premium/smartInbox/geminiProvider.ts';
import { CORPUS } from '../tests/premium/smartInboxEval/corpus.mjs';
import { pct, scoreScenario, sumScores, summarise } from '../tests/premium/smartInboxEval/score.mjs';

if (process.env.SMART_INBOX_LIVE_EVAL !== 'yes-spend-money' || !process.env.GEMINI_API_KEY) {
  console.error('Refusing to run: this calls a paid API. Set GEMINI_API_KEY and SMART_INBOX_LIVE_EVAL=yes-spend-money. (Stage 1: NOT RUN.)');
  process.exit(2);
}

const TZ = 'America/New_York';
const CONTEXT = {
  nowMs: Date.parse('2026-09-16T14:00:00Z'),
  timeZone: TZ,
  today: '2026-09-16',
  children: [
    { id: 'kid-alexa', displayName: 'Alexa' },
    { id: 'kid-ayden', displayName: 'Ayden' },
  ],
  people: [],
  areas: [...SYSTEM_ROLES],
};

const provider = createGeminiProvider({ apiKey: process.env.GEMINI_API_KEY, model: process.env.GEMINI_MODEL ?? null });
const scenarios = CORPUS.filter((s) => !s.adversarial);
const rows = [];
let transportFailures = 0;
let invalid = 0;

for (const s of scenarios) {
  const { request, refs } = buildExtractRequest({ text: s.text, householdId: 'live-eval', idempotencyKey: `live-eval-${s.id}`, context: CONTEXT });
  const prompt = buildPrompt(request);
  const out = await provider.extract({ system: prompt.system, user: prompt.user, schema: RESPONSE_JSON_SCHEMA, deadlineMs: 20_000 });
  if (!out.ok) {
    transportFailures += 1;
    console.error(`${s.id}: provider ${out.kind}`);
    continue;
  }
  const validated = validateExtraction(out.text, request);
  if (!validated.ok) {
    invalid += 1;
    console.error(`${s.id}: invalid output (${validated.reason})`);
    continue;
  }
  const result = mapExtraction({ extraction: validated.extraction, text: s.text, context: CONTEXT, refs, existing: [], captureId: s.id });
  rows.push(scoreScenario(s, result, TZ));
}

const summary = summarise(sumScores(rows));
const f = summary.fieldAccuracy;
console.log(`LIVE smart-inbox evaluation: ${rows.length}/${scenarios.length} scenarios scored (${transportFailures} provider failures, ${invalid} invalid outputs)`);
console.log(`items: precision ${pct(summary.itemPrecision)}  recall ${pct(summary.itemRecall)}`);
console.log(`fields: ${Object.keys(f).map((k) => `${k}=${pct(f[k].accuracy)} (wrong ${f[k].wrong}, invented ${f[k].invented}, missed ${f[k].missed})`).join('  ')}`);
console.log(`asks-when-she-should: ${pct(summary.askRecall)}  guesses-instead-of-asking: ${summary.guessesInsteadOfAsking}`);
console.log(`unsupported flagged: ${pct(summary.unsupportedRecall)}  unsupported extra: ${summary.unsupportedExtra}`);
