import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { AppText, Button, Card, Overline, Screen } from '../src/design/components';
import { colors, spacing } from '../src/design/tokens';
import { addCategory, categoryWithRole, renameCategory } from '../src/domain/categories';
import type { SimulatedDamage } from '../src/persistence/damageSimulation';
import { useAppStore, useStoreSnapshot } from '../src/store/AppStateProvider';
import { dataMode, simulateDamage } from '../src/store/appStoreInstance';

const DAMAGE: Array<{ kind: SimulatedDamage; label: string }> = [
  { kind: 'cleared', label: 'Clear stored state (fresh install)' },
  { kind: 'malformed_json', label: 'Corrupt: malformed JSON' },
  { kind: 'missing_schema_version', label: 'Corrupt: missing schema version' },
  { kind: 'invalid_state', label: 'Corrupt: invalid state' },
  { kind: 'dangling_category', label: 'Corrupt: dangling category' },
  { kind: 'future_version', label: 'Newer schema version' },
];

/**
 * Internal builds with demo data only — the root guard removes this route
 * everywhere else. Opened by link (herkeys://dev-tools), never from the app's
 * own navigation.
 */
export default function DevToolsScreen() {
  const store = useAppStore();
  const snapshot = useStoreSnapshot();
  const [note, setNote] = useState<string | null>(null);
  const kids = snapshot.state ? categoryWithRole(snapshot.state, 'kids') : null;

  const rows: Array<[string, string]> = [
    ['Data mode', dataMode],
    ['Lifecycle', snapshot.status],
    ['Loaded from storage', snapshot.diagnostics.loadOutcome ?? '—'],
    ['Recovery', snapshot.recovery ? `${snapshot.recovery.reason}${snapshot.recovery.quarantined ? ' (kept aside)' : ''}` : 'none'],
    ['Hydration', snapshot.diagnostics.hydrationMs === null ? '—' : `${snapshot.diagnostics.hydrationMs} ms`],
    ['Persistence', `${snapshot.persistence}${snapshot.persistenceDegraded ? ', degraded' : ''}`],
    ['Logical day', `${snapshot.today ?? '—'} (${snapshot.state?.user.timezone ?? '—'})`],
    ['Catalog repairs', String(snapshot.diagnostics.repairs.length)],
  ];

  return (
    <Screen>
      <Overline>Demo data only</Overline>
      <Card tone="subtle" style={styles.card}>
        {rows.map(([label, value]) => (
          <AppText key={label} variant="bodySm" color={colors.textSecondary}>
            {label}: {value}
          </AppText>
        ))}
      </Card>

      {note && (
        <AppText variant="bodySm" style={styles.note} accessibilityLiveRegion="polite">
          {note}
        </AppText>
      )}

      <Button
        label="Reset demo data"
        onPress={async () => {
          const done = await store.reset();
          setNote(
            done
              ? 'Demo household restored for today. Onboarding starts again.'
              : snapshot.recovery?.reason === 'future_version'
                ? 'Reset is unavailable while data from a newer app version is on this device.'
                : snapshot.recovery?.reason === 'mode_mismatch' && snapshot.persistence === 'disabled'
                  ? 'Reset is unavailable because this demo session is protecting real-user data on this device.'
                : 'Reset could not clear stored data. Nothing was changed; try again.'
          );
        }}
      />

      <Overline style={styles.section}>Household categories</Overline>
      {kids && (
        <>
          <Button
            label="Rename the kids category to “Children”"
            variant="secondary"
            onPress={() => store.dispatch((state) => renameCategory(state, kids.id, 'Children'))}
          />
          <Button
            label="Rename it back to “Kids”"
            variant="secondary"
            style={styles.spaced}
            onPress={() => store.dispatch((state) => renameCategory(state, kids.id, 'Kids'))}
          />
        </>
      )}
      <Button
        label="Add a “Pets” category"
        variant="secondary"
        style={styles.spaced}
        onPress={() => store.dispatch((state, ctx) => addCategory(state, ctx, { name: 'Pets', scope: 'household' }))}
      />

      <Overline style={styles.section}>Stored-state damage — loads on next launch</Overline>
      {DAMAGE.map(({ kind, label }) => (
        <Button
          key={kind}
          label={label}
          variant="ghost"
          onPress={async () => {
            await simulateDamage(kind, snapshot.state);
            setNote(`${label}: written. Saving is paused — close and reopen the app to load it.`);
          }}
        />
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { marginTop: spacing.md, marginBottom: spacing.lg, gap: spacing.xs },
  note: { marginBottom: spacing.lg },
  section: { marginTop: spacing.xxl, marginBottom: spacing.md },
  spaced: { marginTop: spacing.sm },
});
