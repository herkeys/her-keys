import { useEffect, useState } from 'react';
import { AppState as NativeAppState, Image, Linking, StyleSheet, View } from 'react-native';
import { AppText, Button, Card, Overline } from '../../design/components';
import { color, spacing } from '../../design/tokens';
import { weatherAnchorConfig } from '../../config/externalIntelligence';
import type { WeatherSnapshot } from '../../external/types';
import { useOptionalAccount } from '../../store/AccountProvider';
import { useHouseholdState } from '../../store/AppStateProvider';
import { externalIntelligenceClient } from '../../store/accountRuntimeInstance';

export function WeatherContextCard() {
  const account = useOptionalAccount();
  const { state } = useHouseholdState();
  const [weather, setWeather] = useState<WeatherSnapshot | null>(null);

  useEffect(() => {
    if (account?.state.kind !== 'accountBound' || weatherAnchorConfig === null) {
      setWeather(null);
      return;
    }

    const anchor = weatherAnchorConfig;
    let live = true;
    const load = async () => {
      const result = await externalIntelligenceClient.weather({
        latitude: anchor.latitude,
        longitude: anchor.longitude,
        timezone: state.user.timezone,
        countryCode: anchor.countryCode,
        language: 'en-US',
      });
      if (live) setWeather(result.kind === 'ready' ? result.value : null);
    };

    void load();
    const subscription = NativeAppState.addEventListener('change', (next) => {
      if (next === 'active') void load();
    });
    const timer = setInterval(load, 30 * 60_000);

    return () => {
      live = false;
      subscription.remove();
      clearInterval(timer);
    };
  }, [account?.state.kind, state.user.timezone]);

  if (weather === null) return null;

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
      <Overline>{weatherAnchorConfig?.label ? `Weather · ${weatherAnchorConfig.label}` : 'Weather context'}</Overline>
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
