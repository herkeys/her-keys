import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, ChipToggle, ConfirmationSheet, Divider, EmptyState, ErrorState, InlineNotice, LoadingState, OfflineState, Overline, Screen, SegmentBar, Sheet, StatusList, Tag, TextField } from '../src/design/components';
import { color, radius, spacing, type as typeScale } from '../src/design/tokens';

/**
 * Development design gallery (HK-FE-UI-01 §20). Demonstrates the permanent
 * primitives with realistic Her Keys copy.
 *
 * Production gating: __DEV__ is false in release bundles, so gallery content
 * never renders; the route is not registered in any navigator (the root stack
 * declares screens explicitly, and gallery is not one of them — Expo Router
 * only links to it from the dev-tools surface, itself development-only). No
 * dependency added for gating; __DEV__ is the framework-native mechanism.
 */

export default function DesignGallery() {
  const [sheetVisible, setSheetVisible] = useState(false);
  const [confirmVisible, setConfirmVisible] = useState(false);
  const [chips, setChips] = useState(['Cooking']);
  const [draft, setDraft] = useState('');

  if (!__DEV__) return null;

  return (
    <Screen>
      <Overline>Design gallery · development only</Overline>
      <AppText variant="display" style={styles.block}>Paper and ink</AppText>
      <AppText variant="supporting" color={color.text.secondary}>
        The permanent Her Keys front-end system. Every sample uses real Her Keys language.
      </AppText>

      <GallerySection title="Palette">
        {([
          ['background', color.background],
          ['surface.primary', color.surface.primary],
          ['surface.secondary', color.surface.secondary],
          ['action.primary', color.action.primary],
          ['status.attention', color.status.attention],
          ['status.risk', color.status.risk],
          ['status.success', color.status.success],
          ['status.waiting', color.status.waiting],
          ['neutral.deep (plum)', color.neutral.deep],
        ] as const).map(([name, value]) => (
          <View key={name} style={styles.swatchRow}>
            <View style={[styles.swatch, { backgroundColor: value }]} />
            <AppText variant="supporting">{name}</AppText>
            <AppText variant="metadata" color={color.text.muted}>{value}</AppText>
          </View>
        ))}
      </GallerySection>

      <GallerySection title="Typography">
        {(['display', 'screenTitle', 'sectionTitle', 'cardTitle', 'body', 'supporting', 'metadata', 'label', 'actionLabel', 'statusLabel'] as const).map((rung) => (
          <View key={rung} style={styles.typeRow}>
            <AppText variant={rung}>
              {rung === 'label' ? 'WHERE THINGS STAND' : rung === 'statusLabel' ? 'Possible pattern' : 'Choose tomorrow’s dinner before noon'}
            </AppText>
            <AppText variant="metadata" color={color.text.muted}>
              {typeScale[rung].fontSize}/{typeScale[rung].lineHeight} · {typeScale[rung].fontWeight}
            </AppText>
          </View>
        ))}
      </GallerySection>

      <GallerySection title="Surfaces">
        <Card tone="surface"><AppText variant="body">surface.primary — what Her Keys is telling you.</AppText></Card>
        <Card tone="subtle" style={styles.stack}><AppText variant="body">surface.secondary — supporting, settled content.</AppText></Card>
        <Card tone="attention" style={styles.stack}><AppText variant="body">attention — one window in your day is too tight.</AppText></Card>
        <Card tone="success" style={styles.stack}><AppText variant="body">success — the mail basket is empty. It stayed empty for six days.</AppText></Card>
      </GallerySection>

      <GallerySection title="Buttons">
        <Button label="Move it to tomorrow" onPress={() => {}} />
        <View style={styles.row}>
          <Button label="Show another option" variant="secondary" onPress={() => {}} />
          <Button label="Start over" variant="ghost" onPress={() => {}} />
        </View>
        <Button label="Continue — nothing selected yet" onPress={() => {}} disabled style={styles.stack} />
      </GallerySection>

      <GallerySection title="Inputs">
        <TextField label="First name" value={draft} onChangeText={setDraft} placeholder="What should Her Keys call you?" />
        <TextField label="What’s on your mind?" value="" onChangeText={() => {}} multiline error="One short sentence is enough to start." />
        <View style={styles.row}>
          {['Cooking', 'Planning ahead', 'Communication'].map((c) => (
            <ChipToggle
              key={c}
              label={c}
              selected={chips.includes(c)}
              onPress={() => setChips((cur) => (cur.includes(c) ? cur.filter((x) => x !== c) : [...cur, c]))}
            />
          ))}
        </View>
      </GallerySection>

      <GallerySection title="Statuses + tags">
        <View style={styles.row}>
          <Tag label="Possible pattern" tone="accent" />
          <Tag label="Needs a decision" tone="attention" />
          <Tag label="Settled" tone="success" />
          <Tag label="Waiting on school" tone="neutral" />
        </View>
        <StatusList
          style={styles.stack}
          items={[
            { key: 'kids', label: 'Kids', value: '1 scheduled, nothing due', onPress: () => {} },
            { key: 'money', label: 'Money', value: '1 thing due today', needsAttention: true, onPress: () => {} },
            { key: 'meals', label: 'Meals', value: 'Planned through Tuesday', onPress: () => {} },
          ]}
        />
      </GallerySection>

      <GallerySection title="Capacity + progress">
        <SegmentBar filled={2} total={4} tone="accent" />
        <AppText variant="supporting" color={color.text.secondary} style={styles.tight}>Estimated load — “about this much”, never a fake percentage.</AppText>
      </GallerySection>

      <GallerySection title="Notices">
        <InlineNotice tone="attention" title="One window is short on room." body="The rest of the day has space." />
        <InlineNotice tone="waiting" title="Waiting on the school calendar" body="Pickups update when the school publishes changes." style={styles.stack} />
      </GallerySection>

      <GallerySection title="System states">
        <LoadingState label="Syncing your household…" />
        <Divider />
        <EmptyState
          title="Nothing captured yet"
          body="Say it in a sentence — “call insurance” — and Her Keys will hold it for you."
          actionLabel="Capture one now"
          onAction={() => {}}
        />
        <Divider />
        <ErrorState body="That change didn’t save. Nothing was lost — your last version is intact." onRetry={() => {}} />
        <Divider />
        <OfflineState />
      </GallerySection>

      <GallerySection title="Overlays">
        <View style={styles.row}>
          <Button label="Open sheet" variant="secondary" onPress={() => setSheetVisible(true)} />
          <Button label="Ask to confirm" variant="secondary" onPress={() => setConfirmVisible(true)} />
        </View>
      </GallerySection>

      <Sheet visible={sheetVisible} onClose={() => setSheetVisible(false)} accessibilityLabel="Why this move">
        <AppText variant="sectionTitle">Why this move</AppText>
        <AppText variant="body" color={color.text.secondary} style={styles.stack}>
          Tomorrow has a 65-minute window after pickup. Today’s only gap is 35 minutes — 10 short of what Her Keys
          allows to get there unrushed.
        </AppText>
      </Sheet>

      <ConfirmationSheet
        visible={confirmVisible}
        title="Move it to tomorrow?"
        body="The library books stay one more day; nothing else in the day changes."
        cancelLabel="Keep today as planned"
        confirmLabel="Move it"
        onCancel={() => setConfirmVisible(false)}
        onConfirm={() => setConfirmVisible(false)}
      />
    </Screen>
  );
}

function GallerySection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Overline style={styles.sectionLabel}>{title}</Overline>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  block: { marginTop: spacing.sm },
  section: { marginTop: spacing.xxxl },
  sectionLabel: { marginBottom: spacing.md },
  stack: { marginTop: spacing.md },
  tight: { marginTop: spacing.sm },
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, alignItems: 'center' },
  swatchRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, marginTop: spacing.xs },
  swatch: { width: 28, height: 28, borderRadius: radius.xs, borderWidth: StyleSheet.hairlineWidth, borderColor: color.border.default },
  typeRow: { marginTop: spacing.md },
});
