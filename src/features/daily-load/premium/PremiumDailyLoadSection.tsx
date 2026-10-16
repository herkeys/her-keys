import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AiMark, AppText, Button, Card, ConfirmationSheet, Divider, PremiumBadge, Sheet, Tag } from '../../../design/components';
import { sizing, spacing } from '../../../design/tokens';
import { createThemedStyles, useTheme } from '../../../design/theme';
import type { DailyLoadReview, RescheduleProposal } from '../../../domain/premium/dailyLoadReview';
import { openAccountToRestore } from '../../../monetization/accountNavigation';
import type { PremiumCopy } from '../../../monetization/premiumCopy';
import { COPY, assumptionLine, consideredLine, dayTitle, evidenceGapLine, pressureResponsibleLine, pressureSentence, proposalHeadline, proposalImpactLines } from './copy';
import { usePremiumDailyLoad, type Notice, type PremiumDailyLoadApi, type ReceiptView } from './usePremiumDailyLoad';

const noticeColor = (tone: Notice['tone'], c: { attention: string; success: string; textSecondary: string }) => (tone === 'attention' ? c.attention : tone === 'success' ? c.success : c.textSecondary);

/**
 * Her Keys Premium's Daily Load review, on Today beneath the Free Daily Load.
 *
 *   Free:    the verdict (overloaded / tight / open), one suggested move to tomorrow, keep, protect. Untouched by this component.
 *   Premium: every pressure ranked with the records behind it, what was considered and what was not, alternative days that were each
 *            evaluated, the measured before/after of both days, an explicit approval, a receipt, and an undo.
 *
 * Mount it only where the day has something to say (the parent decides); it renders nothing for a signed-out device (Premium belongs
 * to the account) and nothing while the server's answer is still loading.
 */
export function PremiumDailyLoadSection({ showWhenClear = false }: { showWhenClear?: boolean }) {
  const api = usePremiumDailyLoad();
  const { feature } = api;
  if (feature.state.kind === 'signed_out' || feature.state.kind === 'loading') return null;
  // No pressure and no receipts: nothing to offer, and nothing to undo.
  if (!showWhenClear && api.receipts.length === 0) return null;
  return <PremiumDailyLoadPanel api={api} />;
}

export function PremiumDailyLoadPanel({ api }: { api: PremiumDailyLoadApi }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const { feature } = api;
  const usable = feature.usable;
  return (
    <Card tone="accent" style={styles.card}>
      {/* HK-FE-UI-02 Premium register: the small Luxury Black badge beside the plan tag; everything else is the Free card language. */}
      <View style={styles.brandRow}>
        <PremiumBadge />
        <View>
          <Tag label="Her Keys Premium" tone="accent" />
        </View>
      </View>
      <AppText variant="screenTitle" style={styles.headline}>
        {usable ? COPY.entry.title : feature.copy.title}
      </AppText>
      <AppText variant="body" color={colors.textSecondary} style={styles.body}>
        {usable ? COPY.entry.body : feature.copy.body}
      </AppText>

      {api.upgrade.notice !== null ? (
        <AppText variant="supporting" color={noticeColor(api.upgrade.notice.tone, colors)} style={styles.note} accessibilityRole="alert">
          {api.upgrade.notice.message}
        </AppText>
      ) : null}
      {api.notice !== null ? (
        <AppText variant="supporting" color={noticeColor(api.notice.tone, colors)} style={styles.note} accessibilityRole="alert">
          {api.notice.message}
        </AppText>
      ) : null}

      <Actions api={api} copy={feature.copy} />
      <Receipts receipts={api.receipts} busyId={api.undoingId} onUndo={api.undo} />

      <Sheet visible={api.panel === 'open' && api.review !== null} onClose={api.close} accessibilityLabel={COPY.sheet.title}>
        {api.review !== null ? <ReviewBody api={api} review={api.review} /> : null}
      </Sheet>

      <ConfirmationSheet
        visible={api.confirming !== null}
        title={COPY.confirm.title}
        body={api.confirming === null ? '' : `${proposalHeadline(api.confirming)}. ${COPY.confirm.scope}`}
        cancelLabel={COPY.confirm.cancel}
        confirmLabel={COPY.confirm.confirm}
        onCancel={api.cancelConfirm}
        onConfirm={() => void api.approve()}
      />
    </Card>
  );
}

