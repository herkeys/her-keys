import { StyleSheet, View } from 'react-native';
import { colors, spacing } from '../tokens';

export function Divider({ tight = false }: { tight?: boolean }) {
  return <View style={[styles.line, tight ? styles.tight : styles.roomy]} />;
}

const styles = StyleSheet.create({
  line: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  roomy: { marginVertical: spacing.lg },
  tight: { marginVertical: spacing.md },
});
