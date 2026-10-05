/**
 * Test stand-in for `src/store/accountRuntimeInstance.ts`, for the welcome flow only (see ./register.mjs).
 *
 * The flow asks one thing of the composition root: which providers this device offers. A test sets that with
 * `offerProviders([...])` — `['apple', 'google']` is an iPhone, `['google']` is an Android phone.
 */
let offered = ['google'];

export function offerProviders(providers) {
  offered = [...providers];
}

export const accountProviders = {
  async available() {
    return [...offered];
  },
};
