import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { opacity, radius, spacing, withAlpha } from '../tokens';
import { createThemedStyles, useTheme } from '../theme';
import { readableColumnFor } from '../readableColumn';
import { useAdaptiveLayout } from '../adaptive';
import { AppText } from './AppText';
import { Button } from './Button';

/**
 * Sheet — the one overlay surface. Dismiss-on-scrim and a visible close
 * control keep her in charge (HUMAN CONTROL, §6). Motion follows motion.deliberate
 * via the platform sheet transition; no decorative animation.
 */

export interface SheetProps {
  visible: boolean;
  onClose: () => void;
  /** Screen-reader description of what this sheet is for. */
  accessibilityLabel: string;
  children: ReactNode;
}

export function Sheet({ visible, onClose, accessibilityLabel, children }: SheetProps) {
  const styles = useStyles();
  const layout = useAdaptiveLayout();
  // Wider than compact (iOS): the sheet keeps the readable width instead of a full-width strip. `null` on compact windows and on
  // Android, where the sheet renders exactly as before.
  const column = readableColumnFor(layout);
  // Expanded windows (a full-screen iPad, a wide Stage Manager window): a centered dialog card with every corner rounded, so a
  // short confirmation does not sit at the bottom of a 1,000pt-tall window and the keyboard never covers it. The handle is a
  // bottom-sheet affordance, so the dialog does not draw one; the scrim and the explicit buttons still close it.
  const dialog = layout.sheetPresentation === 'dialog';
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
      accessibilityLabel={accessibilityLabel}
    >
      <View style={dialog ? [styles.backdrop, styles.backdropDialog] : styles.backdrop}>
        {/* The scrim closes the sheet; without a role a screen reader announces it as plain text with no hint that it can be activated. */}
        <Pressable style={StyleSheet.absoluteFill} accessibilityRole="button" accessibilityLabel="Dismiss" accessibilityHint="Closes this panel" onPress={onClose} />
        <View style={dialog ? [styles.sheet, column, styles.dialog] : column ? [styles.sheet, column] : styles.sheet}>
          {dialog ? null : <View style={styles.handle} />}
          {children}
        </View>
      </View>
    </Modal>
  );
}

export interface ConfirmationSheetProps {
  visible: boolean;
  title: string;
  body: string;
  /** What happens if she does nothing — stated explicitly, never implied. */
  cancelLabel: string;
  confirmLabel: string;
  onCancel: () => void;
  onConfirm: () => void;
}

/** Approval is always explicit: consequence stated, both paths labeled. */
export function ConfirmationSheet({
  visible,
  title,
  body,
  cancelLabel,
  confirmLabel,
  onCancel,
  onConfirm,
}: ConfirmationSheetProps) {
  const { color } = useTheme();
  const styles = useStyles();
  return (
    <Sheet visible={visible} onClose={onCancel} accessibilityLabel={title}>
      <AppText variant="sectionTitle" style={styles.title}>
        {title}
      </AppText>
      <AppText variant="body" color={color.text.secondary} style={styles.body}>
        {body}
      </AppText>
      <View style={styles.actions}>
        <Button label={cancelLabel} variant="ghost" onPress={onCancel} style={styles.action} />
        <Button label={confirmLabel} variant="primary" onPress={onConfirm} style={styles.action} />
      </View>
    </Sheet>
  );
}

const useStyles = createThemedStyles(({ color }) => StyleSheet.create({
  backdrop: {
    flex: 1,
    // Plum-black scrim (never pure black): the one translucent layer, and it never sits behind measured text.
    backgroundColor: withAlpha(color.scrim, opacity.scrim),
    justifyContent: 'flex-end',
  },
  backdropDialog: { justifyContent: 'center', paddingHorizontal: spacing.xl, paddingVertical: spacing.xxl },
  dialog: { maxWidth: 560, borderRadius: radius.xl, paddingTop: spacing.xl, paddingBottom: spacing.xl },
  sheet: {
    backgroundColor: color.surface.elevated,
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
    paddingBottom: spacing.xxl,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radius.pill,
    backgroundColor: color.border.default,
    marginBottom: spacing.lg,
  },
  title: { marginTop: spacing.sm },
  body: { marginTop: spacing.sm, marginBottom: spacing.xl },
  actions: { flexDirection: 'row', justifyContent: 'flex-end', gap: spacing.sm },
  action: { paddingHorizontal: spacing.lg },
}));
