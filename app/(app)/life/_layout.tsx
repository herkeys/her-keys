import { Stack } from 'expo-router';
import { colors } from '../../../src/design/tokens';
import type { SystemRole } from '../../../src/domain/state';
import { useHousehold } from '../../../src/store/useHousehold';

// Keeps the hub underneath any Life screen opened from outside this stack
// (a Today row or a link), so Back and the Life tab can always reach it.
export const unstable_settings = {
  initialRouteName: 'index',
};

export default function LifeLayout() {
  const { categoryIdForRole, categoryName } = useHousehold();
  // Headers use the household's own name for each area, so a renamed category reads the same everywhere.
  const titleFor = (role: SystemRole, fallback: string) => {
    const id = categoryIdForRole(role);
    return (id && categoryName(id)) || fallback;
  };

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
      <Stack.Screen name="kids" options={{ title: titleFor('kids', 'Kids') }} />
      <Stack.Screen name="home" options={{ title: titleFor('home', 'Home') }} />
      <Stack.Screen name="money" options={{ title: titleFor('money', 'Money') }} />
      <Stack.Screen name="meals" options={{ title: titleFor('meals', 'Meals') }} />
      <Stack.Screen name="work" options={{ title: titleFor('work', 'Work') }} />
    </Stack>
  );
}
