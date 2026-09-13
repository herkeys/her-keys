import { StyleSheet, View } from 'react-native';
import { AppText, Screen } from '../../src/design/components';
import { colors, spacing } from '../../src/design/tokens';
import { SystemsList } from '../../src/features/systems/SystemsList';

export default function SystemsScreen() {
  return (
    <Screen>
      <View style={styles.header}>
        <AppText variant="hero">Systems</AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.subtitle}>
          The routines already holding your household together. Her Keys protects these rather than replacing them.
        </AppText>
      </View>
      <SystemsList />
    </Screen>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xxl },
  subtitle: { marginTop: spacing.sm },
});
