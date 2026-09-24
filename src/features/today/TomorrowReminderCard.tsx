import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Overline } from '../../design/components';
import { color, spacing } from '../../design/tokens';
import { useLocalNotifications } from '../../store/LocalNotificationProvider';

/**
 * Contextual opt-in only. This is the user action that may ask the OS for
 * permission; app launch never does.
 */
export function TomorrowReminderCard() {
  const { ready, enabled, permission, busy, nextPlan, error, enable, disable, openSettings } = useLocalNotifications();

  if (!ready) return null;

  // Do not advertise a reminder on a day where Her Keys has nothing to say.
  // Once enabled, keep a small control visible so she can always turn it off.
  if (!enabled && nextPlan === null) return null;

  if (permission === 'denied') {
    return (
      <Card tone="subtle" style={styles.card}>
        <Overline>Evening heads-up</Overline>
        <AppText variant="sectionTitle" style={styles.title}>Notifications are off for Her Keys</AppText>
        <AppText variant="body" color={color.text.secondary} style={styles.body}>
          You can turn them back on in your phone settings. Her Keys won’t change that setting itself.
        </AppText>
        <View style={styles.actions}>
          <Button label="Open phone settings" variant="secondary" size="sm" disabled={busy} onPress={() => void openSettings()} />
          {enabled ? <Button label="Turn off reminder" variant="ghost" size="sm" disabled={busy} onPress={() => void disable()} /> : null}
        </View>
      </Card>
    );
  }

  if (enabled && permission === 'granted') {
    return (
      <Card tone="subtle" style={styles.card}>
        <Overline>Evening heads-up</Overline>
        <AppText variant="sectionTitle" style={styles.title}>Tomorrow reminder is on</AppText>
        <AppText variant="body" color={color.text.secondary} style={styles.body}>
          Her Keys will give you one quiet evening heads-up when tomorrow has something worth reviewing. Names and private details stay inside the app.
        </AppText>
        {error ? <AppText variant="bodySm" color={color.text.muted} style={styles.note}>The reminder could not be updated just now.</AppText> : null}
        <View style={styles.actions}>
          <Button label="Turn off" variant="ghost" size="sm" disabled={busy} onPress={() => void disable()} />
        </View>
      </Card>
    );
  }

  return (
    <Card tone="subtle" style={styles.card}>
      <Overline>Evening heads-up</Overline>
      <AppText variant="sectionTitle" style={styles.title}>Want a heads-up about tomorrow?</AppText>
      <AppText variant="body" color={color.text.secondary} style={styles.body}>
        Her Keys can give you one quiet evening reminder when tomorrow has something worth reviewing. Your lock screen only gets a general heads-up—not names or private details.
      </AppText>
      {error ? <AppText variant="bodySm" color={color.text.muted} style={styles.note}>Notifications aren’t available just now.</AppText> : null}
      <View style={styles.actions}>
        <Button label="Turn on" variant="secondary" size="sm" disabled={busy} onPress={() => void enable()} />
      </View>
    </Card>
  );
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.xxl },
  title: { marginTop: spacing.sm },
  body: { marginTop: spacing.sm },
  note: { marginTop: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
});
