import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Overline, Screen } from '../src/design/components';
import { colors, spacing } from '../src/design/tokens';

export default function Welcome() {
  return (
    <Screen scroll={false}>
      <View style={styles.body}>
        <Overline>Her Keys</Overline>
        <AppText variant="hero" style={styles.title}>
          Rebuild your life.{'\n'}Run it your way.
        </AppText>
        <AppText variant="title" color={colors.textSecondary} style={styles.lede}>
          Her Keys holds the parts of your life you shouldn’t have to keep in your head — and tells you what actually
          needs you today.
        </AppText>
      </View>

      <View style={styles.footer}>
        <AppText variant="bodySm" color={colors.textTertiary} style={styles.footnote}>
          First, a couple of minutes on how your life runs now — what already works, and where it tends to break down.
        </AppText>
        <Button label="Begin" onPress={() => router.push('/onboarding/goals')} />
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  title: { marginTop: spacing.md },
  lede: { marginTop: spacing.xl },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl },
  footnote: { marginBottom: spacing.lg },
});
