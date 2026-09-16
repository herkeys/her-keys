import { router } from 'expo-router';
import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, ChipToggle, Overline, Screen, TextField } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import { addEvent, removeEvent, updateEvent } from '../../domain/events';
import { epochMsOf, isLocalDate, logicalDateAt, toInstant, wallClockMinutesAt, zonedTimeToEpochMs } from '../../domain/logicalDay';
import { FIELD_LIMITS } from '../../domain/state';
import type { Transition } from '../../state/appStore';
import { useAppStore, useHouseholdState } from '../../store/AppStateProvider';
import { useHousehold } from '../../store/useHousehold';

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

function timeStringOf(instant: string, timeZone: string): string {
  const minutes = wallClockMinutesAt(epochMsOf(instant), timeZone);
  return `${Math.floor(minutes / 60).toString().padStart(2, '0')}:${(minutes % 60).toString().padStart(2, '0')}`;
}

function minutesOfTimeString(time: string): number {
  const [hour, minute] = time.split(':').map(Number);
  return hour * 60 + minute;
}

/** An empty string, or a whole number of minutes the store accepts — never anything invented in between. */
function parseOptionalMinutes(value: string): { ok: true; minutes: number | null } | { ok: false } {
  if (value.trim() === '') return { ok: true, minutes: null };
  if (!/^\d+$/.test(value.trim())) return { ok: false };
  const minutes = Number(value.trim());
  return minutes <= FIELD_LIMITS.travelMinutes ? { ok: true, minutes } : { ok: false };
}

