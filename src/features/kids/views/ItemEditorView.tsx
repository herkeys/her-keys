import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, ChipToggle, InlineNotice, Overline, TextField } from '../../../design/components';
import { color, spacing } from '../../../design/tokens';
import type { DurationKnowledge } from '../../../domain/foundation/duration';
import { FIELD_LIMITS } from '../../../domain/state';
import { FORM, HANDOFF, timeHint } from '../copy';
import type { ChildLabel } from '../identity';
import { createSingleFlight } from '../singleFlight';
import { ResponsibilityPanel, type PersonChoice, type ResponsibilityPanelProps } from './ResponsibilityPanel';

export interface EditorValues {
  childId: string | null;
  title: string;
  dueDate: string;
  durationText: string;
  durationTouched: boolean;
  notes: string;
  commitment: 'fixed' | 'flexible';
  date: string;
  startText: string;
  endText: string;
  where: string;
  handoffToPersonId: string | null;
}

export type SubmitResult = { ok: true } | { ok: false; message: string };

export interface ItemEditorViewProps {
  kind: 'task' | 'event';
  mode: 'create' | 'edit';
  timeZone: string;
  childChoices: ChildLabel[];
  initial: EditorValues;
  /** The length's provenance on an existing task, so the field can say what the number is. */
  durationKnowledge: DurationKnowledge | null;
  /** The title of what this task is a step of (a plan step), if it is one. */
  planStepFor: string | null;
  /** Create only: somebody to ask at the same moment. */
  people: PersonChoice[];
  /** Edit only. */
  responsibility: ResponsibilityPanelProps | null;
  /** Set after a stale or missing save: the newer version is what is shown. */
  notice: string | null;
  onSubmit: (values: EditorValues) => Promise<SubmitResult>;
  onMarkDone?: () => Promise<SubmitResult>;
  onRemove?: () => Promise<SubmitResult>;
  onReload?: () => void;
}

/**
 * Create or edit ONE canonical child-linked item. The same fields either way; an edit only ever sends what she changed. The length
 * field is the place provenance is decided: it starts as the planning default she was shown, and only touching it makes it hers.
 */
