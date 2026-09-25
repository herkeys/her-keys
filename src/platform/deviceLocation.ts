/**
 * Weather device-location seam — the ONLY file in Her Keys that touches `expo-location`.
 *
 * What it does: reads (and, only when the caller says the user just asked, requests) FOREGROUND location permission, then returns
 * one approximate position for the Weather request. What it never does: request Always/background authorization, start a watcher or
 * subscription, reverse-geocode, write a coordinate anywhere (state, storage, sync, logs, analytics), or fall back to a place it
 * invented. The coordinate is returned to the caller, used for one authenticated `weather-context` request, and dropped.
 *
 * Precision: Weather needs a neighbourhood, not a doorstep. Positions are requested at low accuracy (iOS reduced accuracy and Android
 * coarse-only are enough) and rounded to two decimals (~1 km) before they leave this module.
 */
import * as Location from 'expo-location';
import { Linking } from 'react-native';

export type WeatherLocationResult =
  | { kind: 'ready'; latitude: number; longitude: number }
  | { kind: 'permission-required' }
  | { kind: 'permission-denied'; canAskAgain: boolean }
  | { kind: 'unavailable'; reason: 'location_services_disabled' | 'location_unavailable' };

/** A last-known fix older than this is not "where she is now" — take a fresh low-accuracy fix instead. */
const LAST_KNOWN_MAX_AGE_MS = 30 * 60_000;
/** Reject a cached fix whose uncertainty radius is wider than a city district. */
const LAST_KNOWN_REQUIRED_ACCURACY_M = 10_000;
/** A single fix must not hang the card forever (a device with no fix simply has no Weather). */
const CURRENT_FIX_TIMEOUT_MS = 15_000;

function permissionResult(response: Location.LocationPermissionResponse): WeatherLocationResult | null {
  if (response.granted) return null;
  if (response.status === 'undetermined' && response.canAskAgain) return { kind: 'permission-required' };
  return { kind: 'permission-denied', canAskAgain: response.canAskAgain };
}

/** ~1 km. Coarse on purpose: the forecast does not change across a neighbourhood, and less precision is less exposure. */
function coarsen(value: number): number {
  return Math.round(value * 100) / 100;
}

function withTimeout<T>(work: Promise<T>, ms: number): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('location_timeout')), ms);
    work.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (error) => {
        clearTimeout(timer);
        reject(error);
      },
    );
  });
}

async function acquirePosition(): Promise<WeatherLocationResult> {
  try {
    if (!(await Location.hasServicesEnabledAsync())) {
      return { kind: 'unavailable', reason: 'location_services_disabled' };
    }
    const cached = await Location.getLastKnownPositionAsync({
      maxAge: LAST_KNOWN_MAX_AGE_MS,
      requiredAccuracy: LAST_KNOWN_REQUIRED_ACCURACY_M,
    });
    const fix =
      cached ??
      (await withTimeout(
        Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Low }),
        CURRENT_FIX_TIMEOUT_MS,
      ));
    const { latitude, longitude } = fix.coords;
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
      return { kind: 'unavailable', reason: 'location_unavailable' };
    }
    return { kind: 'ready', latitude: coarsen(latitude), longitude: coarsen(longitude) };
  } catch {
    // Deliberately no detail: nothing about the position or the failure is carried out of this module.
    return { kind: 'unavailable', reason: 'location_unavailable' };
  }
}

/**
 * Silent path — refreshes, foreground returns and the 30-minute tick. Reads the CURRENT permission and never prompts: if it is not
 * granted the result says so and nothing else happens.
 */
export async function readWeatherLocation(): Promise<WeatherLocationResult> {
  try {
    const blocked = permissionResult(await Location.getForegroundPermissionsAsync());
    if (blocked) return blocked;
  } catch {
    return { kind: 'unavailable', reason: 'location_unavailable' };
  }
  return acquirePosition();
}

/**
 * User-action path — call ONLY from a Weather button press. Shows the system foreground prompt at most once per press, and never when
 * the OS has already said it will not ask again (the caller offers Settings instead).
 */
export async function requestWeatherLocation(): Promise<WeatherLocationResult> {
  try {
    const current = await Location.getForegroundPermissionsAsync();
    if (!current.granted && current.canAskAgain) {
      const blocked = permissionResult(await Location.requestForegroundPermissionsAsync());
      if (blocked) return blocked;
    } else {
      const blocked = permissionResult(current);
      if (blocked) return blocked;
    }
  } catch {
    return { kind: 'unavailable', reason: 'location_unavailable' };
  }
  return acquirePosition();
}

/** Where a permanent denial is undone: the OS settings page for Her Keys. */
export async function openLocationSettings(): Promise<void> {
  try {
    await Linking.openSettings();
  } catch {
    // Nothing to recover: the card keeps its Open Settings action.
  }
}
