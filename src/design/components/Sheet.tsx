import type { ReactNode } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';
import { color, opacity, radius, spacing } from '../tokens';
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
  return (
    <Modal
      visible={visible}
      transparent
      animationType="slide"
      onRequestClose={onClose}
      accessibilityViewIsModal
      accessibilityLabel={accessibilityLabel}
    >
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} accessibilityLabel="Dismiss" onPress={onClose} />
        <View style={styles.sheet}>
          <View style={styles.handle} />
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

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: `rgba(31, 30, 27, ${opacity.scrim})`,
    justifyContent: 'flex-end',
  },
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
});
