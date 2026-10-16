import { StyleSheet, View } from 'react-native';
import { AiMark, AppText, Button, Card, Divider, InlineNotice, PremiumBadge, Sheet, Tag } from '../../../design/components';
import { colors, spacing } from '../../../design/tokens';
import type { MomentumReport } from '../../../domain/premium/momentum/model';
import type { SavedReport } from '../../../domain/premium/momentum/snapshot';
import { openAccountToRestore } from '../../../monetization/accountNavigation';
import type { PremiumCopy } from '../../../monetization/premiumCopy';
import {
  COPY,
  basedOnLine,
  comparisonLines,
  comparisonUnavailableLine,
  countLines,
  insufficientBody,
  nextStepBody,
  nextStepHeadline,
  patternLine,
  periodLabel,
  savedLine,
  savedReviewLine,
  tierExplanation,
  tierLabel,
  unavailableLine,
} from './copy';
import type { SavedReview } from './momentumFlow';
import { usePremiumMomentum, type MomentumView, type PremiumMomentumApi } from './usePremiumMomentum';

/**
 * Her Keys Premium's weekly review, on Today. Discovery is visible to Free accounts ONLY when the server manifest
 * has released this feature. Existing saved reviews always remain available after a subscription ends.
 * A signed-out device, an unresolved server view, or an unreleased feature with no saved records renders nothing.
 */
export function PremiumMomentumSection() {
  const api = usePremiumMomentum();
  const { feature } = api;
  if (feature.state.kind === 'signed_out' || feature.state.kind === 'loading') return null;
  if (!feature.usable && feature.state.kind !== 'upgrade_required' && api.saved.length === 0) return null;
  return <PremiumMomentumPanel api={api} />;
}

export function PremiumMomentumPanel({ api }: { api: PremiumMomentumApi }) {
  const { feature, view } = api;
  const open = view.kind === 'review' || view.kind === 'saved';
  return (
    <Card tone="accent" style={styles.card}>
      <View style={styles.brandRow}>
        <PremiumBadge />
        <View>
          <Tag label="Her Keys Premium" tone="accent" />
        </View>
      </View>
      <AppText variant="screenTitle" style={styles.headline}>
        {feature.usable ? COPY.entry.title : feature.copy.title}
      </AppText>
      <AppText variant="body" color={colors.textSecondary} style={styles.body}>
        {feature.usable ? COPY.entry.body : feature.copy.body}
      </AppText>

      {api.upgrade.notice !== null ? (
        <AppText variant="supporting" color={colors.textSecondary} style={styles.note} accessibilityRole="alert">
          {api.upgrade.notice.message}
        </AppText>
      ) : null}
      {api.notice !== null ? (
        <AppText variant="supporting" color={colors.attention} style={styles.note} accessibilityRole="alert">
          {api.notice.message}
        </AppText>
      ) : null}

      <Actions api={api} copy={feature.copy} />
      <Earlier api={api} />

      <Sheet visible={open} onClose={api.close} accessibilityLabel={COPY.sheet.title}>
        <SheetBody api={api} view={view} />
      </Sheet>
    </Card>
  );
}

