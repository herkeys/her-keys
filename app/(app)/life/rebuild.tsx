import { Stack, useLocalSearchParams } from 'expo-router';
import { REBUILD_COPY } from '../../../src/features/rebuild/copy';
import { RebuildScreen } from '../../../src/features/rebuild/RebuildScreen';

/**
 * Me / Rebuild, under Life. One route: `mode` picks the view (the home when absent), `id` names the Focus, `step=1` opens its
 * next-step form. The title is set here, like Co-Parent's, so the Life stack's own layout is untouched.
 */
export default function RebuildRoute() {
  const params = useLocalSearchParams<{ mode?: string; id?: string; step?: string }>();
  return (
    <>
      <Stack.Screen options={{ title: REBUILD_COPY.screenTitle }} />
      <RebuildScreen mode={params.mode} id={params.id} step={params.step} />
    </>
  );
}
