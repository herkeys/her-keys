export const fixture = { snapshot: { identity: { binding: { accountId: 'a', householdId: 'ha', boundAt: 't1' } }, state: { household: { id: 'ha' }, discovery: null } }, writes: 0, call: async () => ({kind:'unavailable'}) };
const listeners = new Set();
export const store = { getSnapshot: () => fixture.snapshot, dispatch: () => { fixture.writes++; }, subscribe: fn => { listeners.add(fn); return () => listeners.delete(fn); }, notify: () => { for(const fn of listeners) fn(); } };
export const useAppStore = () => store;
export const useHouseholdState = () => ({ state: fixture.snapshot.state });
export const CaptureProvider = ({children}) => children;
export const useCapture = () => ({coordinator:{preview:()=>null}});
export const herKeysAiClient = { advance: (...args) => fixture.call(...args) };

