import { Stack, useLocalSearchParams } from 'expo-router';
import { CoParentScreen } from '../../../src/features/coparent/ui/CoParentScreen';
import { resolveMode, titleFor } from '../../../src/features/coparent/ui/modes';

/**
 * Co-Parent Logistics. One route: `mode` picks the view (hub when absent), `id` names the record for a detail or an edit, and
 * `handoff` names the handoff a new preparation item arrives tied to. The header title comes from `COPY` for whichever view it is.
 */
export default function CoParentRoute() {
  const params = useLocalSearchParams<{ mode?: string; id?: string; handoff?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: titleFor(resolveMode(params.mode)) }} />
      <CoParentScreen mode={params.mode} id={params.id} handoff={params.handoff} />
    </>
  );
}
