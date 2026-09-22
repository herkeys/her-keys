import { Screen } from '../../src/design/components';
import { TodayBriefing } from '../../src/features/today/TodayBriefing';
import { useTodayView } from '../../src/features/today/useTodayView';

/**
 * Today — the household chief-of-staff briefing. The route stays what it always was: the
 * first tab, behind the `(app)` guard. Everything on it comes from one pure projection of
 * canonical local state (`buildTodayView`); the screen renders it and decides nothing.
 */
export default function TodayScreen() {
  const view = useTodayView();
  return (
    <Screen>
      <TodayBriefing view={view} />
    </Screen>
  );
}
