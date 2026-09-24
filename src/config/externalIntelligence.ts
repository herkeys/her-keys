export interface WeatherAnchorConfig {
  latitude: number;
  longitude: number;
  countryCode: string | null;
  label: string | null;
}

function finiteEnv(name: string, min: number, max: number): number | null {
  const raw = process.env[name];
  if (!raw) return null;
  const value = Number(raw);
  return Number.isFinite(value) && value >= min && value <= max ? value : null;
}

/**
 * Prototype weather anchor only. These values are non-secret and deliberately
 * separate from household truth. Production can later replace this source with
 * a user-approved home area or explicit destination without changing WeatherKit.
 */
export const weatherAnchorConfig: WeatherAnchorConfig | null = (() => {
  const latitude = finiteEnv('EXPO_PUBLIC_WEATHER_ANCHOR_LATITUDE', -90, 90);
  const longitude = finiteEnv('EXPO_PUBLIC_WEATHER_ANCHOR_LONGITUDE', -180, 180);
  if (latitude === null || longitude === null) return null;

  const country = process.env.EXPO_PUBLIC_WEATHER_ANCHOR_COUNTRY_CODE?.trim().toUpperCase() ?? '';
  const label = process.env.EXPO_PUBLIC_WEATHER_ANCHOR_LABEL?.trim() ?? '';
  return {
    latitude,
    longitude,
    countryCode: /^[A-Z]{2}$/.test(country) ? country : null,
    label: label || null,
  };
})();
