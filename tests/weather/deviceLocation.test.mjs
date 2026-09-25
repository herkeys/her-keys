/**
 * Weather device-location behavior: the seam (`src/platform/deviceLocation.ts`) and the card (`WeatherContextCard`) driven against a
 * scripted device. Only the native/composition-root imports are stood in (see ./support); the seam and the card are the real files.
 * `architecture.test.mjs` proves the real production imports are intact and the privacy invariants hold in source.
 */
import assert from 'node:assert/strict';
import { afterEach, beforeEach, describe, test } from 'node:test';
import React from 'react';
import TestRenderer from 'react-test-renderer';

await import('./support/register-weather-stubs.mjs');
const device = await import('./support/expo-location-stub.mjs');
const rn = await import('./support/rn-weather-stub.mjs');
const store = await import('./support/weather-store-stub.mjs');
const seam = await import('../../src/platform/deviceLocation.ts');
const { WeatherContextCard } = await import('../../src/features/today/WeatherContextCard.tsx');

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

const FORBIDDEN = [
  'watchPositionAsync', 'watchHeadingAsync', 'startLocationUpdatesAsync', 'startGeofencingAsync',
  'requestBackgroundPermissionsAsync', 'getBackgroundPermissionsAsync', 'requestPermissionsAsync',
  'reverseGeocodeAsync', 'geocodeAsync',
];
const called = (name) => device.calls.filter((call) => call.name === name).length;
const GRANTED = { status: 'granted', granted: true, canAskAgain: true, expires: 'never' };
const DENIED_ASK = { status: 'denied', granted: false, canAskAgain: true, expires: 'never' };
const DENIED_BLOCKED = { status: 'denied', granted: false, canAskAgain: false, expires: 'never' };

// The seam scenarios below share one process, so the "never" list is asserted after every test, not once at the end.
beforeEach(() => {
  device.resetDevice();
  store.resetWorld();
  rn.linkingCalls.length = 0;
  rn.appStateHandlers.length = 0;
});
const mounted = [];
afterEach(() => {
  // A failing test must not leave the card's 30-minute interval alive (it would keep the test process from exiting).
  for (const renderer of mounted.splice(0)) TestRenderer.act(() => renderer.unmount());
  for (const name of FORBIDDEN) assert.equal(called(name), 0, `${name} must never be called`);
});

async function mount() {
  let renderer;
  await TestRenderer.act(async () => {
    renderer = TestRenderer.create(React.createElement(WeatherContextCard));
  });
  mounted.push(renderer);
  await settle();
  return renderer;
}
const settle = () => TestRenderer.act(async () => { await new Promise((resolve) => setImmediate(resolve)); });
const text = (renderer) => JSON.stringify(renderer.toJSON());
const press = async (renderer, label) => {
  const target = renderer.root.findAll((node) => node.props.accessibilityRole === 'button' && node.props.accessibilityLabel === label)[0];
  assert.ok(target, `button "${label}" is rendered`);
  await TestRenderer.act(async () => { target.props.onPress(); });
  await settle();
};

