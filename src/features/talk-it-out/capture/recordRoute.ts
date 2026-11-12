import type { ProposalVM } from './viewModel';

/**
 * Where a SAVED reading's record can be opened. The same editors the Calendar already opens an item in, and the Needs Me list for a note.
 * Pure data: the route files and the conversation call `router.push` with it, so this feature's views carry no navigation of their own.
 */
export type RecordRoute = { pathname: '/event-editor'; params: { eventId: string } } | { pathname: '/task-editor'; params: { taskId: string } } | { pathname: '/life/needs-me' };

export function recordRouteOf(target: NonNullable<ProposalVM['openTarget']>): RecordRoute {
  switch (target.kind) {
    case 'event':
      return { pathname: '/event-editor', params: { eventId: target.id } };
    case 'task':
      return { pathname: '/task-editor', params: { taskId: target.id } };
    case 'needsMe':
      return { pathname: '/life/needs-me' };
  }
}
