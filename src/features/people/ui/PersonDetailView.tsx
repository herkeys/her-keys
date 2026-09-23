import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, InlineNotice, Overline, StatusList, TextField } from '../../../design/components';
import { colors, spacing } from '../../../design/tokens';
import { PEOPLE_LIMITS } from '../../../domain/foundation/personContext';
import { peopleCopy } from '../copy';
import type { PersonDetail } from '../privateNote';

export interface ContextFieldsInput {
  relationshipName: string;
  organizationName: string;
  contextNote: string;
}

export interface PersonDetailViewProps {
  detail: PersonDetail;
  busy: boolean;
  message: string | null;
  onRemember: (fields: ContextFieldsInput) => void;
  onSaveContext: (fields: ContextFieldsInput) => void;
  onArchiveContext: () => void;
  onRestoreContext: () => void;
  onRename: (displayName: string) => void;
  onArchivePerson: () => void;
  onRestorePerson: () => void;
  onAddFollowUp: () => void;
}

/**
 * One person (HK-FEATURE-13). The ONLY surface that shows her private note, because it is the person's own detail screen. Identity
 * controls appear only where People owns the identity (a non-account person who is not the co-parent); a child is Kids', a co-parent
 * is Co-Parent's, and that is said plainly.
 */
export function PersonDetailView(props: PersonDetailViewProps) {
  const { detail, busy, message } = props;
  const context = detail.context;
  const [label, setLabel] = useState(context?.relationshipName ?? '');
  const [organization, setOrganization] = useState(context?.organizationName ?? '');
  const [note, setNote] = useState(context?.contextNote ?? '');
  const [name, setName] = useState(detail.displayName);
  const fields = (): ContextFieldsInput => ({ relationshipName: label, organizationName: organization, contextNote: note });
  const archivedPerson = detail.identityStatus === 'archived';

  return (
    <View>
      <View style={styles.header}>
        <AppText variant="display" accessibilityRole="header">
          {detail.displayName}
        </AppText>
        {detail.kindLabel ? (
          <AppText variant="supporting" color={colors.textSecondary}>
            {detail.kindLabel}
          </AppText>
        ) : null}
      </View>

      {message ? <InlineNotice tone="waiting" title={message} body="" style={styles.notice} /> : null}
      {archivedPerson ? <InlineNotice tone="info" title={peopleCopy.detail.archivedPerson} body="" style={styles.notice} /> : null}
      {context?.status === 'archived' ? <InlineNotice tone="info" title={peopleCopy.detail.archivedContext} body="" style={styles.notice} /> : null}

      {context === null ? (
        <View style={styles.section}>
          <Overline style={styles.sectionLabel}>{peopleCopy.detail.rememberSomething}</Overline>
          <ContextFields label={label} setLabel={setLabel} organization={organization} setOrganization={setOrganization} note={note} setNote={setNote} />
          <Button label={peopleCopy.detail.save} onPress={() => props.onRemember(fields())} disabled={busy || archivedPerson} />
        </View>
      ) : (
        <View style={styles.section}>
          <ContextFields label={label} setLabel={setLabel} organization={organization} setOrganization={setOrganization} note={note} setNote={setNote} editable={context.status === 'active'} />
          {context.status === 'active' ? (
            <View style={styles.actions}>
              <Button label={peopleCopy.detail.save} onPress={() => props.onSaveContext(fields())} disabled={busy} />
              <Button label={peopleCopy.detail.archiveContext} variant="ghost" onPress={props.onArchiveContext} disabled={busy} />
            </View>
          ) : (
            <Button label={peopleCopy.detail.restoreContext} variant="secondary" onPress={props.onRestoreContext} disabled={busy || archivedPerson} />
          )}
        </View>
      )}

      {context !== null ? (
        <View style={styles.section}>
          <Overline style={styles.sectionLabel}>{peopleCopy.sections.needsFollowUp}</Overline>
          {detail.followUps.length === 0 ? (
            <AppText variant="supporting" color={colors.textSecondary}>
              {peopleCopy.detail.noFollowUps}
            </AppText>
          ) : (
            <StatusList items={detail.followUps.map((f) => ({ key: f.taskId, label: f.title, value: f.whenText }))} />
          )}
          {detail.canAddFollowUp ? <Button label={peopleCopy.followUp.add} variant="secondary" onPress={props.onAddFollowUp} disabled={busy} style={styles.addFollowUp} /> : null}
        </View>
      ) : null}

      <View style={styles.section}>
        {detail.identityEditable ? (
          <>
            <TextField label={peopleCopy.detail.name} value={name} onChangeText={setName} maxLength={PEOPLE_LIMITS.displayName} editable={!archivedPerson} />
            <View style={styles.actions}>
              {!archivedPerson ? <Button label={peopleCopy.detail.save} variant="secondary" onPress={() => props.onRename(name)} disabled={busy} /> : null}
              {archivedPerson ? (
                <Button label={peopleCopy.detail.restorePerson} variant="secondary" onPress={props.onRestorePerson} disabled={busy} />
              ) : (
                <Button label={peopleCopy.detail.archivePerson} variant="ghost" onPress={props.onArchivePerson} disabled={busy} />
              )}
            </View>
          </>
        ) : (
          <AppText variant="supporting" color={colors.textSecondary}>
            {detail.readOnlyReason ?? ''}
          </AppText>
        )}
      </View>
    </View>
  );
}

function ContextFields(p: {
  label: string;
  setLabel: (v: string) => void;
  organization: string;
  setOrganization: (v: string) => void;
  note: string;
  setNote: (v: string) => void;
  editable?: boolean;
}) {
  const editable = p.editable ?? true;
  return (
    <View>
      <TextField label={peopleCopy.detail.relationshipName} placeholder={peopleCopy.detail.relationshipHint} value={p.label} onChangeText={p.setLabel} maxLength={PEOPLE_LIMITS.relationshipName} editable={editable} />
      <TextField label={peopleCopy.detail.organizationName} value={p.organization} onChangeText={p.setOrganization} maxLength={PEOPLE_LIMITS.organizationName} editable={editable} />
      <TextField label={peopleCopy.detail.contextNote} placeholder={peopleCopy.detail.contextNoteHint} value={p.note} onChangeText={p.setNote} maxLength={PEOPLE_LIMITS.contextNote} multiline editable={editable} />
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xl },
  notice: { marginBottom: spacing.lg },
  section: { marginBottom: spacing.xxl },
  sectionLabel: { marginBottom: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, marginTop: spacing.sm },
  addFollowUp: { marginTop: spacing.md, alignSelf: 'flex-start' },
});
