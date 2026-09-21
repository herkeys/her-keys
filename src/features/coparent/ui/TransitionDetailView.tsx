import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, InlineNotice } from '../../../design/components';
import { colors, spacing } from '../../../design/tokens';
import { COPY } from '../copy';
import { presentPrepItem, presentTransitionRow, type PresentationContext, type ResponsibilityAction, type TransitionDetailPresentation } from '../present';
import type { PrepItemView, TransitionDetailView as TransitionDetailModel } from '../types';
import type { CounterpartChoice } from './actions';
import { handoffLabelFor } from './labels';
import { Caption, ErrorLine, Lines, Section, TagRow, type AreaError } from './parts';
import { RemoveControl } from './RemoveControl';
import { ResponsibilityActions } from './ResponsibilityActions';

export interface TransitionDetailViewProps {
  /** With the handoff's id, keys the location reveal, so it starts hidden again for a different household or a different handoff. */
  householdId: string;
  presentation: TransitionDetailPresentation;
  detail: TransitionDetailModel;
  presentationCtx: PresentationContext;
  busy: boolean;
  error: AreaError | null;
  onResponsibilityAction: (action: ResponsibilityAction, counterpart: CounterpartChoice | null) => void;
  onCompletePrep: (taskId: string) => void;
  onRemovePrep: (taskId: string) => void;
  onUnlinkPrep: (dependencyId: string) => void;
  onAddPrep: () => void;
  onEdit: () => void;
  onRemove: () => void;
}

/**
 * ONE HANDOFF, OPENED. This is the only screen that can show where it is, and only after she asks: the location is hidden until she
 * presses "Show location", and the reveal is local state keyed by household and handoff, so it never survives a change of either.
 * Every sentence comes from the presentation; every button is a recording of what SHE says, and none of them contacts anyone.
 */
export function TransitionDetailView(props: TransitionDetailViewProps) {
  const { householdId, presentation: p, detail, presentationCtx, busy, error } = props;
  const transition = detail.transition;
  const revealKey = `${householdId}:${transition?.id ?? ''}`;
  const [revealedKey, setRevealedKey] = useState<string | null>(null);
  // A reveal belongs to one household and one handoff. If either changes it is forgotten — and stays forgotten if the old pair returns.
  if (revealedKey !== null && revealedKey !== revealKey) setRevealedKey(null);
  if (transition === null) return null;

  const revealed = revealedKey === revealKey && detail.location !== null;
  const removed = transition.lifecycle === 'removed';
  const tags = presentTransitionRow(transition, presentationCtx).tags;
  const handoffLabel = handoffLabelFor(transition, presentationCtx.today);
  const notes = detail.notes !== null && detail.notes.trim() !== '' ? detail.notes : null;
  const errorIn = (area: AreaError['area']) => (error !== null && error.area === area ? error.text : null);

  // The same sentence is never printed twice: a review line that is also a responsibility line is shown once, in the review notice.
  const responsibilityLines = p.responsibilityLines.filter((line) => !p.reviewLines.includes(line));

  return (
    <View>
      <View>
        <AppText variant="metadata" color={colors.textTertiary}>
          {p.childName}
        </AppText>
        <AppText variant="screenTitle" accessibilityRole="header">
          {p.title}
        </AppText>
        <AppText variant="body" color={colors.textSecondary}>
          {p.whenLine}
        </AppText>
        {p.zoneNote !== null ? <Caption>{p.zoneNote}</Caption> : null}
        {p.statusLine !== null ? (
          <AppText variant="supporting" color={colors.textSecondary}>
            {p.statusLine}
          </AppText>
        ) : null}
        <TagRow tags={tags} />
      </View>

      {removed ? <InlineNotice title={COPY.detail.removed} style={styles.notice} /> : null}
      {p.reviewLines.length > 0 ? <InlineNotice tone="attention" title={COPY.sections.needsReview} body={p.reviewLines.join('\n')} style={styles.notice} /> : null}

      <Section title={COPY.detail.location}>
        <AppText variant="body">{p.locationLabel}</AppText>
        {detail.location !== null ? (
          <Button
            label={revealed ? COPY.privacy.hideLocation : COPY.privacy.showLocation}
            variant="secondary"
            size="sm"
            onPress={() => setRevealedKey(revealed ? null : revealKey)}
            style={styles.start}
          />
        ) : null}
        {revealed ? (
          <Card tone="subtle" style={styles.reveal}>
            <AppText variant="body">{detail.location}</AppText>
          </Card>
        ) : null}
      </Section>

      <Section title={COPY.detail.responsibility}>
        <Lines lines={responsibilityLines} />
        {removed ? null : (
          <ResponsibilityActions view={transition.responsibility} people={detail.people} busy={busy} error={errorIn('responsibility')} onAction={props.onResponsibilityAction} />
        )}
      </Section>

      {p.needsYouLines.length > 0 ? (
        <Section title={COPY.sections.needsYou}>
          <Lines lines={p.needsYouLines} />
        </Section>
      ) : null}

      <Section title={COPY.sections.preparation}>
        <AppText variant="supporting" color={colors.textSecondary}>
          {p.preparationLine}
        </AppText>
        {transition.preparation.items.map((item) => (
          <PrepRow
            key={item.taskId}
            item={item}
            ctx={presentationCtx}
            handoffLabel={handoffLabel}
            busy={busy}
            actionable={!removed}
            onComplete={props.onCompletePrep}
            onRemove={props.onRemovePrep}
            onUnlink={props.onUnlinkPrep}
          />
        ))}
        {removed ? null : <Button label={COPY.actions.addPrep} variant="secondary" size="sm" onPress={props.onAddPrep} disabled={busy} style={styles.addPrep} />}
        <ErrorLine text={errorIn('preparation')} />
      </Section>

      {p.repeatLines.length > 0 ? (
        <Section title={COPY.editor.repeat}>
          <Lines lines={p.repeatLines} />
        </Section>
      ) : null}

      {p.unknownLines.length > 0 ? (
        <Section title={COPY.detail.notRecorded}>
          <Lines lines={p.unknownLines} />
        </Section>
      ) : null}

      {notes !== null ? (
        <Section title={COPY.detail.notes}>
          <AppText variant="body">{notes}</AppText>
        </Section>
      ) : null}

      {p.privacyLine !== null ? (
        <View style={styles.privacy}>
          <Caption>{p.privacyLine}</Caption>
        </View>
      ) : null}

      {removed ? null : (
        <View style={styles.manage}>
          <Button label={COPY.actions.edit} variant="secondary" onPress={props.onEdit} disabled={busy} style={styles.start} />
          <RemoveControl
            label={COPY.actions.remove}
            confirmTitle={COPY.confirm.removeHandoffTitle}
            confirmBody={COPY.confirm.removeHandoffBody}
            busy={busy}
            onConfirm={props.onRemove}
          />
          <ErrorLine text={errorIn('manage')} />
        </View>
      )}
    </View>
  );
}

