import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { AppText, Button, Card, EmptyState, InlineNotice, LoadingState, Tag } from '../../../design/components';
import { color, spacing } from '../../../design/tokens';
import { CaptureGroup } from './CaptureCards';
import { useCapture, useLifeInbox } from './CaptureContext';
import { copy } from './copy';
import type { InboxItemVM } from './viewModel';

/**
 * LIFE INBOX — unresolved life admin. Not a second task list (accepted items are canonical rows and are
 * never listed here) and not an activity feed (history is not listed). One list, opened inside the
 * existing Life stack.
 */

function ItemCard({ item, open, onToggle, onSayAgain }: { item: InboxItemVM; open: boolean; onToggle: () => void; onSayAgain: () => void }) {
  const { coordinator } = useCapture();
  const urgency = item.passed ? copy.inbox.passed : copy.inbox.urgency[item.urgency];
  return (
    <Card tone="surface" style={styles.card}>
      <View style={styles.header}>
        <AppText variant="cardTitle" style={styles.headline} accessibilityRole="header">
          {item.headline}
        </AppText>
        {urgency.length > 0 && <Tag label={urgency} tone={item.urgency === 'none' && !item.passed ? 'neutral' : 'attention'} />}
      </View>
      <AppText variant="supporting" color={color.text.secondary} style={styles.line}>
        {item.phaseLabel}
        {item.progressLabel ? ` · ${item.progressLabel}` : ''}
      </AppText>
      {item.whenLabel && (
        <AppText variant="supporting" color={color.text.secondary} style={styles.line}>
          {item.whenLabel}
        </AppText>
      )}
      <AppText variant="metadata" color={color.text.muted} style={styles.line}>
        {copy.inbox.received(item.receivedLabel)}
      </AppText>

      {item.hollow ? (
        <View>
          <InlineNotice tone="waiting" title={copy.inbox.hollow(item.receivedLabel)} style={styles.line} />
          <View style={styles.actions}>
            <Button label={copy.inbox.sayAgain} variant="secondary" size="sm" onPress={onSayAgain} accessibilityHint={copy.inbox.talkItOutHint} />
            <Button label={copy.inbox.dismiss} variant="ghost" size="sm" onPress={() => void coordinator.dismissCapture(item.captureId)} />
          </View>
        </View>
      ) : (
        <View style={styles.actions}>
          <Button label={open ? copy.inbox.collapse : copy.inbox.open} variant={open ? 'ghost' : 'secondary'} size="sm" onPress={onToggle} />
        </View>
      )}

      {open && !item.hollow && <CaptureGroup captureId={item.captureId} onLater={onToggle} />}
    </Card>
  );
}

/** `onSayAgain` opens Talk It Out; the route supplies it so this view carries no navigation of its own. */
export function LifeInboxView({ onSayAgain }: { onSayAgain: () => void }) {
  const vm = useLifeInbox();
  const [openId, setOpenId] = useState<string | null>(null);

  return (
    <View>
      <View style={styles.title}>
        <AppText variant="display">{copy.inbox.title}</AppText>
        <AppText variant="supporting" color={color.text.secondary} style={styles.subtitle}>
          {copy.inbox.subtitle}
        </AppText>
      </View>

      {vm.phase === 'loading' && <LoadingState label={vm.message} />}

      {vm.phase === 'empty' && <EmptyState title={vm.message} body={copy.inbox.emptyBody} />}

      {vm.phase === 'recovery' && <InlineNotice tone="attention" title={vm.message} style={styles.notice} />}

      {(vm.phase === 'items' || vm.phase === 'recovery') &&
        vm.items.map((item) => (
          <ItemCard key={item.captureId} item={item} open={openId === item.captureId} onToggle={() => setOpenId(openId === item.captureId ? null : item.captureId)} onSayAgain={onSayAgain} />
        ))}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { marginBottom: spacing.xxl },
  subtitle: { marginTop: spacing.sm },
  notice: { marginBottom: spacing.lg },
  card: { marginBottom: spacing.md },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: spacing.md },
  headline: { flex: 1 },
  line: { marginTop: spacing.sm },
  actions: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm, marginTop: spacing.lg },
});
