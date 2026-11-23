import { Tabs } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAdaptiveLayout } from '../../src/design/adaptive';
import { appTabsScreenOptions } from '../../src/design/adaptive/appTabs';
import { useTheme } from '../../src/design/theme';

/**
 * The primary navigation: five destinations, one icon family (Ionicons: outline at rest, filled when selected), labels kept
 * for accessibility and clarity.
 *
 * Build 5: a bottom tab bar on compact and medium windows (unchanged), a leading sidebar on expanded iOS windows (a full-screen
 * iPad, a wide Stage Manager window, an iPhone Duo inner display in landscape). It is the SAME `Tabs` navigator in both — only its
 * screen options change — so a resize keeps the selected destination, every tab's stack and every mounted screen.
 */
export default function AppTabsLayout() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const layout = useAdaptiveLayout();

  return (
    <Tabs screenOptions={({ route }) => appTabsScreenOptions({ routeName: route.name, theme, insets, layout })}>
      <Tabs.Screen name="today" options={{ title: 'Today' }} />
      <Tabs.Screen name="life" options={{ title: 'Life' }} />
      <Tabs.Screen name="calendar" options={{ title: 'Calendar' }} />
      <Tabs.Screen name="systems" options={{ title: 'Systems' }} />
      <Tabs.Screen name="ai" options={{ title: 'AI' }} />
    </Tabs>
  );
}
