import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, ChipToggle, Overline, Screen, StatusList, TextField } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { epochMsOf, isLocalDate, toInstant, zonedTimeToEpochMs } from '../../domain/logicalDay';
import {
  OPPORTUNITY_CLOSED_REASONS,
  OPPORTUNITY_STAGES,
  OPPORTUNITY_TYPES,
  type OpportunityClosedReason,
  type OpportunityStage,
  type OpportunityType,
} from '../../domain/foundation/opportunity';
import {
  addOpportunity,
  addOpportunityNextAction,
  archiveOpportunity,
  linkedInterviewsOf,
  linkedTasksOf,
  openLinkedTaskCount,
  restoreOpportunity,
  scheduleOpportunityInterview,
  setOpportunityStage,
  updateOpportunity,
} from '../../domain/opportunities';
import type { TransitionContext } from '../../domain/context';
import { FIELD_LIMITS, type AppState } from '../../domain/state';
import type { Transition } from '../../state/appStore';
import { useAppStore, useHouseholdState } from '../../store/AppStateProvider';
import { useHousehold } from '../../store/useHousehold';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

const TYPE_LABEL: Record<OpportunityType, string> = {
  job: 'Job',
  freelance: 'Freelance',
  contract: 'Contract',
  education_program: 'Education',
  other: 'Other',
};

const STAGE_LABEL: Record<OpportunityStage, string> = {
  exploring: 'Exploring',
  interested: 'Interested',
  applied: 'Applied',
  interviewing: 'Interviewing',
  offer: 'Offer',
  accepted: 'Accepted',
  closed: 'Closed',
};

const CLOSED_REASON_LABEL: Record<OpportunityClosedReason, string> = {
  withdrawn: 'I withdrew',
  declined_by_organization: 'They declined',
  offer_rescinded: 'Offer rescinded',
  no_further_response: 'No further response',
  other: 'Other',
};

/**
 * The Opportunity itself is never actionable truth (ADDENDUM B): "Add a next action" creates an
 * ordinary canonical Task and links it; "Schedule an interview" creates an ordinary canonical
 * Event and links it. Neither section here is a second task or calendar UI — each mini-form saves
 * through the same domain commands the rest of the app uses.
 */
