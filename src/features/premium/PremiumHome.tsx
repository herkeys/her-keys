import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Overline, Tag } from '../../design/components';
import { colors, spacing } from '../../design/tokens';
import type { PremiumHomeCopy, CapabilityView, HomeActionCopy } from '../../monetization/premiumHomeCopy';
import { usePremiumStateIfMounted } from '../../monetization/PremiumStateProvider';
import { usePremiumHome, type PremiumHomeApi } from './usePremiumHome';

const toneOf = (tone: PremiumHomeCopy['tone']) => (tone === 'success' ? 'success' : tone === 'attention' ? 'attention' : 'neutral');
const cardTone = (tone: PremiumHomeCopy['tone']) => (tone === 'success' ? 'success' : tone === 'attention' ? 'attention' : 'surface');
const capabilityTag = (status: CapabilityView['status']) => (status === 'ready' ? 'success' : status === 'included' ? 'accent' : 'neutral');

export interface PremiumHomeViewProps {
  home: PremiumHomeApi;
  /** The host is busy (signing in or out, or a restore is pending): nothing here may start a store operation. */
  hold: boolean;
}

/**
 * Her Keys Premium, inside Your Account: where she stands, what it gives her, and the way to buy, check or manage it.
 *
 * Presentational over `usePremiumHome`. It renders NO Restore Purchases control — the Account surface owns the one control and places it
 * directly beneath this section — and NO price: the store's own purchase interface is the only place a price appears.
 */
export function PremiumHomeView({ home, hold }: PremiumHomeViewProps) {
  const { copy, capabilities, upgrade } = home;
  const act = (item: HomeActionCopy) => {
    switch (item.action) {
      case 'upgrade':
        return void upgrade.start();
      case 'verify':
        return void home.verify();
      case 'retry':
        return void home.retry();
      case 'manage':
        return void home.manage();
    }
  };
  const busy = hold || upgrade.presenting || home.managing;

  return (
    <View style={styles.root}>
      <Overline>Her Keys Premium</Overline>
      <Card tone={cardTone(copy.tone)} style={styles.status}>
        <View accessible accessibilityRole="summary" style={styles.statusText}>
          <Tag label={copy.status} tone={toneOf(copy.tone)} />
          <AppText variant="title" accessibilityRole="header" style={styles.statusTitle}>
            {copy.title}
          </AppText>
          <AppText variant="bodySm" color={colors.textSecondary}>
            {copy.body}
          </AppText>
        </View>
        {copy.primary ? <Button label={upgrade.presenting && copy.primary.action === 'upgrade' ? 'Opening…' : copy.primary.label} variant="primary" disabled={busy} onPress={() => act(copy.primary!)} /> : null}
        {copy.manage ? <Button label={copy.manage.label} variant="secondary" disabled={busy} onPress={() => act(copy.manage!)} /> : null}
        {upgrade.notice ? (
          <AppText variant="bodySm" color={colors.textSecondary} style={styles.note} accessibilityLiveRegion="polite">
            {upgrade.notice.message}
          </AppText>
        ) : null}
        {home.manageNotice ? (
          <AppText variant="bodySm" color={colors.textSecondary} style={styles.note} accessibilityLiveRegion="polite">
            {home.manageNotice}
          </AppText>
        ) : null}
      </Card>

      <AppText variant="label" color={colors.textTertiary} style={styles.listLabel}>
        Premium tools and availability
      </AppText>
      {capabilities.map((capability) => (
        <Card key={capability.key} tone="surface" style={styles.capability}>
          <View accessible accessibilityRole="summary" style={styles.statusText}>
            <View style={styles.capabilityHead}>
              <AppText variant="bodyStrong" style={styles.capabilityName} accessibilityRole="header">
                {capability.name}
              </AppText>
              <Tag label={capability.statusLabel} tone={capabilityTag(capability.status)} />
            </View>
            <AppText variant="bodySm" color={colors.textSecondary}>
              {capability.summary}
            </AppText>
            <AppText variant="bodySm" color={colors.textTertiary}>
              {capability.where}
            </AppText>
          </View>
        </Card>
      ))}
    </View>
  );
}

function MountedPremiumHome({ hold }: { hold: boolean }) {
  return <PremiumHomeView home={usePremiumHome()} hold={hold} />;
}

/** Renders nothing where no Premium provider is mounted (the account screen is useful without it). Key it by account. */
export function PremiumHome({ hold }: { hold: boolean }) {
  return usePremiumStateIfMounted() === null ? null : <MountedPremiumHome hold={hold} />;
}

const styles = StyleSheet.create({
  root: { gap: spacing.md },
  status: { gap: spacing.md },
  statusText: { gap: spacing.sm, alignItems: 'flex-start' },
  statusTitle: { marginTop: spacing.xs },
  note: { textAlign: 'center' },
  listLabel: { marginTop: spacing.sm },
  capability: { padding: spacing.lg },
  capabilityHead: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: spacing.md, alignSelf: 'stretch' },
  capabilityName: { flexShrink: 1 },
});
