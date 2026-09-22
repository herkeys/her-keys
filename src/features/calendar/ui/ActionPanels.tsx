import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, InlineNotice, RecommendationBlock } from '../../../design/components';
import { spacing } from '../../../design/tokens';
import { ACCEPT_LABEL, COPY, copyContextFor, offersFor, previewLines, undoLine, type CopyContext } from '../copy';
import type { ActionPreview, PreviewableIntent } from '../model/preview';
import type { CalendarDayViewModel } from '../model/types';
import { WhyDisclosure } from './Disclosure';

/**
 * WHAT THE FOUNDATION OFFERS, and nothing else. Every offer here is a legitimate mutation that the
 * action map says is available right now; Calendar adds no ranking and no action of its own. Each block
 * needs her explicit yes (`approvalRequired`), and pressing the primary action opens a PREVIEW — it never
 * applies anything itself.
 */
export function RecommendationSection({
  view,
  ctx,
  onPreview,
  onKeep,
}: {
  view: CalendarDayViewModel;
  ctx: CopyContext;
  onPreview: (intent: PreviewableIntent) => void;
  onKeep: (keep: 'timing' | 'capacity') => void;
}) {
  const offers = offersFor(view, ctx);
  if (offers.length === 0) return null;
  return (
    <View style={styles.section}>
      {offers.map((offer) => (
        <View key={offer.key}>
          <RecommendationBlock
            body={offer.body}
            approvalRequired
            actionLabel={offer.primary.label}
            onApprove={() => onPreview(offer.primary.intent)}
            onShowAlternative={offer.alternative === null ? undefined : () => onPreview(offer.alternative!.intent)}
            onNotToday={() => onKeep(offer.keep)}
          />
          <WhyDisclosure reasons={offer.why} subject={offer.body} />
        </View>
      ))}
    </View>
  );
}

export type PreviewNotice = 'updated' | 'out_of_date' | 'failed' | null;

/**
 * The ephemeral what-if. It is unmistakably marked as a preview, describes a hypothesis in the
 * conditional ("would"), and can be cancelled with no trace. If the schedule changed underneath it, it
 * says so and refuses to apply until it has been recomputed.
 */
export function PreviewPanel({
  preview,
  validity,
  notice,
  busy,
  onAccept,
  onCancel,
  onPreviewAgain,
}: {
  preview: ActionPreview;
  validity: 'current' | 'stale';
  notice: PreviewNotice;
  busy: boolean;
  onAccept: () => void;
  onCancel: () => void;
  onPreviewAgain: () => void;
}) {
  const ctx = copyContextFor(preview.before);
  const lines = previewLines(preview, ctx);
  const current = validity === 'current';
  return (
    <Card tone="surface" style={styles.preview}>
      <InlineNotice tone="info" title={COPY.previewBanner} />
      {!current ? <InlineNotice tone="attention" title={COPY.previewOutOfDate} style={styles.gap} /> : null}
      {current && notice === 'updated' ? <InlineNotice tone="waiting" title={COPY.previewUpdated} style={styles.gap} /> : null}
      {notice === 'failed' ? <InlineNotice tone="attention" title={COPY.saveFailed} style={styles.gap} /> : null}
      <View style={styles.lines} accessibilityLabel={COPY.whatWouldChange}>
        {lines.map((line) => (
          <AppText key={line} variant="body">
            {line}
          </AppText>
        ))}
      </View>
      <View style={styles.buttons}>
        <Button label={ACCEPT_LABEL[preview.intent.kind]} onPress={onAccept} disabled={busy || !current} accessibilityHint={COPY.hintAccept} />
        {!current ? <Button label={COPY.previewAgain} variant="secondary" onPress={onPreviewAgain} /> : null}
        <Button label={COPY.cancel} variant="ghost" onPress={onCancel} accessibilityHint={COPY.hintCancelPreview} />
      </View>
    </Card>
  );
}

/** A move made today can be undone today. It is the safety net, so it asks for nothing. */
export function UndoNotice({ title, busy, onUndo }: { title: string; busy: boolean; onUndo: () => void }) {
  return (
    <View style={styles.undo}>
      <InlineNotice tone="success" title={undoLine(title)} />
      <Button label={COPY.undo} variant="secondary" size="sm" onPress={onUndo} disabled={busy} style={styles.undoButton} />
    </View>
  );
}

const styles = StyleSheet.create({
  section: { gap: spacing.md, marginBottom: spacing.lg },
  preview: { marginBottom: spacing.lg },
  gap: { marginTop: spacing.sm },
  lines: { gap: spacing.sm, marginTop: spacing.lg },
  buttons: { gap: spacing.sm, marginTop: spacing.lg },
  undo: { marginBottom: spacing.lg },
  undoButton: { alignSelf: 'flex-start', marginTop: spacing.sm },
});
