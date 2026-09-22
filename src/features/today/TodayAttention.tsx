import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ActionStateBlock, AppText, Button, Card, ConfirmationSheet, Tag } from '../../design/components';
import { color, spacing } from '../../design/tokens';
import type { ConsequenceLevel, Reversibility } from '../../domain/foundation/authorization';
import type { AttentionRow, AttentionSection, TodayAction } from './model';
import { TodayDisclosure } from './TodayDisclosure';
import { TodaySourceLine } from './TodaySourceLine';

interface TodayAttentionProps {
  section: AttentionSection;
  onTakeBack: (responsibilityId: string) => Promise<boolean>;
  onDecide: (intentId: string, decision: 'approved' | 'declined') => Promise<boolean>;
  busy: boolean;
  note: string | null;
}

const CONSEQUENCE_TEXT: Record<ConsequenceLevel, string> = {
  low: 'If it went wrong, the impact would be low.',
  moderate: 'If it went wrong, the impact would be moderate.',
  high: 'If it went wrong, the impact would be high.',
  critical: 'If it went wrong, the impact would be critical.',
};

const REVERSIBILITY_TEXT: Record<Reversibility, string> = {
  reversible: 'It can be undone.',
  compensable: 'It can be reversed, but not instantly.',
  irreversible: 'It can’t be undone.',
};

/**
 * What actually needs her — versus what merely exists.
 *
 * Every row is one specific, calm sentence from the view model. The only things a row can do are the
 * things an existing domain path supports: open the item (so she can correct it), take a delegated thing
 * back, or answer something Her Keys proposed. An approval is always explicit — it opens a confirmation that
 * states the intent's own consequence and reversibility, and it never promises anything will run. Declining
 * needs no confirmation.
 *
 * At most three rows are first-level; the rest are counted and one disclosure away.
 */
export function TodayAttention({ section, onTakeBack, onDecide, busy, note }: TodayAttentionProps) {
  const [reviewing, setReviewing] = useState<AttentionRow | null>(null);

  const renderRows = (rows: AttentionRow[]) => {
    const plain = rows.filter((row) => !row.approval);
    const approvals = rows.filter((row) => row.approval);
    return (
      <>
        {plain.length > 0 ? (
          <Card tone="attention" style={styles.card}>
            <Tag label="Needs you" tone="attention" />
            {plain.map((row, index) => (
              <AttentionRowView key={row.key} row={row} last={index === plain.length - 1} busy={busy} onTakeBack={onTakeBack} />
            ))}
          </Card>
        ) : null}
        {approvals.map((row) => (
          <ActionStateBlock
            key={row.key}
            stage="proposed"
            summary={row.approval!.summary}
            approvalQuestion="Do you want it to go ahead?"
            onApprove={() => setReviewing(row)}
            onDecline={() => void onDecide(row.approval!.intentId, 'declined')}
            style={styles.card}
          />
        ))}
      </>
    );
  };

  return (
    <View>
      {renderRows(section.rows)}
      {section.moreRows.length > 0 ? (
        <TodayDisclosure title="More that needs you" summary={String(section.moreRows.length)}>
          {renderRows(section.moreRows)}
        </TodayDisclosure>
      ) : null}
      {note ? (
        <AppText variant="supporting" color={color.status.attention} style={styles.note} accessibilityRole="alert">
          {note}
        </AppText>
      ) : null}
      {reviewing?.approval ? (
        <ConfirmationSheet
          visible
          title="Approve this?"
          body={`${reviewing.approval.summary} ${CONSEQUENCE_TEXT[reviewing.approval.consequence]} ${REVERSIBILITY_TEXT[reviewing.approval.reversibility]} Approving records your yes.`}
          cancelLabel="Not now"
          confirmLabel="Yes, approve"
          onCancel={() => setReviewing(null)}
          onConfirm={() => {
            const intentId = reviewing.approval!.intentId;
            setReviewing(null);
            void onDecide(intentId, 'approved');
          }}
        />
      ) : null}
    </View>
  );
}

function AttentionRowView({ row, last, busy, onTakeBack }: { row: AttentionRow; last: boolean; busy: boolean; onTakeBack: (id: string) => Promise<boolean> }) {
  return (
    <View style={[styles.row, last ? null : styles.divider]}>
      <AppText variant="body">{row.statement}</AppText>
      {row.changedToday ? (
        <AppText variant="metadata" color={color.text.muted} style={styles.meta}>
          {row.changedToday}
        </AppText>
      ) : null}
      {row.source ? <TodaySourceLine source={row.source} /> : null}
      {row.actions.length > 0 ? (
        <View style={styles.actions}>
          {row.actions.map((action) => (
            <ActionButton key={`${action.kind}:${action.kind === 'open' ? action.label : ''}`} action={action} busy={busy} onTakeBack={onTakeBack} />
          ))}
        </View>
      ) : null}
    </View>
  );
}

function ActionButton({ action, busy, onTakeBack }: { action: TodayAction; busy: boolean; onTakeBack: (id: string) => Promise<boolean> }) {
  if (action.kind === 'take_back') {
    return (
      <Button
        label={action.label}
        variant="secondary"
        size="sm"
        disabled={busy}
        accessibilityHint="Marks it as yours again. It doesn’t tell anyone."
        onPress={() => void onTakeBack(action.responsibilityId)}
      />
    );
  }
  if (action.kind === 'open') {
    return <Button label={action.label} variant="ghost" size="sm" accessibilityHint="Opens it so you can check or change it" onPress={() => router.push(action.route)} />;
  }
  return null;
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.md },
  row: { paddingVertical: spacing.md },
  divider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.status.attentionBorder },
  meta: { marginTop: spacing.xs },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  note: { marginTop: spacing.sm },
});
