import { useEffect, useMemo, type ReactNode } from 'react';
import { DefaultTheme, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useAppearance } from './ThemeProvider';

/**
 * HK-FE-UI-02-DM — the parts of the theme that live OUTSIDE React Native's own views. Mounted only by the root layout (it imports
 * expo-router and native modules, so it is deliberately not exported from the theme index).
 *
 *   SystemChrome     — status-bar content colour (light glyphs on the dark ground, dark glyphs on the light one) and the native root
 *                      view background, so an overscroll, a keyboard resize or a navigation transition never flashes the wrong ground.
 *   ThemedNavigation — the React Navigation theme (header, card, border, tab bar defaults) from the same tokens, so stack headers,
 *                      modal presentation and the default scene background follow the scheme without any per-screen override.
 *
 * Changing scheme re-renders these in place; nothing here owns navigation state, so the stack, the tab and every form entry survive.
 */

export function SystemChrome() {
  const { scheme, theme } = useAppearance();
  const ground = theme.color.background;

  useEffect(() => {
    let live = true;
    try {
      // Lazy: a binary without the native module simply keeps its default root background.
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const SystemUI = require('expo-system-ui') as { setBackgroundColorAsync: (color: string) => Promise<unknown> };
      void SystemUI.setBackgroundColorAsync(ground).catch(() => {
        if (live) return;
      });
    } catch {
      // not available in this binary
    }
    return () => {
      live = false;
    };
  }, [ground]);

  return <StatusBar style={scheme === 'dark' ? 'light' : 'dark'} />;
}

export function ThemedNavigation({ children }: { children: ReactNode }) {
  const { scheme, theme } = useAppearance();
  const { color } = theme;
  const value = useMemo(
    () => ({
      ...DefaultTheme,
      dark: scheme === 'dark',
      colors: {
        ...DefaultTheme.colors,
        primary: color.action.primary,
        background: color.background,
        card: color.surface.primary,
        text: color.text.primary,
        border: color.border.default,
        notification: color.action.primary,
      },
    }),
    [scheme, color],
  );
  return <ThemeProvider value={value}>{children}</ThemeProvider>;
}
