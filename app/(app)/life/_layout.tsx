import { Stack } from 'expo-router';
import { colors } from '../../../src/design/tokens';

// Keeps the hub underneath any Life screen opened from outside this stack
// (a Today row or a link), so Back and the Life tab can always reach it.
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function LifeLayout() {
  return (
    <Stack
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: colors.background },
        headerTintColor: colors.textPrimary,
        contentStyle: { backgroundColor: colors.background },
      }}
    >
      {/* The hub renders its own heading, so the native header would duplicate it. */}
      <Stack.Screen name="index" options={{ headerShown: false }} />
      <Stack.Screen name="kids" options={{ title: 'Kids' }} />
      <Stack.Screen name="home" options={{ title: 'Home' }} />
      <Stack.Screen name="money" options={{ title: 'Money' }} />
      <Stack.Screen name="meals" options={{ title: 'Meals' }} />
      <Stack.Screen name="work" options={{ title: 'Work' }} />
    </Stack>
  );
}
