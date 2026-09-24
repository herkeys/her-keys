import { importPKCS8, SignJWT } from 'npm:jose@6.1.0';
import { AuthError, requireUser } from '../_shared/supabaseAdmin.ts';
import { json, options, safeMessage } from '../_shared/http.ts';

type Body = {
  latitude?: unknown;
  longitude?: unknown;
  timezone?: unknown;
  countryCode?: unknown;
  language?: unknown;
};

type AppleMetadata = {
  attributionURL?: string;
  expireTime?: string;
  providerLogo?: string;
  providerName?: string;
  readTime?: string;
};

function configured(): boolean {
  return ['WEATHERKIT_TEAM_ID', 'WEATHERKIT_SERVICE_ID', 'WEATHERKIT_KEY_ID', 'WEATHERKIT_PRIVATE_KEY_P8']
    .every((name) => Boolean(Deno.env.get(name)));
}

function normalizePrivateKey(value: string): string {
  return value.includes('\\n') ? value.replace(/\\n/g, '\n') : value;
}

async function developerToken(): Promise<string> {
  const teamId = Deno.env.get('WEATHERKIT_TEAM_ID')!;
  const serviceId = Deno.env.get('WEATHERKIT_SERVICE_ID')!;
  const keyId = Deno.env.get('WEATHERKIT_KEY_ID')!;
  const privateKey = await importPKCS8(normalizePrivateKey(Deno.env.get('WEATHERKIT_PRIVATE_KEY_P8')!), 'ES256');

  // Apple explicitly requires only iss/iat/exp/sub claims and alg/kid/id headers.
  return await new SignJWT({})
    .setProtectedHeader({ alg: 'ES256', kid: keyId, id: `${teamId}.${serviceId}` })
    .setIssuer(teamId)
    .setSubject(serviceId)
    .setIssuedAt()
    .setExpirationTime('30m')
    .sign(privateKey);
}

function finite(value: unknown, min: number, max: number): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max ? value : null;
}

function stringValue(value: unknown, max = 128): string | null {
  return typeof value === 'string' && value.length > 0 && value.length <= max ? value : null;
}

function numeric(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function object(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function list(value: unknown): Record<string, unknown>[] {
  return Array.isArray(value) ? value.map(object) : [];
}

/**
 * Keep WeatherKit data ephemeral and normalize only the fields Her Keys needs
 * for context. We do not persist, prefetch in bulk, or build a weather database.
 */
function normalizeWeather(payload: unknown) {
  const root = object(payload);
  const current = object(root.currentWeather);
  const currentMetadata = object(current.metadata) as AppleMetadata & Record<string, unknown>;
  const daily = object(root.forecastDaily);
  const hourly = object(root.forecastHourly);

  return {
    provider: 'weatherkit',
    fetchedAt: new Date().toISOString(),
    attribution: {
      providerName: stringValue(currentMetadata.providerName) ?? 'Apple Weather',
      attributionURL: stringValue(currentMetadata.attributionURL, 2048),
      providerLogo: stringValue(currentMetadata.providerLogo, 2048),
    },
    metadata: {
      readTime: stringValue(currentMetadata.readTime),
      expireTime: stringValue(currentMetadata.expireTime),
    },
    current: {
      asOf: stringValue(current.asOf) ?? stringValue(currentMetadata.readTime),
      conditionCode: stringValue(current.conditionCode),
      temperatureC: numeric(current.temperature),
      apparentTemperatureC: numeric(current.temperatureApparent),
      daylight: typeof current.daylight === 'boolean' ? current.daylight : null,
    },
    daily: list(daily.days).slice(0, 10).map((day) => ({
      forecastStart: stringValue(day.forecastStart),
      forecastEnd: stringValue(day.forecastEnd),
      conditionCode: stringValue(day.conditionCode),
      temperatureMinC: numeric(day.temperatureMin),
      temperatureMaxC: numeric(day.temperatureMax),
      precipitationChance: numeric(day.precipitationChance),
      precipitationType: stringValue(day.precipitationType),
    })),
    hourly: list(hourly.hours).slice(0, 25).map((hour) => ({
      forecastStart: stringValue(hour.forecastStart),
      conditionCode: stringValue(hour.conditionCode),
      temperatureC: numeric(hour.temperature),
      precipitationChance: numeric(hour.precipitationChance),
      precipitationType: stringValue(hour.precipitationType),
    })),
  };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return options();
  if (req.method !== 'POST') return json({ error: 'method_not_allowed' }, 405);

  try {
    await requireUser(req);
    if (!configured()) {
      return json({ status: 'unavailable', reason: 'weatherkit_not_configured' }, 503);
    }

    const body = await req.json() as Body;
    const latitude = finite(body.latitude, -90, 90);
    const longitude = finite(body.longitude, -180, 180);
    const timezone = stringValue(body.timezone, 64);
    const countryCode = stringValue(body.countryCode, 2)?.toUpperCase() ?? null;
    const language = stringValue(body.language, 35) ?? 'en-US';

    if (latitude === null || longitude === null || timezone === null) {
      return json({ error: 'invalid_location' }, 400);
    }

    const url = new URL(`https://weatherkit.apple.com/api/v1/weather/${encodeURIComponent(language)}/${latitude}/${longitude}`);
    url.searchParams.set('dataSets', 'currentWeather,forecastDaily,forecastHourly');
    url.searchParams.set('timezone', timezone);
    if (countryCode) url.searchParams.set('countryCode', countryCode);

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${await developerToken()}` },
    });

    if (!response.ok) {
      const providerStatus = response.status;
      return json(
        { status: 'unavailable', reason: providerStatus === 401 ? 'weatherkit_auth_failed' : 'weatherkit_request_failed', providerStatus },
        providerStatus === 401 ? 503 : 502,
      );
    }

    return json({ status: 'ready', weather: normalizeWeather(await response.json()) });
  } catch (error) {
    if (error instanceof AuthError) return json({ error: 'unauthorized' }, 401);
    return json({ status: 'unavailable', reason: 'weatherkit_internal_error', detail: safeMessage(error) }, 500);
  }
});
