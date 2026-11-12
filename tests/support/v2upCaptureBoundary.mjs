// Stand-ins for TalkItOutContext's runtime imports, for the V2UP-B capture-turn tests: the household store (identity binding and
// household id are all the conversation fence reads), the AI client, and a capture coordinator whose `submit` the test controls.
export const fixture = {
  snapshot: { identity: { binding: { accountId: 'a', householdId: 'ha', boundAt: 't1' } }, state: { household: { id: 'ha' }, discovery: null } },
  writes: 0,
  submits: [],
  /** What `coordinator.submit` does: a test replaces it with something deferred. */
  submit: async () => ({ kind: 'captured', captureId: 'cap-a', readingIds: ['r1'], duplicate: false, failure: null, unsupported: [] }),
  call: async () => ({ kind: 'unavailable' }),
};
const listeners = new Set();
export const store = {
  getSnapshot: () => fixture.snapshot,
  dispatch: () => {
    fixture.writes += 1;
  },
  subscribe: (fn) => {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },
  notify: () => {
    for (const fn of listeners) fn();
  },
};
export const useAppStore = () => store;
export const useHouseholdState = () => ({ state: fixture.snapshot.state ?? { discovery: null } });
export const CaptureProvider = ({ children }) => children;
export const useCapture = () => ({
  coordinator: {
    // The reader "recognised" something, so a message is routed to capture (routing.ts).
    preview: () => ({ failure: null, proposals: [{}], unsupported: [] }),
    submit: (input) => {
      fixture.submits.push(input);
      return fixture.submit(input);
    },
  },
});
export const herKeysAiClient = { advance: (...args) => fixture.call(...args) };

// Stand-ins for TalkItOutView's own heavy imports (navigation, the capture cards, the report panel), so the composer can be mounted alone.
export const router = { push: () => undefined };
export const CaptureGroup = () => null;
export const AiReportPanel = () => null;
