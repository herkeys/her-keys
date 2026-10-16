import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Appearance, StyleSheet, View, useColorScheme } from 'react-native';
import {
  APPEARANCE_HYDRATION_TIMEOUT_MS,
  DEFAULT_APPEARANCE_PREFERENCE,
  loadPreference,
  resolveScheme,
  savePreference,
  type AppearancePreference,
  type AppearanceStorage,
} from './appearance';
import { lightTheme, themes, type Scheme, type Theme } from './palettes';

/**
 * HK-FE-UI-02-DM — the single theme provider.
 *
 * Responsibilities, and nothing else:
 *   1. hold the device-local PREFERENCE (light | dark | system) and resolve it to a SCHEME;
 *   2. publish the memoised `Theme` for that scheme through React context, so every themed component re-renders in place;
 *   3. tell the native layer (Appearance.setColorScheme) so alerts, keyboards, pickers and the status bar follow;
 *   4. hide the first frame until the stored preference is known, bounded, so a saved Dark never flashes Light.
 *
 * It owns NO navigation, account, household, consent or purchase state and renders `children` immediately — account initialisation is
 * never waiting on it. A theme change re-renders consumers; it does not remount the tree, so navigation, form entries, onboarding
 * progress and open sheets are untouched.
 */

export interface AppearanceContextValue {
  /** What she chose. */
  preference: AppearancePreference;
  /** What is drawn. */
  scheme: Scheme;
  theme: Theme;
  /** False only until the stored preference has been read (or the bounded read gave up). */
  hydrated: boolean;
  setPreference: (next: AppearancePreference) => void;
}

/**
 * With no provider mounted (unit tests, isolated renders) components draw the approved Light theme. The contrast-audit harness may
 * ask for another default with HK_UI_DEFAULT_SCHEME so every existing render can be measured in Dark too; a shipped bundle never
 * sets it (process.env.* is not inlined for non-EXPO_PUBLIC names).
 */
const defaultScheme = (): Scheme => {
  try {
    return typeof process !== 'undefined' && process.env?.HK_UI_DEFAULT_SCHEME === 'dark' ? 'dark' : 'light';
  } catch {
    return 'light';
  }
};

const fallbackValue: AppearanceContextValue = {
  preference: DEFAULT_APPEARANCE_PREFERENCE,
  scheme: lightTheme.scheme,
  theme: lightTheme,
  hydrated: true,
  setPreference: () => {},
};

const AppearanceContext = createContext<AppearanceContextValue | null>(null);

function currentFallback(): AppearanceContextValue {
  const scheme = defaultScheme();
  return scheme === 'light' ? fallbackValue : { ...fallbackValue, scheme, theme: themes[scheme] };
}

export interface AppearanceProviderProps {
  children: ReactNode;
  /** Device-local persistence. `null` = this provider does not persist (evidence harnesses). */
  storage?: AppearanceStorage | null;
  /** Skip hydration and start from this preference (evidence harnesses and tests). */
  initialPreference?: AppearancePreference;
  hydrationTimeoutMs?: number;
}

export function AppearanceProvider({ children, storage = null, initialPreference, hydrationTimeoutMs = APPEARANCE_HYDRATION_TIMEOUT_MS }: AppearanceProviderProps) {
  const [preference, setPreferenceState] = useState<AppearancePreference>(initialPreference ?? DEFAULT_APPEARANCE_PREFERENCE);
  const [hydrated, setHydrated] = useState<boolean>(initialPreference !== undefined || storage === null);
  const chosenThisSession = useRef(false);
  const writeSequence = useRef(0);
  const system = useColorScheme();

  // 1) read the stored preference once; a choice made while it was still reading wins over what it returns
  useEffect(() => {
    if (hydrated) return;
    let live = true;
    void loadPreference(storage, hydrationTimeoutMs).then((stored) => {
      if (!live) return;
      if (!chosenThisSession.current) setPreferenceState(stored);
      setHydrated(true);
    });
    return () => {
      live = false;
    };
    // hydration runs once per provider instance
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setPreference = useCallback(
    (next: AppearancePreference) => {
      chosenThisSession.current = true;
      setPreferenceState(next);
      writeSequence.current += 1;
      const mine = writeSequence.current;
      // Rapid switching converges on the LATEST choice: only the last queued write is allowed to land last.
      void Promise.resolve().then(() => (mine === writeSequence.current ? savePreference(storage, next) : false));
    },
    [storage],
  );

  // 2) the native layer follows a manual choice; System hands control back to the device
  useEffect(() => {
    try {
      Appearance?.setColorScheme?.(preference === 'system' ? 'unspecified' : preference);
    } catch {
      // a platform without the override simply keeps following the device
    }
  }, [preference]);

  // `useColorScheme()` already reflects a manual override once set; only System should consult the device value
  const scheme = resolveScheme(preference, system === 'dark' || system === 'light' ? system : null);

  const value = useMemo<AppearanceContextValue>(
    () => ({ preference, scheme, theme: themes[scheme], hydrated, setPreference }),
    [preference, scheme, hydrated, setPreference],
  );

  return (
    <AppearanceContext.Provider value={value}>
      {children}
      {hydrated ? null : <View pointerEvents="auto" style={[StyleSheet.absoluteFill, { backgroundColor: themes[scheme].color.background }]} accessibilityElementsHidden importantForAccessibility="no-hide-descendants" />}
    </AppearanceContext.Provider>
  );
}

/** The whole appearance state: preference, resolved scheme, the Theme, and the setter. */
export function useAppearance(): AppearanceContextValue {
  return useContext(AppearanceContext) ?? currentFallback();
}

/**
 * The live theme. Components read colours ONLY from here (`const { color, colors, elevation, interaction } = useTheme()`), so a change
 * of appearance re-renders them in place. The static `color`/`colors` exports in tokens.ts are the legacy LIGHT values and are not
 * to be imported by components (tests/design-system/themeBoundary.test.mjs enforces it).
 */
export function useTheme(): Theme {
  return useAppearance().theme;
}
