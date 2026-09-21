import { COPY } from '../copy';

/**
 * WHICH VIEW THE ROUTE IS ASKING FOR.
 *
 * The screen is one route (`/life/coparent`); the query params pick the view. Reading them is pure so it is testable without a
 * navigator: an unknown or repeated value never opens an editor by accident — it falls back to the read-only hub.
 */

export type CoParentMode =
  | 'hub'
  | 'handoff'
  | 'followup'
  | 'new-handoff'
  | 'edit-handoff'
  | 'new-prep'
  | 'new-followup'
  | 'edit-followup';

const MODES: readonly CoParentMode[] = ['hub', 'handoff', 'followup', 'new-handoff', 'edit-handoff', 'new-prep', 'new-followup', 'edit-followup'];

/** A search param can arrive as a list when a key is repeated; only the first value is ever read. */
export function paramText(raw: string | readonly string[] | undefined): string | undefined {
  const first = typeof raw === 'string' ? raw : raw?.[0];
  return first === undefined || first === '' ? undefined : first;
}

export function resolveMode(raw: string | readonly string[] | undefined): CoParentMode {
  const text = paramText(raw);
  return MODES.find((mode) => mode === text) ?? 'hub';
}

/** The modes that name one existing record by id. Without an id there is nothing to open. */
export const MODES_NEEDING_ID: readonly CoParentMode[] = ['handoff', 'followup', 'edit-handoff', 'edit-followup'];

export function titleFor(mode: CoParentMode): string {
  switch (mode) {
    case 'hub':
      return COPY.screen.title;
    case 'handoff':
      return COPY.detail.handoff;
    case 'followup':
      return COPY.detail.followUp;
    case 'new-handoff':
      return COPY.editor.handoffTitleNew;
    case 'edit-handoff':
      return COPY.editor.handoffTitleEdit;
    case 'new-prep':
      return COPY.editor.prepTitle;
    case 'new-followup':
      return COPY.editor.followUpTitleNew;
    case 'edit-followup':
      return COPY.editor.followUpTitleEdit;
  }
}
