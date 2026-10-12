import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Overline } from '../../../design/components';
import { color, sizing, spacing } from '../../../design/tokens';
import { HER_KEYS_PREMIUM_DISPLAY_NAME } from '../../../monetization/entitlement';
import { WELCOME_AUTH_COPY as COPY } from '../copy';

export interface PremiumIntroProps {
  onSelectPremium: () => void;
  onContinueFree: () => void;
}

/**
 * The new-user Premium offer, BEFORE the account choice. It records an intent and starts nothing: there is no account yet, so
 * there is no RevenueCat call and no checkout here (the welcome tree cannot reach either). Both actions move on to the account
 * choice; the free continuation is as large and as visible as the Premium one, and no state requires either.
 */
export function PremiumIntroView({ onSelectPremium, onContinueFree }: PremiumIntroProps) {
  return (
    <>
      <View style={styles.body}>
        <View style={styles.mark}>
          <Ionicons name="sparkles-outline" size={sizing.icon.lg} color={color.brand.gold} />
        </View>
        <Overline>{HER_KEYS_PREMIUM_DISPLAY_NAME}</Overline>
        <AppText variant="hero" style={styles.title}>
          {COPY.premium.title}
        </AppText>
        <AppText variant="title" color={color.text.secondary} style={styles.lede}>
          {COPY.premium.lede}
        </AppText>
        <Card tone="subtle" style={styles.benefits}>
          {COPY.premium.benefits.map((benefit) => (
            <AppText key={benefit} variant="body">
              {benefit}
            </AppText>
          ))}
        </Card>
      </View>
      <View style={styles.footer}>
        <Button label={COPY.premium.select} onPress={onSelectPremium} />
        <Button label={COPY.premium.free} variant="secondary" onPress={onContinueFree} />
        <AppText variant="bodySm" color={color.text.muted} style={styles.note}>
          {COPY.premium.note}
        </AppText>
      </View>
    </>
  );
}

const styles = StyleSheet.create({
  body: { flex: 1, justifyContent: 'center', paddingHorizontal: spacing.xl },
  mark: { width: 44, height: 44, borderRadius: 22, alignItems: 'center', justifyContent: 'center', backgroundColor: color.brand.goldSoft, marginBottom: spacing.lg },
  title: { marginTop: spacing.md },
  lede: { marginTop: spacing.lg },
  benefits: { marginTop: spacing.xl, gap: spacing.sm },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  note: { textAlign: 'center' },
});
