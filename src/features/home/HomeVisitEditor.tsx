import { Stack, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, ChipToggle, EmptyState, Overline, Screen, TextField } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { FIELD_LIMITS } from '../../domain/state';
import { useAppStore, useHouseholdState } from '../../store/AppStateProvider';
import { HOME_COPY, REFUSAL_COPY } from './copy';
import { parseVisitForm, visitEditorBaseline, visitFormInitial, type VisitFormValues } from './model/forms';
import { commitHomeChange, createHomeVisit, createSubmitGuard, updateHomeVisit, type HomeVisitDraft, type HomeVisitEdit } from './model/mutations';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** Create or edit a Home service visit (a canonical commitment in the Home context). */
export function HomeVisitEditor() {
  const { eventId } = useLocalSearchParams<{ eventId?: string }>();
  const [reload, setReload] = useState(0);
  return <VisitEditorForm key={reload} eventId={first(eventId)} onReload={() => setReload((n) => n + 1)} />;
}

function VisitEditorForm({ eventId, onReload }: { eventId?: string; onReload: () => void }) {
  const store = useAppStore();
  const { state, today } = useHouseholdState();
  const existing = eventId ? (state.events.find((event) => event.id === eventId) ?? null) : null;
  const timeZone = state.user.timezone;

  const baseline = useRef(visitEditorBaseline(existing)).current;
  const guard = useRef(createSubmitGuard()).current;
  const [values, setValues] = useState<VisitFormValues>(() => visitFormInitial(existing, timeZone, today));
  const [error, setError] = useState<string | null>(null);
  const [stale, setStale] = useState(false);
  const [busy, setBusy] = useState(false);
  const set = (patch: Partial<VisitFormValues>) => setValues((current) => ({ ...current, ...patch }));

  if (eventId && existing === null) {
    return (
      <Screen>
        <EmptyState title="That isn’t here any more" body="It may have been removed on this or another device." />
      </Screen>
    );
  }

  const onSave = async () => {
    const parsed = parseVisitForm(values, timeZone, existing && baseline ? { kind: 'edit', eventId: existing.id, basedOn: baseline } : { kind: 'create' });
    if (!parsed.ok) return setError(parsed.error);
    setError(null);
    setStale(false);
    setBusy(true);
    const result = await guard.run(() =>
      commitHomeChange(store, (current, ctx) => (existing ? updateHomeVisit(current, ctx, parsed.value as HomeVisitEdit) : createHomeVisit(current, ctx, parsed.value as HomeVisitDraft)))
    );
    setBusy(false);
    if (result.ok) return router.back();
    setError(REFUSAL_COPY[result.reason]);
    if (result.reason === 'stale') setStale(true);
  };

  return (
    <Screen>
      <Stack.Screen options={{ title: existing ? 'Edit visit' : 'Add a visit' }} />
      <TextField label="Title" value={values.title} onChangeText={(title) => set({ title })} placeholder="Furnace tune-up" autoFocus={!existing} maxLength={FIELD_LIMITS.titleLength} />
      <TextField label="Date (YYYY-MM-DD)" value={values.dateText} onChangeText={(dateText) => set({ dateText })} maxLength={10} />
      <TextField label="Starts (24-hour, like 09:30)" value={values.startText} onChangeText={(startText) => set({ startText })} maxLength={5} />
      <TextField label="Ends (24-hour, like 10:30)" value={values.endText} onChangeText={(endText) => set({ endText })} maxLength={5} />
      <TextField label="Where (optional)" value={values.location} onChangeText={(location) => set({ location })} maxLength={FIELD_LIMITS.locationLength} />
      <TextField label="Notes (optional)" value={values.notes} onChangeText={(notes) => set({ notes })} multiline maxLength={FIELD_LIMITS.notesLength} />

      <Overline style={styles.label}>Commitment</Overline>
      <View style={styles.chips}>
        <ChipToggle label="Fixed" selected={values.commitment === 'fixed'} onPress={() => set({ commitment: 'fixed' })} />
        <ChipToggle label="Flexible" selected={values.commitment === 'flexible'} onPress={() => set({ commitment: 'flexible' })} />
      </View>
      <AppText variant="metadata" color={colors.textTertiary} style={styles.hint}>
        Adding a visit records that it’s on your calendar. It doesn’t mean anyone has been booked, that anyone will come, or what they’ll find.
      </AppText>

      {error !== null && (
        <AppText variant="bodySm" color={colors.attention} accessibilityRole="alert" style={styles.error}>
          {error}
        </AppText>
      )}
      {stale && <Button label="Reload the latest" variant="secondary" onPress={onReload} style={styles.save} />}
      <Button label={existing ? 'Save changes' : HOME_COPY.addVisit} onPress={() => void onSave()} disabled={busy} style={styles.save} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.sm, marginTop: spacing.sm },
  chips: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.md },
  hint: { marginBottom: spacing.lg },
  error: { marginBottom: spacing.lg },
  save: { marginTop: spacing.md, marginBottom: spacing.md },
});
