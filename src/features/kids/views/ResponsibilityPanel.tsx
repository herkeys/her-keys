import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, ChipToggle, InlineNotice, Overline, Tag, TextField } from '../../../design/components';
import { color, spacing } from '../../../design/tokens';
import { PERSON_RELATIONSHIPS } from '../../../domain/foundation/responsibility';
import { HANDOFF, RELATIONSHIP_LABEL, coverageLine, coverageTag } from '../copy';
import type { ItemAction, ResponsibilityFacts } from '../types';

export interface PersonChoice {
  id: string;
  displayName: string;
}

export interface ResponsibilityPanelProps {
  facts: ResponsibilityFacts;
  actions: ItemAction[];
  people: PersonChoice[];
  busy: boolean;
  /** Set when the last step did not apply or was refused. */
  message: string | null;
  onAskPerson: (personId: string) => void;
  onAskNewPerson: (name: string, relationship: string) => void;
  onSeen: () => void;
  onAccepted: (stillNeedsMe: boolean) => void;
  onDeclined: () => void;
  onTakeBack: () => void;
}

type Mode = 'idle' | 'choose' | 'accept';

/**
 * Who is handling this, and where the handoff has got to, in her own record of what she was told. Nothing is sent; each button records
 * one step of the lifecycle the foundation already defines. Accepting asks the one question that matters and offers no default, so
 * "accepted" can never quietly become "covered".
 */
export function ResponsibilityPanel(props: ResponsibilityPanelProps) {
  const { facts, actions, people, busy, message } = props;
  const [mode, setMode] = useState<Mode>('idle');
  const [newName, setNewName] = useState('');
  const [relationship, setRelationship] = useState<string | null>(null);
  const [answer, setAnswer] = useState<'still' | 'off' | null>(null);
  const tag = coverageTag(facts.coverage);
  const who = facts.holder?.displayName.trim() || 'They';

  return (
    <View style={styles.stack}>
      <Overline>{HANDOFF.section}</Overline>
      <AppText variant="body">{coverageLine(facts)}</AppText>
      {tag ? (
        <View style={styles.tagRow}>
          <Tag label={tag.label} tone={tag.tone} />
        </View>
      ) : null}
      {message ? <InlineNotice tone="attention" title="Nothing changed" body={message} /> : null}

      {actions.includes('record_acknowledged') ? <Button label={HANDOFF.seen(who)} variant="ghost" disabled={busy} onPress={props.onSeen} /> : null}

      {actions.includes('record_accepted') ? (
        mode === 'accept' ? (
          <Card tone="subtle">
            <AppText variant="bodyStrong">{HANDOFF.acceptQuestion}</AppText>
            <View style={styles.chips}>
              <ChipToggle label={HANDOFF.stillNeedsMe} selected={answer === 'still'} onPress={() => setAnswer('still')} />
              <ChipToggle label={HANDOFF.offMyList} selected={answer === 'off'} onPress={() => setAnswer('off')} />
            </View>
            <AppText variant="metadata" color={color.text.secondary}>
              {HANDOFF.acceptNote}
            </AppText>
            <View style={styles.actions}>
              <Button
                label={HANDOFF.acceptSave}
                disabled={busy || answer === null}
                onPress={() => {
                  if (answer === null) return;
                  props.onAccepted(answer === 'still');
                  setMode('idle');
                  setAnswer(null);
                }}
              />
              <Button label={HANDOFF.acceptCancel} variant="ghost" onPress={() => { setMode('idle'); setAnswer(null); }} />
            </View>
          </Card>
        ) : (
          <Button label={HANDOFF.saidYes(who)} variant="secondary" disabled={busy} onPress={() => setMode('accept')} />
        )
      ) : null}

      {actions.includes('record_declined') ? <Button label={HANDOFF.saidNo(who)} variant="ghost" disabled={busy} onPress={props.onDeclined} /> : null}
      {actions.includes('take_back') ? <Button label={HANDOFF.takeBack} variant="ghost" disabled={busy} onPress={props.onTakeBack} /> : null}

      {actions.includes('request_handoff') ? (
        mode === 'choose' ? (
          <Card tone="subtle">
            <AppText variant="supporting" color={color.text.secondary}>
              {HANDOFF.askNote}
            </AppText>
            {people.length === 0 ? (
              <AppText variant="body" color={color.text.secondary}>
                {HANDOFF.noPeople}
              </AppText>
            ) : (
              people.map((person) => (
                <Button key={person.id} label={HANDOFF.askAction(person.displayName)} variant="secondary" disabled={busy} onPress={() => props.onAskPerson(person.id)} />
              ))
            )}
            <AppText variant="sectionTitle" style={styles.newHeading}>
              {HANDOFF.addSomeone}
            </AppText>
            <TextField label={HANDOFF.name} value={newName} onChangeText={setNewName} maxLength={80} />
            <AppText variant="metadata" color={color.text.secondary}>
              {HANDOFF.relationship}
            </AppText>
            <View style={styles.chips}>
              {PERSON_RELATIONSHIPS.map((option) => (
                <ChipToggle key={option} label={RELATIONSHIP_LABEL[option] ?? option} selected={relationship === option} onPress={() => setRelationship(option)} />
              ))}
            </View>
            <Button
              label={HANDOFF.askNewAction}
              disabled={busy || newName.trim().length === 0 || relationship === null}
              onPress={() => {
                if (relationship === null) return;
                props.onAskNewPerson(newName, relationship);
                setNewName('');
                setRelationship(null);
                setMode('idle');
              }}
            />
            <Button label={HANDOFF.acceptCancel} variant="ghost" onPress={() => setMode('idle')} />
          </Card>
        ) : (
          <Button label={HANDOFF.ask} variant="secondary" disabled={busy} onPress={() => setMode('choose')} />
        )
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  stack: { gap: spacing.md },
  tagRow: { flexDirection: 'row' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginVertical: spacing.sm },
  actions: { gap: spacing.sm, marginTop: spacing.sm },
  newHeading: { marginTop: spacing.lg },
});
