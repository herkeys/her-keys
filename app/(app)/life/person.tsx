import { Screen } from '../../../src/design/components';
import { PersonScreen } from '../../../src/features/people/containers';

// People OS (HK-FEATURE-13). A thin route; the screen sets its own title, so the Life stack layout is untouched.
export default function PersonRoute() {
  return (
    <Screen>
      <PersonScreen />
    </Screen>
  );
}
