import { useLocalSearchParams } from 'expo-router';
import { SystemEditor } from '../../../src/features/systems/editor/SystemEditor';

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

/** No `id` creates a System; an `id` edits that one. The editor remounts per System, so a draft never leaks between them. */
export default function SystemEditorRoute() {
  const { id } = useLocalSearchParams<{ id?: string }>();
  const systemId = first(id);
  return <SystemEditor key={systemId ?? 'new'} systemId={systemId} />;
}
