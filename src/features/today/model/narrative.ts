import type { DailyLoadIssue } from '../../../domain/dailyLoadIssues';
import type { LoadTier } from '../../../domain/loadTier';
import type { LocalDate } from '../../../domain/logicalDay';
import type { DailyLoadDecision } from '../../../types';
import { formatTime } from '../../daily-load/computeDailyLoad';
import { capitalize, countWord } from './refs';

/**
 * THE ONE SEAM FOR FUTURE LANGUAGE SYNTHESIS.
 *
 * The pattern every Her Keys feature will follow when bounded LLM reasoning
 * arrives is:
 *
 *   TYPED FACTS -> DETERMINISTIC PRODUCT REASONING -> BOUNDED SYNTHESIS
 *     -> TYPED RESULT -> HER KEYS UI
 *
 * and never "the whole app state, tell her what to do". This file is the smallest
 * honest version of the synthesis step for Today: it accepts a few typed facts that
 * the deterministic reasoning has ALREADY established, and returns a typed result.
 * It cannot add a fact — the structure of the screen (which sections exist, what
 * they hold, what actions are offered) is decided before it runs and is not its
 * output. It returns prose for one slot, and that prose is never stored.
 *
 * Nothing here calls a model, holds a prompt, reads a secret or touches the
 * network. `deterministicNarrative` is the only provider, and it is what runs.
 */

export interface BriefingNarrativeInput {
  logicalDate: LocalDate;
  household: 'never_entered' | 'has_entries';
  /** What the existing deterministic day-state reading says, verbatim (`describeDayState`). */
  dayState: string;
  tier: LoadTier;
  /** The day's recorded decision, if she has made one. */
  decision: DailyLoadDecision | 'adjusted';
  /** The primary Daily Load issue, only while it is still live (not already behind her, not overdue-only). */
  liveIssue: Exclude<DailyLoadIssue['kind'], 'overdue'> | null;
  counts: { events: number; openTasks: number };
  /** The next commitment that has not yet ended. */
  next: { title: string; startMinutes: number } | null;
  /** How many first-level attention rows there are. */
  needsYou: number;
}

export interface BriefingNarrativeResult {
  headline: string;
}

export type BriefingNarrativeProvider = (input: BriefingNarrativeInput) => BriefingNarrativeResult;

/**
 * Calm, precise, operational. It states what is true and what the day asks; it does
 * not encourage, dramatize, or judge. "Your day fits" is said only when Daily Load
 * classifies the day as open — it is that classification, in words.
 */
export const deterministicNarrative: BriefingNarrativeProvider = (input) => ({ headline: headlineFor(input) });

function headlineFor(input: BriefingNarrativeInput): string {
  if (input.household === 'never_entered') return 'Nothing is on your list yet.';

  // A decision she has made, or a live timing / capacity issue: the existing verdict sentence, unchanged.
  if (input.decision === 'moved' || input.decision === 'kept' || input.decision === 'adjusted') return input.dayState;
  if (input.liveIssue !== null) return input.dayState;

  if (input.needsYou > 0) {
    return input.needsYou === 1 ? 'One thing needs you today.' : `${capitalize(countWord(input.needsYou))} things need you today.`;
  }

  const { events, openTasks } = input.counts;
  if (events > 0 || openTasks > 0) {
    if (input.next !== null) {
      const next = `Next up: ${input.next.title} at ${formatTime(input.next.startMinutes)}.`;
      return input.tier === 'open' ? `Your day fits. ${next}` : next;
    }
    if (events > 0) {
      if (openTasks === 0) return 'Nothing else is scheduled today.';
      return `Nothing else is scheduled. ${openTasks === 1 ? 'One task is' : `${capitalize(countWord(openTasks))} tasks are`} still open.`;
    }
    return openTasks === 1 ? 'One task is on your list today.' : `${capitalize(countWord(openTasks))} tasks are on your list today.`;
  }

  return 'Your day looks light so far.';
}
