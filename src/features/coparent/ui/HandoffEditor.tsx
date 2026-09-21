import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, ChipToggle, TextField } from '../../../design/components';
import { spacing } from '../../../design/tokens';
import { FIELD_LIMITS } from '../../../domain/state';
import { COPY } from '../copy';
import type { CounterpartInput, HandoffFields, RepeatChoice } from '../mutations';
import type { ChildOption, PersonOption } from '../types';
import { initialCounterpart, PersonPicker } from './PersonPicker';
import { Caption, Choice, ErrorLine, FieldLabel } from './parts';
import { handoffPresenceIssue } from './validation';

export interface HandoffEditorProps {
  mode: 'create' | 'edit';
  /** What the editor opens with. On create it is blank: no date, no time, no length, no child is ever guessed. */
  initial: HandoffFields;
  childOptions: readonly ChildOption[];
  people: readonly PersonOption[];
  /** The sentence for the last refusal, or null. */
  error: string | null;
  busy: boolean;
  /** The row changed after this editor opened. Saving is off and the reason is printed. */
  stale: boolean;
  /** On edit the counterpart is not part of this form, so `{ kind: 'none' }` is passed and ignored. */
  onSubmit: (fields: HandoffFields, counterpart: CounterpartInput) => void;
  onCancel?: () => void;
}

const REPEAT_KEYS: readonly RepeatChoice[] = ['none', 'weekly', 'every_2_weeks', 'monthly'];

/** Create: the one child when there is exactly one, otherwise none. Edit: the recorded child, only while it is still a child here. */
function startingChild(mode: 'create' | 'edit', recorded: string, options: readonly ChildOption[]): string {
  if (mode === 'edit') return options.some((option) => option.childId === recorded) ? recorded : '';
  return options.length === 1 ? options[0].childId : '';
}

const needsKey = (value: boolean | null) => (value === true ? 'yes' : value === false ? 'no' : 'unsure');

export function HandoffEditor({ mode, initial, childOptions, people, error, busy, stale, onSubmit, onCancel }: HandoffEditorProps) {
  const [childId, setChildId] = useState(() => startingChild(mode, initial.childId, childOptions));
  const [title, setTitle] = useState(initial.title);
  const [date, setDate] = useState(initial.date);
  const [startTime, setStartTime] = useState(initial.startTime);
  const [endTime, setEndTime] = useState(initial.endTime);
  const [location, setLocation] = useState(initial.location);
  const [notes, setNotes] = useState(initial.notes);
  const [commitment, setCommitment] = useState(initial.commitment);
  const [needsMe, setNeedsMe] = useState(initial.needsMe);
  const [repeat, setRepeat] = useState(initial.repeat);
  const [counterpart, setCounterpart] = useState<CounterpartInput | null>(initialCounterpart(true));
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = () => {
    const fields: HandoffFields = { childId, title, date, startTime, endTime, location, notes, commitment, needsMe, repeat };
    const issue = handoffPresenceIssue(fields);
    if (issue !== null) return setLocalError(COPY.outcomes[issue]);
    if (mode === 'create' && counterpart === null) return setLocalError(COPY.editor.personIncomplete);
    setLocalError(null);
    onSubmit(fields, mode === 'create' && counterpart !== null ? counterpart : { kind: 'none' });
  };

  const repeatKeys = initial.repeat === 'keep' ? [...REPEAT_KEYS, 'keep' as const] : REPEAT_KEYS;

  return (
    <View>
      <Choice label={COPY.editor.child} options={childOptions.map((option) => ({ key: option.childId, label: option.displayName }))} selected={childId === '' ? null : childId} onSelect={setChildId} />

      <TextField label={COPY.editor.title} value={title} onChangeText={setTitle} placeholder={COPY.editor.titlePlaceholder} maxLength={FIELD_LIMITS.titleLength} />
      <View style={styles.chips}>
        {COPY.editor.starters.map((starter) => (
          <ChipToggle key={starter} label={starter} selected={title === starter} onPress={() => setTitle(starter)} />
        ))}
      </View>
      <Caption>{COPY.editor.startersHint}</Caption>

      <View style={styles.fields}>
        <TextField label={COPY.editor.date} value={date} onChangeText={setDate} placeholder={COPY.editor.datePlaceholder} maxLength={10} />
        <View style={styles.row}>
          <View style={styles.rowItem}>
            <TextField label={COPY.editor.start} value={startTime} onChangeText={setStartTime} placeholder={COPY.editor.timePlaceholder} maxLength={5} />
          </View>
          <View style={styles.rowItem}>
            <TextField label={COPY.editor.end} value={endTime} onChangeText={setEndTime} placeholder={COPY.editor.timePlaceholder} maxLength={5} />
          </View>
        </View>
        <Caption>{COPY.editor.timeHelp}</Caption>
      </View>

      <View style={styles.fields}>
        <TextField label={COPY.editor.location} value={location} onChangeText={setLocation} maxLength={FIELD_LIMITS.locationLength} />
        <TextField label={COPY.editor.notes} value={notes} onChangeText={setNotes} multiline maxLength={FIELD_LIMITS.notesLength} />
      </View>

      <Choice
        label={COPY.editor.commitment}
        options={[
          { key: 'fixed', label: COPY.editor.fixed },
          { key: 'flexible', label: COPY.editor.flexible },
        ]}
        selected={commitment}
        onSelect={(key) => setCommitment(key === 'flexible' ? 'flexible' : 'fixed')}
      />
      <Caption>{COPY.editor.commitmentHelp}</Caption>

      <View style={styles.fields}>
        <Choice
          label={COPY.editor.needsYou}
          options={[
            { key: 'yes', label: COPY.editor.needsYesNo.yes },
            { key: 'no', label: COPY.editor.needsYesNo.no },
            { key: 'unsure', label: COPY.editor.needsYesNo.unsure },
          ]}
          selected={needsKey(needsMe)}
          onSelect={(key) => setNeedsMe(key === 'yes' ? true : key === 'no' ? false : null)}
        />
      </View>

      <Choice
        label={COPY.editor.repeat}
        options={repeatKeys.map((key) => ({ key, label: COPY.editor.repeatChoices[key] }))}
        selected={repeat}
        onSelect={(key) => setRepeat(repeatKeys.find((candidate) => candidate === key) ?? 'none')}
      />
      <Caption>{COPY.editor.repeatHelp}</Caption>

      {mode === 'create' ? (
        <View style={styles.fields}>
          <PersonPicker people={people} allowNone onChange={setCounterpart} />
        </View>
      ) : null}

      <ErrorLine text={stale ? COPY.outcomes.stale : (localError ?? error)} />

      <View style={styles.actions}>
        <Button label={mode === 'edit' ? COPY.actions.save : COPY.actions.create} onPress={submit} disabled={busy || stale} />
        {onCancel !== undefined ? <Button label={COPY.actions.cancel} variant="ghost" onPress={onCancel} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { flexDirection: 'row', flexWrap: 'wrap' },
  fields: { marginTop: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.md },
  rowItem: { flex: 1 },
  actions: { marginTop: spacing.xl, gap: spacing.sm },
});
