import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState as NativeAppState, Image, Linking, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Overline } from '../../design/components';
import { color, spacing } from '../../design/tokens';
import type { WeatherSnapshot } from '../../external/types';
import {
  openLocationSettings,
  readWeatherLocation,
  requestWeatherLocation,
  type WeatherLocationResult,
} from '../../platform/deviceLocation';
import { useOptionalAccount } from '../../store/AccountProvider';
import { useHouseholdState } from '../../store/AppStateProvider';
import { externalIntelligenceClient } from '../../store/accountRuntimeInstance';

/**
 * Weather is optional and device-located: no permission, no Weather. `checking` and `unavailable` render nothing (Today carries on);
 * the other three states are the calm, explicit ways she can turn Weather on.
 */
type LocationAccess =
  | 'checking'
  | 'ready'
  | 'permission-required'
  | 'denied-can-ask'
  | 'denied-blocked'
  | 'unavailable'
  | 'unavailable-after-request';

function accessFor(location: WeatherLocationResult, askedNow: boolean): LocationAccess {
  switch (location.kind) {
    case 'ready':
      return 'ready';
    case 'permission-required':
      return 'permission-required';
    case 'permission-denied':
      return location.canAskAgain ? 'denied-can-ask' : 'denied-blocked';
    case 'unavailable':
      return askedNow ? 'unavailable-after-request' : 'unavailable';
  }
}

