import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, InlineNotice, LoadingState, Overline, StatusList } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import type { MoneyGate } from './moneyGate';
import type { MoneyHomeView, MoneyItemView } from './projection';
import { MECHANISM_LABEL, MONEY_COPY } from './moneyCopy';
import type { ReimbursementProjection } from './reimbursements';

export interface MoneyBodyProps {
  gate: MoneyGate;
  view: MoneyHomeView;
  onAddObligation: () => void;
  onAddIncome: () => void;
  onOpenItem: (taskId: string) => void;
}

const itemLine = (item: MoneyItemView): string => {
  const mechanism = item.direction === 'outflow' && item.paymentMechanism ? ` · ${MECHANISM_LABEL[item.paymentMechanism]}` : '';
  const status =
    item.direction === 'outflow' ? MONEY_COPY.statusOpenObligation(item.dueDate, item.pastDue) : MONEY_COPY.statusOpenIncome(item.dueDate, item.pastDue);
  return `${item.decimal} · ${status}${mechanism}`;
};

const reimbursementLine = (r: ReimbursementProjection): string => {
  const label =
    r.interpretation === 'requested'
      ? MONEY_COPY.reimbursementRequested
      : r.interpretation === 'acknowledged'
        ? MONEY_COPY.reimbursementAcknowledged
        : r.interpretation === 'accepted'
          ? MONEY_COPY.reimbursementAccepted
          : r.interpretation === 'declined'
            ? MONEY_COPY.reimbursementDeclined
            : r.interpretation === 'marked_done_no_payment_record'
              ? MONEY_COPY.reimbursementMarkedDone
              : MONEY_COPY.reimbursementNotFollowedUp;
  return `${r.decimal} · ${label}`;
};

/**
 * Money Home. Sections that have nothing to show are not drawn (adaptive density, same rule
 * Meals follows). The verdict sentence is deterministic — computed in projection.ts, never
 * hand-authored per state.
 */
export function MoneyBody({ gate, view, onAddObligation, onAddIncome, onOpenItem }: MoneyBodyProps) {
  if (gate.state === 'loading') return <LoadingState label={MONEY_COPY.loading} />;
  if (gate.state === 'recovery') return <InlineNotice tone="attention" title={MONEY_COPY.recoveryTitle} body={MONEY_COPY.recoveryBody} />;

  const canAdd = gate.canWrite;
  const hasAttention = view.needsAttention.length > 0 || view.outstandingReimbursements.length > 0;

  return (
    <View style={styles.root}>
      {!gate.canWrite ? <InlineNotice tone="waiting" title={MONEY_COPY.readOnlyNotice} /> : null}

      <View accessibilityLiveRegion="polite" style={styles.verdict}>
        <AppText variant="sectionTitle">{view.verdict}</AppText>
      </View>

      <View style={styles.actions}>
        <Button label={MONEY_COPY.addObligation} onPress={onAddObligation} disabled={!canAdd} accessibilityHint={MONEY_COPY.addObligationHint} />
        <Button label={MONEY_COPY.addIncome} variant="secondary" onPress={onAddIncome} disabled={!canAdd} accessibilityHint={MONEY_COPY.addIncomeHint} />
      </View>

      {hasAttention ? (
        <Section title={MONEY_COPY.sectionNeedsAttention}>
          <StatusList
            items={[
              ...view.needsAttention.map((item) => ({ key: item.taskId, label: item.title, value: itemLine(item), needsAttention: true, onPress: () => onOpenItem(item.taskId) })),
              ...view.outstandingReimbursements
                .filter((r) => r.interpretation === 'marked_done_no_payment_record')
                .map((r) => ({ key: r.taskId, label: r.title, value: reimbursementLine(r), needsAttention: true })),
            ]}
          />
        </Section>
      ) : null}

      <Section title={MONEY_COPY.sectionComingUp}>
        {view.comingUp.length > 0 ? (
          <StatusList items={view.comingUp.map((item) => ({ key: item.taskId, label: item.title, value: itemLine(item), onPress: () => onOpenItem(item.taskId) }))} />
        ) : (
          <Empty text={MONEY_COPY.noComingUp} />
        )}
      </Section>

      <Section title={MONEY_COPY.sectionExpectedIn}>
        {view.expectedIn.length > 0 ? (
          <StatusList items={view.expectedIn.map((item) => ({ key: item.taskId, label: item.title, value: itemLine(item), onPress: () => onOpenItem(item.taskId) }))} />
        ) : (
          <Empty text={MONEY_COPY.noExpectedIn} />
        )}
      </Section>

      <Section title={MONEY_COPY.sectionOutstandingReimbursements}>
        {view.outstandingReimbursements.length > 0 ? (
          <StatusList items={view.outstandingReimbursements.map((r) => ({ key: r.taskId, label: r.title, value: reimbursementLine(r) }))} />
        ) : (
          <Empty text={MONEY_COPY.noOutstandingReimbursements} />
        )}
      </Section>

      <Section title={MONEY_COPY.sectionRecentlyResolved}>
        {view.recentlyResolved.own.length > 0 || view.recentlyResolved.reimbursements.length > 0 ? (
          <StatusList
            items={[
              ...view.recentlyResolved.own.map((item) => ({
                key: item.taskId,
                label: item.title,
                value: item.direction === 'outflow' ? `${item.decimal} · ${MONEY_COPY.statusResolvedObligation}` : `${item.decimal} · ${MONEY_COPY.statusResolvedIncome}`,
                onPress: () => onOpenItem(item.taskId),
              })),
              ...view.recentlyResolved.reimbursements.map((r) => ({ key: r.taskId, label: r.title, value: `${r.decimal} · ${MONEY_COPY.reimbursementPaid}` })),
            ]}
          />
        ) : (
          <Empty text={MONEY_COPY.noRecentlyResolved} />
        )}
      </Section>
    </View>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.section}>
      <Overline>{title}</Overline>
      {children}
    </View>
  );
}

function Empty({ text }: { text: string }) {
  return (
    <AppText variant="body" color={colors.textSecondary}>
      {text}
    </AppText>
  );
}

const styles = StyleSheet.create({
  root: { gap: spacing.xl },
  verdict: { paddingVertical: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm },
  section: { gap: spacing.md },
});