function Actions({ api, copy }: { api: PremiumDailyLoadApi; copy: PremiumCopy }) {
  const styles = useStyles();
  const { feature, upgrade } = api;
  if (feature.usable) {
    return (
      <Button label={api.panel === 'opening' ? COPY.entry.opening : COPY.entry.open} onPress={() => void api.open()} disabled={api.panel === 'opening'} style={styles.primaryButton} />
    );
  }
  const primary = copy.actionLabel;
  return (
    <View>
      {copy.action === 'upgrade' && primary !== null ? <Button label={primary} onPress={() => void upgrade.start()} disabled={upgrade.presenting} style={styles.primaryButton} /> : null}
      {(copy.action === 'verify' || copy.action === 'retry') && primary !== null ? <Button label={primary} onPress={() => void feature.verify()} style={styles.primaryButton} /> : null}
      {copy.action === 'restore' && primary !== null ? <Button label={primary} onPress={() => void openAccountToRestore()} style={styles.primaryButton} /> : null}
      {copy.secondaryAction === 'verify' && copy.secondaryLabel !== null ? <Button label={copy.secondaryLabel} variant="ghost" size="sm" onPress={() => void feature.verify()} /> : null}
      {copy.secondaryAction === 'restore' && copy.secondaryLabel !== null ? <Button label={copy.secondaryLabel} variant="ghost" size="sm" onPress={() => void openAccountToRestore()} /> : null}
    </View>
  );
}

function Receipts({ receipts, busyId, onUndo }: { receipts: ReceiptView[]; busyId: string | null; onUndo: (id: string) => Promise<void> }) {
  const { colors } = useTheme();
  const styles = useStyles();
  if (receipts.length === 0) return null;
  return (
    <View style={styles.receipts}>
      <Divider />
      <AppText variant="sectionTitle" style={styles.sectionTitle}>
        {COPY.sheet.recentTitle}
      </AppText>
      {receipts.map((receipt) => (
        <View key={receipt.id} style={styles.receiptRow}>
          {/* APPLIED: a receipt of something that already happened — a neutral receipt glyph, never the solid confirmed check (an undone
              receipt reads from its own words), and always beside its undo. */}
          <View style={styles.receiptLine}>
            <View accessibilityElementsHidden importantForAccessibility="no">
              <Ionicons name="receipt-outline" size={sizing.icon.md} color={colors.textSecondary} />
            </View>
            <AppText variant="body" color={colors.textSecondary} style={styles.receiptText}>
              {receipt.line}
            </AppText>
          </View>
          {receipt.canUndo ? <Button label={busyId === receipt.id ? COPY.sheet.undoing : COPY.sheet.undo} variant="secondary" size="sm" onPress={() => void onUndo(receipt.id)} disabled={busyId !== null} /> : null}
        </View>
      ))}
    </View>
  );
}

