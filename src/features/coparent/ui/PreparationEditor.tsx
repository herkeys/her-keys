import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button, TextField } from '../../../design/components';
import { spacing } from '../../../design/tokens';
import { FIELD_LIMITS } from '../../../domain/state';
import { COPY } from '../copy';
import type { PreparationFields } from '../mutations';
import type { ChildOption } from '../types';
import { Choice, ErrorLine } from './parts';
import { preparationPresenceIssue } from './validation';

export interface PreparationEditorProps {
  childOptions: readonly ChildOption[];
  /** The handoffs that can be linked, each with a label already made unique. */
  transitions: ReadonlyArray<{ id: string; label: string }>;
  /** A handoff to have chosen when the editor opens (from "Add preparation" on a handoff), or null. Only honoured while it is listed. */
  initialLinkId: string | null;
  error: string | null;
  busy: boolean;
  onSubmit: (fields: PreparationFields) => void;
  onCancel?: () => void;
}

/** Something to get ready, optionally tied to one handoff. The link is only ever one she chose (or arrived with); it is never inferred. */
export function PreparationEditor({ childOptions, transitions, initialLinkId, error, busy, onSubmit, onCancel }: PreparationEditorProps) {
  const [childId, setChildId] = useState(() => (childOptions.length === 1 ? childOptions[0].childId : ''));
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [notes, setNotes] = useState('');
  const [linkId, setLinkId] = useState<string | null>(() => (initialLinkId !== null && transitions.some((transition) => transition.id === initialLinkId) ? initialLinkId : null));
  const [localError, setLocalError] = useState<string | null>(null);

  const submit = () => {
    const fields: PreparationFields = { childId, title, dueDate, notes, linkEventId: linkId };
    const issue = preparationPresenceIssue(fields);
    if (issue !== null) return setLocalError(COPY.outcomes[issue]);
    setLocalError(null);
    onSubmit(fields);
  };

  return (
    <View>
      <Choice label={COPY.editor.child} options={childOptions.map((option) => ({ key: option.childId, label: option.displayName }))} selected={childId === '' ? null : childId} onSelect={setChildId} />
      <TextField label={COPY.editor.title} value={title} onChangeText={setTitle} maxLength={FIELD_LIMITS.titleLength} />
      <TextField label={COPY.editor.dueDate} value={dueDate} onChangeText={setDueDate} placeholder={COPY.editor.datePlaceholder} maxLength={10} />
      <TextField label={COPY.editor.notes} value={notes} onChangeText={setNotes} multiline maxLength={FIELD_LIMITS.notesLength} />
      <Choice
        label={COPY.editor.linkHandoff}
        options={[{ key: '', label: COPY.editor.linkNone }, ...transitions.map((transition) => ({ key: transition.id, label: transition.label }))]}
        selected={linkId ?? ''}
        onSelect={(key) => setLinkId(key === '' ? null : key)}
      />

      <ErrorLine text={localError ?? error} />

      <View style={styles.actions}>
        <Button label={COPY.actions.createPrep} onPress={submit} disabled={busy} />
        {onCancel !== undefined ? <Button label={COPY.actions.cancel} variant="ghost" onPress={onCancel} /> : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { marginTop: spacing.xl, gap: spacing.sm },
});
