import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, InlineNotice, LoadingState } from '../../design/components';
import { color, spacing } from '../../design/tokens';
import type { RecoveryReason } from '../../state/appStore';
import type { SparseSection } from './model';

type Props =
  | { kind: 'unknown' }
  | { kind: 'unavailable'; recoveryReason: RecoveryReason | null }
  | { kind: SparseSection['kind']; entry: SparseSection['entry'] };

/** Why the saved household cannot be shown, by the recovery that is in effect. Each says what is true and stops there. */
const UNAVAILABLE_REASON: Partial<Record<RecoveryReason, string>> = {
  future_version: 'What’s saved on this device was made by a newer version of Her Keys.',
  read_failed: 'Her Keys couldn’t read what’s saved on this device.',
  mode_mismatch: 'This device holds a household from a different mode of the app.',
};

/**
 * The states in which Today has no briefing to give — and says exactly why.
 *
 *   unknown      state is not resolved yet. This is NOT an empty day, so it never says "light".
 *   unavailable  the state on screen is a stand-in, not her household. Intelligence is withheld;
 *                the shell's own notice (PersistenceNotice) still owns the recovery message.
 *   never_entered / light   resolved state that genuinely has nothing today, said plainly, with
 *                one existing place to begin. It does not ask her to fill her day.
 */
export function TodayStateNotice(props: Props) {
  if (props.kind === 'unknown') return <LoadingState label="Getting your day ready…" />;

  if (props.kind === 'unavailable') {
    const reason = (props.recoveryReason && UNAVAILABLE_REASON[props.recoveryReason]) || null;
    return (
      <InlineNotice
        tone="attention"
        title="Her Keys can’t show your day right now"
        body={`${reason ? `${reason} ` : ''}This session isn’t saving anything, so nothing you’ve saved has been changed.`}
      />
    );
  }

  const { entry } = props;
  const actions = (
    <View style={styles.actions}>
      {entry.map((item, index) => (
        <Button key={item.label} label={item.label} variant={index === 0 && props.kind === 'never_entered' ? 'secondary' : 'ghost'} size="sm" onPress={() => router.push(item.route)} />
      ))}
    </View>
  );

  if (props.kind === 'never_entered') {
    return (
      <Card tone="subtle">
        <AppText variant="screenTitle">Nothing entered yet.</AppText>
        <AppText variant="body" color={color.text.secondary} style={styles.body}>
          Add your first event or task to see what Her Keys notices about your day.
        </AppText>
        {actions}
      </Card>
    );
  }

  return actions;
}

const styles = StyleSheet.create({
  body: { marginTop: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
});
