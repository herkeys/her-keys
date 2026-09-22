import { useLocalSearchParams } from 'expo-router';
import { OpportunityForm } from '../src/features/work/OpportunityForm';

/** Search params can arrive repeated; only the first value of each is used. */
const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value);

export default function OpportunityEditorModal() {
  const { opportunityId } = useLocalSearchParams<{ opportunityId?: string }>();
  return <OpportunityForm opportunityId={first(opportunityId)} />;
}
