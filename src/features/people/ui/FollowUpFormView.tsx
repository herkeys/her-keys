import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, InlineNotice, TextField } from '../../../design/components';
import { colors, spacing } from '../../../design/tokens';
import { peopleCopy } from '../copy';

export interface FollowUpFormViewProps {
  /** Whose follow-up this is, for the heading only. The name is NEVER put into the title field. */
  displayName: string;
  busy: boolean;
  message: string | null;
  onSave: (input: { title: string; dueDate: string | null }) => void;
  onCancel: () => void;
}

/**
 * Add a follow-up (HK-FEATURE-13). The title starts EMPTY — no name, label, note or suggested action is filled in: she types what the
 * follow-up actually is. Scope is fixed (private to her) and said so. Rendering this form writes nothing; Cancel writes nothing.
 */
export function FollowUpFormView({ displayName, busy, message, onSave, onCancel }: FollowUpFormViewProps) {
  const [title, setTitle] = useState('');
  const [dueDate, setDueDate] = useState('');
  return (
    <View>
      <AppText variant="screenTitle" accessibilityRole="header" style={styles.heading}>
        {`${peopleCopy.followUp.add} — ${displayName}`}
      </AppText>
      {message ? <InlineNotice tone="waiting" title={message} body="" style={styles.notice} /> : null}
      <TextField label={peopleCopy.followUp.titleLabel} placeholder={peopleCopy.followUp.titleHint} value={title} onChangeText={setTitle} maxLength={200} autoFocus />
      <TextField label={peopleCopy.followUp.dueLabel} placeholder="YYYY-MM-DD" value={dueDate} onChangeText={setDueDate} maxLength={10} />
      <AppText variant="supporting" color={colors.textSecondary} style={styles.private}>
        {peopleCopy.followUp.privateNote}
      </AppText>
      <View style={styles.actions}>
        <Button label={peopleCopy.followUp.save} onPress={() => onSave({ title, dueDate: dueDate.trim() === '' ? null : dueDate.trim() })} disabled={busy || title.trim() === ''} />
        <Button label={peopleCopy.followUp.cancel} variant="ghost" onPress={onCancel} disabled={busy} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { marginBottom: spacing.xl },
  notice: { marginBottom: spacing.lg },
  private: { marginBottom: spacing.lg },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md },
});