function Actions({ api, copy }: { api: PremiumMomentumApi; copy: PremiumCopy }) {
  const { feature, upgrade } = api;
  if (feature.usable) {
    return <Button label={api.view.kind === 'opening' ? COPY.entry.opening : COPY.entry.open} onPress={() => void api.open()} disabled={api.view.kind === 'opening'} style={styles.primaryButton} />;
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

function Earlier({ api }: { api: PremiumMomentumApi }) {
  if (api.saved.length === 0) return null;
  return (
    <View style={styles.block}>
      <Divider />
      <AppText variant="sectionTitle" style={styles.sectionTitle}>
        {COPY.entry.earlier}
      </AppText>
      <AppText variant="supporting" color={colors.textSecondary}>
        {COPY.entry.earlierBody}
      </AppText>
      {api.saved.slice(0, 5).map((review) => (
        <View key={review.id} style={styles.row}>
          <AppText variant="body" color={colors.textSecondary} style={styles.rowText}>
            {savedReviewLine(review.report)}
          </AppText>
          <Button label={`${COPY.entry.openSaved} ${periodLabel(review.report.period)}`} variant="secondary" size="sm" onPress={() => api.openSaved(review.id)} />
        </View>
      ))}
    </View>
  );
}

function SheetBody({ api, view }: { api: PremiumMomentumApi; view: MomentumView }) {
  if (view.kind === 'saved') return <SavedBody api={api} review={view.review} />;
  if (view.kind !== 'review') return null;
  const { outcome } = view;
  if (outcome.kind === 'unavailable') {
    return (
      <View>
        <AppText variant="screenTitle">{COPY.sheet.title}</AppText>
        <AppText variant="body" color={colors.textSecondary} style={styles.block}>
          {unavailableLine(outcome)}
        </AppText>
        <Button label={COPY.sheet.close} variant="secondary" onPress={api.close} style={styles.closeButton} />
      </View>
    );
  }
  if (outcome.kind === 'insufficient') {
    const { report } = outcome;
    return (
      <View>
        <AppText variant="screenTitle">{COPY.insufficient.title}</AppText>
        <AppText variant="supporting" color={colors.textSecondary} style={styles.gap}>
          {periodLabel(report.period)}
        </AppText>
        {/* INSUFFICIENT EVIDENCE: stated plainly with the waiting icon — no pattern, score or accomplishment is implied. */}
        <InlineNotice tone="waiting" title={insufficientBody(report.reason, report.have, report.needs)} style={styles.block} />
        <Button label={COPY.sheet.close} variant="secondary" onPress={api.close} style={styles.closeButton} />
      </View>
    );
  }
  return <ReadyBody api={api} report={outcome.report} saved={outcome.saved} nextApproved={view.nextApproved} />;
}

function ReadyBody({ api, report, saved, nextApproved }: { api: PremiumMomentumApi; report: Extract<MomentumReport, { status: 'ready' }>; saved: 'recorded' | 'already_saved' | 'pending'; nextApproved: boolean }) {
  const lines = countLines(report.counts);
  const next = report.nextStep;
  return (
    <View>
      <AppText variant="screenTitle">{COPY.sheet.title}</AppText>
      <AppText variant="supporting" color={colors.textSecondary} style={styles.gap}>
        {periodLabel(report.period)}
      </AppText>

      <Section title={COPY.sheet.thisWeekTitle}>
        {lines.map((line) => (
          <AppText key={line} variant="body" style={styles.line}>
            {line}
          </AppText>
        ))}
      </Section>

      <Section title={COPY.sheet.changesTitle}>
        {report.comparison ? (
          comparisonLines(report.comparison.deltas).map((line) => (
            <AppText key={line} variant="body" style={styles.line}>
              {line}
            </AppText>
          ))
        ) : (
          <AppText variant="body" color={colors.textSecondary}>
            {comparisonUnavailableLine}
          </AppText>
        )}
      </Section>

      <Section title={COPY.sheet.patternsTitle}>
        {report.patterns.length === 0 ? (
          <AppText variant="body" color={colors.textSecondary}>
            {COPY.noPatterns}
          </AppText>
        ) : (
          report.patterns.map((pattern, index) => (
            // INFERRED READING: dashed outline + the unconfirmed-reading mark, beside its existing tier tag. A pattern is never styled as a fact.
            <View key={`${pattern.kind}-${pattern.about?.id ?? pattern.weekday}-${index}`} style={[styles.pattern, styles.inferred]}>
              <View style={styles.inferredHead}>
                <AiMark kind="noticed" />
                <Tag label={tierLabel[pattern.tier]} tone={pattern.tier === 'possible' ? 'neutral' : 'accent'} />
              </View>
              <AppText variant="body" style={styles.line}>
                {patternLine(pattern, api.titleOf)}
              </AppText>
              <AppText variant="supporting" color={colors.textSecondary}>
                {tierExplanation(pattern)}
              </AppText>
            </View>
          ))
        )}
      </Section>

      <Section title={COPY.sheet.nextStepTitle}>
        {next === null ? (
          <AppText variant="body" color={colors.textSecondary}>
            {COPY.noNextStep}
          </AppText>
        ) : (
          // RECOMMENDATION: solid Berry rail + lightbulb mark; approval below is a separate, explicit action.
          <View style={styles.recommended}>
            <View style={styles.inferredHead}>
              <AiMark kind="suggests" />
            </View>
            <AppText variant="body">{nextStepHeadline(api.titleOf(next.about))}</AppText>
            <AppText variant="supporting" color={colors.textSecondary} style={styles.gap}>
              {nextStepBody}
            </AppText>
            {nextApproved ? (
              <AppText variant="body" color={colors.success} style={styles.line} accessibilityRole="alert">
                {COPY.nextStep.approved}
              </AppText>
            ) : (
              <View>
                <AppText variant="supporting" color={colors.textSecondary} style={styles.gap}>
                  {COPY.nextStep.scope}
                </AppText>
                <Button label={api.approving ? COPY.nextStep.approving : COPY.nextStep.approve} onPress={() => void api.approveNext()} disabled={api.approving} style={styles.primaryButton} />
              </View>
            )}
          </View>
        )}
      </Section>

      <Section title={COPY.sheet.basedOnTitle}>
        <AppText variant="supporting" color={colors.textSecondary}>
          {basedOnLine(report.evidence)}
        </AppText>
        <AppText variant="supporting" color={colors.textSecondary} style={styles.gap}>
          {savedLine(saved)}
        </AppText>
      </Section>

      <Button label={COPY.sheet.close} variant="secondary" onPress={api.close} style={styles.closeButton} />
    </View>
  );
}

function SavedBody({ api, review }: { api: PremiumMomentumApi; review: SavedReview }) {
  const report: SavedReport = review.report;
  const lines = countLines(report.counts);
  return (
    <View>
      <AppText variant="screenTitle">{COPY.sheet.savedCopyTitle}</AppText>
      <AppText variant="supporting" color={colors.textSecondary} style={styles.gap}>
        {periodLabel(report.period)}
      </AppText>
      <Section title={COPY.sheet.thisWeekTitle}>
        {lines.map((line) => (
          <AppText key={line} variant="body" style={styles.line}>
            {line}
          </AppText>
        ))}
      </Section>
      <Section title={COPY.sheet.patternsTitle}>
        {report.patterns.length === 0 ? (
          <AppText variant="body" color={colors.textSecondary}>
            {COPY.noPatterns}
          </AppText>
        ) : (
          report.patterns.map((pattern, index) => (
            <View key={`${pattern.kind}-${pattern.about?.id ?? pattern.weekday}-${index}`} style={[styles.pattern, styles.inferred]}>
              <View style={styles.inferredHead}>
                <AiMark kind="noticed" />
                <Tag label={tierLabel[pattern.tier]} tone={pattern.tier === 'possible' ? 'neutral' : 'accent'} />
              </View>
              <AppText variant="body" style={styles.line}>
                {patternLine(pattern, api.titleOf)}
              </AppText>
            </View>
          ))
        )}
      </Section>
      <Button label={COPY.sheet.close} variant="secondary" onPress={api.close} style={styles.closeButton} />
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.block}>
      <AppText variant="sectionTitle" style={styles.sectionTitle}>
        {title}
      </AppText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.lg },
  headline: { marginTop: spacing.md },
  body: { marginTop: spacing.sm },
  note: { marginTop: spacing.md },
  primaryButton: { marginTop: spacing.lg },
  block: { marginTop: spacing.lg },
  sectionTitle: { marginBottom: spacing.xs },
  row: { marginTop: spacing.sm, gap: spacing.sm },
  rowText: { flexShrink: 1 },
  line: { marginTop: spacing.xs },
  gap: { marginTop: spacing.xs },
  pattern: { marginTop: spacing.sm },
  brandRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  inferred: { borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.accentBorder, borderRadius: 16, padding: spacing.md },
  inferredHead: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  recommended: { borderLeftWidth: 4, borderLeftColor: colors.accent, paddingLeft: spacing.md },
  closeButton: { marginTop: spacing.xl },
});
