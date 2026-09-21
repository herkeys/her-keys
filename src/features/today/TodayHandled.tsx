import { StyleSheet, View } from 'react-native';
import { ActionStateBlock } from '../../design/components';
import { spacing } from '../../design/tokens';
import type { HandledSection } from './model';
import { SectionLabel } from './TodayDisclosure';

/**
 * What Her Keys handled — and only that. A row exists only when the household holds a succeeded execution AND
 * a success outcome observed today; the view model enforces it, and this cannot say more. The words come from the
 * permanent action-state presentation ("Done — delivered"), which is the same language a prepared, running or failed
 * action uses, so a handled thing can never be mistaken for one that was merely approved.
 */
export function TodayHandled({ section }: { section: HandledSection }) {
  return (
    <View>
      <SectionLabel>Handled by Her Keys</SectionLabel>
      <View style={styles.list}>
        {section.rows.map((row) => (
          <ActionStateBlock key={row.key} stage="succeeded" outcome={row.outcome} summary={row.statement} style={styles.item} />
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: { marginTop: spacing.sm },
  item: { marginBottom: spacing.sm },
});
