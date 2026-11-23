import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';
import { useAdaptiveLayout } from './useAdaptiveLayout';
import { PANE_GAP } from './sizeClass';

export interface AdaptiveSplitProps {
  /** Full width above the panes in every layout (a screen's title, its primary entry control). */
  lead?: ReactNode;
  /** The main workspace: the schedule, the briefing, the list. */
  primary: ReactNode;
  /** Restrained supporting information. Beside the primary pane when there is room; stacked otherwise. */
  secondary?: ReactNode;
  /**
   * Where the secondary content sits in the single-column (stacked) layout. Screens pick the order they ALREADY had, so a
   * compact window renders the same sequence it did before Build 5.
   */
  stackedOrder?: 'primaryFirst' | 'secondaryFirst';
}

/**
 * Master-detail / main-plus-supporting layout that NEVER remounts its content when the window changes.
 *
 * The tree is identical in every layout: one lead container, one pane container, and the primary and secondary panes as KEYED
 * children of that same pane container. Changing layout only changes styles (row vs column, widths) and, in the stacked layout,
 * the keyed order — React moves keyed children without unmounting them. So draft text, open disclosures, in-flight work,
 * an OAuth handoff or a purchase sheet inside either pane survive rotation, Split View resizing and fold/unfold.
 */
export function AdaptiveSplit({ lead, primary, secondary, stackedOrder = 'primaryFirst' }: AdaptiveSplitProps) {
  const layout = useAdaptiveLayout();
  const hasSecondary = secondary !== undefined && secondary !== null && secondary !== false;
  const twoPane = layout.twoPane && hasSecondary;

  const primaryPane = (
    <View key="primary" testID="adaptive-split-primary" style={twoPane ? styles.primaryPane : null}>
      {primary}
    </View>
  );
  const secondaryPane = hasSecondary ? (
    <View key="secondary" testID="adaptive-split-secondary" style={twoPane ? [styles.secondaryPane, { width: layout.secondaryPaneWidth }] : null}>
      {secondary}
    </View>
  ) : null;
  const panes = twoPane || stackedOrder === 'primaryFirst' ? [primaryPane, secondaryPane] : [secondaryPane, primaryPane];

  return (
    <View testID="adaptive-split" style={styles.root}>
      <View key="lead" testID="adaptive-split-lead">
        {lead}
      </View>
      <View key="panes" testID={twoPane ? 'adaptive-split-panes-row' : 'adaptive-split-panes-stacked'} style={twoPane ? styles.row : null}>
        {panes}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flexGrow: 1 },
  row: { flexDirection: 'row', alignItems: 'flex-start', gap: PANE_GAP },
  primaryPane: { flex: 1, minWidth: 0 },
  secondaryPane: { flexShrink: 0 },
});
