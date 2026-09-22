import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Button } from '../../../design/components';
import { spacing } from '../../../design/tokens';
import { COPY } from '../copy';
import type { CounterpartInput } from '../mutations';
import { availableResponsibilityActions, responsibilityActionLabel, type ResponsibilityAction } from '../present';
import type { PersonOption, ResponsibilityView } from '../types';
import type { CounterpartChoice } from './actions';
import { PersonPicker } from './PersonPicker';
import { ErrorLine } from './parts';

export interface ResponsibilityActionsProps {
  view: ResponsibilityView;
  people: readonly PersonOption[];
  busy: boolean;
  /** The sentence for a refused recording, or null. */
  error: string | null;
  /** `counterpart` is set only for the two actions that need a person: recording a request, and recording a different person. */
  onAction: (action: ResponsibilityAction, counterpart: CounterpartChoice | null) => void;
}

/**
 * THE RESPONSIBILITY BUTTONS — exactly the recordings `availableResponsibilityActions` allows for where things stand, worded by
 * `responsibilityActionLabel`. Nothing else is ever offered, and every one is a recording of what SHE says happened: none of them
 * contacts anyone. The two that need a person open the picker in place, with no "Not recorded" choice.
 *
 * The inner component is keyed by where the record stands, so a picker left open never carries over to a different state.
 */
export function ResponsibilityActions(props: ResponsibilityActionsProps) {
  const { view } = props;
  const standing = [view.responsibilityId ?? '-', view.stage, view.counterpart?.personId ?? '-', String(view.stillNeedsMe)].join('|');
  return <Actions key={standing} {...props} />;
}

type PickerAction = Extract<ResponsibilityAction, 'record_asked' | 'reassign'>;

function Actions({ view, people, busy, error, onAction }: ResponsibilityActionsProps) {
  const actions = availableResponsibilityActions(view);
  const name = view.counterpart?.label ?? COPY.responsibility.someone;
  const [picking, setPicking] = useState<PickerAction | null>(null);
  const [choice, setChoice] = useState<CounterpartInput | null>(null);
  const [incomplete, setIncomplete] = useState(false);

  const press = (action: ResponsibilityAction) => {
    if (action === 'record_asked' || action === 'reassign') {
      setChoice(null);
      setIncomplete(false);
      setPicking(picking === action ? null : action);
      return;
    }
    onAction(action, null);
  };

  const submit = () => {
    if (picking === null) return;
    if (choice === null || choice.kind === 'none') {
      setIncomplete(true);
      return;
    }
    setIncomplete(false);
    onAction(picking, choice);
  };

  if (actions.length === 0) return <ErrorLine text={error} />;

  return (
    <View>
      <View style={styles.actions}>
        {actions.map((action) => (
          <Button
            key={action}
            label={responsibilityActionLabel(action, name)}
            variant={action === 'reassign' || action === 'returned' ? 'ghost' : 'secondary'}
            size="sm"
            onPress={() => press(action)}
            disabled={busy}
          />
        ))}
      </View>

      {picking !== null ? (
        <View style={styles.picker}>
          <PersonPicker people={people} allowNone={false} heading={picking === 'record_asked' ? COPY.editor.askedWho : COPY.editor.askedInstead} onChange={setChoice} />
          {incomplete ? <ErrorLine text={COPY.editor.personIncomplete} /> : null}
          <View style={styles.pickerActions}>
            <Button label={COPY.actions.recordIt} size="sm" onPress={submit} disabled={busy} />
            <Button label={COPY.actions.cancel} size="sm" variant="ghost" onPress={() => setPicking(null)} />
          </View>
        </View>
      ) : null}

      <ErrorLine text={error} />
    </View>
  );
}

const styles = StyleSheet.create({
  actions: { gap: spacing.sm, alignItems: 'flex-start', marginTop: spacing.md },
  picker: { marginTop: spacing.lg },
  pickerActions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
});
