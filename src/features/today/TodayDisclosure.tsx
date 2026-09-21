import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../../design/components';
import { color, interaction, sizing, spacing } from '../../design/tokens';

/**
 * A section heading. It is a real heading for a screen reader, and its meaning never
 * depends on color — it is a word.
 */
export function SectionLabel({ children, tone }: { children: string; tone?: string }) {
  return (
    <AppText variant="label" color={tone ?? color.text.muted} accessibilityRole="header">
      {children.toUpperCase()}
    </AppText>
  );
}

interface TodayDisclosureProps {
  title: string;
  /** A short count or state read with the title ("3", "2 of 5 clear"). */
  summary?: string;
  defaultExpanded?: boolean;
  children: ReactNode;
}

/**
 * Progressive disclosure for Today: the first glance carries the recommendation and
 * the meaningful risk; the reasoning, the rest of the list and the full day sit one
 * tap down. Expanded state is exposed to assistive technology, the whole header is the
 * target, and it is never below the 44pt touch floor.
 *
 * MGP-01: the permanent system has no disclosure primitive yet. This is the smallest
 * composition of permanent primitives and tokens that provides one; the integration wave
 * should promote a single shared version.
 */
export function TodayDisclosure({ title, summary, defaultExpanded = false, children }: TodayDisclosureProps) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <View>
      <Pressable
        onPress={() => setExpanded((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel={summary ? `${title}, ${summary}` : title}
        accessibilityState={{ expanded }}
        accessibilityHint={expanded ? 'Hides the detail' : 'Shows the detail'}
        style={({ pressed }) => [styles.header, pressed ? styles.pressed : null]}
      >
        <View style={styles.titles}>
          <AppText variant="label" color={color.text.muted}>
            {title.toUpperCase()}
          </AppText>
          {summary ? (
            <AppText variant="metadata" color={color.text.muted}>
              {summary}
            </AppText>
          ) : null}
        </View>
        <AppText variant="body" color={color.text.muted} importantForAccessibility="no" accessibilityElementsHidden>
          {expanded ? '▾' : '▸'}
        </AppText>
      </Pressable>
      {expanded ? <View style={styles.body}>{children}</View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: {
    minHeight: sizing.minTouchTarget,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  titles: { flex: 1, flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: spacing.sm },
  body: { marginTop: spacing.sm },
  pressed: { opacity: interaction.pressedOpacity },
});
