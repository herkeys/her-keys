import { epochMsOf, logicalDateAt } from '../../../src/domain/logicalDay.ts';
import { CHILDREN } from './corpus.mjs';

/** Field-level scoring of produced proposals against hand labels. Pure; no I/O. */

const NAME_OF = Object.fromEntries(Object.entries(CHILDREN).map(([name, id]) => [id, name]));

function minutesOfDay(instant, tz) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour: 'numeric', minute: 'numeric', hourCycle: 'h23' }).formatToParts(new Date(epochMsOf(instant)));
  const get = (type) => Number(parts.find((p) => p.type === type).value);
  return get('hour') * 60 + get('minute');
}

/** What a produced proposal says, in label vocabulary. */
export function signatureOf(p, tz) {
  const isTimed = p.kind === 'event' && p.startsAt;
  return {
    kind: p.kind,
    // While "which day?" is open the day is a placeholder, not something she said.
    date: (p.clarification?.steps ?? []).some((s) => s.kind === 'which_day') ? null : isTimed ? logicalDateAt(epochMsOf(p.startsAt), tz) : p.dueDate,
    time: isTimed ? minutesOfDay(p.startsAt, tz) : null,
    child: p.subjectMemberId ? (NAME_OF[p.subjectMemberId] ?? '?') : null,
    amount: p.value ? (p.value.amountMinor / 100).toFixed(2) : null,
    direction: p.value ? p.value.direction : null,
    asks: (p.clarification?.steps ?? []).map((s) => s.kind),
  };
}

const FIELDS = ['kind', 'date', 'time', 'child', 'amount', 'direction'];

/** A produced item is "about" an expected item when its source span covers the anchor's start. */
function aboutAnchor(text, produced, expected) {
  const at = text.indexOf(expected.anchor);
  if (at < 0) return false;
  const { start, end } = produced.span;
  // the produced clause and the anchor overlap
  return start < at + expected.anchor.length && end > at;
}

/**
 * Score one scenario's produced result.
 * Returns counts that sum into corpus-level precision / recall:
 *   itemTP/itemFP/itemFN  — a pairing counts as TP only when the KIND agrees as well
 *   field[f] {correct, wrong, invented, missed} — over PAIRED items only. "invented" = she did not say it but a value was produced.
 *   asks {should, did, guessed} — questions she should have been asked, and guesses made instead
 *   unsupported {should, did, extra}
 */
export function scoreScenario(scenario, result, tz) {
  const produced = result.proposals.map((p) => ({ p, sig: signatureOf(p, tz), span: p.span }));
  const expected = scenario.items;
  const used = new Set();
  const pairs = [];
  for (const exp of expected) {
    const idx = produced.findIndex((pr, i) => !used.has(i) && aboutAnchor(scenario.text, pr, exp));
    if (idx >= 0) {
      used.add(idx);
      pairs.push({ exp, got: produced[idx] });
    }
  }

  const out = { itemTP: 0, itemFP: 0, itemFN: 0, field: {}, asks: { should: 0, did: 0, guessed: 0 }, unsupported: { should: 0, did: 0, extra: 0 } };
  for (const f of FIELDS) out.field[f] = { correct: 0, wrong: 0, invented: 0, missed: 0 };

  for (const { exp, got } of pairs) {
    if (got.sig.kind === exp.kind) out.itemTP += 1;
    else {
      out.itemFP += 1;
      out.itemFN += 1;
    }
    for (const f of FIELDS) {
      // A typed amount only exists once its direction is known; until she answers, the amount lives in the title and the value is empty.
      const want = f === 'amount' && exp.asks.includes('which_money_direction') ? null : (exp[f] ?? null);
      const have = got.sig[f] ?? null;
      if (want === have) out.field[f].correct += 1;
      else if (want === null && have !== null) out.field[f].invented += 1;
      else if (want !== null && have === null) out.field[f].missed += 1;
      else out.field[f].wrong += 1;
    }
    // Asking: every expected question must be asked; a value produced where a question was due is a GUESS.
    for (const q of exp.asks) {
      out.asks.should += 1;
      if (got.sig.asks.includes(q)) out.asks.did += 1;
      const guessField = { which_day: 'date', which_child: 'child', which_money_direction: 'direction' }[q];
      if (got.sig[guessField] !== null && exp[guessField] === null) out.asks.guessed += 1;
    }
  }
  out.itemFP += produced.length - used.size;
  out.itemFN += expected.length - pairs.length;

  const wantReasons = scenario.unsupported ?? [];
  const gotReasons = result.unsupported.map((u) => u.reason);
  out.unsupported.should = wantReasons.length;
  out.unsupported.did = wantReasons.filter((r) => gotReasons.includes(r)).length;
  out.unsupported.extra = gotReasons.filter((r) => !wantReasons.includes(r)).length;
  return out;
}

export function sumScores(scores) {
  const total = { itemTP: 0, itemFP: 0, itemFN: 0, field: {}, asks: { should: 0, did: 0, guessed: 0 }, unsupported: { should: 0, did: 0, extra: 0 } };
  for (const f of FIELDS) total.field[f] = { correct: 0, wrong: 0, invented: 0, missed: 0 };
  for (const s of scores) {
    total.itemTP += s.itemTP;
    total.itemFP += s.itemFP;
    total.itemFN += s.itemFN;
    for (const f of FIELDS) for (const k of Object.keys(total.field[f])) total.field[f][k] += s.field[f][k];
    for (const k of Object.keys(total.asks)) total.asks[k] += s.asks[k];
    for (const k of Object.keys(total.unsupported)) total.unsupported[k] += s.unsupported[k];
  }
  return total;
}

const ratio = (a, b) => (b === 0 ? null : a / b);

export function summarise(total) {
  const fieldAccuracy = {};
  for (const f of FIELDS) {
    const c = total.field[f];
    const n = c.correct + c.wrong + c.invented + c.missed;
    fieldAccuracy[f] = { accuracy: ratio(c.correct, n), invented: c.invented, wrong: c.wrong, missed: c.missed, n };
  }
  return {
    itemPrecision: ratio(total.itemTP, total.itemTP + total.itemFP),
    itemRecall: ratio(total.itemTP, total.itemTP + total.itemFN),
    askRecall: ratio(total.asks.did, total.asks.should),
    guessesInsteadOfAsking: total.asks.guessed,
    unsupportedRecall: ratio(total.unsupported.did, total.unsupported.should),
    unsupportedExtra: total.unsupported.extra,
    fieldAccuracy,
  };
}

export const pct = (x) => (x === null ? 'n/a' : `${(x * 100).toFixed(1)}%`);
