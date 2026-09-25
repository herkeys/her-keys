/**
 * TEST-ONLY stand-in for `expo-location` (the real package ships raw native-module TypeScript that plain node cannot load).
 *
 * It is a scripted device, not a fake feature: tests set `device` (permission, services, cached/current fix) and read `calls` to prove
 * exactly which native entry points the seam touched. Every API Her Keys must NEVER use (watchers, background, geofencing, geocoding,
 * the deprecated combined permission calls) is exported too, records the call, and throws — so a regression that starts using one
 * fails loudly instead of silently working against a stub that did not know about it.
 */
export const Accuracy = { Lowest: 1, Low: 2, Balanced: 3, High: 4, Highest: 5, BestForNavigation: 6 };

export const calls = [];
export const device = {
  permission: { status: 'undetermined', granted: false, canAskAgain: true, expires: 'never' },
  /** What the system prompt resolves to when the seam asks. */
  onRequest: { status: 'granted', granted: true, canAskAgain: true, expires: 'never' },
  servicesEnabled: true,
  lastKnown: null,
  current: { coords: { latitude: 35.227087, longitude: -80.843127 } },
  currentFails: false,
};

export function resetDevice() {
  calls.length = 0;
  device.permission = { status: 'undetermined', granted: false, canAskAgain: true, expires: 'never' };
  device.onRequest = { status: 'granted', granted: true, canAskAgain: true, expires: 'never' };
  device.servicesEnabled = true;
  device.lastKnown = null;
  device.current = { coords: { latitude: 35.227087, longitude: -80.843127 } };
  device.currentFails = false;
}

export async function getForegroundPermissionsAsync() {
  calls.push({ name: 'getForegroundPermissionsAsync' });
  return device.permission;
}
export async function requestForegroundPermissionsAsync() {
  calls.push({ name: 'requestForegroundPermissionsAsync' });
  device.permission = device.onRequest;
  return device.permission;
}
export async function hasServicesEnabledAsync() {
  calls.push({ name: 'hasServicesEnabledAsync' });
  return device.servicesEnabled;
}
export async function getLastKnownPositionAsync(options) {
  calls.push({ name: 'getLastKnownPositionAsync', options });
  return device.lastKnown;
}
export async function getCurrentPositionAsync(options) {
  calls.push({ name: 'getCurrentPositionAsync', options });
  if (device.currentFails) throw new Error('position unavailable');
  return device.current;
}

const forbidden = (name) => async () => {
  calls.push({ name });
  throw new Error(`${name} must never be called by Her Keys Weather`);
};
export const watchPositionAsync = forbidden('watchPositionAsync');
export const watchHeadingAsync = forbidden('watchHeadingAsync');
export const startLocationUpdatesAsync = forbidden('startLocationUpdatesAsync');
export const startGeofencingAsync = forbidden('startGeofencingAsync');
export const requestBackgroundPermissionsAsync = forbidden('requestBackgroundPermissionsAsync');
export const getBackgroundPermissionsAsync = forbidden('getBackgroundPermissionsAsync');
export const requestPermissionsAsync = forbidden('requestPermissionsAsync');
export const reverseGeocodeAsync = forbidden('reverseGeocodeAsync');
export const geocodeAsync = forbidden('geocodeAsync');
