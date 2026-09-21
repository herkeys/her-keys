import { useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, TextField } from '../../../design/components';
import { color, spacing } from '../../../design/tokens';
import { FORM } from '../copy';
import { createSingleFlight } from '../singleFlight';

export type AddChildResult = { ok: true } | { ok: false; message: string };

/** Name and birth date: the two facts Her Keys needs to keep one child apart from another. Nothing else is asked. */
export function AddChildView({ onSubmit }: { onSubmit: (name: string, birthDate: string) => Promise<AddChildResult> }) {
  const [name, setName] = useState('');
  const [birthDate, setBirthDate] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const flight = useRef(createSingleFlight());

  const submit = async () => {
    setError(null);
    const result = await flight.current.run(async () => {
      setBusy(true);
      try {
        return await onSubmit(name, birthDate.trim());
      } finally {
        setBusy(false);
      }
    });
    if (result && !result.ok) setError(result.message);
  };

  return (
    <View style={styles.stack}>
      <AppText variant="supporting" color={color.text.secondary}>
        {FORM.childWhy}
      </AppText>
      <TextField label={FORM.childName} value={name} onChangeText={setName} maxLength={80} autoFocus />
      <TextField label={FORM.childBirth} value={birthDate} onChangeText={setBirthDate} maxLength={10} placeholder="2018-03-03" />
      {error ? (
        <AppText variant="supporting" color={color.status.attention} accessibilityRole="alert">
          {error}
        </AppText>
      ) : null}
      <Button label={FORM.childSave} onPress={submit} disabled={busy} />
    </View>
  );
}

const styles = StyleSheet.create({ stack: { gap: spacing.lg } });
