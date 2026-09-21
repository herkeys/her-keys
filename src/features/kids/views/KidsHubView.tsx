import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, EmptyState, InlineNotice, Tag } from '../../../design/components';
import { color, interaction, radius, sizing, spacing } from '../../../design/tokens';
import { HUB, cardTags, nextLine } from '../copy';
import type { ChildCard, KidsView } from '../types';

/**
 * The Kids hub: "what's going on with my kids?" One quiet card per child - who they are, what is next, and only the facts that need
 * her. No score, no rank, no percentage, no equal-priority wall.
 */
export interface KidsHubViewProps {
  view: KidsView;
  /** Whether a child may be added here: true for a household that is bound to an account and for one that is not (owner checkpoint OC-01). */
  canAddChild: boolean;
  onOpenChild: (childId: string) => void;
  onAddChild: () => void;
}

function cardSummary(card: ChildCard, today: string): string {
  if (card.next) return nextLine(card.next, today);
  return card.hasAnyRecords ? HUB.nothingComing : HUB.noRecords;
}

export function KidsHubView({ view, canAddChild, onOpenChild, onAddChild }: KidsHubViewProps) {
  if (view.status === 'household_mismatch') {
    return <InlineNotice tone="attention" title="Nothing to show" body={HUB.mismatch} />;
  }

  if (view.children.length === 0) {
    return (
      <View style={styles.stack}>
        <EmptyState title={HUB.emptyTitle} body={HUB.emptyBody} />
        {canAddChild ? (
          <Button label={HUB.addChild} onPress={onAddChild} />
        ) : (
          <InlineNotice tone="info" title="Adding a child" body={HUB.addChildUnavailable} />
        )}
      </View>
    );
  }

  return (
    <View style={styles.stack}>
      <AppText variant="supporting" color={color.text.secondary}>
        {HUB.intro}
      </AppText>
      {view.children.map((card) => {
        const summary = cardSummary(card, view.today);
        const tags = cardTags(card);
        const label = [card.label.full, summary, ...tags.map((tag) => tag.label)].join('. ');
        return (
          <Pressable
            key={card.childId}
            onPress={() => onOpenChild(card.childId)}
            accessibilityRole="button"
            accessibilityLabel={label}
            accessibilityHint="Opens this child"
            style={({ pressed }) => [styles.press, pressed ? { opacity: interaction.pressedOpacity } : null]}
          >
            <Card>
              <AppText variant="cardTitle">{card.label.short}</AppText>
              {card.label.context ? (
                <AppText variant="metadata" color={color.text.secondary}>
                  {card.label.context}
                </AppText>
              ) : null}
              <AppText variant="body" color={color.text.secondary} style={styles.summary}>
                {summary}
              </AppText>
              {tags.length > 0 ? (
                <View style={styles.tags}>
                  {tags.map((tag) => (
                    <Tag key={tag.label} label={tag.label} tone={tag.tone} />
                  ))}
                </View>
              ) : null}
            </Card>
          </Pressable>
        );
      })}
      {view.unattributed > 0 ? <InlineNotice tone="info" title="Not shown under a child" body={HUB.unattributed(view.unattributed)} /> : null}
      {canAddChild ? (
        <Button label={HUB.addChild} variant="secondary" onPress={onAddChild} />
      ) : (
        <AppText variant="metadata" color={color.text.muted}>
          {HUB.addChildUnavailable}
        </AppText>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  press: { minHeight: sizing.minTouchTarget, borderRadius: radius.lg },
  summary: { marginTop: spacing.xs },
  tags: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
});
