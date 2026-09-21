/**
 * COPY — every user-facing sentence of Co-Parent Logistics, in one place.
 *
 * Tone: calm, specific, adult, neutral, non-judgmental. Factual operational wording only.
 *
 * Rules the words obey (and `tests/coparent/copyTruth.test.mjs` mechanically enforces on everything produced here and on the source):
 *  - A state SHE recorded is worded "You recorded …". Her Keys never says a third party did, agreed, received, paid or complied.
 *  - Never: agreed, court-ordered, required, complied, violation, missed/late/ignored by the other parent, owes, owed, settled, verified,
 *    court-ready, legal record, custody schedule/plan, "shared with", "can see this", "sent"/"delivered" without evidence.
 *  - A few sentences NAME a boundary in the negative ("isn't a legal record", "isn't an agreed amount"). Those are listed in
 *    `NEGATED_BOUNDARY_SENTENCES` and are the only allowed occurrences of a boundary word.
 */

const s = (n: number, one: string, many: string) => (n === 1 ? one : many);

export const COPY = {
  screen: {
    title: 'Co-parent logistics',
    subtitle: "Your record of child handoffs, what to prepare, and follow-ups.",
    footnote: "Only what you've recorded in Her Keys. It isn't a legal record, and it doesn't say what anyone has agreed to.",
    hubHint: "Her Keys hasn't contacted anyone.",
  },

  sections: {
    next: 'Next handoff',
    upcoming: 'Coming up',
    needsYou: 'Needs you',
    waiting: 'Waiting on someone',
    needsReview: 'Needs review',
    preparation: 'Preparation',
    money: 'Money to follow up',
    recentlyCompleted: 'Recently completed',
  },

  states: {
    loadingTitle: 'Getting your household ready',
    loadingBody: 'This will show what you recorded as soon as it has loaded.',
    unrecoveredTitle: "Her Keys couldn't load what was saved here",
    unrecoveredBody: "What you recorded before isn't shown, so this screen won't tell you there's nothing to do.",
    otherAccountTitle: 'This device holds another account',
    otherAccountBody: "Nothing from that account is shown here.",
    emptyTitle: 'Nothing recorded here yet',
    emptyBody: "Add a handoff, something to prepare, or a follow-up. This only shows what you've recorded in Her Keys.",
    notFoundTitle: "That isn't in Her Keys any more",
    notFoundBody: 'It may have been removed, or it belongs to a different household.',
    notAHandoffTitle: "That isn't a co-parenting handoff",
    notAHandoffBody: 'Open it from where it lives instead.',
  },

  blocked: {
    no_child: { title: 'A child comes first', body: "No child is recorded in this household yet, so a handoff can't be linked to one. Her Keys won't guess a child." },
    no_category: { title: "Co-parenting isn't set up here", body: "This household has no co-parenting category, so new records can't be filed. Nothing else is affected." },
    category_archived: { title: 'The co-parenting category is archived', body: "New records can't be filed until it is restored. What you already recorded is unchanged." },
  },

  time: {
    zoneNote: (zone: string) => `Times are shown in your household time zone, ${zone}.`,
    inProgress: 'Happening now',
    upcoming: 'Coming up',
    past: 'This time has passed. Nothing is recorded about whether it happened.',
    nextDate: (date: string) => `Next: ${date}`,
  },

  child: {
    notRecorded: 'No child recorded',
    unavailable: 'A child no longer in this household',
  },

  unknown: {
    child_not_recorded: 'No child recorded.',
    location_not_recorded: 'No location recorded.',
    counterpart_not_recorded: 'No one is recorded as responsible.',
    preparation_not_recorded: 'No preparation recorded.',
    needs_you_not_recorded: 'Not recorded whether this needs you personally.',
    outcome_not_recorded: 'Nothing is recorded about whether it happened.',
  },

  review: {
    child_not_recorded: 'No child is recorded for this handoff.',
    child_unavailable: 'The child recorded here is no longer in this household.',
    counterpart_unavailable: (name: string) => `${name} is no longer available in Her Keys, so this can't count as accepted or covered. Review it.`,
    preparation_unavailable: "A preparation item was removed. It isn't counted as done.",
    handoff_removed: 'The handoff this was for was removed.',
  },

  needsYouReason: {
    marked_needs_you: 'You marked that this needs you.',
    back_with_you: "It's back with you.",
    answer_overdue: 'No answer is recorded, and the time you set for one has passed.',
    accepted_still_needs_you: 'You recorded it as accepted, and that it still needs you.',
  },

  /** What a responsibility means, worded as what SHE recorded. */
  responsibility: {
    none_recorded: 'No one is recorded as responsible.',
    with_you: 'With you.',
    back_with_you: 'Back with you.',
    assigned: (name: string) => `${name} is recorded as responsible. No request is recorded.`,
    requested: (name: string) => `You recorded a request to ${name}. No answer is recorded.`,
    requestedOn: (name: string, date: string) => `You recorded a request to ${name} on ${date}. No answer is recorded.`,
    acknowledged: (name: string) => `You recorded that ${name} acknowledged this.`,
    accepted_needs: (name: string) => `You recorded that ${name} accepted this. It still needs you.`,
    covered: (name: string) => `Covered: you recorded that ${name} accepted this and it no longer needs you.`,
    declined: (name: string) => `You recorded that ${name} declined. It's back with you.`,
    completed: (name: string) => `You recorded ${name}'s part as complete.`,
    completedSelf: 'You recorded your part as complete.',
    holderChild: (name: string) => `Recorded with ${name}.`,
    unavailable: (name: string) => `${name} is no longer available in Her Keys. Nothing here counts as accepted or covered.`,
    someone: 'Someone no longer in Her Keys',
    notContacted: (name: string) => `Her Keys has not contacted ${name}.`,
    sentEvidence: 'Her Keys sent the request.',
    deliveredEvidence: 'Delivery was reported.',
  },

  prep: {
    heading: 'Preparation',
    readiness: {
      no_prep_recorded: 'No preparation recorded.',
      waiting_on_prep: (open: number, linked: number) => `${open} of ${linked} preparation ${s(linked, 'item', 'items')} still open.`,
      all_marked_done: 'All preparation you listed is marked done.',
      needs_review: "A preparation item was removed. It isn't counted as done.",
    },
    standing: {
      open: 'Open',
      done: 'Marked done',
      removed: 'Removed from the list. Not marked done.',
      missing: 'No longer in Her Keys. Not marked done.',
    },
    unlinked: 'Not linked to a specific handoff.',
    forHandoff: (label: string) => `For: ${label}`,
    dueOn: (date: string) => `Due ${date}`,
    doneNote: 'Marked done means the task was ticked off. Her Keys has no record of it arriving anywhere.',
    doneShort: 'Marked done',
  },

  money: {
    heading: 'Money to follow up',
    amount: (decimal: string, currency: string) => `Amount you entered: ${decimal} ${currency}`,
    amountNote: "An amount you entered isn't an agreed amount.",
    dueOn: (date: string) => `Follow up by ${date}`,
    noDate: 'No follow-up date',
    open: 'Follow-up open',
    done: 'Marked done. Her Keys has no record of a payment.',
    removed: 'Removed',
    paymentReported: 'A connected service reported a payment.',
    forChild: (name: string) => `About ${name}`,
    noChild: 'No child recorded',
  },

  privacy: {
    ownerOnly: 'Only your account can open this in Her Keys.',
    showLocation: 'Show location',
    hideLocation: 'Hide location',
    locationRecorded: 'A location is recorded.',
    noLocation: 'No location recorded.',
  },

  repeat: {
    line: (phrase: string) => `Repeats ${phrase}. This is the pattern you recorded.`,
    paused: (phrase: string) => `Repeat paused (${phrase}). This is the pattern you recorded.`,
    forRecordedDate: (date: string) => `Recorded for ${date}. Nothing is recorded for this date.`,
    everyWeek: (weekday: string) => `every week on ${weekday}`,
    everyNWeeks: (n: number, weekday: string) => `every ${n} weeks on ${weekday}`,
    everyMonth: (day: number) => `every month on day ${day}`,
    everyNMonths: (n: number, day: number) => `every ${n} months on day ${day}`,
    daily: (n: number) => (n === 1 ? 'every day' : `every ${n} days`),
    yearly: (n: number) => (n === 1 ? 'every year' : `every ${n} years`),
    weekdays: (names: string[]) => names.join(', '),
  },

  /** Labels for the detail screens (headings only — every sentence on a detail comes from the presenter). */
  detail: {
    handoff: 'Handoff',
    followUp: 'Follow-up',
    location: 'Location',
    responsibility: 'Responsibility',
    notes: 'Notes',
    notRecorded: 'Not recorded',
    removed: "You removed this handoff. Removed isn't the same as completed, and it doesn't say whether it happened.",
  },

  /** The second step of a removal. Removing is a recording of her own, never a claim about what happened. */
  confirm: {
    removeHandoffTitle: 'Remove this handoff?',
    removeHandoffBody: "It leaves your list. Removing isn't the same as completing it, and it doesn't say whether it happened.",
    removeFollowUpTitle: 'Remove this follow-up?',
    removeFollowUpBody: "It leaves your list. Removing isn't the same as marking it done.",
  },

  actions: {
    addHandoff: 'Add a handoff',
    addPrep: 'Add preparation',
    addFollowUp: 'Add a follow-up',
    open: 'Open',
    edit: 'Edit',
    save: 'Save changes',
    create: 'Add handoff',
    createPrep: 'Add preparation item',
    createFollowUp: 'Add follow-up',
    cancel: 'Cancel',
    remove: 'Remove handoff',
    removeItem: 'Remove from the list',
    markDone: 'Mark done',
    linkTo: 'Link to a handoff',
    unlink: 'Unlink',
    recordAsked: "Record that you've asked someone",
    reassign: 'Record a different person',
    acknowledged: (name: string) => `Record that ${name} acknowledged`,
    acceptedCovered: (name: string) => `Record that ${name} accepted and I need do nothing more`,
    acceptedNeedsMe: (name: string) => `Record that ${name} accepted and I still need to act`,
    declined: (name: string) => `Record that ${name} declined`,
    partComplete: (name: string) => `Record ${name}'s part as complete`,
    takeBack: 'Take it back',
    stillNeedsMe: 'It still needs me',
    noLongerNeedsMe: 'It no longer needs me',
    showMore: (n: number) => `Show ${n} more`,
    removeFollowUp: 'Remove follow-up',
    recordIt: 'Record this',
  },

  editor: {
    handoffTitleNew: 'New handoff',
    handoffTitleEdit: 'Edit handoff',
    prepTitle: 'New preparation item',
    followUpTitleNew: 'New follow-up',
    followUpTitleEdit: 'Edit follow-up',
    child: 'Child',
    title: 'Title',
    titlePlaceholder: 'Pickup Josie',
    starters: ['Drop-off', 'Pickup', 'Handoff'] as const,
    startersHint: 'These only fill in the title. Change the words to match what is happening.',
    date: 'Date (YYYY-MM-DD)',
    start: 'Start (HH:MM)',
    end: 'End (HH:MM)',
    timeHelp: 'Times are in your household time zone. Her Keys never guesses a length or a time zone.',
    location: 'Location (optional)',
    notes: 'Notes (optional)',
    commitment: 'Commitment',
    fixed: 'Fixed',
    flexible: 'Flexible',
    commitmentHelp: "Fixed: Her Keys won't suggest moving it.",
    needsYou: 'Does this need you personally?',
    needsYesNo: { yes: 'Yes', no: 'No', unsure: 'Not sure' },
    repeat: 'Repeat',
    repeatChoices: { none: "Doesn't repeat", weekly: 'Every week', every_2_weeks: 'Every 2 weeks', monthly: 'Every month', keep: 'Keep as recorded' },
    repeatHelp: "A repeat is a pattern you recorded. It doesn't mean anyone agreed to it.",
    responsible: "Who is responsible? (optional)",
    responsibleNone: 'Not recorded',
    responsibleAdd: 'Add someone',
    responsibleHelp: "This records that you've asked them. Her Keys doesn't message anyone.",
    personName: 'Their name',
    personRelationship: 'How you know them',
    dueDate: 'Due date (optional)',
    linkHandoff: 'Which handoff is this for? (optional)',
    linkNone: 'Not linked',
    amount: 'Amount',
    amountHelp: 'Enter what you intend to follow up about. It is only a number you entered.',
    currency: 'Currency',
    currencySuggested: (code: string) => `${code} (from your other amounts)`,
    direction: 'Which way would the money go?',
    directionInflow: 'Coming to me',
    directionOutflow: 'Going from me',
    followUpDate: 'Follow-up date (optional)',
    followUpHelp: "This is a task for you. It doesn't ask anyone for money and it isn't a record of what anyone owes.",
    noChild: 'No child',
    personIncomplete: 'Enter their name and how you know them, or choose someone else.',
    askedWho: 'Who did you ask?',
    askedInstead: 'Who did you ask instead?',
    datePlaceholder: 'YYYY-MM-DD',
    timePlaceholder: 'HH:MM',
    currencyOther: 'Other currency (3 letters)',
    relationships: {
      'co-parent': 'Co-parent',
      partner: 'Partner',
      grandparent: 'Grandparent',
      caregiver: 'Caregiver',
      neighbor: 'Neighbor',
      contractor: 'Contractor',
      friend: 'Friend',
      other: 'Other',
    },
  },

  outcomes: {
    invalid_child: 'Choose a child.',
    invalid_title: 'Give it a title.',
    invalid_text: 'That text is too long.',
    invalid_date: 'Date should look like YYYY-MM-DD.',
    invalid_time: 'Times should look like HH:MM in 24-hour time, and the end has to be after the start.',
    invalid_counterpart: 'Choose someone who is still available, or leave it blank.',
    invalid_link: 'Choose a handoff that is still there.',
    link_refused: "That link couldn't be recorded.",
    invalid_currency: 'Choose a currency.',
    invalid_direction: 'Choose which way the money would go.',
    invalid_amount: 'Enter an amount above zero, such as 80 or 80.50.',
    no_category: "Co-parenting isn't set up in this household.",
    category_archived: 'The co-parenting category is archived.',
    stale: 'This changed while you were editing. Close it and open it again to see the latest.',
    missing: "That isn't in Her Keys any more.",
    removed: 'That was removed.',
    not_a_handoff: "That isn't a co-parenting handoff.",
    not_a_follow_up: "That isn't a follow-up.",
    not_a_coparent_record: "That isn't a co-parenting record.",
    not_open: "That isn't open any more.",
    unchanged: 'Nothing changed.',
    already_recorded: 'Someone is already recorded. Record a different person instead.',
    counterpart_unavailable: 'That person is no longer available, so nothing positive can be recorded for them.',
    not_allowed: "That can't be recorded from where it is now.",
    not_saved: "Her Keys couldn't save that yet. Try again.",
  },
} as const;

/**
 * The only sentences allowed to contain a boundary word (legal / agreed / owes / payment / received / shared …) — and only because
 * they NAME the boundary to deny it. The copy-truth audit allows these exact strings and nothing else.
 */
export const NEGATED_BOUNDARY_SENTENCES: readonly string[] = [
  COPY.screen.footnote,
  COPY.money.amountNote,
  COPY.money.done,
  COPY.editor.followUpHelp,
  COPY.prep.doneNote,
];

/**
 * Sentences that state something HAPPENED outside her own recording. They may be produced only when a real execution/outcome row
 * exists (`evidence.ts`); the presenter is the only place they are chosen, and the audit checks that they never appear without it.
 */
export const EVIDENCE_GATED_SENTENCES: readonly string[] = [
  COPY.responsibility.sentEvidence,
  COPY.responsibility.deliveredEvidence,
  COPY.money.paymentReported,
];

/** A weekday list for a repeat phrase, in the order the rule stores them. */
export const WEEKDAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'] as const;
