import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { TabIcon, type TabIconSpec } from '../../src/design/components';
import { colors, sizing, spacing, typography } from '../../src/design/tokens';

/**
 * The primary navigation: five tabs, one icon family (Ionicons — outline at
 * rest, filled when selected, one optical weight), labels kept for
 * accessibility and clarity. Iconography is restrained and literal:
 * a day (Today), a home (Life), a calendar, a grid of systems, a spark (AI).
 */
const TAB_ICONS: Record<string, TabIconSpec> = {
  today: { outline: 'sunny-outline', filled: 'sunny' },
  life: { outline: 'home-outline', filled: 'home' },
  calendar: { outline: 'calendar-outline', filled: 'calendar' },
  systems: { outline: 'grid-outline', filled: 'grid' },
  ai: { outline: 'sparkles-outline', filled: 'sparkles' },
};

export default function AppTabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={({ route }) => ({
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
        tabBarIcon: ({ color, focused }) => (
          <TabIcon spec={TAB_ICONS[route.name]} color={color} size={sizing.icon.lg} focused={focused} />
        ),
        tabBarLabelStyle: typography.micro,
        // Fixed chrome: the tab bar's height is fixed, so its labels do not scale with
        // Dynamic Type — an 11pt label at 200% would clip inside 68pt. Documented narrow
        // cap (HK-FE-UI-02): every other surface scales freely.
        tabBarAllowFontScaling: false,
        tabBarItemStyle: { paddingVertical: spacing.xs },
        tabBarIconStyle: { marginTop: spacing.xxs },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.borderSubtle,
          // A fixed height replaces the navigator's own inset math, so the system
          // navigation bar has to be added back or it squeezes the labels out.
          height: 68 + insets.bottom,
          paddingTop: spacing.xs,
        },
      })}
    >
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="life" options={{ title: 'Life' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="systems" options={{ title: 'Systems' }} />
      <Tabs.Screen name="ai" options={{ title: 'AI' }} />
    </Tabs>
  );
}
