import type { AssumptionCode, ClarificationStep, InterpretationFailureCode, ProposalKind, UnsupportedReason } from './types';

/**
 * ALL operational copy for Talk It Out capture and the Life Inbox, in one reviewable place.
 *
 * Tone: attentive, calm, concise, practical, respectful. Not therapy, coaching, cutesy or enthusiastic.
 * No exclamation marks, no emoji, no reassurance ("don't worry"), no praise. Where Her Keys does not know,
 * it says what it does not know. `copyCorpus()` lists every string so a test can audit tone mechanically.
 */

const KIND_LABEL: Record<ProposalKind, string> = {
  event: 'Appointment',
  task: 'To-do',
  needsMe: 'A note for you',
};

const ASSUMPTION: Record<AssumptionCode, string> = {
  'end-time-assumed': 'You didn’t say how long it lasts, so I assumed 30 minutes.',
  'meridiem-assumed': 'You didn’t say AM or PM, so I assumed the time shown.',
  'date-assumed-today': 'You didn’t say which day, so I assumed today.',
  'date-rolled-forward': 'That date has already passed this year, so I used next year’s.',
  'hedged-language': 'You weren’t sure about this one.',
  'title-shortened': 'I shortened the title. Your full words are kept only while the app is open.',
  'multiple-children-no-single-subject': 'You named more than one child, so this isn’t tied to a single child.',
  'amount-direction-unknown': 'You didn’t say whether you pay this or are owed it, so I didn’t record the amount as money.',
};

const UNSUPPORTED: Record<Exclude<UnsupportedReason, 'responsibility-handoff'>, string> = {
  'change-to-existing-item': 'This changes something that already exists. I can’t update existing items yet, so I kept it as a note.',
  recurrence: 'This repeats. I can’t set up repeating items here, so I kept it as a note.',
  'multiple-dates': 'There is more than one date in this, so I kept it as a note instead of choosing one.',
  'multiple-times': 'There is more than one time in this, so I kept it as a note instead of choosing one.',
  'multiple-amounts': 'There is more than one amount in this, so I kept it as a note instead of choosing one.',
  'foreign-currency': 'This has an amount that isn’t in dollars. I don’t convert currencies, so I kept it as a note.',
  'clause-limit': 'That was a lot at once. I read the first part; the rest isn’t turned into anything.',
  'context-only': 'Part of what you said isn’t something I can turn into a task or an appointment. I left it as it is.',
};

const FAILURE: Record<InterpretationFailureCode, string> = {
  'nothing-recognized': 'I couldn’t turn that into anything specific, so nothing is saved from it. It stays in your Life Inbox until you decide.',
  'over-processing-limit': 'That is longer than I can read in one go. I haven’t read any of it. You can send it in shorter parts.',
  'high-stakes': 'That sounds important. I haven’t turned it into tasks or reminders, and I haven’t shared it with anyone.',
  empty: 'There is nothing to send.',
  'answer-not-understood': 'I didn’t catch that.',
};

