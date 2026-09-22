import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, ChipToggle, TextField } from '../../../design/components';
import { spacing } from '../../../design/tokens';
import { FIELD_LIMITS } from '../../../domain/state';
import { COPY } from '../copy';
import type { CounterpartInput, FollowUpFields } from '../mutations';
import type { ChildOption, PersonOption } from '../types';
import { initialCounterpart, PersonPicker } from './PersonPicker';
import { Caption, Choice, ErrorLine, FieldLabel } from './parts';
import { followUpPresenceIssue } from './validation';

export interface FollowUpEditorProps {
  mode: 'create' | 'edit';
  /** On create: no amount, no currency, no direction. On edit: the row as it was when the editor opened. */
  initial: FollowUpFields;
  childOptions: readonly ChildOption[];
  people: readonly PersonOption[];
  /** The currency of an amount she recorded before, offered (never applied silently) on create. Null when there is none, and on edit. */
  suggestedCurrency: string | null;
  error: string | null;
  busy: boolean;
  /** The row changed after this editor opened. Saving is off and the reason is printed. */
  stale: boolean;
  /** On edit the counterpart is not part of this form, so `{ kind: 'none' }` is passed and ignored. */
  onSubmit: (fields: FollowUpFields, counterpart: CounterpartInput) => void;
  onCancel?: () => void;
}

const CURRENCIES: readonly string[] = ['USD', 'CAD', 'GBP', 'EUR', 'AUD'];

/** A money follow-up is a task for her. The direction is her own explicit answer, and no currency is chosen for her. */
export function FollowUpEditor({ mode, initial, childOptions, people, suggestedCurrency, error, busy, stale, onSubmit, onCancel }: FollowUpEditorProps) {
  const suggested = mode === 'create' ? suggestedCurrency : null;
  const codes = suggested !== null && !CURRENCIES.includes(suggested) ? [suggested, ...CURRENCIES] : CURRENCIES;
  const recorded = initial.currency.trim().toUpperCase();

  const [title, setTitle] = useState(initial.title);
  // No child is a real answer, so "No child" is a chip of its own (key '') and starts selected unless a child was recorded.
  const [childId, setChildId] = useState<string | null>(initial.childId);
  const [amountText, setAmountText] = useState(initial.amountText);
  // A chosen chip, or letters typed into "Other" — never both. Only a suggestion (create) or the recorded currency (edit) is pre-chosen.
  const [chip, setChip] = useState<string | null>(() => (recorded !== '' ? (codes.includes(recorded) ? recorded : null) : suggested));
  const [other, setOther] = useState(() => (recorded !== '' && !codes.includes(recorded) ? recorded : ''));
  const [direction, setDirection] = useState(initial.direction);
  const [followUpDate, setFollowUpDate] = useState(initial.followUpDate);
  const [notes, setNotes] = useState(initial.notes);
  const [counterpart, setCounterpart] = useState<CounterpartInput | null>(initialCounterpart(true));
  const [localError, setLocalError] = useState<string | null>(null);

  const currency = other.trim() !== '' ? other.trim().toUpperCase() : (chip ?? '');

  const submit = () => {
    const fields: FollowUpFields = { title, childId, amountText, currency, direction, followUpDate, notes };
    const issue = followUpPresenceIssue(fields);
    if (issue !== null) return setLocalError(COPY.outcomes[issue]);
    if (mode === 'create' && counterpart === null) return setLocalError(COPY.editor.personIncomplete);
    setLocalError(null);
    onSubmit(fields, mode === 'create' && counterpart !== null ? counterpart : { kind: 'none' });
  };

  return (
    <View>
      <TextField label={COPY.editor.title} value={title} onChangeText={setTitle} maxLength={FIELD_LIMITS.titleLength} />

      <Choice
        label={COPY.editor.child}
        options={[{ key: '', label: COPY.editor.noChild }, ...childOptions.map((option) => ({ key: option.childId, label: option.displayName }))]}
        selected={childId ?? ''}
        onSelect={(key) => setChildId(key === '' ? null : key)}
      />

      <TextField label={COPY.editor.amount} value={amountText} onChangeText={setAmountText} keyboardType="decimal-pad" maxLength={14} />
      <Caption>{COPY.editor.amountHelp}</Caption>

      <View style={styles.fields}>
        <FieldLabel>{COPY.editor.currency}</FieldLabel>
        <View style={styles.chips}>
          {codes.map((code) => (
            <ChipToggle
              key={code}
              label={code === suggested ? COPY.editor.currencySuggested(code) : code}
              selected={other.trim() === '' && chip === code}
              onPress={() => {
                setChip(code);
                setOther('');
              }}
            />
          ))}
        </View>
        <TextField
          label={COPY.editor.currencyOther}
          value={other}
          onChangeText={(text) => {
            setOther(text.toUpperCase());
            setChip(null);
          }}
          maxLength={3}
        />
      </View>

      <Choice
        label={COPY.editor.direction}
        options={[
          { key: 'inflow', label: COPY.editor.directionInflow },
          { key: 'outflow', label: COPY.editor.directionOutflow },
        ]}
        selected={direction}
        onSelect={(key) => setDirection(key === 'inflow' ? 'inflow' : 'outflow')}
      />

      <TextField label={COPY.editor.followUpDate} value={followUpDate} onChangeText={setFollowUpDate} placeholder={COPY.editor.datePlaceholder} maxLength={10} />
      <TextField label={COPY.editor.notes} value={notes} onChangeText={setNotes} multiline maxLength={FIELD_LIMITS.notesLength} />
      <Caption>{COPY.editor.followUpHelp}</Caption>

      {mode === 'create' ? (
        <View style={styles.fields}>
          <PersonPicker people={people} allowNone onChange={setCounterpart} />
        </View>
      ) : null}

      <ErrorLine text={stale ? COPY.outcomes.stale : (localError ?? error)} />

      <View style={styles.actions}>
        <Button label={mode === 'edit' ? COPY.actions.save : COPY.actions.createFollowUp} onPress={submit} disabled={busy || stale} />
        {onCancel !== undefined ? <Button label={COPY.actions.cancel} variant="ghost" onPress={onCancel} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fields: { marginTop: spacing.lg },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md },
  actions: { marginTop: spacing.xl, gap: spacing.sm },
});
