/**
 * Test doubles for the consent gate's three outside dependencies: the consent ledger (the network), the account context (sign out)
 * and the local-notification provider (the permissions step). The gate itself is the real component.
 */
export const fixture = {
  /** Every session the gate asked the ledger to read with, in order. */
  reads: [],
  /** (session) => Promise<ConsentReadResult>. */
  read: async () => ({ kind: 'unavailable' }),
  record: async () => ({ kind: 'unavailable' }),
  signOutCalls: 0,
  signOut: async () => {},
};

export const createConsentLedger = (session) => ({
  read: () => {
    fixture.reads.push(session);
    return fixture.read(session);
  },
  record: (choices) => fixture.record(choices, session),
});

export const useAccount = () => ({
  signOut: () => {
    fixture.signOutCalls += 1;
    return fixture.signOut();
  },
});

export const useLocalNotifications = () => ({ busy: false, enable: async () => {} });
