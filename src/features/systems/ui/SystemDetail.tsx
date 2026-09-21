import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import {
  ActionStateBlock,
  AppText,
  Button,
  Card,
  ConfidenceBadge,
  ConfirmationSheet,
  Divider,
  EmptyState,
  InlineNotice,
  LoadingState,
  Overline,
  ProvenanceLabel,
  Sheet,
} from '../../../design/components';
import { color, spacing } from '../../../design/tokens';
import type { Transition } from '../../../state/appStore';
import { useAppStore, useStoreSnapshot } from '../../../store/AppStateProvider';
import { assignResponsibility, reassignResponsibility, recordAnswer, takeBackResponsibility, type Answer, type HolderChoice as Holder } from '../commands/responsibility';
import { pauseSchedule, resumeSchedule, skipNextOccurrence, stopSchedule } from '../commands/schedule';
import { UNAVAILABLE_BODY, attentionLine, copy, durationDetailLine, evidenceSummary, noNextText, responsibilityLine, scheduleSentence, skippedLine } from '../copy';
import { formatDay } from '../format';
import { availabilityOf } from '../model/availability';
import { projectSystemDetail } from '../model/detail';
import type { ActionAvailability, SystemAction, SystemDetailView } from '../model/types';
import { commitChange } from '../useCases/commit';

const available = (view: SystemDetailView, action: SystemAction): boolean => view.actions.some((a: ActionAvailability) => a.action === action && a.available);

type HolderSheet = 'assign' | 'reassign' | null;

/**
 * One System, as a REUSABLE BLUEPRINT.
 *
 * The steps here are instructions that exist, not tasks being done: there is no run and no step
 * completion in the foundation, so nothing on this screen can be checked off — no checkbox, no
 * progress, no "done". Every action shown is one the foundation can really perform; the rest are
 * simply absent (the projection lists them as unavailable, with reasons, for the evidence).
 */
