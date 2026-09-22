import { StyleSheet, View } from 'react-native';
import { ConfidenceBadge, PROVENANCE_LABEL, ProvenanceLabel } from '../../design/components';
import { spacing } from '../../design/tokens';
import type { SourceLine } from './model';

/**
 * The same words, for assistive technology. A button that carries its own `accessibilityLabel` hides its children from a
 * screen reader, so a row that is itself a button must add this to its label — otherwise an unconfirmed claim is seen and
 * never heard.
 */
export function sourceLabelOf(source: SourceLine): string {
  return `${PROVENANCE_LABEL[source.producer]}${source.confidence ? `. Confidence: ${source.confidence}` : ''}`;
}

/**
 * Where a row came from, in the permanent provenance and confidence language.
 *
 * At first glance it appears only for Her Keys' unconfirmed claim (a stored confidence of
 * `possible` or `likely`) — a fact she stated needs no badge. `always` is for the detail
 * level, where the honest source ("Source unknown" for a legacy row, "Demo data" for a
 * demo row) is shown too. The wording and the badge come from the design system; nothing is
 * upgraded, defaulted or invented here.
 */
export function TodaySourceLine({ source, always = false }: { source: SourceLine; always?: boolean }) {
  if (!always && !source.uncertain) return null;
  const confidence = source.confidence;
  return (
    <View style={styles.row} accessible accessibilityLabel={sourceLabelOf(source)}>
      {confidence ? <ConfidenceBadge level={confidence} /> : null}
      <ProvenanceLabel source={source.producer} />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
});
