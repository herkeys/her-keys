import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, TextField } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { focusInputProblem, type FocusInputProblem } from '../../domain/rebuild/commands';
import { REBUILD_FOCUS_NOTE_MAX, REBUILD_FOCUS_TITLE_MAX } from '../../domain/rebuild/schema';
import { REBUILD_COPY } from './copy';

export interface FocusEditorBodyProps {
  canWrite: boolean;
  /** Saves and resolves true once it is on disk. Nothing is created before this is called. */
  onSave: (input: { title: string; note: string | null }) => Promise<boolean>;
  onCancel: () => void;
}

const C = REBUILD_COPY.editor;
const MESSAGE: Record<FocusInputProblem, string> = {
  title_missing: C.titleMissing,
  title_too_long: C.titleTooLong,
  note_too_long: C.noteTooLong,
};

/**
 * Naming a Focus. Progressive capture: a few words are enough, the note is optional, and nothing else is asked — no assessment, no
 * category, no goal, no next step. The Focus / Goal distinction is shown as plain copy; nothing here classifies what she writes.
 */
export function FocusEditorBody({ canWrite, onSave, onCancel }: FocusEditorBodyProps) {
  const [title, setTitle] = useState('');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState<FocusInputProblem | null>(null);
  const [failed, setFailed] = useState(false);
  const [busy, setBusy] = useState(false);
  // A second tap in the same frame would otherwise save twice before `busy` renders.
  const inFlight = useRef(false);

  const save = async () => {
    const found = focusInputProblem({ title, note });
    setProblem(found);
    if (found !== null || inFlight.current || !canWrite) return;
    inFlight.current = true;
    setBusy(true);
    setFailed(false);
    const saved = await onSave({ title, note: note.trim().length === 0 ? null : note });
    inFlight.current = false;
    setBusy(false);
    if (!saved) setFailed(true);
  };

  return (
    <View>
      <AppText variant="screenTitle" style={styles.title}>
        {C.title}
      </AppText>
      <View style={styles.distinction}>
        <AppText variant="supporting" color={colors.textSecondary}>
          {C.distinctionFocus}
        </AppText>
        <AppText variant="supporting" color={colors.textSecondary}>
          {C.distinctionGoal}
        </AppText>
      </View>
      <TextField
        label={C.titleLabel}
        value={title}
        onChangeText={setTitle}
        placeholder={C.titlePlaceholder}
        maxLength={REBUILD_FOCUS_TITLE_MAX}
        error={problem === 'title_missing' || problem === 'title_too_long' ? MESSAGE[problem] : null}
        autoFocus
      />
      <TextField
        label={C.noteLabel}
        value={note}
        onChangeText={setNote}
        placeholder={C.notePlaceholder}
        maxLength={REBUILD_FOCUS_NOTE_MAX}
        multiline
        error={problem === 'note_too_long' ? MESSAGE.note_too_long : null}
      />
      {failed && (
        <AppText variant="supporting" color={colors.attention} accessibilityRole="alert" style={styles.failed}>
          {C.saveFailed}
        </AppText>
      )}
      <View style={styles.row}>
        <Button label={C.save} onPress={save} disabled={busy || !canWrite} />
        <Button label={C.cancel} variant="ghost" onPress={onCancel} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.md },
  distinction: { marginBottom: spacing.xl, gap: spacing.xs },
  failed: { marginBottom: spacing.md },
  row: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.lg },
});
