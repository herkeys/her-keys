import { StyleSheet, View } from 'react-native';
import { spacing } from '../tokens';
import { createThemedStyles } from '../theme';

export function Divider({ tight = false }: { tight?: boolean }) {
  const styles = useStyles();
  return <View style={[styles.line, tight ? styles.tight : styles.roomy]} />;
}

const useStyles = createThemedStyles(({ colors }) => StyleSheet.create({
  line: { height: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  roomy: { marginVertical: spacing.lg },
  tight: { marginVertical: spacing.md },
}));
