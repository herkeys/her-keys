import { useWindowDimensions, type ViewStyle } from 'react-native';
import type { Ionicons } from '@expo/vector-icons';
import { IconBadge, useDecorationVisible } from '../../design/components';
import { spacing } from '../../design/tokens';

/** Short windows (landscape, small phones with the keyboard up) drop the header badge before they drop any functional spacing. */
const MIN_HEIGHT_FOR_HEADER_BADGE = 640;

/**
 * The decorative icon well above a form step's overline. It is ornament: it disappears on compact widths, at large text
 * sizes and on short windows so a form step never loses a field or a disclosure to make room for it.
 */
export function HeaderBadge({ icon, style }: { icon: keyof typeof Ionicons.glyphMap; style?: ViewStyle }) {
  const { height } = useWindowDimensions();
  const decorate = useDecorationVisible();
  if (!decorate || height < MIN_HEIGHT_FOR_HEADER_BADGE) return null;
  return <IconBadge icon={icon} style={style ?? { marginBottom: spacing.lg }} />;
}