export const copy = {
  composer: {
    placeholderFirst: 'What’s going on?',
    placeholderAnswer: 'Or answer in your own words…',
    disclaimer: 'Nothing here changes your household until you approve it.',
    startOver: 'Start over',
    send: 'Send',
    accessibilityLabel: 'Message to Her Keys',
  },

  capture: {
    understood: 'Here is what I understood. Nothing is saved until you say so.',
    understoodNothingSafe: 'I kept what you wrote, but I haven’t turned any of it into something to save.',
    keptForLater: 'Decide later',
    keptForLaterHint: 'Leaves this in your Life Inbox',
    notSaved: 'That couldn’t be saved, so nothing was changed. You can try sending it again.',
    failure: (code: InterpretationFailureCode): string => FAILURE[code],
  },

  review: {
    sourceLabel: 'What you said',
    sourceExpand: 'Show all',
    sourceCollapse: 'Show less',
    sourceUnavailable: 'The exact words aren’t kept after the app closes. What Her Keys understood is still here.',
    revised: 'Revised from an earlier reading.',
    checkDetails: 'Her Keys read these details from your words. Check the day and time before you save it.',
    sourceFromTalk: 'From what you told Her Keys',
    kind: (kind: ProposalKind, hasDate: boolean): string => (kind === 'needsMe' && hasDate ? 'A dated note' : KIND_LABEL[kind]),
    fieldWhat: 'What',
    fieldWhen: 'When',
    fieldDue: 'Due',
    fieldDate: 'Date',
    fieldAmount: 'Amount',
    fieldFor: 'For',
    fieldArea: 'Area',
    noChild: 'Not tied to one child',
    savedAs: (kind: ProposalKind): string => `Saved as ${kind === 'event' ? 'an appointment' : kind === 'task' ? 'a to-do' : 'a note that needs you'}.`,
    rejected: 'Not saved.',
    assumption: (code: AssumptionCode): string => ASSUMPTION[code],
    unsupported: (reason: Exclude<UnsupportedReason, 'responsibility-handoff'>): string => UNSUPPORTED[reason],
    handoff: (name: string): string => `I haven’t recorded that ${name} is handling this, and I haven’t contacted them.`,
    handoffKnown: (name: string): string => `${name} is in your household. I haven’t recorded that they are handling this, and I haven’t contacted them.`,
    childOpen: 'This is about one of your children, so it can’t be saved until I know which.',
    areaPrompt: 'Which area is this?',
    areaNeeded: 'Choose an area so it can be saved.',
    whyEvidence: (excerpt: string, what: string): string => `You wrote “${excerpt}”, which I read as the ${what}.`,
    whyArea: (area: string): string => `The words point to your ${area} area.`,
    whyDirection: 'You included words that say which way the money goes.',
    whyDurable: (received: string): string => `Read from what you told Her Keys ${received}.`,
    whatLabels: { date: 'day', time: 'time', duration: 'length', amount: 'amount', child: 'child', direction: 'direction', area: 'area', kind: 'kind' } as const,
    accept: 'Save it like that',
    reject: 'That’s not it',
    fix: 'Fix it',
  },

  clarify: {
    which_child: 'Which child do you mean?',
    which_day: (weekdayName: string | null): string => (weekdayName === null ? 'Do you mean today or tomorrow?' : `Which ${weekdayName} do you mean?`),
    which_money_direction: 'Is this something you pay, or something you are owed?',
    optionNoChild: 'Neither. It isn’t about a child',
    optionPay: 'I pay it',
    optionOwed: 'It’s owed to me',
    optionToday: (label: string): string => `Today (${label})`,
    optionTomorrow: (label: string): string => `Tomorrow (${label})`,
    optionDate: (label: string): string => label,
    answerPlaceholder: 'Or say it in your own words…',
    notUnderstood: 'I didn’t catch that. You can choose one of the options.',
    exhausted: 'I’m not getting this one. You can fix it yourself, or leave it in your Life Inbox.',
    remaining: (count: number): string => (count === 1 ? 'One more question after this.' : `${count} more questions after this.`),
    step: (step: ClarificationStep['kind']): string => step,
  },

  fix: {
    title: 'Fix what I understood',
    sayIt: 'Or tell me what to change',
    sayItPlaceholder: 'For example: no, I meant next Friday at 4',
    apply: 'Change it',
    cancel: 'Cancel',
    notUnderstood: 'I didn’t catch that. Try a day, a time, an amount or a name.',
    exhausted: 'I’m not getting this one. Use the choices above, or leave it as it is.',
    saved: 'Changed. Nothing is saved as a real item until you approve it.',
    cannot: 'That change can’t be made without more information, so nothing was changed.',
    labelTitle: 'What it is',
    labelDay: 'Day',
    labelTime: 'Start time',
    labelAmount: 'Amount',
    labelChild: 'Which child',
    labelArea: 'Area',
    labelKind: 'Kind',
    kindEvent: 'Appointment',
    kindTask: 'To-do',
    kindNote: 'Note',
    timeHint: 'For example 3:30 pm',
    amountHint: 'For example 85.00',
    amountDirection: 'Which way does it go?',
  },

  inbox: {
    title: 'Life Inbox',
    subtitle: 'Things you’ve told Her Keys that still need a decision.',
    rowLabel: 'Life Inbox',
    rowEmpty: 'Nothing waiting',
    rowCount: (count: number): string => `${count} waiting`,
    empty: 'Nothing is waiting on a decision.',
    loading: 'Checking what’s waiting…',
    recovery: 'Your saved household couldn’t be read on this device, so items waiting on you may not be shown here.',
    phaseClarify: 'Needs one answer',
    phaseReview: 'Ready to review',
    phaseAwaiting: 'Not read yet',
    phaseFailed: 'Couldn’t be turned into anything',
    progress: (decided: number, total: number): string => `${decided} of ${total} decided`,
    received: (when: string): string => `Told to Her Keys ${when.toLowerCase()}`,
    passed: 'The time has passed',
    hollowTitle: 'Something you shared',
    hollow: (when: string): string => `You told Her Keys something ${when.toLowerCase()}, but the exact words weren’t kept after the app closed, so I can’t read it again. You can say it again or dismiss it.`,
    sayAgain: 'Say it again',
    dismiss: 'Dismiss',
    open: 'Review',
    retry: 'Read it again',
    talkItOut: 'Talk it out',
    talkItOutHint: 'Opens Her Keys to tell it something new',
  },
};

/** Every string this feature can show, with representative arguments — for the mechanical tone audit. */
export function copyCorpus(): string[] {
  const out: string[] = [];
  const add = (value: unknown) => {
    if (typeof value === 'string') out.push(value);
  };
  const assumptions = Object.keys(ASSUMPTION) as AssumptionCode[];
  const unsupported = Object.keys(UNSUPPORTED) as Array<Exclude<UnsupportedReason, 'responsibility-handoff'>>;
  const failures = Object.keys(FAILURE) as InterpretationFailureCode[];
  for (const section of Object.values(copy)) {
    for (const value of Object.values(section)) {
      if (typeof value === 'string') add(value);
      else if (typeof value === 'object' && value !== null) for (const nested of Object.values(value as Record<string, unknown>)) add(nested);
    }
  }
  for (const a of assumptions) add(copy.review.assumption(a));
  for (const u of unsupported) add(copy.review.unsupported(u));
  for (const f of failures) add(copy.capture.failure(f));
  for (const kind of ['event', 'task', 'needsMe'] as const) {
    add(copy.review.kind(kind, true));
    add(copy.review.kind(kind, false));
    add(copy.review.savedAs(kind));
  }
  add(copy.review.handoff('Jordan'));
  add(copy.review.handoffKnown('Maya'));
  add(copy.review.whyEvidence('Friday at 3', 'time'));
  add(copy.review.whyArea('Kids'));
  add(copy.review.whyDurable('today'));
  add(copy.clarify.which_day(null));
  add(copy.clarify.which_day('Friday'));
  add(copy.clarify.optionToday('Wed, Sep 16'));
  add(copy.clarify.optionTomorrow('Thu, Sep 17'));
  add(copy.clarify.remaining(1));
  add(copy.clarify.remaining(3));
  add(copy.inbox.rowCount(3));
  add(copy.inbox.progress(1, 3));
  add(copy.inbox.received('Yesterday'));
  add(copy.inbox.hollow('Yesterday'));
  return out;
}
