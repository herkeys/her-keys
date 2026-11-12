import { onboardingLabels } from '../../data/catalog/onboardingOptions';

/**
 * THE FIRST STEP.
 *
 * A household that has nothing in it yet has nothing for Her Keys to be intelligent about, and an empty dashboard is not a
 * first benefit. This chooses the ONE thing worth doing first, from two inputs only:
 *
 *   - what the household actually holds (a count of each kind of entry, and whether she has already told Her Keys something), and
 *   - what she herself picked in the Life Systems Audit (stored option ids).
 *
 * It is a pure, deterministic function of those inputs. It invents nothing: the only personal fact it can repeat is the exact
 * wording of an audit answer she chose, said as hers ("You told us ..."). It never reads an answer as a conclusion about her
 * life, never claims what Her Keys has noticed, and says nothing at all about a household that already has entries — from the
 * first entry on, Today's own briefing leads and this step is gone.
 */

export type FirstStepKind = 'review_inbox' | 'talk_it_out' | 'add_event' | 'add_task';

/** Each is an existing screen. Choosing a step navigates; it mutates nothing. */
export type FirstStepRoute = '/talk-it-out' | '/event-editor' | '/task-editor' | '/life/inbox';

export interface FirstStepOption {
  kind: FirstStepKind;
  label: string;
  route: FirstStepRoute;
}

export interface FirstStepHousehold {
  origin: 'demo' | 'empty';
  eventCount: number;
  taskCount: number;
  needsMeCount: number;
  /**
   * Captures she has made with Talk It Out that still wait for her decision (the Life Inbox). `null` while that is not yet known —
   * which is treated as none, never as a reason to hold the step back.
   */
  inboxOpenCount: number | null;
}

export interface FirstStepInput {
  household: FirstStepHousehold;
  /**
   * Stored struggle option ids from the audit, in the order she chose them. Unknown ids are ignored. Goals and strengths are
   * deliberately not inputs: nothing about a goal says what to do first, and guessing one would be inventing a fact.
   */
  struggleIds: readonly string[];
}

export interface FirstStep extends FirstStepOption {
  title: string;
  body: string;
  /** What she told us that this rests on, in her own audit wording — or `null` when nothing she chose decided it. */
  reason: string | null;
  /** The other ways in, in a fixed order. Never includes the step itself. */
  alternatives: FirstStepOption[];
}

const OPTIONS: Record<FirstStepKind, FirstStepOption> = {
  review_inbox: { kind: 'review_inbox', label: 'Open your Life Inbox', route: '/life/inbox' },
  talk_it_out: { kind: 'talk_it_out', label: 'Talk it out', route: '/talk-it-out' },
  add_event: { kind: 'add_event', label: 'Add an event', route: '/event-editor' },
  add_task: { kind: 'add_task', label: 'Add a task', route: '/task-editor' },
};

/** The other ways in, always in this order. Reviewing the inbox is only ever a primary step, never an alternative. */
const ALTERNATIVE_ORDER: readonly FirstStepKind[] = ['talk_it_out', 'add_task', 'add_event'];

/**
 * Which first step each audit struggle points at. Keyed by the stable option id (never the wording).
 *
 * Only a calendar struggle points at the calendar: Her Keys cannot say anything about an overfull or unrealistic week until
 * it can see some of it. Every other struggle points at Talk It Out, which needs no structure from her — the same thing the
 * audit already promised ("You don’t need to know what’s wrong").
 */
const STRUGGLE_FIRST_STEP: Readonly<Record<string, 'talk_it_out' | 'add_event'>> = {
  overcommitting: 'add_event',
  'unrealistic-calendars': 'add_event',
  'paperwork-piling-up': 'talk_it_out',
  'financial-avoidance': 'talk_it_out',
  'last-minute-meals': 'talk_it_out',
  'frozen-when-overloaded': 'talk_it_out',
};

const COPY: Record<FirstStepKind, { title: string; body: string }> = {
  review_inbox: {
    title: 'You’ve already told Her Keys something',
    body: 'Decide what to do with it. Nothing becomes part of your day until you say so.',
  },
  talk_it_out: {
    title: 'Start with what’s on your mind',
    body: 'Tell Her Keys what’s going on, in your own words. You don’t need to know what kind of problem it is.',
  },
  add_event: {
    title: 'Start with one thing on your calendar',
    body: 'Her Keys can only help with your week once it can see some of it. Add one thing you already have planned.',
  },
  add_task: {
    title: 'Start with one thing to do',
    body: 'Add one thing you need to get done, and Her Keys can start from there.',
  },
};

/** Whether the household holds anything she put there. A household in demo mode is never a blank one. */
export function isBlankHousehold(household: FirstStepHousehold): boolean {
  return household.origin === 'empty' && household.eventCount === 0 && household.taskCount === 0 && household.needsMeCount === 0;
}

export function chooseFirstStep(input: FirstStepInput): FirstStep | null {
  if (!isBlankHousehold(input.household)) return null;

  const waiting = input.household.inboxOpenCount ?? 0;
  if (waiting > 0) return build('review_inbox', null);

  // The first struggle she chose that points somewhere decides. Her own order is the only tie-break; nothing is ranked behind her back.
  const decisive = input.struggleIds.find((id) => Object.hasOwn(STRUGGLE_FIRST_STEP, id));
  if (decisive === undefined) return build('talk_it_out', null);

  const [label] = onboardingLabels('struggles', [decisive]);
  return build(STRUGGLE_FIRST_STEP[decisive], label === undefined ? null : `You told us “${label}” is where things tend to break down.`);
}

function build(kind: FirstStepKind, reason: string | null): FirstStep {
  return {
    ...OPTIONS[kind],
    ...COPY[kind],
    reason,
    alternatives: ALTERNATIVE_ORDER.filter((other) => other !== kind).map((other) => OPTIONS[other]),
  };
}
