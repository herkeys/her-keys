import { router } from 'expo-router';
import { Screen } from '../../../src/design/components';
import { LifeInboxView } from '../../../src/features/talk-it-out/capture/LifeInboxView';

/** Life Inbox: unresolved life admin, mounted inside the existing Life stack (no new tab, no shell change). */
export default function LifeInboxScreen() {
  return (
    <Screen>
      <LifeInboxView onSayAgain={() => router.push('/talk-it-out')} />
    </Screen>
  );
}
