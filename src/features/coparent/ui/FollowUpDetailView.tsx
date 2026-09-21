import { StyleSheet, View } from 'react-native';
import { AppText, Button } from '../../../design/components';
import { colors, spacing } from '../../../design/tokens';
import { COPY } from '../copy';
import type { FollowUpPresentation, ResponsibilityAction } from '../present';
import type { MoneyFollowUpDetailView as MoneyFollowUpDetailModel } from '../types';
import type { CounterpartChoice } from './actions';
import { Caption, ErrorLine, Lines, Section, type AreaError } from './parts';
import { RemoveControl } from './RemoveControl';
import { ResponsibilityActions } from './ResponsibilityActions';

export interface FollowUpDetailViewProps {
  presentation: FollowUpPresentation;
  detail: MoneyFollowUpDetailModel;
  busy: boolean;
  error: AreaError | null;
  onResponsibilityAction: (action: ResponsibilityAction, counterpart: CounterpartChoice | null) => void;
  onEdit: () => void;
  onMarkDone: () => void;
  onRemove: () => void;
}

/**
 * ONE FOLLOW-UP, OPENED. It is a task she intends to do — not a request that was made, and not a claim about money between people. The
 * amount, its note, the date, the status and every sentence about payment come from the presentation, which words "marked done" and
 * "a payment was reported" only as far as the record supports.
 */
export function FollowUpDetailView({ presentation: p, detail, busy, error, onResponsibilityAction, onEdit, onMarkDone, onRemove }: FollowUpDetailViewProps) {
  const followUp = detail.followUp;
  if (followUp === null) return null;

  const open = followUp.standing === 'open';
  const notes = detail.notes !== null && detail.notes.trim() !== '' ? detail.notes : null;
  const errorIn = (area: AreaError['area']) => (error !== null && error.area === area ? error.text : null);

  return (
    <View>
      <AppText variant="metadata" color={colors.textTertiary}>
        {p.childLine}
      </AppText>
      <AppText variant="screenTitle" accessibilityRole="header">
        {p.title}
      </AppText>
      <AppText variant="bodyStrong" style={styles.amount}>
        {p.amountLine}
      </AppText>
      <Caption>{p.amountNote}</Caption>
      <AppText variant="supporting" color={colors.textSecondary} style={styles.first}>
        {p.dateLine}
      </AppText>
      <AppText variant="supporting" color={colors.textSecondary}>
        {p.statusLine}
      </AppText>
      <Lines lines={p.lines} />

      {open ? (
        <Section title={COPY.detail.responsibility}>
          <ResponsibilityActions view={followUp.responsibility} people={detail.people} busy={busy} error={errorIn('responsibility')} onAction={onResponsibilityAction} />
        </Section>
      ) : null}

      {notes !== null ? (
        <Section title={COPY.detail.notes}>
          <AppText variant="body">{notes}</AppText>
        </Section>
      ) : null}

      {open ? (
        <View style={styles.manage}>
          <Button label={COPY.actions.edit} variant="secondary" onPress={onEdit} disabled={busy} style={styles.start} />
          <Button label={COPY.actions.markDone} variant="secondary" onPress={onMarkDone} disabled={busy} style={styles.start} />
          <RemoveControl
            label={COPY.actions.removeFollowUp}
            confirmTitle={COPY.confirm.removeFollowUpTitle}
            confirmBody={COPY.confirm.removeFollowUpBody}
            busy={busy}
            onConfirm={onRemove}
          />
          <ErrorLine text={errorIn('manage')} />
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  amount: { marginTop: spacing.sm },
  first: { marginTop: spacing.md },
  start: { alignSelf: 'flex-start' },
  manage: { marginTop: spacing.xxl, gap: spacing.md },
});
