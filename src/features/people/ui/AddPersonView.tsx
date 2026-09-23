import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, InlineNotice, TextField } from '../../../design/components';
import { spacing } from '../../../design/tokens';
import { PEOPLE_LIMITS } from '../../../domain/foundation/personContext';
import { peopleCopy } from '../copy';

export interface AddPersonInput {
  displayName: string;
  relationshipName: string;
  organizationName: string;
  contextNote: string;
}

export interface AddPersonViewProps {
  busy: boolean;
  message: string | null;
  onSubmit: (input: AddPersonInput) => void;
}

/**
 * Add someone (HK-FEATURE-13). A name, and — only if she wants — a short label, an organization and a private note. She never picks
 * from a taxonomy, and nothing is looked up by name: a second "Jordan Lee" is a second person.
 */
export function AddPersonView({ busy, message, onSubmit }: AddPersonViewProps) {
  const [displayName, setName] = useState('');
  const [relationshipName, setLabel] = useState('');
  const [organizationName, setOrganization] = useState('');
  const [contextNote, setNote] = useState('');
  return (
    <View>
      <AppText variant="screenTitle" accessibilityRole="header" style={styles.heading}>
        {peopleCopy.add.title}
      </AppText>
      {message ? <InlineNotice tone="waiting" title={message} body="" style={styles.notice} /> : null}
      <TextField label={peopleCopy.add.nameLabel} value={displayName} onChangeText={setName} maxLength={PEOPLE_LIMITS.displayName} autoFocus />
      <TextField label={peopleCopy.detail.relationshipName} placeholder={peopleCopy.detail.relationshipHint} value={relationshipName} onChangeText={setLabel} maxLength={PEOPLE_LIMITS.relationshipName} />
      <TextField label={peopleCopy.detail.organizationName} value={organizationName} onChangeText={setOrganization} maxLength={PEOPLE_LIMITS.organizationName} />
      <TextField label={peopleCopy.detail.contextNote} placeholder={peopleCopy.detail.contextNoteHint} value={contextNote} onChangeText={setNote} maxLength={PEOPLE_LIMITS.contextNote} multiline />
      <Button label={peopleCopy.add.save} onPress={() => onSubmit({ displayName, relationshipName, organizationName, contextNote })} disabled={busy || displayName.trim() === ''} />
    </View>
  );
}

const styles = StyleSheet.create({
  heading: { marginBottom: spacing.xl },
  notice: { marginBottom: spacing.lg },
});
