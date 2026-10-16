import { StyleSheet, View } from 'react-native';
import { AppText, Button, IconBadge, Overline, PremiumBadge } from '../../../design/components';
import { color, radius, spacing } from '../../../design/tokens';
import { HER_KEYS_PREMIUM_DISPLAY_NAME } from '../../../monetization/entitlement';
import { WELCOME_AUTH_COPY as COPY } from '../copy';

export interface PremiumIntroProps {
  onSelectPremium: () => void;
  onContinueFree: () => void;
}

/** One icon per real Stage 1 tool, in the order the copy lists them. The icons are ornament: the sentence is the content. */
const BENEFIT_ICONS = ['sunny-outline', 'mail-unread-outline', 'trending-up-outline'] as const;

/** "Daily Load: review tight days…" → ["Daily Load", "review tight days…"]. A line without the separator renders whole. */
function splitBenefit(benefit: string): { name: string | null; detail: string } {
  const at = benefit.indexOf(': ');
  return at === -1 ? { name: null, detail: benefit } : { name: benefit.slice(0, at), detail: benefit.slice(at + 2) };
}

/**
 * The new-user Premium offer, BEFORE the account choice. It records an intent and starts nothing: there is no account yet, so
 * there is no RevenueCat call and no checkout here (the welcome tree cannot reach either). Both actions move on to the account
 * choice; the free continuation is as large and as visible as the Premium one, and no state requires either.
 *
 * HK-FE-UI-02: the Premium sparkle badge is the one small Luxury Black detail; the three real Stage 1 tools are rounded
 * benefit rows with Soft Lilac icon wells. Nothing here shows or implies a price, plan or trial.
 */
export function PremiumIntroView({ onSelectPremium, onContinueFree }: PremiumIntroProps) {
  return (
    <>
      <View style={styles.body}>
        <PremiumBadge size="md" style={styles.mark} />
        <Overline>{HER_KEYS_PREMIUM_DISPLAY_NAME}</Overline>
        <AppText variant="hero" style={styles.title}>
          {COPY.premium.title}
        </AppText>
        <AppText variant="title" color={color.text.secondary} style={styles.lede}>
          {COPY.premium.lede}
        </AppText>
        <View style={styles.benefits}>
          {COPY.premium.benefits.map((benefit, index) => {
            const { name, detail } = splitBenefit(benefit);
            return (
              <View key={benefit} style={styles.row}>
                <IconBadge icon={BENEFIT_ICONS[index] ?? 'sparkles-outline'} />
                <View style={styles.rowText}>
                  {name ? <AppText variant="bodyStrong">{name}</AppText> : null}
                  <AppText variant="supporting" color={color.text.secondary}>
                    {detail}
                  </AppText>
                </View>
              </View>
            );
          })}
        </View>
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
  mark: { marginBottom: spacing.lg },
  title: { marginTop: spacing.md },
  lede: { marginTop: spacing.lg },
  benefits: { marginTop: spacing.xl, gap: spacing.md },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    padding: spacing.md,
    borderRadius: radius.lg,
    backgroundColor: color.surface.primary,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: color.border.default,
  },
  rowText: { flex: 1 },
  footer: { paddingHorizontal: spacing.xl, paddingBottom: spacing.xxl, gap: spacing.md },
  note: { textAlign: 'center' },
});
