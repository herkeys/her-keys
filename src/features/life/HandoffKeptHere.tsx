import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Button, InlineNotice } from '../../design/components';
import { spacing } from '../../design/tokens';
import { HANDOFF_KEPT_COPY } from './lifeHubCopy';

/**
 * WHAT ANOTHER EDITOR SHOWS INSTEAD OF A HANDOFF'S FORM (HK13-D35).
 *
 * A handoff is Co-Parent's row. Moved there, its recorded repeat is re-anchored with it; moved in a generic editor (Calendar's event
 * form, Kids' item editor) the event would move and the pattern would stay behind — so those editors never edit one. Calendar, Today
 * and Kids open handoffs in Co-Parent directly; this covers any other way in (a deep link, an older route), and replaces itself with
 * Co-Parent's editor rather than stacking it. It lives in Life, the area that links one part of her life to another.
 */
export function HandoffKeptHere({ eventId }: { eventId: string }) {
  return (
    <View style={styles.wrap}>
      <InlineNotice tone="waiting" title={HANDOFF_KEPT_COPY.title} body={HANDOFF_KEPT_COPY.body} />
      <Button
        label={HANDOFF_KEPT_COPY.open}
        onPress={() => router.replace({ pathname: '/life/coparent', params: { mode: 'edit-handoff', id: eventId } })}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.md },
});
