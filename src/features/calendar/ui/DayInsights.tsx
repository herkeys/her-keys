import { StyleSheet, View } from 'react-native';
import { AppText, Card, InlineNotice, Tag } from '../../../design/components';
import { colors, spacing } from '../../../design/tokens';
import { COPY, conflictCopy, headlineFor, missingLines, tierLabel, type CopyContext, type Headline } from '../copy';
import type { CalendarDayViewModel, Conflict, MissingEvidence } from '../model/types';
import { WhyDisclosure } from './Disclosure';

/**
 * The first thing on the day: one sentence about whether it fits, in the foundation’s own capacity
 * category (Room / Tight / More than fits / Not enough known). There is no meter, no percentage and no
 * score — the category is a word, and the evidence is one press away.
 */
export function DaySummary({ view, ctx }: { view: CalendarDayViewModel; ctx: CopyContext }) {
  const headline = headlineFor(view, ctx);
  const state = view.capacityState;
  const showTier = view.dayMode !== 'past' && state !== null && headline.kind !== 'empty';
  return (
    <Card tone="surface" style={styles.summary}>
      {showTier ? (
        <View style={styles.tierRow} accessibilityLabel={`Capacity: ${tierLabel(state.tier)}`}>
          <Tag label={tierLabel(state.tier)} tone={state.tier === 'overloaded' ? 'attention' : 'neutral'} />
        </View>
      ) : null}
      <AppText variant="bodyStrong" color={toneOf(headline)} accessibilityRole="header">
        {headline.text}
      </AppText>
      {headline.more > 0 ? (
        <AppText variant="metadata" color={colors.textSecondary} style={styles.more}>
          {headline.more === 1 ? '1 more below.' : `${headline.more} more below.`}
        </AppText>
      ) : null}
    </Card>
  );
}

const toneOf = (headline: Headline): string => (headline.kind === 'problem' ? colors.attention : colors.textPrimary);

/** One genuine conflict: a plain sentence, a text label (never color alone), and the evidence on request. */
export function ConflictCard({ conflict, ctx }: { conflict: Conflict; ctx: CopyContext }) {
  const copy = conflictCopy(conflict, ctx);
  return (
    <Card tone="surface" style={styles.conflict}>
      <Tag label={copy.label} tone="attention" />
      <AppText variant="body" style={styles.conflictText}>
        {copy.sentence}
      </AppText>
      <WhyDisclosure reasons={copy.why} subject={copy.sentence} />
    </Card>
  );
}

/** Conflicts other than “needs a place”, which is shown with the item it is about. */
export function ConflictList({ conflicts, ctx }: { conflicts: Conflict[]; ctx: CopyContext }) {
  const shown = conflicts.filter((conflict) => conflict.type !== 'PLACEMENT_FAILURE');
  if (shown.length === 0) return null;
  return (
    <View style={styles.list}>
      {shown.map((conflict) => (
        <ConflictCard key={conflict.id} conflict={conflict} ctx={ctx} />
      ))}
    </View>
  );
}

/** What could not be established. Named specifically — the fields that are missing — never a vague warning. */
export function UnknownNotice({ missing, ctx }: { missing: MissingEvidence[]; ctx: CopyContext }) {
  if (missing.length === 0) return null;
  return <InlineNotice tone="waiting" title={COPY.unknownHeading} body={missingLines(missing, ctx).join('\n')} style={styles.notice} />;
}

const styles = StyleSheet.create({
  summary: { marginBottom: spacing.lg },
  tierRow: { marginBottom: spacing.sm },
  more: { marginTop: spacing.xs },
  list: { gap: spacing.md, marginBottom: spacing.lg },
  conflict: { gap: spacing.sm },
  conflictText: { marginTop: spacing.xs },
  notice: { marginTop: spacing.lg },
});
