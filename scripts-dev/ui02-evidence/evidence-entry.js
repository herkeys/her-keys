// HK-FE-UI-02 evidence entry — a router-free entry that renders ONE evidence screen (src/dev/Ui02Evidence.tsx).
// It exists because the baseline app root cannot mount in Expo Go 57.0.9: expo-notifications 57.0.23 needs the native
// ExpoTopicSubscriptionModule that Expo Go does not ship (independent of this redesign). To use it, copy this file to the repo root
// and point package.json "main" at it TEMPORARILY; never commit that change. See README.md.
import { registerRootComponent } from 'expo';
import React, { useEffect, useState } from 'react';
import { Linking, View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Ui02Evidence, isEvidenceMode } from './src/dev/Ui02Evidence';

const param = (url, key) => {
  const m = new RegExp('[?&]' + key + '=([^&#]*)').exec(url || '');
  return m ? decodeURIComponent(m[1]) : undefined;
};

function Host() {
  const [url, setUrl] = useState(null);
  useEffect(() => {
    Linking.getInitialURL().then((u) => setUrl(u || ''));
    const sub = Linking.addEventListener('url', (e) => setUrl(e.url));
    return () => sub.remove();
  }, []);
  if (url === null) return <View />;
  const mode = param(url, 'mode');
  if (!isEvidenceMode(mode)) return <View />;
  const params = { scene: param(url, 'scene'), platform: param(url, 'platform'), stage: param(url, 'stage'), step: param(url, 'step') };
  return (
    <SafeAreaProvider>
      <Ui02Evidence key={url} mode={mode} params={params} />
    </SafeAreaProvider>
  );
}

registerRootComponent(Host);
