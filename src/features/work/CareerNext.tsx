import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { AppText, Button, Overline, StatusList } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { CLOSED_REASON_LABEL, STAGE_LABEL, type CareerLists } from './careerLists';

export interface CareerNextProps {
  lists: CareerLists;
  /** Whether an open opportunity has an open next action (a quiet dot when it does not). */
  hasNextAction: (opportunityId: string) => boolean;
  onOpen: (opportunityId: string) => void;
  onAdd: () => void;
}

/**
 * Career Next (F10): the opportunities still in play, then the ones she closed, then — one tap away — the ones she archived (HK13-D16).
 * Every row opens the opportunity, where she can move its stage or restore it. Pure: the Work screen supplies the lists and actions.
 */
export function CareerNext({ lists, hasNextAction, onOpen, onAdd }: CareerNextProps) {
  const [showArchived, setShowArchived] = useState(false);
  return (
    <>
      <Overline style={styles.labelSpaced}>Career next</Overline>
      {lists.open.length > 0 ? (
        <StatusList
          items={lists.open.map((o) => ({
            key: o.id,
            label: o.title,
            value: STAGE_LABEL[o.stage] ?? o.stage,
            needsAttention: !hasNextAction(o.id),
            onPress: () => onOpen(o.id),
          }))}
        />
      ) : (
        <AppText variant="body" color={colors.textSecondary}>
          {lists.closed.length + lists.archived.length > 0 ? 'Nothing in play right now.' : 'No career opportunities recorded yet.'}
        </AppText>
      )}
      <Button label="Add an opportunity" variant="ghost" size="sm" onPress={onAdd} style={styles.addButton} />

      {lists.closed.length > 0 && (
        <>
          <Overline style={styles.labelSpaced}>Closed</Overline>
          <StatusList
            items={lists.closed.map((o) => ({
              key: o.id,
              label: o.title,
              value: o.closedReason ? CLOSED_REASON_LABEL[o.closedReason] : STAGE_LABEL.closed,
              onPress: () => onOpen(o.id),
            }))}
          />
        </>
      )}

      {lists.archived.length > 0 &&
        (showArchived ? (
          <>
            <Overline style={styles.labelSpaced}>Archived</Overline>
            <StatusList
              items={lists.archived.map((o) => ({
                key: o.id,
                label: o.title,
                value: `Archived · ${STAGE_LABEL[o.stage] ?? o.stage}`,
                onPress: () => onOpen(o.id),
              }))}
            />
          </>
        ) : (
          <Button label={`Show archived (${lists.archived.length})`} variant="ghost" size="sm" onPress={() => setShowArchived(true)} style={styles.addButton} />
        ))}
    </>
  );
}

const styles = StyleSheet.create({
  labelSpaced: { marginTop: spacing.xxl, marginBottom: spacing.md },
  addButton: { marginTop: spacing.md, alignSelf: 'flex-start' },
});
