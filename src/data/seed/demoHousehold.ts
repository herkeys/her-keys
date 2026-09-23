import { starterCategories } from '../../domain/categories';
import { emptyEventFacets, emptyMealFacets, emptySystemFacets, emptyTaskFacets } from '../../domain/foundation/commitment';
import type { CareerOpportunity } from '../../domain/foundation/opportunity';
import type { Dependency } from '../../domain/foundation/structure';
import { demoProvenance } from '../../domain/foundation/provenance';
import { addDays, addYears, toInstant, zonedTimeToEpochMs, type LocalDate } from '../../domain/logicalDay';
import { initialOnboarding } from '../../domain/onboarding';
import type { AppState, CalendarEvent, Child, HouseholdSystem, MealPlanEntry, Task, VisibilityScope } from '../../domain/state';

/**
 * Entirely fictional household used to demonstrate Her Keys. No real person's
 * data is represented here, and it is only ever loaded in demo mode.
 *
 * The scenario is written relative to an anchor day so it never goes stale:
 * a normal-looking day that is actually too tight once the flexible tasks
 * scheduled into the pickup -> soccer window are accounted for. Materializing
 * turns it into absolute dates in the household's timezone; after that the
 * stored dates are the truth. Ids never change, whatever the anchor.
 */

export const DEMO_HOUSEHOLD_ID = 'hh-1';
export const DEMO_USER_ID = 'user-1';

const at = (hour: number, minute = 0) => hour * 60 + minute;

const category = {
  kids: 'cat-kids',
  home: 'cat-home',
  money: 'cat-money',
  meals: 'cat-meals',
  work: 'cat-work',
} as const;

interface EventTemplate {
  id: string;
  title: string;
  categoryId: string;
  subjectMemberId: string | null;
  dayOffset: number;
  startMinutes: number;
  endMinutes: number;
  location: string | null;
  commitment: 'fixed' | 'flexible';
  scope: VisibilityScope;
}

const eventTemplates: EventTemplate[] = [
  { id: 'evt-1', title: 'Team status call', categoryId: category.work, subjectMemberId: DEMO_USER_ID, dayOffset: 0, startMinutes: at(9), endMinutes: at(9, 30), location: null, commitment: 'fixed', scope: 'professional' },
  { id: 'evt-2', title: 'Pick up Josie & Theo', categoryId: category.kids, subjectMemberId: DEMO_USER_ID, dayOffset: 0, startMinutes: at(15), endMinutes: at(15, 15), location: 'Lincoln Elementary', commitment: 'fixed', scope: 'household' },
  { id: 'evt-3', title: "Josie's soccer practice", categoryId: category.kids, subjectMemberId: 'child-1', dayOffset: 0, startMinutes: at(16, 30), endMinutes: at(17, 30), location: 'Riverside Field', commitment: 'fixed', scope: 'child' },
  { id: 'evt-4', title: 'Dinner', categoryId: category.meals, subjectMemberId: DEMO_USER_ID, dayOffset: 0, startMinutes: at(18, 30), endMinutes: at(19, 15), location: null, commitment: 'flexible', scope: 'household' },
];

interface TaskTemplate extends Omit<Task, 'dueDate' | 'plan' | 'status' | 'notes' | 'completedAt' | 'createdAt' | 'updatedAt' | 'provenance' | keyof ReturnType<typeof emptyTaskFacets>> {
  dueDayOffset: number | null;
  timed: { dayOffset: number; startMinutes: number } | null;
}

const taskTemplates: TaskTemplate[] = [
  { id: 'task-1', title: 'Pay orthodontist invoice', categoryId: category.money, subjectMemberId: null, durationMinutes: 10, durationSource: 'user', commitment: 'fixed', dueDayOffset: 0, timed: null, scope: 'household' },
  { id: 'task-2', title: 'Return library books', categoryId: category.home, subjectMemberId: null, durationMinutes: 30, durationSource: 'user', commitment: 'flexible', dueDayOffset: null, timed: { dayOffset: 0, startMinutes: at(15, 20) }, scope: 'household' },
  { id: 'task-3', title: "Email Josie's teacher about the field trip form", categoryId: category.kids, subjectMemberId: 'child-1', durationMinutes: 10, durationSource: 'user', commitment: 'flexible', dueDayOffset: null, timed: { dayOffset: 0, startMinutes: at(15, 55) }, scope: 'child' },
];

const childTemplates = [
  { id: 'child-1', displayName: 'Josie', age: 8, daysSinceBirthday: 120 },
  { id: 'child-2', displayName: 'Theo', age: 5, daysSinceBirthday: 40 },
];

const systems: Array<Omit<HouseholdSystem, 'provenance' | keyof ReturnType<typeof emptySystemFacets>>> = [
  { id: 'sys-1', name: 'Backpack landing zone', description: 'One basket by the door catches backpacks and shoes before they spread through the house.', categoryId: category.home, subjectMemberId: null, scope: 'household' },
  { id: 'sys-2', name: 'Sunday reset', description: '20 minutes each Sunday to reset shared spaces before the week starts.', categoryId: category.home, subjectMemberId: null, scope: 'household' },
  { id: 'sys-3', name: 'Bill envelope', description: 'Paper bills get sorted into a single envelope every Sunday instead of scattering across the counter.', categoryId: category.money, subjectMemberId: null, scope: 'household' },
  { id: 'sys-4', name: 'Autopay for utilities', description: 'Electric, water, and internet are on autopay — one less thing to track.', categoryId: category.money, subjectMemberId: null, scope: 'household' },
];

