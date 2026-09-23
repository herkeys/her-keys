import { Screen } from '../../../src/design/components';
import { PeopleHomeScreen } from '../../../src/features/people/containers';

// People OS (HK-FEATURE-13). A thin route; the screen sets its own title, so the Life stack layout is untouched.
export default function PeopleRoute() {
  return (
    <Screen>
      <PeopleHomeScreen />
    </Screen>
  );
}
