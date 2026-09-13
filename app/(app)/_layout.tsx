import { Tabs } from 'expo-router';
import { colors, spacing, typography } from '../../src/design/tokens';

export default function AppTabsLayout() {
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
          height: 68,
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
