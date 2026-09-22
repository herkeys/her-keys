import { EmptyState, InlineNotice, LoadingState } from '../../../design/components';
import { spacing } from '../../../design/tokens';
import { COPY } from '../copy';

/**
 * The states in which Calendar must say something other than “nothing here”. Each is a distinct state
 * with its own wording (contract section 47): loading is not empty, and recovery is neither.
 */
export const CalendarLoading = () => <LoadingState label={COPY.loading} detail={COPY.loadingDetail} />;

/** The household was not recovered. No capacity, conflict or opening is derived from unrecovered data. */
export const CalendarRecovery = () => <EmptyState title={COPY.recoveryTitle} body={COPY.recoveryBody} />;

/** A known-empty day: only ever shown once the household is loaded and authoritative. */
export const CalendarEmptyDay = () => <EmptyState title={COPY.emptyDayTitle} body={COPY.emptyDayBody} />;

/** Product-level uncertainty only. No cursor, queue count or sync badge ever appears in Calendar. */
export const CalendarDegradedNotice = () => <InlineNotice tone="waiting" title={COPY.persistenceDegraded} style={{ marginBottom: spacing.lg }} />;
