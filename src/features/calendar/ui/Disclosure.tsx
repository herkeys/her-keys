import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText, WhyThis } from '../../../design/components';
import { sizing, spacing } from '../../../design/tokens';
import { createThemedStyles, useTheme } from '../../../design/theme';
import { COPY } from '../copy';

/**
 * Progressive disclosure (MGP-09: the design system has no toggle for its always-visible `WhyThis`).
 * First glance carries the constraint; the evidence is one deliberate press away. Feature-local and
 * composed from the shared `AppText` / `WhyThis`, so no second visual language is introduced.
 */
export function ToggleLink({
  label,
  expandedLabel,
  expanded,
  onPress,
  accessibilityLabel,
}: {
  label: string;
  expandedLabel: string;
  expanded: boolean;
  onPress: () => void;
  accessibilityLabel: string;
}) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ expanded }}
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [styles.toggle, pressed ? styles.pressed : null]}
    >
      <AppText variant="metadata" color={colors.accent}>
        {expanded ? expandedLabel : label}
      </AppText>
    </Pressable>
  );
}

/** "Why" for one conflict or one unplaced item: structured evidence, stated as facts. */
export function WhyDisclosure({ reasons, subject }: { reasons: readonly string[]; subject: string }) {
  const styles = useStyles();
  const [open, setOpen] = useState(false);
  if (reasons.length === 0) return null;
  return (
    <View>
      <ToggleLink
        label={COPY.why}
        expandedLabel={COPY.hideWhy}
        expanded={open}
        onPress={() => setOpen((value) => !value)}
        accessibilityLabel={`${open ? COPY.hideWhy : COPY.why}: ${subject}`}
      />
      {open ? <WhyThis reasons={reasons} style={styles.body} /> : null}
    </View>
  );
}

/** A quiet block of second-level lines under an item. */
export function DetailLines({ lines, children }: { lines: readonly string[]; children?: ReactNode }) {
  const { colors } = useTheme();
  const styles = useStyles();
  return (
    <View style={styles.details}>
      {lines.map((line) => (
        <AppText key={line} variant="supporting" color={colors.textSecondary}>
          {line}
        </AppText>
      ))}
      {children}
    </View>
  );
}

const useStyles = createThemedStyles(({ interaction }) => StyleSheet.create({
  toggle: { minHeight: sizing.minTouchTarget, justifyContent: 'center', alignSelf: 'flex-start' },
  pressed: { opacity: interaction.pressedOpacity },
  body: { marginBottom: spacing.sm },
  details: { gap: spacing.xs, paddingBottom: spacing.md },
}));
