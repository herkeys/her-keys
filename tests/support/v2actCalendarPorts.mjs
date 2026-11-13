/**
 * Controllable stand-ins for the two production modules the Google Calendar bridge reads at load time
 * (`store/AccountProvider` and the `store/accountRuntimeInstance` composition root), plus `expo-web-browser`.
 * Every provider call is recorded and answered only when the test settles it, so ordering races are explicit.
 * Nothing here pretends a live provider exists; tests decide each answer.
 */
export const calendarFixture = {
  account: null,
  calls: [],
  pending: [],
  reset() {
    this.account = null;
    this.calls.length = 0;
    this.pending.length = 0;
  },
  /** Settle the oldest unanswered call with the given name. */
  answer(name, value) {
    const index = this.pending.findIndex((p) => p.name === name);
    if (index < 0) throw new Error(`no pending ${name} call`);
    const [call] = this.pending.splice(index, 1);
    call.resolve(value);
    return call;
  },
  /** Settle a specific pending call (by its args predicate). */
  answerWhere(name, predicate, value) {
    const index = this.pending.findIndex((p) => p.name === name && predicate(p.args));
    if (index < 0) throw new Error(`no matching pending ${name} call`);
    const [call] = this.pending.splice(index, 1);
    call.resolve(value);
    return call;
  },
};

const deferred = (name) => (...args) => new Promise((resolve) => {
  calendarFixture.calls.push({ name, args });
  calendarFixture.pending.push({ name, args, resolve });
});

export const externalIntelligenceClient = {
  weather: deferred('weather'),
  calendarStatus: deferred('calendarStatus'),
  beginCalendarConnection: deferred('beginCalendarConnection'),
  listCalendars: deferred('listCalendars'),
  selectCalendars: deferred('selectCalendars'),
  calendarEvents: deferred('calendarEvents'),
  disconnectCalendar: deferred('disconnectCalendar'),
};

export const useOptionalAccount = () => calendarFixture.account;
export const useAccount = () => calendarFixture.account;

export const openAuthSessionAsync = async () => ({ type: 'dismiss' });
export const maybeCompleteAuthSession = () => ({ type: 'failed' });
export default { openAuthSessionAsync, maybeCompleteAuthSession };
