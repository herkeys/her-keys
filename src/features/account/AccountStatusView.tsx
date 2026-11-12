import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, Overline } from '../../design/components';
import { useAnnounceOnIOS } from '../../design/announce';
import { radius, sizing, spacing } from '../../design/tokens';
import { createThemedStyles, useTheme } from '../../design/theme';
import { statusRowSpeech, type StatusActionId, type StatusGroupModel, type StatusRowModel } from './accountStatusModel';

/**
 * Your Account, at a glance — the PRESENTATION. It renders groups the pure model decided (accountStatusModel.ts) and reports which
 * action a row asked for; it reads no state and performs no action itself. Each row is one spoken statement (label, value and detail),
 * so nothing that is visible is missing from a screen reader and nothing is spoken that is not visible.
 */

export const LINK_FAILED_NOTICE = 'That page could not be opened. Check your connection and try again.';

export function AccountStatusView({
  groups,
  onAction,
  notice,
}: {
  groups: readonly StatusGroupModel[];
  onAction: (action: StatusActionId) => void;
  notice?: string | null;
}) {
  const styles = useStyles();
  const { color } = useTheme();
  useAnnounceOnIOS(notice);
  return (
    <View style={styles.root}>
      {groups.map((group) => (
        <View key={group.key} style={styles.group}>
          <View accessible accessibilityRole="header">
            <Overline>{group.title}</Overline>
          </View>
          <View style={styles.surface}>
            {group.rows.map((row, index) => (
              <StatusRow key={row.key} row={row} isLast={index === group.rows.length - 1} onAction={onAction} />
            ))}
          </View>
        </View>
      ))}
      {notice ? (
        <AppText variant="bodySm" color={color.text.secondary} accessibilityLiveRegion="polite">
          {notice}
        </AppText>
      ) : null}
    </View>
  );
}

function StatusRow({ row, isLast, onAction }: { row: StatusRowModel; isLast: boolean; onAction: (action: StatusActionId) => void }) {
  const { color } = useTheme();
  const styles = useStyles();
  const content = (
    <View style={[styles.row, isLast ? null : styles.rowDivider]}>
      <View style={styles.rowText}>
        <AppText variant="bodyStrong">{row.label}</AppText>
        <View style={styles.valueLine}>
          {row.needsAttention ? <View style={styles.dot} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" /> : null}
          <AppText variant="supporting" color={row.needsAttention ? color.status.attention : color.text.primary} style={styles.value}>
            {row.value}
          </AppText>
        </View>
        {row.detail ? (
          <AppText variant="metadata" color={color.text.secondary}>
            {row.detail}
          </AppText>
        ) : null}
      </View>
      {row.action ? (
        <AppText variant="body" color={color.text.muted} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
          ›
        </AppText>
      ) : null}
    </View>
  );

  const speech = statusRowSpeech(row);
  if (!row.action) {
    return (
      <View accessible accessibilityLabel={speech}>
        {content}
      </View>
    );
  }
  const action = row.action;
  return (
    <Pressable
      onPress={() => onAction(action.id)}
      accessibilityRole={action.id === 'terms' || action.id === 'privacy' ? 'link' : 'button'}
      accessibilityLabel={speech}
      accessibilityHint={action.hint}
      style={({ pressed }) => (pressed ? styles.pressed : null)}
    >
      {content}
    </Pressable>
  );
}

const useStyles = createThemedStyles(({ color }) =>
  StyleSheet.create({
    root: { gap: spacing.xl },
    group: { gap: spacing.sm },
    surface: {
      backgroundColor: color.surface.primary,
      borderRadius: radius.lg,
      borderWidth: StyleSheet.hairlineWidth,
      borderColor: color.border.default,
      paddingHorizontal: spacing.lg,
    },
    row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: sizing.minTouchTarget + spacing.md, paddingVertical: spacing.md },
    rowDivider: { borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: color.border.default },
    rowText: { flex: 1, gap: spacing.xxs },
    valueLine: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    value: { flexShrink: 1 },
    dot: { width: 6, height: 6, borderRadius: radius.pill, backgroundColor: color.status.attention },
    pressed: { opacity: 0.6 },
  }),
);