export function EventForm({ eventId }: { eventId?: string }) {
  const store = useAppStore();
  const { state, today } = useHouseholdState();
  const { categories } = useHousehold();
  const existing = eventId ? (state.events.find((event) => event.id === eventId) ?? null) : null;

  const [title, setTitle] = useState(existing?.title ?? '');
  const [categoryId, setCategoryId] = useState(existing?.categoryId ?? categories[0]?.id ?? '');
  const [commitment, setCommitment] = useState<'fixed' | 'flexible'>(existing?.commitment ?? 'fixed');
  const [date, setDate] = useState(existing ? logicalDateAt(epochMsOf(existing.startsAt), state.user.timezone) : today);
  const [startTime, setStartTime] = useState(existing ? timeStringOf(existing.startsAt, state.user.timezone) : '09:00');
  const [endTime, setEndTime] = useState(existing ? timeStringOf(existing.endsAt, state.user.timezone) : '09:30');
  const [location, setLocation] = useState(existing?.location ?? '');
  const [travelBefore, setTravelBefore] = useState(existing?.travelMinutesBefore?.toString() ?? '');
  const [travelAfter, setTravelAfter] = useState(existing?.travelMinutesAfter?.toString() ?? '');
  const [preparation, setPreparation] = useState(existing?.preparationMinutes?.toString() ?? '');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // A second tap in the same frame would otherwise save twice before `busy` renders.
  const inFlight = useRef(false);

  const save = async (transition: Transition) => {
    if (inFlight.current) return;
    inFlight.current = true;
    setBusy(true);
    const saved = await store.commit(transition);
    inFlight.current = false;
    setBusy(false);
    if (saved) router.back();
    else setError('Her Keys couldn’t save that yet. Try again.');
  };

  const onSave = () => {
    if (title.trim().length === 0) return setError('Give it a title.');
    if (!categoryId) return setError('Choose a category.');
    if (!isLocalDate(date)) return setError('Date should look like YYYY-MM-DD.');
    if (!TIME_PATTERN.test(startTime) || !TIME_PATTERN.test(endTime)) return setError('Times should look like HH:MM, in 24-hour time.');

    const before = parseOptionalMinutes(travelBefore);
    const after = parseOptionalMinutes(travelAfter);
    const prep = parseOptionalMinutes(preparation);
    if (!before.ok || !after.ok || !prep.ok) {
      return setError(`Travel and preparation minutes should be whole numbers up to ${FIELD_LIMITS.travelMinutes}, or left blank.`);
    }

    const startsAt = toInstant(zonedTimeToEpochMs(date, minutesOfTimeString(startTime), state.user.timezone));
    const endsAt = toInstant(zonedTimeToEpochMs(date, minutesOfTimeString(endTime), state.user.timezone));
    if (epochMsOf(endsAt) <= epochMsOf(startsAt)) return setError('The event needs to end after it starts.');

    setError(null);
    const edits = {
      title: title.trim(),
      categoryId,
      commitment,
      startsAt,
      endsAt,
      location: location.trim() || null,
      travelMinutesBefore: before.minutes,
      travelMinutesAfter: after.minutes,
      preparationMinutes: prep.minutes,
    };
    // An edit keeps the event's own visibility scope; only a new event gets one.
    if (existing) return save((current, ctx) => updateEvent(current, ctx, existing.id, edits));
    return save((current, ctx) => addEvent(current, ctx, { ...edits, scope: 'household' }));
  };

  const onRemove = () => {
    if (existing) void save((current, ctx) => removeEvent(current, ctx, existing.id));
  };

  return (
    <Screen>
      <TextField
        label="Title"
        value={title}
        onChangeText={setTitle}
        placeholder="Pick up prescription"
        autoFocus
        maxLength={FIELD_LIMITS.titleLength}
      />

      <Overline style={styles.label}>Category</Overline>
      <View style={styles.chipRow}>
        {categories.map((category) => (
          <ChipToggle key={category.id} label={category.name} selected={category.id === categoryId} onPress={() => setCategoryId(category.id)} />
        ))}
      </View>

      <Overline style={styles.label}>Commitment</Overline>
      <View style={styles.chipRow}>
        <ChipToggle label="Fixed" selected={commitment === 'fixed'} onPress={() => setCommitment('fixed')} />
        <ChipToggle label="Flexible" selected={commitment === 'flexible'} onPress={() => setCommitment('flexible')} />
      </View>
      <AppText variant="caption" color={colors.textTertiary} style={styles.hint}>
        Fixed commitments are never moved automatically. Only a flexible event can ever be offered for a move.
      </AppText>

      <View style={styles.row}>
        <View style={styles.rowItem}>
          <TextField label="Date (YYYY-MM-DD)" value={date} onChangeText={setDate} placeholder={today} maxLength={10} />
        </View>
      </View>
      <View style={styles.row}>
        <View style={styles.rowItem}>
          <TextField label="Start (HH:MM)" value={startTime} onChangeText={setStartTime} placeholder="09:00" maxLength={5} />
        </View>
        <View style={styles.rowItem}>
          <TextField label="End (HH:MM)" value={endTime} onChangeText={setEndTime} placeholder="09:30" maxLength={5} />
        </View>
      </View>

      <TextField label="Location (optional)" value={location} onChangeText={setLocation} placeholder="Lincoln Elementary" maxLength={FIELD_LIMITS.locationLength} />

      <Overline style={styles.label}>Travel and preparation (optional)</Overline>
      <AppText variant="caption" color={colors.textTertiary} style={styles.hint}>
        Only ever what you enter — Her Keys never guesses a travel time.
      </AppText>
      <View style={styles.row}>
        <View style={styles.rowItem}>
          <TextField label="Travel before (min)" value={travelBefore} onChangeText={setTravelBefore} keyboardType="number-pad" maxLength={3} />
        </View>
        <View style={styles.rowItem}>
          <TextField label="Travel after (min)" value={travelAfter} onChangeText={setTravelAfter} keyboardType="number-pad" maxLength={3} />
        </View>
      </View>
      <TextField label="Preparation (min)" value={preparation} onChangeText={setPreparation} keyboardType="number-pad" maxLength={3} />

      {error && (
        <AppText variant="bodySm" color={colors.attention} style={styles.error} accessibilityRole="alert">
          {error}
        </AppText>
      )}

      <Button label={existing ? 'Save changes' : 'Add event'} onPress={onSave} disabled={busy} style={styles.save} />
      {existing && <Button label="Remove event" variant="ghost" onPress={onRemove} disabled={busy} />}
    </Screen>
  );
}

const styles = StyleSheet.create({
  label: { marginBottom: spacing.sm },
  hint: { marginBottom: spacing.md, marginTop: -spacing.xs },
  chipRow: { flexDirection: 'row', flexWrap: 'wrap', marginBottom: spacing.lg },
  row: { flexDirection: 'row', gap: spacing.md },
  rowItem: { flex: 1 },
  error: { marginBottom: spacing.lg },
  save: { marginTop: spacing.md, marginBottom: spacing.md },
});
