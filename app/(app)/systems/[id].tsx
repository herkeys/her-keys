import { useLocalSearchParams } from 'expo-router';
import { Screen } from '../../../src/design/components';
import { SystemDetail } from '../../../src/features/systems/ui/SystemDetail';

/** Search params can arrive repeated; only the first value is used. */
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default function SystemDetailRoute() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <Screen>
      <SystemDetail systemId={first(id) ?? ''} />
    </Screen>
  );
}
