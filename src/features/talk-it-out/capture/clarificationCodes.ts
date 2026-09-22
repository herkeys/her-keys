import { OPEN_CODE_PATTERN } from '../../../domain/schemaPrimitives';
import type { ClarificationStep } from './types';

/**
 * The durable form of a clarification.
 *
 * The foundation stores a clarification as ONE open code on the reading (`which_child`, `which_day`) —
 * "the vocabulary that is actually understood lives in TypeScript". This module is that vocabulary.
 *
 *   which_child                 — which of her children is meant
 *   which_day                   — today or tomorrow (a time that has already passed today)
 *   which_day.fri               — which Friday (weekday-qualified)
 *   which_money_direction       — is the amount owed by her or owed to her
 *
 * Several open questions on one reading are joined with `-` and asked in order, one at a time, so a
 * reading needing a child AND a day is `which_child-which_day.fri`. The questions are a function of the
 * DURABLE reading (its typed fields and creation time) and never of her raw words, which is what lets an
 * app restart resume a question without the wording. There are at most three distinct steps, which also
 * bounds the clarification loop by construction.
 */

const WEEKDAY_TOKENS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

export const MAX_CLARIFICATION_STEPS = 3;

function formatStep(step: ClarificationStep): string {
  switch (step.kind) {
    case 'which_child':
      return 'which_child';
    case 'which_money_direction':
      return 'which_money_direction';
    case 'which_day':
      return step.weekday === null ? 'which_day' : `which_day.${WEEKDAY_TOKENS[step.weekday]}`;
  }
}

function parseStep(token: string): ClarificationStep | null {
  if (token === 'which_child') return { kind: 'which_child' };
  if (token === 'which_money_direction') return { kind: 'which_money_direction' };
  if (token === 'which_day') return { kind: 'which_day', weekday: null };
  const match = /^which_day\.([a-z]{3})$/.exec(token);
  if (match) {
    const weekday = (WEEKDAY_TOKENS as readonly string[]).indexOf(match[1]);
    return weekday === -1 ? null : { kind: 'which_day', weekday };
  }
  return null;
}

/** The durable code for an ordered list of open questions. */
export function formatClarificationCode(steps: readonly ClarificationStep[]): string {
  if (steps.length === 0 || steps.length > MAX_CLARIFICATION_STEPS) throw new RangeError('a clarification has one to three steps');
  const code = steps.map(formatStep).join('-');
  if (!OPEN_CODE_PATTERN.test(code)) throw new RangeError('clarification code is not a valid open code');
  return code;
}

/**
 * The open questions a stored code names, or null when it is a code this build does not understand.
 * An unknown code is still stored and read back intact by the foundation; it is simply not acted on here,
 * and the reading stays unresolved rather than being guessed at.
 */
export function parseClarificationCode(code: string): [ClarificationStep, ...ClarificationStep[]] | null {
  const parts = code.split('-');
  if (parts.length === 0 || parts.length > MAX_CLARIFICATION_STEPS) return null;
  const steps: ClarificationStep[] = [];
  for (const part of parts) {
    const step = parseStep(part);
    if (step === null) return null;
    steps.push(step);
  }
  return steps as [ClarificationStep, ...ClarificationStep[]];
}
