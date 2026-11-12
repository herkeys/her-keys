import { router } from 'expo-router';
import { Screen } from '../../../src/design/components';
import { LifeInboxView } from '../../../src/features/talk-it-out/capture/LifeInboxView';
import { recordRouteOf } from '../../../src/features/talk-it-out/capture/recordRoute';

/** Life Inbox: unresolved life admin, mounted inside the existing Life stack (no new tab, no shell change). */
export default function LifeInboxScreen() {
  return (
    <Screen>
      <LifeInboxView onSayAgain={() => router.push('/talk-it-out')} onOpenRecord={(target) => router.push(recordRouteOf(target))} />
    </Screen>
  );
}
