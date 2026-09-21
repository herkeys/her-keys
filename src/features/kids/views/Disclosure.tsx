import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { AppText } from '../../../design/components';
import { color, interaction, sizing, spacing } from '../../../design/tokens';

/**
 * Progressive disclosure: a labelled toggle that reveals more of the same list. The state ("expanded") is announced, not only drawn,
 * and the target is at least as tall as the touch floor.
 */
export function Disclosure({ collapsedLabel, expandedLabel, children }: { collapsedLabel: string; expandedLabel: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      {open ? children : null}
      <Pressable
        onPress={() => setOpen((value) => !value)}
        accessibilityRole="button"
        accessibilityLabel={open ? expandedLabel : collapsedLabel}
        accessibilityState={{ expanded: open }}
        style={({ pressed }) => [styles.toggle, pressed ? { opacity: interaction.pressedOpacity } : null]}
      >
        <AppText variant="actionLabel" color={color.action.primary}>
          {open ? expandedLabel : collapsedLabel}
        </AppText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: { minHeight: sizing.minTouchTarget, justifyContent: 'center', paddingVertical: spacing.xs },
});
