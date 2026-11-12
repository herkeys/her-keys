/**
 * Stand-ins for the modules around the Today seam, for tests/v2up.integration.today.test.mjs ONLY.
 *
 * That test renders the REAL TodayBriefing, FirstStepCard, DailyLoadCard and OneMoveCard on a REAL store. What it replaces are the
 * panels that need their own provider trees and belong to other features (account entry, Premium entries, weather, the Talk It Out
 * entry, the life summary, the handled ledger, the timeline, the sync/persistence notices) plus the two contexts FirstStepCard reads
 * (Onboarding choices and the Life Inbox count), which the test sets through `globalThis.__v2upSeam`.
 */
const none = () => null;

export const AccountEntry = none;
export const PremiumDailyLoadEntry = none;
export const LifeStatusSummary = none;
export const PremiumMomentumSection = none;
export const TalkItOutEntry = none;
export const HandledLedger = none;
export const TimelineList = none;
export const PersistenceNotice = none;
export const SyncNotice = none;
export const TomorrowReminderCard = none;
export const WeatherContextCard = none;

export const useOnboarding = () => ({ selected: { struggleIds: globalThis.__v2upSeam?.struggleIds ?? [] } });
export const useLifeInbox = () => globalThis.__v2upSeam?.inbox ?? { phase: 'empty' };
