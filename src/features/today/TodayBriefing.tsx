import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { DailyLoadCard } from '../daily-load/DailyLoadCard';
import { LoadMeter } from '../daily-load/LoadMeter';
import { LifeStatusSummary } from '../life/LifeStatusSummary';
import { OneMoveCard } from '../one-move/OneMoveCard';
import { useOneMove } from '../../store/OneMoveContext';
import { TalkItOutEntry } from '../talk-it-out/TalkItOutEntry';
import { spacing } from '../../design/tokens';
import { HandledLedger } from './HandledLedger';
import type { SectionKey, TodayReady, TodayView } from './model';
import { NeedsMeChip } from './NeedsMeChip';
import { TimelineList } from './TimelineList';
import { TodayDisclosure } from './TodayDisclosure';
import { TodayHeader } from './TodayHeader';
import { TodayList } from './TodayList';
import { TodayMatters } from './TodayMatters';
import { TodayStateNotice } from './TodayStateNotice';
import { PersistenceNotice } from './PersistenceNotice';

/**
 * The Today screen body: one projection, rendered in the order the projection composed.
 *
 * There is no layout logic here that is not in the view model. Which sections exist, their
 * order and their level (primary or secondary) were decided by `buildTodayView`; this maps
 * each to its component and nothing else. A section the day has nothing to say about is not
 * in the composition, so it is not rendered — there are no empty boxes.
 */
export function TodayBriefing({ view }: { view: TodayView }) {
  // Completing today's move is an existing store action; the hook is called before any early return.
  const { complete } = useOneMove();

  if (view.availability === 'unknown') return <TodayStateNotice kind="unknown" />;

  if (view.availability === 'unavailable') {
    return (
      <View>
        <PersistenceNotice />
        <TodayStateNotice kind="unavailable" recoveryReason={view.recoveryReason} />
      </View>
    );
  }

  return (
    <>
      <TodayHeader view={view} />
      {view.load ? <LoadMeter load={view.load} note={view.capacityNote} /> : null}
      {view.composition.map(({ key }) => {
        const section = renderSection(key, view, complete);
        return section ? (
          <View key={key} style={styles.block}>
            {section}
          </View>
        ) : null;
      })}
      <TalkItOutEntry />
    </>
  );
}

function renderSection(key: SectionKey, view: TodayReady, completeOneMove: () => void) {
  switch (key) {
    case 'sparse':
      return view.sparse ? <TodayStateNotice kind={view.sparse.kind} entry={view.sparse.entry} /> : null;
    case 'decision':
      return <DailyLoadCard />;
    case 'matters':
      return view.matters ? <TodayMatters section={view.matters} /> : null;
    case 'oneMove':
      return view.oneMove ? <OneMoveCard section={view.oneMove} onComplete={completeOneMove} /> : null;
    case 'upcoming':
      return view.upcoming ? (
        <TodayList
          title="Coming up"
          rows={[
            {
              key: 'upcoming',
              text: view.upcoming.statement,
              onPress: view.upcoming.route ? () => router.push(view.upcoming!.route!) : undefined,
              hint: view.upcoming.route ? 'Opens the thing to do first' : undefined,
            },
          ]}
        />
      ) : null;
    case 'canWait':
      return view.canWait ? (
        <TodayList
          title="Can wait today"
          rows={view.canWait.items.map((item) => ({ key: item.ref.id, text: item.title, onPress: () => router.push(item.route), hint: 'Opens it so you can check or change it' }))}
          moreRows={view.canWait.moreItems.map((item) => ({ key: item.ref.id, text: item.title, onPress: () => router.push(item.route), hint: 'Opens it so you can check or change it' }))}
        />
      ) : null;
    case 'onYourMind':
      return view.onYourMind ? <NeedsMeChip onYourMind={view.onYourMind} /> : null;
    case 'approved':
      return <HandledLedger />;
    case 'everything':
      return (
        <TodayDisclosure title="Everything today" summary={String(view.everythingCount)}>
          <TimelineList />
        </TodayDisclosure>
      );
    case 'alsoChecked':
      return <LifeStatusSummary />;
    // Attention, waiting and handled arrive with the responsibility / execution presentation (T5).
    case 'attention':
    case 'waiting':
    case 'handled':
      return null;
  }
}

const styles = StyleSheet.create({
  block: { marginBottom: spacing.xxl },
});
