import { StyleSheet, View, type ViewStyle } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { color, sizing } from '../tokens';

/**
 * Icon wells and the two brand badges (HK-FE-UI-02 §8).
 *
 * Icons come from the single Ionicons family already in the app — outline at rest, soft rounded forms — set inside Soft Lilac
 * wells. Badges are DECORATIVE by default (hidden from screen readers); pass `accessibilityLabel` only when a badge is the
 * sole carrier of meaning, which the screens in this system never rely on (every badge sits beside text).
 *
 * Luxury Black appears here, and only here, as a small polished detail: the Premium badge is a 40–56 dp black disc with a
 * lighter rim and a one-pixel glint, carrying a Dusty Mauve sparkle (7.81:1 on the black). It is never a screen, a card or a
 * button.
 */

type IoniconName = keyof typeof Ionicons.glyphMap;
type BadgeSize = keyof typeof sizing.badge;

interface BaseProps {
  size?: BadgeSize;
  accessibilityLabel?: string;
  style?: ViewStyle;
}

function a11y(label?: string) {
  return label
    ? ({ accessible: true, accessibilityRole: 'image', accessibilityLabel: label } as const)
    : ({ accessibilityElementsHidden: true, importantForAccessibility: 'no-hide-descendants' } as const);
}

interface IconBadgeProps extends BaseProps {
  icon: IoniconName;
  /** `lilac` (default) is the supporting well; `berry` is the single emphasised icon on a screen. */
  tone?: 'lilac' | 'berry';
}

/** A rounded icon well: Soft Lilac with a Deep Plum Gray glyph (7.48:1), or Berry with a white glyph (5.37:1). */
export function IconBadge({ icon, size = 'sm', tone = 'lilac', accessibilityLabel, style }: IconBadgeProps) {
  const dim = sizing.badge[size];
  const berry = tone === 'berry';
  return (
    <View
      {...a11y(accessibilityLabel)}
      testID="icon-badge"
      style={[
        styles.disc,
        { width: dim, height: dim, borderRadius: dim / 2 },
        berry ? styles.berry : styles.lilac,
        style,
      ]}
    >
      <Ionicons name={icon} size={Math.round(dim * 0.5)} color={berry ? color.text.inverse : color.text.primary} />
    </View>
  );
}

/** The rounded Her Keys key badge: a Soft Lilac disc, a Dusty Mauve ring and a white inner well holding the key glyph. */
export function KeyBadge({ size = 'lg', accessibilityLabel, style }: BaseProps) {
  const dim = sizing.badge[size];
  const inner = Math.round(dim * 0.72);
  return (
    <View
      {...a11y(accessibilityLabel)}
      testID="key-badge"
      style={[styles.disc, styles.keyOuter, { width: dim, height: dim, borderRadius: dim / 2 }, style]}
    >
      <View style={[styles.disc, styles.keyInner, { width: inner, height: inner, borderRadius: inner / 2 }]}>
        <Ionicons name="key-outline" size={Math.round(dim * 0.38)} color={color.text.primary} />
      </View>
    </View>
  );
}

/** Premium sparkle badge — the one place Luxury Black is used as a small polished detail. */
export function PremiumBadge({ size = 'sm', accessibilityLabel, style }: BaseProps) {
  const dim = sizing.badge[size];
  return (
    <View
      {...a11y(accessibilityLabel)}
      testID="premium-badge"
      style={[styles.disc, styles.black, { width: dim, height: dim, borderRadius: dim / 2 }, style]}
    >
      {/* the gloss: one fine, opaque glint near the top edge — a detail, never a gradient */}
      <View style={[styles.glint, { top: Math.round(dim * 0.1), left: Math.round(dim * 0.28), right: Math.round(dim * 0.28) }]} />
      <Ionicons name="sparkles" size={Math.round(dim * 0.46)} color={color.luxury.glyph} />
    </View>
  );
}

const styles = StyleSheet.create({
  disc: { alignItems: 'center', justifyContent: 'center' },
  lilac: { backgroundColor: color.surface.tint },
  berry: { backgroundColor: color.action.primary, borderWidth: 1, borderColor: color.action.primaryPressed },
  keyOuter: {
    backgroundColor: color.surface.tint,
    borderWidth: 1,
    borderColor: color.action.primaryBorder,
  },
  keyInner: { backgroundColor: color.surface.primary, borderWidth: 1, borderColor: color.border.default },
  black: { backgroundColor: color.luxury.black, borderWidth: 1, borderColor: color.luxury.rim },
  glint: { position: 'absolute', height: 1, borderRadius: 1, backgroundColor: color.luxury.glint },
});
