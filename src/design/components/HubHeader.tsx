import { StyleSheet, View, type ViewStyle } from 'react-native';
import { color, spacing } from '../tokens';
import { AppText } from './AppText';

interface HubHeaderProps {
  /** The domain name, exactly as the tab and Life hub already name it. */
  title: string;
  /** One concise supporting lede. Plain words, never a status line. */
  lede?: string;
  style?: ViewStyle;
}

/**
 * The shared opening pattern for domain hubs (Kids, Money, Meals, Work):
 * a screen title, one supporting lede, then content. Life — the reference
 * hub — uses the same shape with the larger display rung; domain hubs use
 * screenTitle so the title doesn't compete with the content beneath it.
 */
export function HubHeader({ title, lede, style }: HubHeaderProps) {
  return (
    <View style={[styles.header, style]}>
      <AppText variant="screenTitle" accessibilityRole="header">
        {title}
      </AppText>
      {lede ? (
        <AppText variant="supporting" color={color.text.secondary} style={styles.lede}>
          {lede}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  header: { marginBottom: spacing.xxl },
  lede: { marginTop: spacing.sm },
});
