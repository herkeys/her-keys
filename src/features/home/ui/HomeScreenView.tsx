import { StyleSheet, View } from 'react-native';
import { AppText, Button, EmptyState, InlineNotice, LoadingState, Screen } from '../../../design/components';
import { colors, spacing } from '../../../design/tokens';
import { HOME_COPY, describeItem, type CopyContext } from '../copy';
import type { HomeReadiness, HomeScreenState } from '../model/readiness';
import type { HomeSectionKey, HomeView } from '../model/types';
import { HomeSectionBlock, type SectionRow } from './HomeSectionBlock';

/** The order sections are shown in: work first, then the lenses. */
const SECTION_ORDER: HomeSectionKey[] = ['attention', 'waiting', 'comingUp', 'unresolved', 'repeats', 'recentlyDone', 'pastVisits'];

export interface HomeScreenViewProps {
  screen: HomeScreenState;
  view: HomeView | null;
  readiness: HomeReadiness;
  copyContext: CopyContext | null;
  expanded: Partial<Record<HomeSectionKey, boolean>>;
  busy: boolean;
  error: string | null;
  onToggleSection: (key: HomeSectionKey) => void;
  onOpenItem: (homeItemId: string) => void;
  onAddTask: () => void;
  onAddVisit: () => void;
  onRestoreArea: () => void;
  onOpenSystems: () => void;
}

/**
 * The Home hub, as a pure function of its state. No domain reasoning happens here: every word comes from `copy.ts`, every fact
 * from the projection, and which of loading / missing / unrecovered / empty / content to show from `homeScreenState`.
 */
export function HomeScreenView(props: HomeScreenViewProps) {
  const { screen, view, readiness, copyContext } = props;

  if (screen.kind === 'loading' || view === null || copyContext === null) {
    return (
      <Screen>
        <LoadingState label={HOME_COPY.loading.label} detail={HOME_COPY.loading.detail} />
      </Screen>
    );
  }

  const unrecovered = readiness.recovery === null ? null : HOME_COPY.unrecovered(readiness.recovery.reason, readiness.recovery.quarantined);
  const byId = new Map(view.items.map((item) => [item.homeItemId, item]));

  return (
    <Screen>
      <AppText variant="supporting" color={colors.textSecondary} style={styles.scope}>
        {HOME_COPY.scope(view.label)}
      </AppText>

      {unrecovered !== null && <InlineNotice tone="attention" title={unrecovered.title} body={unrecovered.body} style={styles.notice} />}
      {readiness.memoryOnly && <InlineNotice tone="waiting" title={HOME_COPY.memoryOnly} style={styles.notice} />}
      {screen.kind === 'missing_context' && <InlineNotice tone="attention" title={HOME_COPY.missing.title} body={HOME_COPY.missing.body} style={styles.notice} />}
      {view.context.kind === 'archived' && (
        <View style={styles.notice}>
          <InlineNotice tone="waiting" title={HOME_COPY.archived.title} body={HOME_COPY.archived.body} />
          <Button label={HOME_COPY.archived.action} variant="secondary" size="sm" onPress={props.onRestoreArea} disabled={props.busy} style={styles.restore} />
        </View>
      )}

      {props.error !== null && (
        <AppText variant="bodySm" color={colors.attention} accessibilityRole="alert" style={styles.notice}>
          {props.error}
        </AppText>
      )}

      {view.canCreate && (
        <View style={styles.actions}>
          <Button label={HOME_COPY.addTask} variant="primary" size="sm" onPress={props.onAddTask} disabled={props.busy} />
          <Button label={HOME_COPY.addVisit} variant="secondary" size="sm" onPress={props.onAddVisit} disabled={props.busy} />
        </View>
      )}

      {screen.kind === 'empty' && <EmptyState title={HOME_COPY.empty.title(view.label, screen.anySaved)} body={HOME_COPY.empty.body(screen.anySaved)} />}

      {screen.kind === 'content' &&
        SECTION_ORDER.map((key) => {
          const section = view.sections.find((s) => s.key === key);
          const rows: SectionRow[] = (section?.itemIds ?? []).flatMap((id) => {
            const item = byId.get(id);
            return item === undefined ? [] : [{ homeItemId: id, copy: describeItem(item, copyContext) }];
          });
          return <HomeSectionBlock key={key} sectionKey={key} rows={rows} expanded={props.expanded[key] === true} onToggle={() => props.onToggleSection(key)} onOpen={props.onOpenItem} />;
        })}

      {screen.kind === 'content' && view.items.some((item) => item.canonicalKind === 'system') && (
        <View style={styles.systems}>
          <AppText variant="metadata" color={colors.textTertiary}>
            {HOME_COPY.systemsNote}
          </AppText>
          <Button label={HOME_COPY.openSystems} variant="ghost" size="sm" onPress={props.onOpenSystems} style={styles.systemsButton} />
        </View>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  scope: { marginBottom: spacing.lg },
  notice: { marginBottom: spacing.lg },
  restore: { alignSelf: 'flex-start', marginTop: spacing.sm },
  actions: { flexDirection: 'row', gap: spacing.sm, marginBottom: spacing.sm },
  systems: { marginTop: spacing.xxl },
  systemsButton: { alignSelf: 'flex-start', marginTop: spacing.xs },
});
