import { InlineNotice, LoadingState } from '../../../design/components';
import type { Availability } from '../availability';
import { COPY } from '../copy';

/**
 * WHAT TO SAY WHEN THE HUB MAY NOT SPEAK.
 *
 * Returns null only when the household is ready. Until then — loading, unreadable, or another account's — nothing else may render:
 * in particular never the empty state, because a household that could not be read is not a household with nothing in it.
 */
export function AvailabilityNotice({ availability }: { availability: Availability }) {
  switch (availability.kind) {
    case 'loading':
      return <LoadingState label={COPY.states.loadingTitle} detail={COPY.states.loadingBody} />;
    case 'unrecovered':
      return <InlineNotice tone="attention" title={COPY.states.unrecoveredTitle} body={COPY.states.unrecoveredBody} />;
    case 'other_account':
      return <InlineNotice title={COPY.states.otherAccountTitle} body={COPY.states.otherAccountBody} />;
    case 'ready':
      return null;
  }
}
