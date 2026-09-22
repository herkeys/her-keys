import { Stack } from 'expo-router';
import { color } from '../../../src/design/tokens';

// Keeps the hub underneath any Systems screen opened from outside this stack (a link), so Back and
// the Systems tab can always reach it — the same shape the Life tab already uses.
export const unstable_settings = {
  initialRouteName: 'index',
};

/**
 * Systems is one primary area with its own screens (hub → System → editor), not a second
 * navigator: it lives inside the existing Systems tab and adds no tab, no root screen and no route
 * guard — `/systems/...` already resolves to the `(app)` guard by its first segment.
 */
export default function SystemsLayout() {
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: color.background },
        headerTintColor: color.text.primary,
        contentStyle: { backgroundColor: color.background },
      }}
    >
      {/* The hub renders its own heading, so the native header would duplicate it. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="[id]" options={{ title: 'System' }} />
      <Stack.Screen name="edit" options={{ presentation: 'modal', title: 'System' }} />
    </Stack>
  );
}