export function ItemEditorView(props: ItemEditorViewProps) {
  const { kind, mode, timeZone, childChoices, initial, people } = props;
  const [childId, setChildId] = useState<string | null>(initial.childId);
  const [title, setTitle] = useState(initial.title);
  const [dueDate, setDueDate] = useState(initial.dueDate);
  const [durationText, setDurationText] = useState(initial.durationText);
  const [durationTouched, setDurationTouched] = useState(false);
  const [notes, setNotes] = useState(initial.notes);
  const [commitment, setCommitment] = useState(initial.commitment);
  const [date, setDate] = useState(initial.date);
  const [startText, setStartText] = useState(initial.startText);
  const [endText, setEndText] = useState(initial.endText);
  const [where, setWhere] = useState(initial.where);
  const [handoff, setHandoff] = useState<string | null>(initial.handoffToPersonId);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Set synchronously, so a second tap in the same frame is refused before the first has rendered "busy".
  const flight = useRef(createSingleFlight());

  const run = async (work: () => Promise<SubmitResult>) => {
    const result = await flight.current.run(async () => {
      setBusy(true);
      try {
        return await work();
      } finally {
        setBusy(false);
      }
    });
    if (result && !result.ok) setError(result.message);
  };

  const submit = () => {
    setError(null);
    return run(() => props.onSubmit({ childId, title, dueDate, durationText, durationTouched, notes, commitment, date, startText, endText, where, handoffToPersonId: handoff }));
  };

  const saveLabel = mode === 'edit' ? FORM.save : kind === 'task' ? FORM.addTaskSave : FORM.addEventSave;

  const knowledge = props.durationKnowledge;
  const durationNote = durationTouched
    ? null
    : mode === 'create' || knowledge === 'default-estimate'
      ? FORM.minutesDefaultNote
      : knowledge === 'unrecorded'
        ? FORM.minutesUnrecordedNote
        : knowledge === 'inferred-estimate'
          ? FORM.minutesInferredNote
          : null;

  const startHint = kind === 'event' ? timeHint(date, startText, timeZone) : null;
  const endHint = kind === 'event' ? timeHint(date, endText, timeZone) : null;

  return (
    <View style={styles.stack}>
      {props.planStepFor ? (
        <InlineNotice tone="info" title="A step, not a plan" body={FORM.planStepFor(props.planStepFor)} />
      ) : null}
      {props.notice ? (
        <InlineNotice tone="attention" title="Nothing was saved" body={props.notice} />
      ) : null}
      {props.notice && props.onReload ? <Button label={FORM.reload} variant="secondary" onPress={props.onReload} /> : null}

      {childChoices.length > 1 ? (
        <View>
          <Overline>{FORM.child}</Overline>
          <View style={styles.chips}>
            {childChoices.map((choice) => (
              <ChipToggle key={choice.childId} label={choice.full} selected={choice.childId === childId} onPress={() => setChildId(choice.childId)} />
            ))}
          </View>
        </View>
      ) : (
        <AppText variant="supporting" color={color.text.secondary}>
          {`For ${childChoices[0]?.short ?? 'your child'}`}
        </AppText>
      )}

      <TextField label={FORM.title} value={title} onChangeText={setTitle} maxLength={FIELD_LIMITS.titleLength} autoFocus={mode === 'create'} />

      {kind === 'task' ? (
        <>
          <TextField label={FORM.due} value={dueDate} onChangeText={setDueDate} maxLength={10} placeholder="No due date" />
          <TextField
            label={FORM.minutes}
            value={durationText}
            onChangeText={(text) => {
              setDurationTouched(true);
              setDurationText(text);
            }}
            keyboardType="number-pad"
            maxLength={4}
          />
          {durationNote ? (
            <AppText variant="metadata" color={color.text.secondary}>
              {durationNote}
            </AppText>
          ) : null}
        </>
      ) : (
        <>
          <TextField label={FORM.date} value={date} onChangeText={setDate} maxLength={10} />
          <TextField label={FORM.starts} value={startText} onChangeText={setStartText} maxLength={8} />
          {startHint ? (
            <AppText variant="metadata" color={color.status.attention}>
              {startHint}
            </AppText>
          ) : null}
          <TextField label={FORM.ends} value={endText} onChangeText={setEndText} maxLength={8} />
          {endHint ? (
            <AppText variant="metadata" color={color.status.attention}>
              {endHint}
            </AppText>
          ) : null}
          <TextField label={FORM.where} value={where} onChangeText={setWhere} maxLength={FIELD_LIMITS.locationLength} />
        </>
      )}

      <TextField label={FORM.notes} value={notes} onChangeText={setNotes} multiline maxLength={FIELD_LIMITS.notesLength} />

      <View>
        <Overline>{FORM.commitment}</Overline>
        <View style={styles.chips}>
          <ChipToggle label={FORM.flexible} selected={commitment === 'flexible'} onPress={() => setCommitment('flexible')} />
          <ChipToggle label={FORM.fixed} selected={commitment === 'fixed'} onPress={() => setCommitment('fixed')} />
        </View>
      </View>

      {mode === 'create' && people.length > 0 ? (
        <View>
          <Overline>{HANDOFF.ask}</Overline>
          <View style={styles.chips}>
            {people.map((person) => (
              <ChipToggle
                key={person.id}
                label={person.displayName}
                selected={handoff === person.id}
                onPress={() => setHandoff(handoff === person.id ? null : person.id)}
              />
            ))}
          </View>
          <AppText variant="metadata" color={color.text.secondary}>
            {HANDOFF.askNote}
          </AppText>
        </View>
      ) : null}

      {error ? (
        <AppText variant="supporting" color={color.status.attention} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}

      <Button label={saveLabel} onPress={submit} disabled={busy} />

      {mode === 'edit' && props.responsibility ? <ResponsibilityPanel {...props.responsibility} /> : null}

      {mode === 'edit' && kind === 'task' && props.onMarkDone ? (
        <Button label={FORM.markDone} variant="secondary" disabled={busy} onPress={() => run(props.onMarkDone!)} />
      ) : null}
      {mode === 'edit' && props.onRemove ? (
        <Button label={kind === 'task' ? FORM.removeTask : FORM.removeEvent} variant="ghost" disabled={busy} onPress={() => run(props.onRemove!)} />
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginTop: spacing.sm },
});