describe('deviceLocation seam', () => {
  test('importing the seam and the card touches no native location API', () => {
    assert.deepEqual(device.calls, []);
  });

  test('silent read with undetermined permission asks for nothing', async () => {
    const result = await seam.readWeatherLocation();
    assert.deepEqual(result, { kind: 'permission-required' });
    assert.equal(called('requestForegroundPermissionsAsync'), 0);
    assert.equal(called('getCurrentPositionAsync'), 0);
  });

  test('silent read after a denial never re-prompts, in either denial state', async () => {
    device.device.permission = DENIED_ASK;
    assert.deepEqual(await seam.readWeatherLocation(), { kind: 'permission-denied', canAskAgain: true });
    device.device.permission = DENIED_BLOCKED;
    assert.deepEqual(await seam.readWeatherLocation(), { kind: 'permission-denied', canAskAgain: false });
    assert.equal(called('requestForegroundPermissionsAsync'), 0);
  });

  test('an explicit request shows the foreground prompt once, then takes one low-accuracy, ~1 km-rounded fix', async () => {
    const result = await seam.requestWeatherLocation();
    assert.deepEqual(result, { kind: 'ready', latitude: 35.23, longitude: -80.84 });
    assert.equal(called('requestForegroundPermissionsAsync'), 1);
    const fix = device.calls.find((call) => call.name === 'getCurrentPositionAsync');
    assert.equal(fix.options.accuracy, device.Accuracy.Low);
  });

  test('an explicit request after a denial the OS will not repeat does not prompt', async () => {
    device.device.permission = DENIED_BLOCKED;
    assert.deepEqual(await seam.requestWeatherLocation(), { kind: 'permission-denied', canAskAgain: false });
    assert.equal(called('requestForegroundPermissionsAsync'), 0);
  });

  test('an explicit retry after a denial the OS will still repeat does prompt, and a second denial is reported', async () => {
    device.device.permission = DENIED_ASK;
    device.device.onRequest = DENIED_BLOCKED;
    assert.deepEqual(await seam.requestWeatherLocation(), { kind: 'permission-denied', canAskAgain: false });
    assert.equal(called('requestForegroundPermissionsAsync'), 1);
    assert.equal(called('getCurrentPositionAsync'), 0);
  });

  test('a recent last-known fix is used without waking the location hardware; it is bounded in age and accuracy', async () => {
    device.device.permission = GRANTED;
    device.device.lastKnown = { coords: { latitude: 40.7128, longitude: -74.006 } };
    assert.deepEqual(await seam.readWeatherLocation(), { kind: 'ready', latitude: 40.71, longitude: -74.01 });
    assert.equal(called('getCurrentPositionAsync'), 0);
    const options = device.calls.find((call) => call.name === 'getLastKnownPositionAsync').options;
    assert.ok(options.maxAge > 0 && options.maxAge <= 60 * 60_000);
    assert.ok(options.requiredAccuracy > 0 && options.requiredAccuracy <= 20_000);
  });

  test('location services switched off is unavailable, not an error and not a prompt', async () => {
    device.device.permission = GRANTED;
    device.device.servicesEnabled = false;
    assert.deepEqual(await seam.readWeatherLocation(), { kind: 'unavailable', reason: 'location_services_disabled' });
  });

  test('a failed fix is unavailable and carries no coordinates or native detail', async () => {
    device.device.permission = GRANTED;
    device.device.currentFails = true;
    const result = await seam.readWeatherLocation();
    assert.deepEqual(result, { kind: 'unavailable', reason: 'location_unavailable' });
  });

  test('Open Settings goes to the OS settings page', async () => {
    await seam.openLocationSettings();
    assert.deepEqual(rn.linkingCalls, ['openSettings']);
  });
});

