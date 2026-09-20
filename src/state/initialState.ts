import type { DataMode } from '../config/dataMode';
import { materializeDemoState } from '../data/seed/demoHousehold';
import { starterCategories } from '../domain/categories';
import { logicalDateAt } from '../domain/logicalDay';
import { initialOnboarding } from '../domain/onboarding';
import type { AppState } from '../domain/state';

/** A real household before intake: its identity and starter categories, and no facts about anyone. */
export function createEmptyState(timeZone: string): AppState {
  const householdId = 'household-1';
  return {
    origin: 'empty',
    household: { id: householdId, displayName: null, scope: 'household' },
    user: { id: 'user-1', displayName: null, timezone: timeZone, scope: 'personal' },
    children: [],
    categories: starterCategories(householdId),
    events: [],
    tasks: [],
    systems: [],
    meals: [],
    onboarding: initialOnboarding(),
    oneMoves: [],
    needsMe: [],
    discovery: null,
    actions: [],
    migrationEvidence: [],
    migrationLineage: [],
    sourceArtifacts: [],
    externalReferences: [],
    interpretations: [],
    observations: [],
    authorities: [],
    intents: [],
    decisions: [],
    executions: [],
    outcomes: [],
    people: [],
    responsibilities: [],
    dependencies: [],
    recurrences: [],
    goals: [],
    systemSteps: [],
    capacity: null,
    patterns: [],
    evidenceLinks: [],
  };
}

/** The state a first launch, a reset, or a recovery starts from. Demo mode re-anchors the demo to today. */
export function initialStateFor(mode: DataMode, { nowMs, timeZone }: { nowMs: number; timeZone: string }): AppState {
  if (mode === 'empty') return createEmptyState(timeZone);
  return materializeDemoState({ anchorDate: logicalDateAt(nowMs, timeZone), timeZone });
}
