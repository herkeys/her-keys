import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { ChipToggle, TextField } from '../../../design/components';
import { spacing } from '../../../design/tokens';
import { PERSON_RELATIONSHIPS } from '../../../domain/foundation/responsibility';
import { COPY } from '../copy';
import type { CounterpartInput, PersonRelationship } from '../mutations';
import type { PersonOption } from '../types';
import { Caption, FieldLabel } from './parts';

/**
 * WHO IS RESPONSIBLE — a person already recorded, a new one, or (where allowed) nobody recorded.
 *
 * Reports its answer as a `CounterpartInput`, or null while the answer is not yet complete (a name typed with no relationship, or
 * nothing chosen where an answer is needed). Labels arrive already made unique, so two people with the same name stay two rows.
 * Choosing here records that she asked; it contacts nobody.
 */

interface Draft {
  mode: 'none' | 'person' | 'add' | null;
  personId: string | null;
  name: string;
  relationship: PersonRelationship | null;
}

/** What a parent should hold before the picker has reported anything. */
export const initialCounterpart = (allowNone: boolean): CounterpartInput | null => (allowNone ? { kind: 'none' } : null);

function counterpartOfDraft(draft: Draft): CounterpartInput | null {
  if (draft.mode === 'none') return { kind: 'none' };
  if (draft.mode === 'person') return draft.personId === null ? null : { kind: 'person', personId: draft.personId };
  if (draft.mode === 'add') {
    const displayName = draft.name.trim();
    return displayName === '' || draft.relationship === null ? null : { kind: 'new', displayName, relationship: draft.relationship };
  }
  return null;
}

export interface PersonPickerProps {
  people: readonly PersonOption[];
  /** Offer "Not recorded". False when an answer is needed (recording a request, or a different person). */
  allowNone: boolean;
  heading?: string;
  onChange: (value: CounterpartInput | null) => void;
}

export function PersonPicker({ people, allowNone, heading = COPY.editor.responsible, onChange }: PersonPickerProps) {
  const [draft, setDraft] = useState<Draft>({ mode: allowNone ? 'none' : people.length === 0 ? 'add' : null, personId: null, name: '', relationship: null });

  const update = (patch: Partial<Draft>) => {
    const next = { ...draft, ...patch };
    setDraft(next);
    onChange(counterpartOfDraft(next));
  };

  return (
    <View style={styles.wrap}>
      <FieldLabel>{heading}</FieldLabel>
      <View style={styles.options}>
        {allowNone ? <ChipToggle label={COPY.editor.responsibleNone} selected={draft.mode === 'none'} onPress={() => update({ mode: 'none', personId: null })} /> : null}
        {people.map((person) => (
          <View key={person.personId} style={styles.option}>
            <ChipToggle
              label={person.label}
              selected={draft.mode === 'person' && draft.personId === person.personId}
              onPress={() => update({ mode: 'person', personId: person.personId })}
            />
            {person.relationshipLabel !== null && !person.label.includes(person.relationshipLabel) ? <Caption>{person.relationshipLabel}</Caption> : null}
          </View>
        ))}
        <ChipToggle label={COPY.editor.responsibleAdd} selected={draft.mode === 'add'} onPress={() => update({ mode: 'add' })} />
      </View>

      {draft.mode === 'add' ? (
        <View style={styles.add}>
          <TextField label={COPY.editor.personName} value={draft.name} onChangeText={(name) => update({ name })} maxLength={80} />
          <FieldLabel>{COPY.editor.personRelationship}</FieldLabel>
          <View style={styles.options}>
            {PERSON_RELATIONSHIPS.map((relationship) => (
              <ChipToggle key={relationship} label={COPY.editor.relationships[relationship]} selected={draft.relationship === relationship} onPress={() => update({ relationship })} />
            ))}
          </View>
        </View>
      ) : null}

      <Caption>{COPY.editor.responsibleHelp}</Caption>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: spacing.lg },
  options: { flexDirection: 'row', flexWrap: 'wrap', alignItems: 'center' },
  option: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginRight: spacing.xs },
  add: { marginTop: spacing.sm },
});