export function WeatherContextCard() {
  const account = useOptionalAccount();
  const { state } = useHouseholdState();
  const timezone = state.user.timezone;
  const bound = account?.state.kind === 'accountBound';
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);
  const [access, setAccess] = useState<LocationAccess>('checking');
  // Newest request wins; bumped on cleanup so a late answer for a stale effect is dropped.
  const sequence = useRef(0);
  // While the system prompt is up, the app goes inactive/active — that must not start a competing silent read.
  const promptOpen = useRef(false);

  /**
   * One location read → one Weather request. The coordinates live only in this closure: they are never put in state, storage,
   * a log or the sync path. `askedNow` is true only for the button press; every other caller is silent and can never prompt.
   */
  const refresh = useCallback(
    async (askedNow: boolean) => {
      if (!askedNow && promptOpen.current) return;
      const mine = ++sequence.current;
      if (askedNow) promptOpen.current = true;
      try {
        const location = askedNow ? await requestWeatherLocation() : await readWeatherLocation();
        if (mine !== sequence.current) return;
        if (location.kind !== 'ready') {
          setWeather(null);
          setAccess(accessFor(location, askedNow));
          return;
        }
        setAccess('ready');
        const result = await externalIntelligenceClient.weather({
          latitude: location.latitude,
          longitude: location.longitude,
          timezone,
          language: 'en-US',
        });
        if (mine !== sequence.current) return;
        setWeather(result.kind === 'ready' ? result.value : null);
      } finally {
        if (askedNow) promptOpen.current = false;
      }
    },
    [timezone],
  );

  useEffect(() => {
    if (!bound) {
      setWeather(null);
      setAccess('checking');
      return;
    }

    void refresh(false);
    const subscription = NativeAppState.addEventListener('change', (next) => {
      if (next === 'active') void refresh(false);
    });
    const timer = setInterval(() => void refresh(false), 30 * 60_000);

    return () => {
      sequence.current += 1;
      subscription.remove();
      clearInterval(timer);
    };
  }, [bound, refresh]);

  if (!bound) return null;

  if (access === 'permission-required') {
    return (
      <Card tone="subtle" style={styles.card}>
        <Overline>Weather</Overline>
        <AppText variant="body" color={color.text.secondary} style={styles.body}>
          Local weather can help Her Keys plan around your day. It uses your approximate location only while the app is open, and
          nothing is saved.
        </AppText>
        <View style={styles.footer}>
          <Button label="Use my location" variant="secondary" size="sm" onPress={() => void refresh(true)} />
        </View>
      </Card>
    );
  }

  if (access === 'denied-can-ask') {
    return (
      <Card tone="subtle" style={styles.card}>
        <Overline>Weather</Overline>
        <AppText variant="body" color={color.text.secondary} style={styles.body}>
          Weather stays off without your location. That is fine — Today works the same either way.
        </AppText>
        <View style={styles.footer}>
          <Button label="Use my location" variant="ghost" size="sm" onPress={() => void refresh(true)} />
        </View>
      </Card>
    );
  }

  if (access === 'denied-blocked') {
    return (
      <Card tone="subtle" style={styles.card}>
        <Overline>Weather</Overline>
        <AppText variant="body" color={color.text.secondary} style={styles.body}>
          Location is off for Her Keys, so Weather is off. You can turn it on in Settings whenever you like.
        </AppText>
        <View style={styles.footer}>
          <Button label="Open Settings" variant="ghost" size="sm" onPress={() => void openLocationSettings()} />
        </View>
      </Card>
    );
  }

  if (access === 'unavailable-after-request') {
    return (
      <Card tone="subtle" style={styles.card}>
        <Overline>Weather</Overline>
        <AppText variant="body" color={color.text.secondary} style={styles.body}>
          Your location isn't available right now, so Weather is off for the moment.
        </AppText>
        <View style={styles.footer}>
          <Button label="Try again" variant="ghost" size="sm" onPress={() => void refresh(true)} />
        </View>
      </Card>
    );
  }

  if (access !== 'ready' || weather === null) return null;

  const today = weather.daily[0] ?? null;
  const condition = humanCondition(weather.current.conditionCode ?? today?.conditionCode);
  const temperature = fahrenheit(weather.current.temperatureC);
  const high = fahrenheit(today?.temperatureMaxC ?? null);
  const low = fahrenheit(today?.temperatureMinC ?? null);
  const precip = precipitationPhrase(today?.precipitationChance ?? null, today?.precipitationType ?? null);
  const sourceUrl = weather.attribution.attributionURL;

  const details = [
    temperature === null ? null : `${temperature}° now`,
    high === null || low === null ? null : `high ${high}° · low ${low}°`,
    precip,
  ].filter(Boolean).join(' · ');

  return (
    <Card tone="subtle" style={styles.card}>
      <Overline>Weather · Near you</Overline>
      <AppText variant="sectionTitle" style={styles.title}>
        {condition || 'Forecast available'}
      </AppText>
      {details ? (
        <AppText variant="body" color={color.text.secondary} style={styles.body}>
          {details}
        </AppText>
      ) : null}
      <View style={styles.footer}>
        {weather.attribution.providerLogo ? (
          <Image
            source={{ uri: weather.attribution.providerLogo }}
            resizeMode="contain"
            accessibilityLabel={weather.attribution.providerName}
            style={styles.providerLogo}
          />
        ) : (
          <AppText variant="supporting" color={color.text.muted}>
            Forecast from {weather.attribution.providerName}
          </AppText>
        )}
        {sourceUrl ? (
          <Button label="Weather sources" variant="ghost" size="sm" onPress={() => void Linking.openURL(sourceUrl)} />
        ) : null}
      </View>
    </Card>
  );
}

function fahrenheit(celsius: number | null): number | null {
  return celsius === null ? null : Math.round((celsius * 9) / 5 + 32);
}

function humanCondition(code: string | null | undefined): string | null {
  if (!code) return null;
  return code
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[_-]+/g, ' ')
    .replace(/^./, (letter) => letter.toUpperCase());
}

function precipitationPhrase(chance: number | null, type: string | null): string | null {
  if (chance === null || chance < 0.25) return null;
  const kind = type && type !== 'clear' ? humanCondition(type) : 'Precipitation';
  return chance >= 0.6 ? `${kind} likely` : `${kind} possible`;
}

const styles = StyleSheet.create({
  card: { marginBottom: spacing.xxl },
  title: { marginTop: spacing.sm },
  body: { marginTop: spacing.sm },
  providerLogo: { width: 104, aspectRatio: 104 / 28 },
  footer: {
    marginTop: spacing.md,
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
});
