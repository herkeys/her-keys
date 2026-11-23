import type { ColorValue } from 'react-native';
import { TabIcon, type TabIconSpec } from '../components/TabIcon';
import { sizing, spacing, typography } from '../tokens';
import type { Theme } from '../theme/palettes';
import { SIDEBAR_WIDTH, TAB_BAR_CHROME_HEIGHT, type AdaptiveLayout, type EdgeInsets } from './sizeClass';

/**
 * The primary navigation's per-screen options, for every layout (Build 5).
 *
 * ONE navigator, two presentations. Compact and medium windows get the bottom tab bar exactly as it was before Build 5 (this
 * function returns the same options object shape and values for it, locked by tests). Expanded iOS windows get the SAME five
 * destinations, in the same order, as a leading sidebar. Only options change between the two, never the navigator, so the
 * selected destination, each tab's stack, and every mounted screen survive a resize, rotation, Split View change or fold.
 *
 * Iconography stays restrained and literal: a day (Today), a home (Life), a calendar, a grid of systems, a spark (AI).
 */
export const TAB_ICONS: Readonly<Record<string, TabIconSpec>> = Object.freeze({
  today: { outline: 'sunny-outline', filled: 'sunny' },
  life: { outline: 'home-outline', filled: 'home' },
  calendar: { outline: 'calendar-outline', filled: 'calendar' },
  systems: { outline: 'grid-outline', filled: 'grid' },
  ai: { outline: 'sparkles-outline', filled: 'sparkles' },
});

export interface AppTabsOptionsInput {
  routeName: string;
  theme: Pick<Theme, 'color' | 'colors'>;
  insets: EdgeInsets;
  layout: Pick<AdaptiveLayout, 'navigation'>;
}

export function appTabsScreenOptions({ routeName, theme, insets, layout }: AppTabsOptionsInput) {
  const { colors, color } = theme;
  const tabBarIcon = ({ color: tint, focused }: { color: ColorValue; focused: boolean }) => (
    <TabIcon spec={TAB_ICONS[routeName]} color={tint} size={sizing.icon.lg} focused={focused} />
  );

  if (layout.navigation === 'sidebar') {
    return {
      headerShown: false,
      sceneStyle: { backgroundColor: colors.background },
      tabBarPosition: 'left' as const,
      tabBarVariant: 'uikit' as const,
      tabBarLabelPosition: 'beside-icon' as const,
      // The selected destination sits on Soft Lilac with on-soft berry text (5.54:1) — the existing selected-row pairing, in
      // both appearances, instead of the navigator's default solid fill.
      tabBarActiveTintColor: color.action.onSoft,
      tabBarActiveBackgroundColor: color.action.primarySoft,
      tabBarInactiveTintColor: color.text.secondary,
      tabBarIcon,
      tabBarLabelStyle: typography.bodyStrong,
      // A sidebar has no fixed height, so its labels scale with Dynamic Type (the bottom bar's documented cap does not apply).
      tabBarAllowFontScaling: true,
      tabBarItemStyle: { minHeight: sizing.minTouchTarget, marginVertical: spacing.xxs },
      tabBarStyle: {
        backgroundColor: color.surface.primary,
        borderColor: color.border.subtle,
        // The navigator's default sidebar is 360pt; Her Keys keeps a restrained 240pt plus whatever leading inset it absorbs.
        width: SIDEBAR_WIDTH + insets.left,
        minWidth: SIDEBAR_WIDTH + insets.left,
      },
    };
  }

  return {
    headerShown: false,
    sceneStyle: { backgroundColor: colors.background },
    tabBarActiveTintColor: colors.accent,
    tabBarInactiveTintColor: colors.textTertiary,
    tabBarIcon,
    tabBarLabelStyle: typography.micro,
    // Fixed chrome: the tab bar's height is fixed, so its labels do not scale with
    // Dynamic Type — an 11pt label at 200% would clip inside 68pt. Documented narrow
    // cap (HK-FE-UI-02): every other surface scales freely. iOS offers the system
    // Large Content Viewer (long-press) on tab items instead.
    tabBarAllowFontScaling: false,
    tabBarItemStyle: { paddingVertical: spacing.xs },
    tabBarIconStyle: { marginTop: spacing.xxs },
    tabBarStyle: {
      backgroundColor: colors.surface,
      borderTopColor: colors.borderSubtle,
      // A fixed height replaces the navigator's own inset math, so the system
      // navigation bar has to be added back or it squeezes the labels out.
      height: TAB_BAR_CHROME_HEIGHT + insets.bottom,
      paddingTop: spacing.xs,
    },
  };
}