describe('Weather card', () => {
  test('before any user action: a calm optional entry point, no native prompt, no Weather request', async () => {
    const renderer = await mount();
    assert.match(text(renderer), /Use my location/);
    assert.match(text(renderer), /Local weather can help Her Keys plan around your day/);
    assert.equal(called('requestForegroundPermissionsAsync'), 0);
    assert.equal(store.world.weatherCalls.length, 0);
  });

  test('a signed-out / not-account-bound user gets no card and no location read at all', async () => {
    store.world.accountKind = 'localOnly';
    const renderer = await mount();
    assert.equal(renderer.toJSON(), null);
    assert.deepEqual(device.calls, []);
    assert.equal(store.world.weatherCalls.length, 0);
  });

  test('tap → grant → Weather · Near you, with attribution and sources, and only coarse coordinates sent', async () => {
    store.world.weatherResult = { kind: 'ready', value: store.SNAPSHOT };
    const renderer = await mount();
    await press(renderer, 'Use my location');

    assert.equal(called('requestForegroundPermissionsAsync'), 1);
    assert.equal(store.world.weatherCalls.length, 1);
    assert.deepEqual(store.world.weatherCalls[0], {
      latitude: 35.23,
      longitude: -80.84,
      timezone: 'America/New_York', // the household/user timezone, not the device's
      language: 'en-US',
    });
    assert.ok(!('countryCode' in store.world.weatherCalls[0]), 'no country code: nothing is reverse-geocoded');

    const shown = text(renderer);
    assert.match(shown, /Weather · Near you/i);
    assert.match(shown, /Partly Cloudy/);
    assert.match(shown, /68° now/);
    assert.match(shown, /high 77° · low 59°/);
    assert.match(shown, /Rain likely/);
    assert.match(shown, /weather-data\.apple\.com\/assets\/logo\.png/); // Apple Weather attribution mark
    assert.match(shown, /Weather sources/);
    assert.doesNotMatch(shown, /35\.2|80\.8/, 'no coordinate is ever rendered');
  });

  test('Weather sources opens the provider attribution link', async () => {
    store.world.weatherResult = { kind: 'ready', value: store.SNAPSHOT };
    const renderer = await mount();
    await press(renderer, 'Use my location');
    await press(renderer, 'Weather sources');
    assert.deepEqual(rn.linkingCalls, ['openURL:https://weatherkit.apple.com/legal-attribution.html']);
  });

  test('a denial the OS will repeat: no Weather request, no error, an explicit retry that prompts again', async () => {
    device.device.onRequest = DENIED_ASK;
    const renderer = await mount();
    await press(renderer, 'Use my location');
    assert.equal(store.world.weatherCalls.length, 0);
    assert.match(text(renderer), /Weather stays off without your location/);
    assert.doesNotMatch(text(renderer), /error|failed|wrong/i);
    assert.equal(called('requestForegroundPermissionsAsync'), 1);

    await press(renderer, 'Use my location');
    assert.equal(called('requestForegroundPermissionsAsync'), 2, 'the retry is an explicit press');
  });

  test('a permanent denial offers Settings and never prompts — not on mount, not on refresh, not on a press', async () => {
    device.device.permission = DENIED_BLOCKED;
    const renderer = await mount();
    assert.match(text(renderer), /Open Settings/);
    assert.doesNotMatch(text(renderer), /Use my location/);

    await TestRenderer.act(async () => { for (const handler of [...rn.appStateHandlers]) handler('active'); });
    await settle();
    assert.equal(called('requestForegroundPermissionsAsync'), 0);

    await press(renderer, 'Open Settings');
    assert.deepEqual(rn.linkingCalls, ['openSettings']);
    assert.equal(called('requestForegroundPermissionsAsync'), 0);
    assert.equal(store.world.weatherCalls.length, 0);
  });

  test('location services off, with no button press: the card is simply absent and nothing is requested', async () => {
    device.device.permission = GRANTED;
    device.device.servicesEnabled = false;
    const renderer = await mount();
    assert.equal(renderer.toJSON(), null);
    assert.equal(store.world.weatherCalls.length, 0);
  });

  test('location unavailable after she pressed the button: a quiet, truthful line and a way to retry', async () => {
    device.device.onRequest = GRANTED;
    device.device.servicesEnabled = false;
    const renderer = await mount();
    await press(renderer, 'Use my location');
    assert.match(text(renderer), /isn't available right now/);
    assert.match(text(renderer), /Try again/);
    assert.equal(store.world.weatherCalls.length, 0);
  });

  test('a Weather provider failure renders nothing and manufactures no forecast', async () => {
    device.device.permission = GRANTED;
    store.world.weatherResult = { kind: 'unavailable', reason: 'function_unavailable' };
    const renderer = await mount();
    assert.equal(store.world.weatherCalls.length, 1);
    assert.equal(renderer.toJSON(), null);
  });

  test('granted permission: returning to the foreground refreshes location then Weather, without prompting', async () => {
    device.device.permission = GRANTED;
    store.world.weatherResult = { kind: 'ready', value: store.SNAPSHOT };
    const renderer = await mount();
    assert.equal(store.world.weatherCalls.length, 1);

    await TestRenderer.act(async () => { for (const handler of [...rn.appStateHandlers]) handler('active'); });
    await settle();
    assert.equal(store.world.weatherCalls.length, 2);
    assert.equal(called('requestForegroundPermissionsAsync'), 0);
  });

  test('a foreground return with no permission does nothing automatically', async () => {
    const renderer = await mount();
    await TestRenderer.act(async () => { for (const handler of [...rn.appStateHandlers]) handler('active'); });
    await settle();
    assert.equal(called('requestForegroundPermissionsAsync'), 0);
    assert.equal(store.world.weatherCalls.length, 0);
  });

  test('permission revoked in Settings while the app is open: the next refresh drops Weather instead of reusing stale coordinates', async () => {
    device.device.permission = GRANTED;
    store.world.weatherResult = { kind: 'ready', value: store.SNAPSHOT };
    const renderer = await mount();
    assert.match(text(renderer), /Weather · Near you/i);

    device.device.permission = DENIED_BLOCKED;
    await TestRenderer.act(async () => { for (const handler of [...rn.appStateHandlers]) handler('active'); });
    await settle();
    assert.doesNotMatch(text(renderer), /Weather · Near you/i);
    assert.match(text(renderer), /Open Settings/);
    assert.equal(store.world.weatherCalls.length, 1, 'no further Weather request after revocation');
  });

  test('unmounting stops the foreground subscription (no lingering refresh)', async () => {
    device.device.permission = GRANTED;
    const renderer = await mount();
    assert.equal(rn.appStateHandlers.length, 1);
    await TestRenderer.act(async () => { renderer.unmount(); });
    assert.equal(rn.appStateHandlers.length, 0);
  });
});
