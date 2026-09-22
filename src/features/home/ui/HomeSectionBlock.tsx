import { StyleSheet, View } from 'react-native';
import { AppText, Button, Overline } from '../../../design/components';
import { colors, spacing } from '../../../design/tokens';
import { HOME_COPY, SECTION_NOTE, SECTION_TITLE, type RowCopy } from '../copy';
import type { HomeSectionKey } from '../model/types';
import { HomeItemRow, homeRowSurface } from './HomeItemRow';

/** How many rows a section shows before she asks for the rest. Collapsing is presentation; nothing is ever dropped. */
export const SECTION_LIMIT = 5;

export interface SectionRow {
  homeItemId: string;
  copy: RowCopy;
}

/**
 * One section of the hub: a title, a line saying what the section is, a bounded set of rows, and "Show all N" when there are more.
 * Every row is reachable — the Life hub does not list a Home task anywhere else, so collapsing must never mean losing.
 */
export function HomeSectionBlock({ sectionKey, rows, expanded, onToggle, onOpen }: { sectionKey: HomeSectionKey; rows: SectionRow[]; expanded: boolean; onToggle: () => void; onOpen: (homeItemId: string) => void }) {
  if (rows.length === 0) return null;
  const shown = expanded ? rows : rows.slice(0, SECTION_LIMIT);
  return (
    <View style={styles.block} accessibilityRole="summary" accessibilityLabel={`${SECTION_TITLE[sectionKey]}, ${rows.length} ${rows.length === 1 ? 'item' : 'items'}`}>
      <Overline style={styles.title}>{`${SECTION_TITLE[sectionKey]} · ${rows.length}`}</Overline>
      <AppText variant="metadata" color={colors.textTertiary} style={styles.note}>
        {SECTION_NOTE[sectionKey]}
      </AppText>
      <View style={homeRowSurface}>
        {shown.map((row, index) => (
          <HomeItemRow key={row.homeItemId} copy={row.copy} isLast={index === shown.length - 1} onPress={() => onOpen(row.homeItemId)} />
        ))}
      </View>
      {rows.length > SECTION_LIMIT && <Button label={expanded ? HOME_COPY.showLess : HOME_COPY.showAll(rows.length)} variant="ghost" size="sm" onPress={onToggle} style={styles.more} />}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.xxl },
  title: { marginBottom: spacing.xs },
  note: { marginBottom: spacing.md },
  more: { alignSelf: 'flex-start', marginTop: spacing.sm },
});
