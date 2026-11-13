export const noticeFixture = { namespace: null, snapshot: { recovery: null, persistenceDegraded: false } };
export const useAccount = () => ({ syncNamespace: noticeFixture.namespace });
export const useStoreSnapshot = () => noticeFixture.snapshot;
export const usePremiumStateIfMounted = () => null;
export const usePremiumHome = () => { throw Error('Presentational notice test must not start billing'); };
