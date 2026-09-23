import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, EmptyState, InlineNotice, LoadingState, Overline, StatusList } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import type { RebuildAvailability } from './availability';
import { REBUILD_COPY } from './copy';
import type { FocusCardView, RebuildHomeView } from './model';

export interface RebuildHomeHandlers {
  onAddFocus: () => void;
  onNotNow: () => void;
  onOpenFocus: (focusId: string) => void;
  /** Opens the step form on that Focus. Opening it creates nothing; only saving the form does. */
  onAddNextStep: (focusId: string) => void;
}

export interface RebuildHomeBodyProps extends RebuildHomeHandlers {
  gate: RebuildAvailability;
  view: RebuildHomeView | null;
}

const C = REBUILD_COPY;

/**
 * THE ME / REBUILD HOME. Spacious on purpose: a verdict, her current Focuses, and only the sections that have something true in them.
 * An empty section is never drawn, and with no active Focus the screen is one calm question (Addendum Q).
 */
export function RebuildHomeBody({ gate, view, onAddFocus, onNotNow, onOpenFocus, onAddNextStep }: RebuildHomeBodyProps) {
  if (gate.kind === 'loading') return <LoadingState label={C.availability.loading} />;
  if (gate.kind === 'unrecovered') return <EmptyState title={C.availability.unrecoveredTitle} body={C.availability.unrecoveredBody} />;
  if (gate.kind === 'other_account') return <EmptyState title={C.availability.otherAccountTitle} body={C.availability.otherAccountBody} />;
  if (view === null) return <LoadingState label={C.availability.loading} />;
  const canWrite = gate.canWrite;

  if (!view.hasActive) {
    return (
      <View>
        {!canWrite && <InlineNotice tone="waiting" title={C.availability.readOnly} style={styles.notice} />}
        <View style={styles.empty}>
          <AppText variant="screenTitle">{C.home.emptyTitle}</AppText>
          <AppText variant="supporting" color={colors.textSecondary} style={styles.emptyBody}>
            {C.home.emptyBody}
          </AppText>
          <View style={styles.row}>
            <Button label={C.home.addFocus} onPress={onAddFocus} disabled={!canWrite} />
            <Button label={C.home.notNow} variant="ghost" onPress={onNotNow} />
          </View>
        </View>
        {view.paused.length > 0 && <PausedList paused={view.paused} onOpenFocus={onOpenFocus} />}
      </View>
    );
  }

  return (
    <View>
      {!canWrite && <InlineNotice tone="waiting" title={C.availability.readOnly} style={styles.notice} />}
      <View style={styles.header}>
        {view.verdict !== null && <AppText variant="screenTitle">{view.verdict}</AppText>}
        <AppText variant="supporting" color={colors.textSecondary} style={styles.private}>
          {C.home.privateNote}
        </AppText>
      </View>

      {view.needsAttention.length > 0 && (
        <View style={styles.section}>
          <Overline style={styles.label}>{C.home.needsAttention}</Overline>
          <StatusList
            items={view.needsAttention.map((item) => ({
              key: item.taskId,
              label: item.title,
              value: item.label,
              needsAttention: true,
              onPress: () => onOpenFocus(item.focusId),
            }))}
          />
        </View>
      )}

      <View style={styles.section}>
        <Overline style={styles.label}>{C.home.current}</Overline>
        {view.current.map((focus) => (
          <FocusCard key={focus.id} focus={focus} canWrite={canWrite} onOpenFocus={onOpenFocus} onAddNextStep={onAddNextStep} />
        ))}
      </View>

      {view.recentProgress.length > 0 && (
        <View style={styles.section}>
          <Overline style={styles.label}>{C.home.recentProgress}</Overline>
          <StatusList items={view.recentProgress.map((item) => ({ key: item.key, label: item.title, value: item.label }))} />
        </View>
      )}

      {view.paused.length > 0 && <PausedList paused={view.paused} onOpenFocus={onOpenFocus} />}

      <View style={styles.row}>
        <Button label={C.home.addAnother} variant="secondary" size="sm" onPress={onAddFocus} disabled={!canWrite} />
      </View>
    </View>
  );
}

function FocusCard({
  focus,
  canWrite,
  onOpenFocus,
  onAddNextStep,
}: {
  focus: FocusCardView;
  canWrite: boolean;
  onOpenFocus: (id: string) => void;
  onAddNextStep: (id: string) => void;
}) {
  return (
    <Card style={styles.card}>
      <Pressable accessibilityRole="button" accessibilityLabel={C.home.openFocus(focus.title)} onPress={() => onOpenFocus(focus.id)}>
        <AppText variant="cardTitle">{focus.title}</AppText>
      </Pressable>
      {focus.steps.map((step) => (
        <View key={step.taskId} style={styles.step}>
          <Overline>{C.home.nextStep}</Overline>
          <AppText variant="body">{step.title}</AppText>
          {step.dateLabel !== null && (
            <AppText variant="metadata" color={colors.textSecondary}>
              {step.dateLabel}
            </AppText>
          )}
          {step.lighterVersion !== null && (
            <AppText variant="metadata" color={colors.textSecondary}>
              {C.home.lighterVersion(step.lighterVersion)}
            </AppText>
          )}
        </View>
      ))}
      {focus.canAddNextStep && (
        // An invitation, not an alert: quiet, and never counted or colored as something wrong.
        <View style={styles.invite}>
          <Button
            label={C.home.addNextStep}
            variant="ghost"
            size="sm"
            accessibilityHint={focus.title}
            onPress={() => onAddNextStep(focus.id)}
            disabled={!canWrite}
          />
        </View>
      )}
    </Card>
  );
}

function PausedList({ paused, onOpenFocus }: { paused: FocusCardView[]; onOpenFocus: (id: string) => void }) {
  return (
    <View style={styles.section}>
      <Overline style={styles.label}>{C.home.paused}</Overline>
      <StatusList
        items={paused.map((focus) => ({ key: focus.id, label: focus.title, value: C.home.paused, onPress: () => onOpenFocus(focus.id) }))}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  notice: { marginBottom: spacing.lg },
  empty: { paddingVertical: spacing.xxl },
  emptyBody: { marginTop: spacing.md, marginBottom: spacing.xl },
  header: { marginBottom: spacing.xxl },
  private: { marginTop: spacing.sm },
  section: { marginBottom: spacing.xxl },
  label: { marginBottom: spacing.md },
  card: { marginBottom: spacing.lg },
  step: { marginTop: spacing.md },
  invite: { marginTop: spacing.md, flexDirection: 'row' },
  row: { flexDirection: 'row', gap: spacing.md },
});