interface PrepRowProps {
  item: PrepItemView;
  ctx: PresentationContext;
  handoffLabel: string;
  busy: boolean;
  actionable: boolean;
  onComplete: (taskId: string) => void;
  onRemove: (taskId: string) => void;
  onUnlink: (dependencyId: string) => void;
}

/** One preparation item tied to this handoff. "Mark done" means ticked off; nothing here says it arrived anywhere. */
function PrepRow({ item, ctx, handoffLabel, busy, actionable, onComplete, onRemove, onUnlink }: PrepRowProps) {
  const prep = presentPrepItem(item, ctx, handoffLabel);
  const open = prep.standing === 'open';
  const dependencyId = item.dependencyId;
  return (
    <View style={styles.prep}>
      <AppText variant="cardTitle">{prep.title}</AppText>
      <Caption>{prep.standingLabel}</Caption>
      <Lines lines={prep.lines} />
      {actionable ? (
        <View style={styles.prepActions}>
          {/* The item's own title is the hint that tells identical labels apart. */}
          {open ? <Button label={COPY.actions.markDone} size="sm" variant="secondary" onPress={() => onComplete(prep.taskId)} disabled={busy} accessibilityHint={prep.title} /> : null}
          {open ? <Button label={COPY.actions.removeItem} size="sm" variant="ghost" onPress={() => onRemove(prep.taskId)} disabled={busy} accessibilityHint={prep.title} /> : null}
          {dependencyId !== null ? <Button label={COPY.actions.unlink} size="sm" variant="ghost" onPress={() => onUnlink(dependencyId)} disabled={busy} accessibilityHint={prep.title} /> : null}
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { marginTop: spacing.lg },
  start: { alignSelf: 'flex-start', marginTop: spacing.sm },
  reveal: { marginTop: spacing.sm },
  addPrep: { alignSelf: 'flex-start', marginTop: spacing.md },
  prep: { marginTop: spacing.md },
  prepActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.sm },
  privacy: { marginTop: spacing.xxl },
  manage: { marginTop: spacing.xxl, gap: spacing.md },
});
