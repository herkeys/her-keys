import { Alert, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Overline, Tag } from '../../design/components';
import { color, spacing } from '../../design/tokens';
import type { ExternalCalendarEvent } from '../../external/types';
import { useGoogleCalendarBridge } from './useGoogleCalendarBridge';

export function GoogleCalendarPanel({
  selectedDate,
  timezone,
  showEvents,
}: {
  selectedDate: string;
  timezone: string;
  showEvents: boolean;
}) {
  const bridge = useGoogleCalendarBridge(selectedDate, timezone, showEvents);

  if (bridge.availability === 'checking' || bridge.availability === 'dormant') return null;

  if (bridge.availability === 'disconnected' || bridge.availability === 'reauth_required') {
    return (
      <Card tone="subtle" style={styles.card}>
        <Overline>External calendar</Overline>
        <AppText variant="sectionTitle" style={styles.title}>
          {bridge.availability === 'reauth_required' ? 'Reconnect Google Calendar' : 'Connect Google Calendar'}
        </AppText>
        <AppText variant="body" color={color.text.secondary} style={styles.body}>
          Read-only. Her Keys can show the calendars you choose without changing, deleting, or rescheduling anything in Google.
        </AppText>
        <Button
          label={bridge.availability === 'reauth_required' ? 'Reconnect' : 'Connect Google Calendar'}
          variant="secondary"
          size="sm"
          disabled={bridge.busy}
          onPress={() => void bridge.connect()}
          style={styles.button}
        />
      </Card>
    );
  }

  if (bridge.availability === 'error') {
    return (
      <Card tone="subtle" style={styles.card}>
        <Overline>External calendar</Overline>
        <AppText variant="sectionTitle" style={styles.title}>Google Calendar needs another try</AppText>
        <AppText variant="body" color={color.text.secondary} style={styles.body}>
          Your Her Keys calendar is unchanged.
        </AppText>
        <Button label="Try again" variant="ghost" size="sm" disabled={bridge.busy} onPress={() => void bridge.refresh()} style={styles.button} />
      </Card>
    );
  }

  return (
    <View style={styles.group}>
      <Card tone="subtle" style={styles.card}>
        <View style={styles.row}>
          <View style={styles.grow}>
            <Overline>External calendar</Overline>
            <AppText variant="sectionTitle" style={styles.title}>Google Calendar connected</AppText>
            <AppText variant="body" color={color.text.secondary} style={styles.body}>
              These remain Google’s events. Her Keys is only reading them.
            </AppText>
          </View>
          <Tag label="Read only" tone="neutral" />
        </View>

        {bridge.calendars.length > 0 ? (
          <View style={styles.calendars}>
            {bridge.calendars.slice(0, 8).map((calendar) => {
              const selected = bridge.selectedCalendarIds.includes(calendar.id);
              return (
                <Button
                  key={calendar.id}
                  label={selected ? `✓ ${calendar.summary}` : calendar.summary}
                  variant={selected ? 'secondary' : 'ghost'}
                  size="sm"
                  disabled={bridge.busy}
                  onPress={() => void bridge.toggleCalendar(calendar.id)}
                />
              );
            })}
          </View>
        ) : null}

        <View style={styles.actions}>
          <Button label="Refresh" variant="ghost" size="sm" disabled={bridge.busy} onPress={() => void bridge.refresh()} />
          <Button
            label="Disconnect"
            variant="ghost"
            size="sm"
            disabled={bridge.busy}
            onPress={() =>
              Alert.alert(
                'Disconnect Google Calendar?',
                'Her Keys will remove its stored Calendar connection and ask Google to revoke the app’s OAuth access. Your Google Calendar events will not be changed.',
                [
                  { text: 'Cancel', style: 'cancel' },
                  { text: 'Disconnect', style: 'destructive', onPress: () => void bridge.disconnect() },
                ],
              )
            }
          />
        </View>
      </Card>

      {!showEvents ? (
        <AppText variant="supporting" color={color.text.secondary}>
          Google events are shown in Day view and stay separate from Her Keys planning.
        </AppText>
      ) : bridge.events.length > 0 ? (
        <ExternalEvents events={bridge.events} timezone={timezone} />
      ) : null}
    </View>
  );
}

function ExternalEvents({ events, timezone }: { events: ExternalCalendarEvent[]; timezone: string }) {
  return (
    <Card tone="surface">
      <View style={styles.row}>
        <AppText variant="sectionTitle">From Google Calendar</AppText>
        <Tag label="Read only" tone="neutral" />
      </View>
      <View style={styles.eventList}>
        {events.map((event) => (
          <View key={`${event.sourceCalendarId}:${event.sourceEventId}`} style={styles.event}>
            <AppText variant="body">{event.title}</AppText>
            <AppText variant="supporting" color={color.text.secondary}>
              {eventTime(event, timezone)} · {event.sourceCalendarSummary}
            </AppText>
            {event.location ? (
              <AppText variant="supporting" color={color.text.muted}>{event.location}</AppText>
            ) : null}
          </View>
        ))}
      </View>
    </Card>
  );
}

function eventTime(event: ExternalCalendarEvent, timezone: string): string {
  if (event.startDate) return 'All day';
  if (!event.startsAt) return 'Time unavailable';
  const date = new Date(event.startsAt);
  return Number.isNaN(date.getTime())
    ? 'Time unavailable'
    : new Intl.DateTimeFormat(undefined, { hour: 'numeric', minute: '2-digit', timeZone: timezone }).format(date);
}

const styles = StyleSheet.create({
  group: { gap: spacing.md, marginBottom: spacing.xl },
  card: { marginBottom: spacing.md },
  row: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md },
  grow: { flex: 1 },
  title: { marginTop: spacing.sm },
  body: { marginTop: spacing.sm },
  button: { alignSelf: 'flex-start', marginTop: spacing.md },
  calendars: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.md },
  eventList: { gap: spacing.md, marginTop: spacing.md },
  event: { gap: spacing.xs },
});