const mealTemplates = [
  { id: 'meal-1', dayOffset: 0, title: 'Sheet-pan chicken and vegetables' },
  { id: 'meal-2', dayOffset: 1, title: 'Leftovers night' },
  { id: 'meal-3', dayOffset: 2, title: 'Tacos' },
];

export function materializeDemoState({ anchorDate, timeZone }: { anchorDate: LocalDate; timeZone: string }): AppState {
  const instantOn = (dayOffset: number, minutes: number) =>
    toInstant(zonedTimeToEpochMs(addDays(anchorDate, dayOffset), minutes, timeZone));

  const events: CalendarEvent[] = eventTemplates.map(({ dayOffset, startMinutes, endMinutes, ...event }) => ({
    ...event,
    startsAt: instantOn(dayOffset, startMinutes),
    endsAt: instantOn(dayOffset, endMinutes),
    status: 'active',
    notes: null,
    travelMinutesBefore: null,
    travelMinutesAfter: null,
    preparationMinutes: null,
    ...emptyEventFacets(),
    provenance: demoProvenance(),
    createdAt: null,
    updatedAt: null,
  }));

  const tasks: Task[] = taskTemplates.map(({ dueDayOffset, timed, ...task }) => ({
    ...task,
    dueDate: dueDayOffset === null ? null : addDays(anchorDate, dueDayOffset),
    plan: timed ? { kind: 'timed', startsAt: instantOn(timed.dayOffset, timed.startMinutes) } : { kind: 'unplanned' },
    status: 'open',
    notes: null,
    completedAt: null,
    createdAt: null,
    updatedAt: null,
    ...emptyTaskFacets(),
    provenance: demoProvenance(),
  }));

  // Birth dates that make each child the scripted age on the anchor day.
  const children: Child[] = childTemplates.map(({ age, daysSinceBirthday, ...child }) => ({
    ...child,
    birthDate: addDays(addYears(anchorDate, -age), -daysSinceBirthday),
    scope: 'child',
  }));

  // One career opportunity, with its next action as an ordinary Task linked through the same
  // Dependency mechanism a Goal's steps use (`relation: 'part_of'`) — never a second, opportunity-only
  // task shape, and never household-visible: both rows stay owner-private, matching the opportunity's scope.
  const opportunityTask: Task = {
    id: 'task-opp-1',
    title: 'Send follow-up email to Priya',
    categoryId: category.work,
    subjectMemberId: null,
    durationMinutes: 10,
    durationSource: 'user',
    commitment: 'flexible',
    dueDate: null,
    plan: { kind: 'unplanned' },
    notes: null,
    status: 'open',
    completedAt: null,
    createdAt: null,
    updatedAt: null,
    ...emptyTaskFacets(),
    provenance: demoProvenance(),
    scope: 'professional',
  };

  const careerOpportunities: CareerOpportunity[] = [
    {
      id: 'opp-1',
      title: 'Senior Analyst role at Brightline',
      organizationName: 'Brightline Data',
      opportunityType: 'job',
      stage: 'applied',
      closedReason: null,
      sourceNote: 'Found through a LinkedIn post',
      applicationDeadline: null,
      followUpDate: addDays(anchorDate, 3),
      contactName: 'Priya (recruiter)',
      compensationNote: null,
      notes: null,
      createdAt: instantOn(-2, at(9)),
      updatedAt: instantOn(-2, at(9)),
      stageChangedAt: instantOn(-2, at(9)),
      archivedAt: null,
      provenance: demoProvenance(),
      scope: 'personal',
    },
  ];

  const opportunityDependencies: Dependency[] = [
    {
      id: 'dep-opp-1',
      relation: 'part_of',
      from: { kind: 'task', id: 'task-opp-1' },
      to: { kind: 'opportunity', id: 'opp-1' },
      status: 'active',
      createdAt: instantOn(-2, at(9)),
      updatedAt: instantOn(-2, at(9)),
      provenance: demoProvenance(),
      scope: 'personal',
    },
  ];

  const meals: MealPlanEntry[] = mealTemplates.map(({ dayOffset, ...meal }) => ({
    ...meal,
    date: addDays(anchorDate, dayOffset),
    categoryId: category.meals,
    // The defaults a legacy row reads as: a live plan with no stated slot.
    slot: 'unspecified',
    status: 'active',
    ...emptyMealFacets(),
    provenance: demoProvenance(),
    scope: 'household',
  }));

  return {
    origin: 'demo',
    household: { id: DEMO_HOUSEHOLD_ID, displayName: 'The Ellis Household', scope: 'household' },
    user: { id: DEMO_USER_ID, displayName: 'Maren Ellis', timezone: timeZone, scope: 'personal' },
    children,
    categories: starterCategories(DEMO_HOUSEHOLD_ID, demoProvenance()),
    events,
    tasks: [...tasks, opportunityTask],
    systems: systems.map((system) => ({ ...system, ...emptySystemFacets(), provenance: demoProvenance() })),
    meals,
    onboarding: initialOnboarding(demoProvenance()),
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
    dependencies: opportunityDependencies,
    recurrences: [],
    goals: [],
    systemSteps: [],
    capacity: null,
    patterns: [],
    evidenceLinks: [],
    careerOpportunities,
  };
}
