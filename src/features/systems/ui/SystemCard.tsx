import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Card, Overline, Tag } from '../../../design/components';
import { color, spacing } from '../../../design/tokens';
import type { LocalDate } from '../../../domain/logicalDay';
import { attentionLine, copy, durationLine, scheduleSentence, scheduleTag, stepCountLine } from '../copy';
import type { HubItem } from '../model/types';

/**
 * One System on the hub: a reusable operating pattern, not a habit tile. It shows what the System
 * IS (name, purpose, how it repeats, how many steps) and never how well anyone did at it — there is
 * no progress, no tally and no encouragement here, because there is nothing done to count.
 */
export function SystemCard({ item, today, onPress }: { item: HubItem; today: LocalDate; onPress: () => void }) {
  const tag = scheduleTag(item.schedule, today);
  const sentence = item.schedule.state === 'active' || item.schedule.state === 'paused' ? scheduleSentence(item.schedule) : null;
  const facts = [stepCountLine(item.stepCount), durationLine(item.duration)].filter((fact): fact is string => fact !== null);
  const attention = item.needsAttention && item.responsibility !== null ? attentionLine({ kind: item.responsibility.holderKind, id: null, name: item.responsibility.holderName }) : null;

  // One spoken sentence, in reading order, so the card is not a pile of fragments to a screen reader.
  const spoken = [item.name, item.areaName, item.purpose, tag, sentence, ...facts, attention].filter(Boolean).join('. ');

  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={spoken} accessibilityHint={copy.hub.cardHint} style={({ pressed }) => (pressed ? styles.pressed : null)}>
      <Card tone={item.needsAttention ? 'attention' : 'surface'}>
        {item.areaName ? <Overline>{item.areaName}</Overline> : null}
        <AppText variant="cardTitle" style={styles.name}>
          {item.name}
        </AppText>
        {item.purpose.length > 0 ? (
          <AppText variant="supporting" color={color.text.secondary} numberOfLines={2} style={styles.purpose}>
            {item.purpose}
          </AppText>
        ) : null}
        <View style={styles.tagRow}>
          <Tag label={tag} tone={item.schedule.state === 'active' ? 'accent' : 'neutral'} />
        </View>
        <AppText variant="metadata" color={color.text.muted} style={styles.facts}>
          {[sentence, ...facts].filter(Boolean).join(' · ')}
        </AppText>
        {attention !== null ? (
          <AppText variant="metadata" color={color.status.attention} style={styles.attention}>
            {attention}
          </AppText>
        ) : null}
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pressed: { opacity: 0.75 },
  name: { marginTop: spacing.xs },
  purpose: { marginTop: spacing.xs },
  tagRow: { marginTop: spacing.md, flexDirection: 'row' },
  facts: { marginTop: spacing.sm },
  attention: { marginTop: spacing.sm },
});
