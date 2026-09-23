/**
 * Every user-facing sentence Me / Rebuild says, in one place, so the copy audit can read all of it.
 *
 * Voice: calm, factual, adult. This surface is about her life as a person, so it must never grade her, diagnose her, cheer her on or
 * hint that she is behind. It names what is true and offers the next thing she might want to do — nothing more.
 * A Focus title and note are HERS; they never appear in these sentences except where a sentence is literally showing her own words.
 */
export const REBUILD_COPY = {
  screenTitle: 'Me / Rebuild',

  life: {
    rowLabel: 'Me / Rebuild',
    // A count of what she keeps visible. With none active, paused ones still exist: "Nothing named yet" would deny them (HK13-D23).
    rowValue: (active: number, paused = 0) =>
      active === 1 ? '1 focus' : active > 1 ? `${active} focuses` : paused === 0 ? 'Nothing named yet' : paused === 1 ? '1 paused' : `${paused} paused`,
  },

  availability: {
    loading: 'Loading…',
    unrecoveredTitle: 'Your saved household couldn’t be read',
    unrecoveredBody: 'Nothing is shown here until it can be, so nothing here is mistaken for yours.',
    otherAccountTitle: 'This household belongs to another account',
    otherAccountBody: 'It isn’t shown here.',
    readOnly: 'Changes can’t be saved on this device right now, so editing is off.',
  },

  home: {
    emptyTitle: 'What’s one part of your life you’d like to make more room for?',
    emptyBody: 'Name it in a few words. It stays private to you, and nothing is expected of it.',
    addFocus: 'Add one Focus',
    notNow: 'Not now',
    addAnother: 'Add another Focus',
    current: 'Current focuses',
    needsAttention: 'Needs attention',
    recentProgress: 'Recent progress',
    paused: 'Paused',
    privateNote: 'Private to you.',
    nextStep: 'Next step',
    addNextStep: 'Add a next step',
    lighterVersion: (title: string) => `Lighter version: ${title}`,
    dueOn: (day: string) => `Due ${day}`,
    pastDue: (day: string) => `Was due ${day}`,
    doneOn: (day: string) => `Done ${day}`,
    reached: (day: string) => `Reached ${day}`,
    openFocus: (title: string) => `Open ${title}`,
  },

  verdict: {
    attention: (count: number) => (count === 1 ? 'One personal step needs attention today.' : `${count} personal steps need attention today.`),
    next: (title: string, day: string) => `Next: ${title}, ${day}.`,
    nothing: 'Nothing here needs attention today.',
  },

  editor: {
    title: 'A new Focus',
    titleLabel: 'Focus',
    titlePlaceholder: 'Make space for myself again',
    noteLabel: 'A little context (optional)',
    notePlaceholder: 'Anything you want to remember about it',
    distinctionFocus: 'Focus: an area you want to keep visible.',
    distinctionGoal: 'Goal: something specific you’re working toward.',
    save: 'Save Focus',
    cancel: 'Cancel',
    titleMissing: 'Give it a few words.',
    titleTooLong: 'Keep it under 200 characters.',
    noteTooLong: 'Keep the note under 500 characters.',
    saveFailed: 'Her Keys couldn’t save that yet. It’s still here — try again.',
  },

  detail: {
    notFoundTitle: 'This Focus isn’t here',
    notFoundBody: 'It may have been archived on another device.',
    stateActive: 'Active',
    statePaused: 'Paused — not shown as current',
    stateArchived: 'Archived',
    rename: 'Rename',
    renameLabel: 'Focus',
    saveRename: 'Save name',
    editNote: 'Edit note',
    addNote: 'Add a note',
    noteLabel: 'A little context',
    saveNote: 'Save note',
    clearNote: 'Remove note',
    cancel: 'Cancel',
    pause: 'Pause',
    resume: 'Resume',
    archive: 'Archive',
    archiveConfirmTitle: 'Archive this Focus?',
    archiveConfirmBody: 'It stays saved, and it leaves this page. Its steps stay exactly as they are.',
    archiveConfirm: 'Archive it',
    keep: 'Keep it',
    nextSteps: 'Next steps',
    markDone: 'Mark done',
    editStep: 'Edit',
    stepLabel: 'Next step',
    stepPlaceholder: 'Book the pottery class',
    stepHint: 'It becomes a task only you can see.',
    categoryLabel: 'File it under',
    saveStep: 'Save step',
    connected: 'Connected',
    connect: 'Connect something already here',
    connectRoutines: 'Routines',
    connectUpcoming: 'Coming up on your calendar',
    nothingToConnect: 'Nothing here to connect yet.',
    connectAction: 'Connect',
    disconnect: 'Disconnect',
    kindLabel: { goal: 'Goal', system: 'Routine', event: 'Calendar', task: 'Task' } as const,
    removedEvent: 'Removed from the calendar',
    saveFailed: 'Her Keys couldn’t save that yet. Try again.',
  },
} as const;
