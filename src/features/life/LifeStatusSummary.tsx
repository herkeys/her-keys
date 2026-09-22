import { router } from 'expo-router';
import { StatusList } from '../../design/components';
import { TodayDisclosure } from '../today/TodayDisclosure';
import { clearCount } from './lifeStatus';
import { useLifeStatus } from './useLifeStatus';

/**
 * Reassurance, not a dashboard: the point is that Her Keys already looked at the rest of her
 * life so she doesn't have to go check each area herself. It is lower-priority context, so it
 * is collapsed until she wants it — the one-line summary says how many areas are clear.
 */
export function LifeStatusSummary() {
  const statuses = useLifeStatus();
  const clear = clearCount(statuses);

  return (
    <TodayDisclosure title="Also checked" summary={`${clear} of ${statuses.length} clear`}>
      <StatusList
        items={statuses.map((s) => ({
          key: s.key,
          label: s.label,
          value: s.value,
          needsAttention: s.needsAttention,
          // The Life stack may not exist yet when this is tapped from Today;
          // the anchor loads the hub beneath the screen instead of stranding it.
          onPress: () => router.push(s.route, { withAnchor: true }),
        }))}
      />
    </TodayDisclosure>
  );
}
