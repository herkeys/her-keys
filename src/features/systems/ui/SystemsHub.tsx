import { router } from 'expo-router';
import { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, EmptyState, InlineNotice, LoadingState } from '../../../design/components';
import { color, spacing } from '../../../design/tokens';
import { useStoreSnapshot } from '../../../store/AppStateProvider';
import { UNAVAILABLE_BODY, copy } from '../copy';
import { projectSystemsHub } from '../model/hub';
import { SystemCard } from './SystemCard';

/**
 * "What repeatable Systems run my household?"
 *
 * Reads the store SNAPSHOT (not the throwing `useHouseholdState`), because whether Systems may be
 * shown at all is the first question: loading is not empty, and a session that cannot save is not
 * a household with no Systems. Content only — the route composes the screen shell.
 */
export function SystemsHub() {
  const snapshot = useStoreSnapshot();
  // The clock is read here, at the edge, and handed down: projections never touch the device clock.
  const hub = useMemo(
    () =>
      projectSystemsHub({
        status: snapshot.status,
        state: snapshot.state,
        today: snapshot.today,
        recovery: snapshot.recovery,
        persistence: snapshot.persistence,
        nowMs: Date.now(),
      }),
    [snapshot]
  );
  const today = snapshot.today;

  return (
    <View>
      <View style={styles.header}>
        <AppText variant="display">{copy.hub.title}</AppText>
        <AppText variant="supporting" color={color.text.secondary} style={styles.subtitle}>
          {copy.hub.subtitle}
        </AppText>
      </View>

      {hub.availability.kind === 'loading' ? <LoadingState label={copy.hub.loading} /> : null}

      {hub.availability.kind === 'unavailable' ? (
        <InlineNotice tone="attention" title={copy.hub.unavailableTitle} body={UNAVAILABLE_BODY[hub.availability.reason]} />
      ) : null}

      {hub.availability.kind === 'ready' ? (
        <>
          {hub.availability.notice === 'started_over' ? (
            <InlineNotice tone="info" title={copy.hub.startedOverTitle} body={copy.hub.startedOverBody} style={styles.notice} />
          ) : null}

          {hub.isEmpty ? (
            <View>
              <EmptyState title={copy.hub.emptyTitle} body={copy.hub.emptyBody} />
              <View style={styles.emptyAction}>
                <Button label={copy.hub.create} onPress={() => router.push('/systems/edit')} />
              </View>
            </View>
          ) : (
            <View>
              <Button label={copy.hub.create} variant="secondary" size="sm" style={styles.create} onPress={() => router.push('/systems/edit')} />
              <View style={styles.list}>
                {hub.items.map((item) => (
                  <SystemCard
                    key={item.id}
                    item={item}
                    today={today as string}
                    onPress={() => router.push({ pathname: '/systems/[id]', params: { id: item.id } })}
                  />
                ))}
              </View>
            </View>
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xxl },
  subtitle: { marginTop: spacing.sm },
  notice: { marginBottom: spacing.lg },
  create: { alignSelf: 'flex-start', marginBottom: spacing.lg },
  emptyAction: { alignItems: 'center' },
  list: { gap: spacing.md },
});
