/**
 * TEST-ONLY stand-in for the three store modules the Weather card imports (`AccountProvider`, `AppStateProvider`,
 * `accountRuntimeInstance` — the production composition root, which node cannot load). Nothing here is a Weather provider: the fake
 * client only records what the card sends and answers what the test scripts, so the tests can prove what leaves the card.
 */
export const world = {
  accountKind: 'accountBound',
  timezone: 'America/New_York',
  weatherCalls: [],
  weatherResult: { kind: 'unavailable', reason: 'function_unavailable' },
};

export function resetWorld() {
  world.accountKind = 'accountBound';
  world.timezone = 'America/New_York';
  world.weatherCalls.length = 0;
  world.weatherResult = { kind: 'unavailable', reason: 'function_unavailable' };
}

export const SNAPSHOT = {
  current: { conditionCode: 'PartlyCloudy', temperatureC: 20 },
  daily: [{ conditionCode: 'PartlyCloudy', temperatureMaxC: 25, temperatureMinC: 15, precipitationChance: 0.7, precipitationType: 'rain' }],
  attribution: {
    providerName: 'Apple Weather',
    providerLogo: 'https://weather-data.apple.com/assets/logo.png',
    attributionURL: 'https://weatherkit.apple.com/legal-attribution.html',
  },
};

export function useOptionalAccount() {
  return world.accountKind === null ? null : { state: { kind: world.accountKind } };
}

export function useHouseholdState() {
  return { state: { user: { timezone: world.timezone } }, today: '2026-09-25' };
}

export const externalIntelligenceClient = {
  async weather(input) {
    world.weatherCalls.push(input);
    return world.weatherResult;
  },
};