function ReviewBody({ api, review }: { api: PremiumDailyLoadApi; review: DailyLoadReview }) {
  const { colors } = useTheme();
  const styles = useStyles();
  const [showConsidered, setShowConsidered] = useState(false);
  return (
    <View>
      <View style={styles.sheetHeader}>
        <AppText variant="screenTitle">{dayTitle(review.date)}</AppText>
        <Tag label={review.metrics.tier} tone={review.metrics.tier === 'open' ? 'success' : 'attention'} />
      </View>

      {review.outlook === 'clear' ? (
        <View style={styles.block}>
          <AppText variant="sectionTitle">{COPY.clear.title}</AppText>
          <AppText variant="body" color={colors.textSecondary}>{COPY.clear.body}</AppText>
        </View>
      ) : (
        <View style={styles.block}>
          <AppText variant="sectionTitle" style={styles.sectionTitle}>{COPY.sheet.pressuresTitle}</AppText>
          {review.pressures.map((pressure) => (
            <View key={pressure.id} style={styles.pressure}>
              <AppText variant="body">{pressureSentence(pressure)}</AppText>
              {pressureResponsibleLine(pressure) !== null ? (
                <AppText variant="supporting" color={colors.textSecondary}>{pressureResponsibleLine(pressure)}</AppText>
              ) : null}
            </View>
          ))}
        </View>
      )}

      {review.outlook === 'pressure_without_move' ? (
        <View style={styles.block}>
          <AppText variant="sectionTitle">{COPY.noMove.title}</AppText>
          <AppText variant="body" color={colors.textSecondary}>{COPY.noMove.body}</AppText>
        </View>
      ) : null}

      {api.proposals.length > 0 ? (
        <View style={styles.block}>
          <AppText variant="sectionTitle" style={styles.sectionTitle}>{COPY.sheet.movesTitle}</AppText>
          {api.proposals.map((proposal) => (
            <ProposalCard key={proposal.digest} proposal={proposal} busy={api.busyDigest === proposal.digest} anyBusy={api.busyDigest !== null} onApprove={() => api.askApprove(proposal)} onDismiss={() => void api.dismiss(proposal)} />
          ))}
        </View>
      ) : null}

      <View style={styles.block}>
        <AppText variant="sectionTitle" style={styles.sectionTitle}>{COPY.sheet.gapsTitle}</AppText>
        {review.evidenceGaps.map((gap) => (
          <AppText key={gap} variant="supporting" color={colors.textSecondary} style={styles.gap}>{evidenceGapLine(gap)}</AppText>
        ))}
      </View>

      <Button label={showConsidered ? COPY.sheet.hideConsidered : COPY.sheet.showConsidered} variant="ghost" size="sm" onPress={() => setShowConsidered((v) => !v)} />
      {showConsidered ? (
        <View style={styles.block}>
          <AppText variant="sectionTitle" style={styles.sectionTitle}>{COPY.sheet.consideredTitle}</AppText>
          {review.considered.map((record) => (
            <AppText key={`${record.kind}:${record.id}`} variant="supporting" color={colors.textSecondary} style={styles.gap}>{consideredLine(record)}</AppText>
          ))}
        </View>
      ) : null}

      <Button label={COPY.entry.close} variant="secondary" onPress={api.close} style={styles.closeButton} />
    </View>
  );
}

function ProposalCard({ proposal, busy, anyBusy, onApprove, onDismiss }: { proposal: RescheduleProposal; busy: boolean; anyBusy: boolean; onApprove: () => void; onDismiss: () => void }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    // PROPOSED CHANGE: the recommendation structure (solid Berry rail + lightbulb mark). Nothing here has happened yet — approval is a
    // separate, explicit action below, and the applied result appears only as a receipt.
    <Card tone="surface" style={[styles.proposal, styles.proposalRail]}>
      <View style={styles.proposalHead}>
        <AiMark kind="suggests" />
        <AppText variant="sectionTitle" style={styles.proposalTitle}>{proposalHeadline(proposal)}</AppText>
      </View>
      {proposalImpactLines(proposal).map((line) => (
        <AppText key={line} variant="body" color={colors.textSecondary} style={styles.gap}>{line}</AppText>
      ))}
      {proposal.assumptions.map((code) => (
        <AppText key={code} variant="supporting" color={colors.textTertiary} style={styles.gap}>{assumptionLine(code, proposal)}</AppText>
      ))}
      <View style={styles.proposalActions}>
        <Button label={busy ? COPY.sheet.approving : COPY.sheet.approve} onPress={onApprove} disabled={anyBusy} style={styles.primaryButton} />
        <Button label={COPY.sheet.reject} variant="ghost" size="sm" onPress={onDismiss} disabled={anyBusy} />
      </View>
    </Card>
  );
}

const useStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  card: { marginBottom: spacing.lg },
  headline: { marginTop: spacing.md },
  body: { marginTop: spacing.sm },
  note: { marginTop: spacing.md },
  primaryButton: { marginTop: spacing.lg },
  receipts: { marginTop: spacing.lg },
  sectionTitle: { marginTop: spacing.md, marginBottom: spacing.xs },
  receiptRow: { marginTop: spacing.sm, gap: spacing.sm },
  receiptLine: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.sm },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  proposalRail: { borderLeftWidth: 4, borderLeftColor: colors.accent },
  proposalHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  proposalTitle: { flexShrink: 1 },
  receiptText: { flexShrink: 1 },
  sheetHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md },
  block: { marginTop: spacing.lg },
  pressure: { marginTop: spacing.sm },
  gap: { marginTop: spacing.xs },
  proposal: { marginTop: spacing.md },
  proposalActions: { marginTop: spacing.md },
  closeButton: { marginTop: spacing.xl },
}));