export function SystemDetail({ systemId }: { systemId: string }) {
  const store = useAppStore();
  const snapshot = useStoreSnapshot();
  const availability = availabilityOf(snapshot);

  const view = useMemo(
    () =>
      availability.kind === 'ready' && snapshot.state !== null && snapshot.today !== null
        ? projectSystemDetail(snapshot.state, systemId, { nowMs: Date.now(), today: snapshot.today }, snapshot.persistence === 'enabled')
        : null,
    [availability.kind, snapshot, systemId]
  );

  const [showDetails, setShowDetails] = useState(false);
  const [holderSheet, setHolderSheet] = useState<HolderSheet>(null);
  const [answerSheet, setAnswerSheet] = useState(false);
  const [confirmSkip, setConfirmSkip] = useState<string | null>(null);
  const [confirmStop, setConfirmStop] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (availability.kind === 'loading') return <LoadingState label={copy.hub.loading} />;
  if (availability.kind === 'unavailable') {
    return <InlineNotice tone="attention" title={copy.hub.unavailableTitle} body={UNAVAILABLE_BODY[availability.reason]} />;
  }
  if (view === null) {
    return (
      <View>
        <EmptyState title={copy.detail.missingTitle} body={copy.detail.missingBody} />
        <View style={styles.centered}>
          <Button label={copy.detail.back} variant="secondary" onPress={() => router.back()} />
        </View>
      </View>
    );
  }

  const { schedule, responsibility } = view;
  const sentence = scheduleSentence(schedule);

  async function run(transition: Transition): Promise<void> {
    if (busy) return;
    setBusy(true);
    setFeedback(null);
    const result = await commitChange(store, transition);
    setBusy(false);
    if (result === 'not_saved') setFeedback(copy.detail.actionFailed);
    else if (result === 'unchanged') setFeedback(copy.detail.actionUnchanged);
  }

  const chooseHolder = (holder: Holder) => {
    const mode = holderSheet;
    setHolderSheet(null);
    void run((state, ctx) => (mode === 'reassign' ? reassignResponsibility(state, ctx, systemId, holder) : assignResponsibility(state, ctx, systemId, holder)));
  };
  const answer = (value: Answer) => {
    setAnswerSheet(false);
    void run((state, ctx) => recordAnswer(state, ctx, systemId, value));
  };

  return (
    <View>
      {/* ------------------------------------------------------------ what it is */}
      <View style={styles.titleBlock}>
        {view.area.name !== null ? <Overline>{view.area.name}</Overline> : null}
        <AppText variant="screenTitle" accessibilityRole="header" style={styles.title}>
          {view.name}
        </AppText>
        {view.purpose.length > 0 ? (
          <AppText variant="body" color={color.text.secondary} style={styles.purpose}>
            {view.purpose}
          </AppText>
        ) : null}
        {available(view, 'edit') ? (
          <Button
            label={copy.detail.edit}
            variant="secondary"
            size="sm"
            style={styles.edit}
            onPress={() => router.push({ pathname: '/systems/edit', params: { id: systemId } })}
          />
        ) : null}
      </View>

      {view.attention.length > 0 && responsibility !== null ? (
        <InlineNotice tone="attention" title={attentionLine(responsibility.holder)} style={styles.block} />
      ) : null}
      {feedback !== null ? <InlineNotice tone="attention" title={feedback} style={styles.block} /> : null}

      {/* ------------------------------------------------------------------ steps */}
      <Overline style={styles.sectionLabel}>{copy.detail.stepsTitle}</Overline>
      <Card>
        {view.steps.length === 0 ? (
          <AppText variant="supporting" color={color.text.secondary}>
            {copy.detail.stepsEmpty}
          </AppText>
        ) : (
          <View>
            <AppText variant="supporting" color={color.text.secondary}>
              {copy.detail.stepsIntro}
            </AppText>
            <View style={styles.steps}>
              {view.steps.map((step, index) => (
                <View key={step.id}>
                  {index > 0 ? <Divider tight /> : null}
                  <View
                    style={styles.stepRow}
                    accessible
                    accessibilityLabel={`Step ${step.order}: ${step.title}${step.effortMinutes === null ? '' : `, about ${step.effortMinutes} minutes`}`}
                  >
                    <AppText variant="metadata" color={color.text.muted} style={styles.stepNumber}>
                      {step.order}
                    </AppText>
                    <AppText variant="body" style={styles.stepTitle}>
                      {step.title}
                    </AppText>
                    {step.effortMinutes !== null ? (
                      <AppText variant="metadata" color={color.text.muted}>
                        {step.effortMinutes} min
                      </AppText>
                    ) : null}
                  </View>
                </View>
              ))}
            </View>
          </View>
        )}
        <Divider />
        <AppText variant="metadata" color={color.text.secondary}>
          {copy.detail.timeTitle}: {durationDetailLine(view.duration)}
        </AppText>
      </Card>

      {/* --------------------------------------------------------------- schedule */}
      <Overline style={[styles.sectionLabel, styles.sectionGap]}>{copy.detail.scheduleTitle}</Overline>
      <Card>
        {schedule.state === 'none' || schedule.state === 'ended' ? null : (
          <AppText variant="bodyStrong">{sentence ?? 'Repeats'}</AppText>
        )}
        {schedule.nextExpected !== null ? (
          <AppText variant="body" style={styles.line}>
            {copy.detail.nextExpected(formatDay(schedule.nextExpected))}
          </AppText>
        ) : schedule.noNextReason !== null ? (
          <AppText variant="supporting" color={color.text.secondary} style={styles.line}>
            {noNextText(schedule.noNextReason)}
          </AppText>
        ) : null}
        {skippedLine(schedule.skipped) !== null ? (
          <AppText variant="metadata" color={color.text.muted} style={styles.line}>
            {skippedLine(schedule.skipped)}
          </AppText>
        ) : null}
        <View style={styles.actions}>
          {available(view, 'pause_schedule') ? <Button label={copy.detail.pause} variant="secondary" size="sm" disabled={busy} onPress={() => void run((s, c) => pauseSchedule(s, c, systemId))} /> : null}
          {available(view, 'resume_schedule') ? <Button label={copy.detail.resume} variant="secondary" size="sm" disabled={busy} onPress={() => void run((s, c) => resumeSchedule(s, c, systemId))} /> : null}
          {available(view, 'skip_next') && schedule.nextExpected !== null ? (
            <Button label={copy.detail.skip(formatDay(schedule.nextExpected))} variant="secondary" size="sm" disabled={busy} onPress={() => setConfirmSkip(schedule.nextExpected)} />
          ) : null}
          {available(view, 'stop_schedule') ? <Button label={copy.detail.stop} variant="ghost" size="sm" disabled={busy} onPress={() => setConfirmStop(true)} /> : null}
          {schedule.state === 'none' || schedule.state === 'ended' ? (
            <Button label={copy.detail.setSchedule} variant="secondary" size="sm" onPress={() => router.push({ pathname: '/systems/edit', params: { id: systemId } })} />
          ) : null}
        </View>
      </Card>

      {/* --------------------------------------------------------- responsibility */}
      {available(view, 'assign_responsibility') || responsibility !== null ? (
        <View>
          <Overline style={[styles.sectionLabel, styles.sectionGap]}>{copy.detail.responsibilityTitle}</Overline>
          <Card>
            <AppText variant="body">{responsibility === null ? copy.detail.noResponsibility : responsibilityLine(responsibility)}</AppText>
            <View style={styles.actions}>
              {available(view, 'assign_responsibility') ? <Button label={copy.detail.assign} variant="secondary" size="sm" disabled={busy} onPress={() => setHolderSheet('assign')} /> : null}
              {available(view, 'record_answer') ? <Button label={copy.detail.answerSheet} variant="secondary" size="sm" disabled={busy} onPress={() => setAnswerSheet(true)} /> : null}
              {available(view, 'reassign_responsibility') ? <Button label={copy.detail.reassign} variant="ghost" size="sm" disabled={busy} onPress={() => setHolderSheet('reassign')} /> : null}
              {available(view, 'take_back_responsibility') ? <Button label={copy.detail.takeBack} variant="ghost" size="sm" disabled={busy} onPress={() => void run((s, c) => takeBackResponsibility(s, c, systemId))} /> : null}
            </View>
          </Card>
        </View>
      ) : null}

      {/* ---------------------------------------------------------------- details */}
      <View style={styles.sectionGap}>
        <Button label={showDetails ? copy.detail.hideDetails : copy.detail.showDetails} variant="ghost" size="sm" style={styles.disclosure} onPress={() => setShowDetails((v) => !v)} />
        {showDetails ? (
          <Card tone="subtle">
            <AppText variant="metadata" color={color.text.secondary}>
              {copy.detail.source}
            </AppText>
            <View style={styles.provenance}>
              <ProvenanceLabel source={view.provenance.producer} />
              {view.provenance.confidence !== null ? <ConfidenceBadge level={view.provenance.confidence} /> : null}
            </View>
            {view.subject.kind === 'child_not_recorded' ? (
              <AppText variant="supporting" color={color.text.secondary} style={styles.line}>
                {copy.detail.childNotRecorded}
              </AppText>
            ) : null}
            {view.needs.length > 0 ? (
              <AppText variant="supporting" style={styles.line}>
                {copy.detail.needs}: {view.needs.map((r) => r.label ?? copy.detail.missingRef).join(', ')}
              </AppText>
            ) : null}
            {view.neededBy.length > 0 ? (
              <AppText variant="supporting" style={styles.line}>
                {copy.detail.neededBy}: {view.neededBy.map((r) => r.label ?? copy.detail.missingRef).join(', ')}
              </AppText>
            ) : null}
            {view.actionEvidence.map((evidence) =>
              evidence.stage === 'proposed' ? (
                <View key={evidence.intentId} style={styles.line}>
                  <AppText variant="supporting">{evidenceSummary(evidence)}</AppText>
                  <AppText variant="metadata" color={color.text.muted}>
                    {copy.detail.proposalWaiting}
                  </AppText>
                </View>
              ) : (
                <ActionStateBlock key={evidence.intentId} stage={evidence.stage} outcome={evidence.latestOutcome} summary={evidenceSummary(evidence)} style={styles.line} />
              )
            )}
          </Card>
        ) : null}
      </View>

      {/* ------------------------------------------------------------------ sheets */}
      <Sheet visible={holderSheet !== null} onClose={() => setHolderSheet(null)} accessibilityLabel={copy.detail.holderSheet}>
        <AppText variant="sectionTitle">{copy.detail.chooseHolder}</AppText>
        <View style={styles.sheetActions}>
          {view.holderChoices.map((choice) => (
            <Button
              key={`${choice.kind}:${choice.id}`}
              label={choice.name}
              variant="secondary"
              onPress={() => chooseHolder({ kind: choice.kind, id: choice.id })}
              accessibilityHint={copy.detail.holderHint(choice.kind)}
            />
          ))}
          <Button label={copy.detail.close} variant="ghost" onPress={() => setHolderSheet(null)} />
        </View>
      </Sheet>

      <Sheet visible={answerSheet} onClose={() => setAnswerSheet(false)} accessibilityLabel={copy.detail.answerSheet}>
        <AppText variant="sectionTitle">{copy.detail.answerSheet}</AppText>
        <View style={styles.sheetActions}>
          <Button label={copy.detail.seen} variant="secondary" onPress={() => answer('acknowledged')} />
          <Button label={copy.detail.saidYes} variant="secondary" onPress={() => answer('accepted')} />
          <Button label={copy.detail.saidNo} variant="secondary" onPress={() => answer('declined')} />
          <Button label={copy.detail.close} variant="ghost" onPress={() => setAnswerSheet(false)} />
        </View>
      </Sheet>

      <ConfirmationSheet
        visible={confirmSkip !== null}
        title={confirmSkip === null ? '' : copy.detail.skipTitle(formatDay(confirmSkip))}
        body={copy.detail.skipBody}
        cancelLabel={copy.detail.skipCancel}
        confirmLabel={copy.detail.skipConfirm}
        onCancel={() => setConfirmSkip(null)}
        onConfirm={() => {
          const expected = confirmSkip;
          setConfirmSkip(null);
          if (expected !== null) void run((s, c) => skipNextOccurrence(s, c, systemId, expected).state);
        }}
      />
      <ConfirmationSheet
        visible={confirmStop}
        title={copy.detail.stopTitle}
        body={copy.detail.stopBody}
        cancelLabel={copy.detail.stopCancel}
        confirmLabel={copy.detail.stopConfirm}
        onCancel={() => setConfirmStop(false)}
        onConfirm={() => {
          setConfirmStop(false);
          void run((s, c) => stopSchedule(s, c, systemId));
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  centered: { alignItems: 'center' },
  titleBlock: { marginBottom: spacing.xl },
  title: { marginTop: spacing.xs },
  purpose: { marginTop: spacing.sm },
  edit: { alignSelf: 'flex-start', marginTop: spacing.md },
  block: { marginBottom: spacing.lg },
  sectionLabel: { marginBottom: spacing.md },
  sectionGap: { marginTop: spacing.xxl },
  steps: { marginTop: spacing.md },
  stepRow: { flexDirection: 'row', alignItems: 'flex-start', gap: spacing.md, minHeight: 32 },
  stepNumber: { width: 22, paddingTop: 3 },
  stepTitle: { flex: 1 },
  line: { marginTop: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
  disclosure: { alignSelf: 'flex-start', marginBottom: spacing.sm },
  provenance: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  sheetActions: { marginTop: spacing.lg, gap: spacing.sm },
});
