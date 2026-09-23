/**
 * The Life hub's own words (F01-F13 integration, INT13-02).
 *
 * The subtitle used to read "Five areas, one picture. Everything here is what Her Keys reads when it looks at your day." Neither half
 * stayed true: the hub has more than five areas, and the private areas below are deliberately NOT read into her day — a Focus, a record
 * or a person reaches Today only through a Task she makes from it. The copy now says only what the system does.
 */
export const LIFE_HUB_COPY = {
  subtitle: 'Where each part of your life stands, in one place.',
  householdSection: 'Where things stand',
  privateSection: 'Just for you',
  privateSectionNote: 'Private to you. Only the tasks you make here reach your day.',
} as const;

/**
 * What a generic editor says when it is opened for a co-parenting handoff (HK13-D35): the handoff is changed in Co-parent logistics,
 * where moving it moves the repeat she recorded with it. Life says it because Life is what links one area to another.
 */
export const HANDOFF_KEPT_COPY = {
  title: 'This handoff is kept in Co-parent logistics',
  body: 'Change its time or repeat there, so the pattern you recorded moves with it.',
  open: 'Open in Co-parent logistics',
} as const;
