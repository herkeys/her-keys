import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { AppText, Button, Card, Overline, Screen } from '../src/design/components';
import { colors, spacing } from '../src/design/tokens';
import {
  addCategory,
  archiveCategory,
  categoriesInOrder,
  categoryWithRole,
  renameCategory,
  reorderCategories,
  restoreCategory,
} from '../src/domain/categories';
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
  const home = snapshot.state ? categoryWithRole(snapshot.state, 'home') : null;
  const categories = snapshot.state ? categoriesInOrder(snapshot.state, { includeArchived: true }) : [];
  const customCategory = categories.find((category) => category.systemRole === null) ?? null;

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
      <Card tone="subtle" style={styles.categoryList}>
        {categories.map((category) => (
          <AppText key={category.id} variant="bodySm" color={colors.textSecondary}>
            {category.sortOrder}: {category.name} · id={category.id} · role={category.systemRole ?? 'none'} · {category.status}
          </AppText>
        ))}
      </Card>
      {kids && (
        <>
          <Button
            label="Rename the kids category to “Family”"
            variant="secondary"
            onPress={() => store.dispatch((state) => renameCategory(state, kids.id, 'Family'))}
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
        onPress={() =>
          store.dispatch((state, ctx) =>
            state.categories.some((category) => category.systemRole === null)
              ? state
              : addCategory(state, ctx, { name: 'Pets', scope: 'household' })
          )
        }
      />
      {customCategory && (
        <Button
          label="Move “Pets” to the first position"
          variant="secondary"
          style={styles.spaced}
          onPress={() =>
            store.dispatch((state) => {
              const ordered = categoriesInOrder(state, { includeArchived: true }).map((category) => category.id);
              return reorderCategories(state, [customCategory.id, ...ordered.filter((id) => id !== customCategory.id)]);
            })
          }
        />
      )}
      {home?.status === 'active' ? (
        <Button
          label="Archive the home category"
          variant="secondary"
          style={styles.spaced}
          onPress={() => store.dispatch((state) => archiveCategory(state, home.id))}
        />
      ) : home ? (
        <Button
          label="Restore the home category"
          variant="secondary"
          style={styles.spaced}
          onPress={() => store.dispatch((state) => restoreCategory(state, home.id))}
        />
      ) : null}

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
  categoryList: { marginBottom: spacing.lg, gap: spacing.xs },
  spaced: { marginTop: spacing.sm },
});
