import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, ChipToggle, ConfirmationSheet, EmptyState, Overline, Screen, Sheet } from '../../../design/components';
import { colors, spacing } from '../../../design/tokens';
import { ACTION_LABEL, describeDetail, type CopyContext } from '../copy';
import type { HolderChoice } from '../model/mutations';
import type { HolderFact, HomeAction, HomeItem } from '../model/types';

export interface DetailActionPayload {
  holder?: HolderChoice;
  stillNeedsMe?: boolean;
}

export interface HomeItemDetailViewProps {
  item: HomeItem | null;
  holders: HolderFact[];
  copyContext: CopyContext;
  busy: boolean;
  error: string | null;
  onAction: (action: HomeAction, payload?: DetailActionPayload) => void;
}

const PRIMARY: HomeAction[] = ['mark_done', 'due_again'];

/** The order actions are offered in. What is offered comes from the projection (`availableActions`); nothing is decided here. */
const ACTION_ORDER: HomeAction[] = ['mark_done', 'due_again', 'edit', 'ask_someone', 'record_seen', 'record_accepted', 'record_declined', 'take_back', 'stop_repeating', 'open_systems', 'remove'];

const holderLabel = (holder: HolderFact) => (holder.relationship === null ? holder.name : `${holder.name} (${holder.relationship})`);

/**
 * One Home item in full: every fact Home states, what Her Keys does NOT know, and the actions the projection says are available.
 * There is no HomeRecord: this composes a task's, visit's or routine's own canonical facts.
 */
export function HomeItemDetailView({ item, holders, copyContext, busy, error, onAction }: HomeItemDetailViewProps) {
  const [asking, setAsking] = useState(false);
  const [choice, setChoice] = useState<HolderFact | null>(null);
  const [answering, setAnswering] = useState(false);
  const [needsMe, setNeedsMe] = useState(true);
  const [removing, setRemoving] = useState(false);

  if (item === null) {
    return (
      <Screen>
        <EmptyState title="That isn’t in Home any more" body="It may have been removed, or moved out of the Home area, on this or another device." />
      </Screen>
    );
  }

  const detail = describeDetail(item, copyContext);
  const actions = ACTION_ORDER.filter((action) => item.availableActions.includes(action));

  const press = (action: HomeAction) => {
    if (action === 'ask_someone') setAsking(true);
    else if (action === 'record_accepted') setAnswering(true);
    else if (action === 'remove') setRemoving(true);
    else onAction(action);
  };

  return (
    <Screen>
      <Overline>{detail.kind}</Overline>
      <AppText variant="screenTitle" accessibilityRole="header" style={styles.title}>
        {item.title}
      </AppText>
      <AppText variant="supporting" color={colors.textSecondary}>
        {detail.status}
      </AppText>

      {detail.groups.map((group) => (
        <View key={group.group} style={styles.group} accessibilityRole="summary" accessibilityLabel={`${group.label}: ${group.lines.join('. ')}`}>
          <Overline style={styles.label}>{group.label}</Overline>
          {group.lines.map((line, index) => (
            <AppText key={`${group.group}-${index}`} variant="body" color={group.group === 'attention' ? colors.attention : colors.textPrimary}>
              {line}
            </AppText>
          ))}
        </View>
      ))}

      {detail.location !== null && (
        <View style={styles.group}>
          <Overline style={styles.label}>Where</Overline>
          <AppText variant="body">{detail.location}</AppText>
        </View>
      )}
      {detail.notes !== null && (
        <View style={styles.group}>
          <Overline style={styles.label}>Notes</Overline>
          <AppText variant="body">{detail.notes}</AppText>
        </View>
      )}

      {detail.notKnown.length > 0 && (
        <View style={styles.group} accessibilityRole="summary" accessibilityLabel={`What Her Keys doesn’t know: ${detail.notKnown.join('. ')}`}>
          <Overline style={styles.label}>What Her Keys doesn’t know</Overline>
          {detail.notKnown.map((line) => (
            <AppText key={line} variant="supporting" color={colors.textSecondary}>
              {line}
            </AppText>
          ))}
        </View>
      )}

      {error !== null && (
        <AppText variant="bodySm" color={colors.attention} accessibilityRole="alert" style={styles.error}>
          {error}
        </AppText>
      )}

      <View style={styles.actions}>
        {actions.map((action) => (
          <Button
            key={action}
            label={ACTION_LABEL[action]}
            variant={PRIMARY.includes(action) ? 'primary' : action === 'remove' ? 'ghost' : 'secondary'}
            onPress={() => press(action)}
            disabled={busy}
            style={styles.action}
          />
        ))}
      </View>

      <Sheet visible={asking} onClose={() => setAsking(false)} accessibilityLabel="Ask someone">
        <AppText variant="sectionTitle">Ask someone</AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.sheetBody}>
          Pick who to ask. Asking doesn’t mean they’ve agreed, and it doesn’t take this off your list.
        </AppText>
        <View style={styles.chips}>
          {holders.map((holder) => (
            <ChipToggle key={`${holder.kind}-${holder.id}`} label={holderLabel(holder)} selected={choice?.id === holder.id && choice.kind === holder.kind} onPress={() => setChoice(holder)} />
          ))}
        </View>
        <Button
          label="Ask"
          onPress={() => {
            if (choice === null || choice.id === null || choice.kind === 'self') return;
            setAsking(false);
            onAction('ask_someone', { holder: { kind: choice.kind, id: choice.id } });
          }}
          disabled={choice === null || busy}
          accessibilityHint="Pick someone first"
        />
      </Sheet>

      <Sheet visible={answering} onClose={() => setAnswering(false)} accessibilityLabel="They said yes">
        <AppText variant="sectionTitle">They said yes</AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.sheetBody}>
          Their yes doesn’t mean it’s done. Does this still need you?
        </AppText>
        <View style={styles.chips}>
          <ChipToggle label="Yes, it still needs me" selected={needsMe} onPress={() => setNeedsMe(true)} />
          <ChipToggle label="No, it doesn’t need me any more" selected={!needsMe} onPress={() => setNeedsMe(false)} />
        </View>
        <Button
          label="Record it"
          onPress={() => {
            setAnswering(false);
            onAction('record_accepted', { stillNeedsMe: needsMe });
          }}
          disabled={busy}
        />
      </Sheet>

      <ConfirmationSheet
        visible={removing}
        title="Remove this from Home?"
        body="It’s taken off your list and kept in your history. Removing it doesn’t mean it was done."
        cancelLabel="Keep it"
        confirmLabel="Remove"
        onCancel={() => setRemoving(false)}
        onConfirm={() => {
          setRemoving(false);
          onAction('remove');
        }}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: spacing.xs, marginBottom: spacing.xs },
  group: { marginTop: spacing.xl, gap: spacing.xxs },
  label: { marginBottom: spacing.xs },
  error: { marginTop: spacing.lg },
  actions: { marginTop: spacing.xxl, gap: spacing.sm },
  action: { alignSelf: 'stretch' },
  sheetBody: { marginTop: spacing.sm, marginBottom: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.lg },
});
