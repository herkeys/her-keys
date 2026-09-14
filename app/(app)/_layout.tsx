import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { colors, spacing, typography } from '../../src/design/tokens';

export default function AppTabsLayout() {
  const insets = useSafeAreaInsets();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.background },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textTertiary,
        // Text-only tabs: no icon set is bundled, and empty icon slots render as
        // missing glyphs. Labels alone also keep the chrome quiet.
        tabBarIconStyle: { display: 'none' },
        tabBarLabelStyle: typography.micro,
        tabBarItemStyle: { paddingVertical: spacing.sm },
        tabBarStyle: {
          backgroundColor: colors.surface,
          borderTopColor: colors.borderSubtle,
          // A fixed height replaces the navigator's own inset math, so the system
          // navigation bar has to be added back or it squeezes the labels out.
          height: 68 + insets.bottom,
          paddingTop: spacing.sm,
        },
      }}
    >
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="life" options={{ title: 'Life' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="systems" options={{ title: 'Systems' }} />
      <Tabs.Screen name="ai" options={{ title: 'Her Keys AI' }} />
    </Tabs>
  );
}
