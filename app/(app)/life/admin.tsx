import { Stack, router } from 'expo-router';
import { Screen } from '../../../src/design/components';
import { LifeAdminScreen } from '../../../src/features/lifeAdmin/LifeAdminScreen';
import { LIFE_ADMIN_COPY } from '../../../src/features/lifeAdmin/lifeAdminCopy';

/**
 * Life Admin / Documents, under Life. One route; the record detail, the record form and the task sheet are in-screen sheets. The
 * header title is declared here (the Co-Parent pattern), so the shared Life stack layout is unchanged. Opening a linked task goes
 * to the one task editor she already has.
 */
export default function LifeAdminRoute() {
  return (
    <>
      <Stack.Screen options={{ title: LIFE_ADMIN_COPY.screenTitle }} />
      <Screen>
        <LifeAdminScreen
          onOpenTask={(taskId) => router.push({ pathname: '/task-editor', params: { taskId } })}
          onSkip={() => (router.canGoBack() ? router.back() : router.replace('/life'))}
        />
      </Screen>
    </>
  );
}