export function OpportunityForm({ opportunityId }: { opportunityId?: string }) {
  const store = useAppStore();
  const { state } = useHouseholdState();
  const { categories, categoryIdForRole } = useHousehold();
  const existing = opportunityId ? (state.careerOpportunities.find((o) => o.id === opportunityId) ?? null) : null;
  const workCategoryId = categoryIdForRole('work') ?? categories[0]?.id ?? '';

  const [title, setTitle] = useState(existing?.title ?? '');
  const [organizationName, setOrganizationName] = useState(existing?.organizationName ?? '');
  const [opportunityType, setOpportunityType] = useState<OpportunityType>(existing?.opportunityType ?? 'job');
  const [stage, setStage] = useState<OpportunityStage>(existing?.stage ?? 'exploring');
  const [closedReason, setClosedReason] = useState<OpportunityClosedReason | null>(existing?.closedReason ?? null);
  const [applicationDeadline, setApplicationDeadline] = useState(existing?.applicationDeadline ?? '');
  const [followUpDate, setFollowUpDate] = useState(existing?.followUpDate ?? '');
  const [contactName, setContactName] = useState(existing?.contactName ?? '');
  const [compensationNote, setCompensationNote] = useState(existing?.compensationNote ?? '');
  const [sourceNote, setSourceNote] = useState(existing?.sourceNote ?? '');
  const [notes, setNotes] = useState(existing?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef(false);

  const [addingAction, setAddingAction] = useState(false);
  const [actionTitle, setActionTitle] = useState('');
  const [addingInterview, setAddingInterview] = useState(false);
  const [interviewTitle, setInterviewTitle] = useState('');
  const [interviewDate, setInterviewDate] = useState('');
  const [interviewStart, setInterviewStart] = useState('09:00');
  const [interviewEnd, setInterviewEnd] = useState('09:30');

  const linkedTasks = existing ? linkedTasksOf(state, existing.id) : [];
  const linkedInterviews = existing ? linkedInterviewsOf(state, existing.id) : [];
  const openLinkedCount = existing ? openLinkedTaskCount(state, existing.id) : 0;

  const save = async (transition: Transition) => {
    if (inFlight.current) return false;
    inFlight.current = true;
    setBusy(true);
    const saved = await store.commit(transition);
    inFlight.current = false;
    setBusy(false);
    if (!saved) setError('Her Keys couldn’t save that yet. Try again.');
    return saved;
  };

  const validDate = (value: string) => value.trim() === '' || isLocalDate(value.trim());

  const onSave = async () => {
    if (title.trim().length === 0) return setError('Give it a title.');
    if (!validDate(applicationDeadline)) return setError('Application deadline should look like YYYY-MM-DD, or be left blank.');
    if (!validDate(followUpDate)) return setError('Follow-up date should look like YYYY-MM-DD, or be left blank.');
    if (stage === 'closed' && closedReason === null) return setError('Say why this closed.');

    setError(null);
    const fields = {
      title: title.trim(),
      organizationName: organizationName.trim() || null,
      opportunityType,
      applicationDeadline: applicationDeadline.trim() || null,
      followUpDate: followUpDate.trim() || null,
      contactName: contactName.trim() || null,
      compensationNote: compensationNote.trim() || null,
      sourceNote: sourceNote.trim() || null,
      notes: notes.trim() || null,
    };

    // A closed reason belongs to Closed only (HK13-D15). The chip she picked earlier stays in this form's state when she moves the
    // stage away again; passing it along made the domain refuse the whole stage change, and the form closed as if it had saved.
    const reason = stage === 'closed' ? closedReason : null;
    // A refused stage change is never reported as saved: nothing is written, the form stays open and says so.
    let refused = false;
    const withStage = (next: AppState, ctx: TransitionContext, id: string, current: AppState): AppState => {
      const staged = setOpportunityStage(next, ctx, id, stage, reason);
      if (staged.refusal === null) return staged.state;
      refused = true;
      return current;
    };

    if (!existing) {
      const ok = await save((current, ctx) => {
        const next = addOpportunity(current, ctx, fields);
        const created = next.careerOpportunities[next.careerOpportunities.length - 1];
        return stage === 'exploring' ? next : withStage(next, ctx, created.id, current);
      });
      if (refused) return setError('Her Keys couldn’t save that stage. Check it and try again.');
      if (ok) router.back();
      return;
    }

    const ok = await save((current, ctx) => {
      const next = updateOpportunity(current, ctx, existing.id, fields);
      return stage === existing.stage && reason === existing.closedReason ? next : withStage(next, ctx, existing.id, current);
    });
    if (refused) return setError('Her Keys couldn’t save that stage. Check it and try again.');
    if (ok) router.back();
  };

  const onAddAction = () => {
    if (!existing || actionTitle.trim().length === 0) return;
    void save((current, ctx) =>
      addOpportunityNextAction(current, ctx, existing.id, { title: actionTitle.trim(), categoryId: workCategoryId }).state
    ).then((ok) => {
      if (ok) {
        setActionTitle('');
        setAddingAction(false);
      }
    });
  };

  const onScheduleInterview = () => {
    if (!existing || interviewTitle.trim().length === 0) return;
    if (!isLocalDate(interviewDate)) return setError('Interview date should look like YYYY-MM-DD.');
    if (!TIME_PATTERN.test(interviewStart) || !TIME_PATTERN.test(interviewEnd)) return setError('Interview times should look like HH:MM, in 24-hour time.');
    const minutesOf = (time: string) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };
    const startsAt = toInstant(zonedTimeToEpochMs(interviewDate, minutesOf(interviewStart), state.user.timezone));
    const endsAt = toInstant(zonedTimeToEpochMs(interviewDate, minutesOf(interviewEnd), state.user.timezone));
    if (epochMsOf(endsAt) <= epochMsOf(startsAt)) return setError('The interview needs to end after it starts.');
    setError(null);
    void save((current, ctx) =>
      scheduleOpportunityInterview(current, ctx, existing.id, { title: interviewTitle.trim(), categoryId: workCategoryId, startsAt, endsAt, commitment: 'fixed' }).state
    ).then((ok) => {
      if (ok) {
        setInterviewTitle('');
        setAddingInterview(false);
      }
    });
  };

  const onArchive = () => existing && void save((current, ctx) => archiveOpportunity(current, ctx, existing.id));
  const onRestore = () => existing && void save((current, ctx) => restoreOpportunity(current, ctx, existing.id));

  return (
    <Screen>
      <TextField label="Title" value={title} onChangeText={setTitle} placeholder="Senior Analyst role" autoFocus maxLength={FIELD_LIMITS.titleLength} />
      <TextField label="Organization (optional)" value={organizationName} onChangeText={setOrganizationName} placeholder="Brightline Data" maxLength={120} />

      <Overline style={styles.label}>Type</Overline>
      <View style={styles.chipRow}>
        {OPPORTUNITY_TYPES.map((t) => (
          <ChipToggle key={t} label={TYPE_LABEL[t]} selected={t === opportunityType} onPress={() => setOpportunityType(t)} />
        ))}
      </View>

      <Overline style={styles.label}>Stage</Overline>
      <View style={styles.chipRow}>
        {OPPORTUNITY_STAGES.map((s) => (
          <ChipToggle key={s} label={STAGE_LABEL[s]} selected={s === stage} onPress={() => setStage(s)} />
        ))}
      </View>
      <AppText variant="caption" color={colors.textTertiary} style={styles.hint}>
        You may move this to any stage — nothing here is skipped or blocked for you.
      </AppText>

      {stage === 'closed' && (
        <>
          <Overline style={styles.label}>Why it closed</Overline>
          <View style={styles.chipRow}>
            {OPPORTUNITY_CLOSED_REASONS.map((r) => (
              <ChipToggle key={r} label={CLOSED_REASON_LABEL[r]} selected={r === closedReason} onPress={() => setClosedReason(r)} />
            ))}
          </View>
        </>
      )}

      {existing && openLinkedCount > 0 && (stage === 'closed' || existing.archivedAt !== null) && (
        <Card tone="attention" style={styles.note}>
          <AppText variant="bodySm">
            {openLinkedCount} linked next step{openLinkedCount === 1 ? '' : 's'} {openLinkedCount === 1 ? 'is' : 'are'} still open. They were not changed — decide separately what to do with them.
          </AppText>
        </Card>
      )}

      <TextField label="Application deadline (optional, YYYY-MM-DD)" value={applicationDeadline} onChangeText={setApplicationDeadline} placeholder="No deadline recorded" maxLength={10} />
      <TextField label="Follow-up date (optional, YYYY-MM-DD)" value={followUpDate} onChangeText={setFollowUpDate} placeholder="No follow-up date" maxLength={10} />
      <TextField label="Contact (optional)" value={contactName} onChangeText={setContactName} placeholder="Priya (recruiter)" maxLength={120} />
      <TextField label="Compensation note (optional)" value={compensationNote} onChangeText={setCompensationNote} placeholder="What you were told, in your own words" maxLength={300} />
      <AppText variant="caption" color={colors.textTertiary} style={styles.hint}>
        A note only — never verified pay, and never counted as household income.
      </AppText>
      <TextField label="Source (optional)" value={sourceNote} onChangeText={setSourceNote} placeholder="Where this came from" maxLength={300} />
      <TextField label="Notes (optional)" value={notes} onChangeText={setNotes} multiline maxLength={FIELD_LIMITS.notesLength} />

      {error && (
        <AppText variant="bodySm" color={colors.attention} style={styles.error} accessibilityRole="alert">
          {error}
        </AppText>
      )}

      <Button label={existing ? 'Save changes' : 'Add opportunity'} onPress={onSave} disabled={busy} style={styles.save} />
      {existing && (existing.archivedAt === null ? (
        <Button label="Archive" variant="ghost" onPress={onArchive} disabled={busy} />
      ) : (
        <Button label="Restore from archive" variant="ghost" onPress={onRestore} disabled={busy} />
      ))}

      {existing && (
        <>
          <Overline style={styles.sectionLabel}>Next steps</Overline>
          {linkedTasks.length > 0 ? (
            <StatusList
              items={linkedTasks.map((t) => ({ key: t.id, label: t.title, value: t.status === 'open' ? 'Open' : t.status === 'completed' ? 'Done' : 'Removed' }))}
            />
          ) : (
            <AppText variant="body" color={colors.textSecondary}>No next action yet.</AppText>
          )}
          {addingAction ? (
            <View style={styles.inlineForm}>
              <TextField label="Next action" value={actionTitle} onChangeText={setActionTitle} placeholder="Send the follow-up email" autoFocus />
              <View style={styles.row}>
                <Button label="Add" onPress={onAddAction} disabled={busy} style={styles.rowItem} />
                <Button label="Cancel" variant="ghost" onPress={() => setAddingAction(false)} disabled={busy} style={styles.rowItem} />
              </View>
            </View>
          ) : (
            <Button label="Add a next action" variant="ghost" size="sm" onPress={() => setAddingAction(true)} style={styles.addButton} />
          )}

          <Overline style={styles.sectionLabel}>Interviews</Overline>
          {linkedInterviews.length > 0 ? (
            <StatusList items={linkedInterviews.map((e) => ({ key: e.id, label: e.title, value: e.status === 'active' ? 'Scheduled' : 'Removed' }))} />
          ) : (
            <AppText variant="body" color={colors.textSecondary}>No interview scheduled.</AppText>
          )}
          {addingInterview ? (
            <View style={styles.inlineForm}>
              <TextField label="Interview" value={interviewTitle} onChangeText={setInterviewTitle} placeholder="Phone screen with Priya" autoFocus />
              <TextField label="Date (YYYY-MM-DD)" value={interviewDate} onChangeText={setInterviewDate} placeholder={followUpDate || 'YYYY-MM-DD'} maxLength={10} />
              <View style={styles.row}>
                <View style={styles.rowItem}><TextField label="Start (HH:MM)" value={interviewStart} onChangeText={setInterviewStart} placeholder="09:00" maxLength={5} /></View>
                <View style={styles.rowItem}><TextField label="End (HH:MM)" value={interviewEnd} onChangeText={setInterviewEnd} placeholder="09:30" maxLength={5} /></View>
              </View>
              <View style={styles.row}>
                <Button label="Schedule" onPress={onScheduleInterview} disabled={busy} style={styles.rowItem} />
                <Button label="Cancel" variant="ghost" onPress={() => setAddingInterview(false)} disabled={busy} style={styles.rowItem} />
              </View>
            </View>
          ) : (
            <Button label="Schedule an interview" variant="ghost" size="sm" onPress={() => setAddingInterview(true)} style={styles.addButton} />
          )}
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.sm },
  sectionLabel: { marginTop: spacing.xxl, marginBottom: spacing.sm },
  hint: { marginBottom: spacing.md, marginTop: -spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.md },
  rowItem: { flex: 1 },
  error: { marginBottom: spacing.lg },
  save: { marginTop: spacing.md, marginBottom: spacing.sm },
  note: { marginBottom: spacing.lg },
  addButton: { marginTop: spacing.md, alignSelf: 'flex-start' },
  inlineForm: { marginTop: spacing.sm },
});
