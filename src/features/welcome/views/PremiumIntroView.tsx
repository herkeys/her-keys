import { StyleSheet, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { AppText, Button, Card, Overline } from '../../../design/components';
import { color, sizing, spacing } from '../../../design/tokens';
import { HER_KEYS_PREMIUM_DISPLAY_NAME } from '../../../monetization/entitlement';

export type PremiumNotice = 'no_offering' | 'unavailable' | 'error' | null;

export interface PremiumIntroProps {
  busy: boolean;
  notice: PremiumNotice;
  onViewPlans: () => void;
  onContinueFree: () => void;
}

/**
 * New-user introduction, BEFORE account creation. RC owns every product,
 * price, trial eligibility and purchase; this view never fabricates an offer.
 * The free path is always available. This screen does NOT represent a purchase.
 */
export function PremiumIntroView({ busy, notice, onViewPlans, onContinueFree }: PremiumIntroProps) {
  return (
    <>
      <View style={styles.body}>
        <View style={styles.mark}>
          <Ionicons name="sparkles-outline" size={sizing.icon.lg} color={color.brand.gold} />
        </View>
        <Overline>{HER_KEYS_PREMIUM_DISPLAY_NAME}</Overline>
        <AppText variant="hero" style={styles.title}>
          A little more room for you.
        </AppText>
        <AppText variant="title" color={color.text.secondary} style={styles.lede}>
          Explore deeper planning support and more proactive help as Her Keys grows.
        </AppText>
        <Card tone="subtle" style={styles.benefits}>
          <AppText variant="body">Deeper household intelligence</AppText>
          <AppText variant="body">More proactive planning support</AppText>
          <AppText variant="body">Enhanced Talk It Out capabilities</AppText>
        </Card>
        {notice !== null && (
          <AppText variant="bodySm" color={color.text.secondary} accessibilityLiveRegion="polite">
            {notice === 'no_offering' || notice === 'unavailable'
              ? 'Premium plans are not available on this device yet. You can still create your account.'
              : 'Premium could not open. Please try again or continue with the free experience.'}
          </AppText>
        )}
      </View>
      <View style={styles.footer}>
        <Button label="Explore Premium Plans" onPress={onViewPlans} disabled={busy} />
        <Button label="Continue with Her Keys Free" variant="secondary" onPress={onContinueFree} disabled={busy} />
        <AppText variant="bodySm" color={color.text.muted} style={styles.note}>
          Plans, prices and any trial eligibility are shown by the App Store or Google Play before a purchase.
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
