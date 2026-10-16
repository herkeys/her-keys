import { useTheme } from './ThemeProvider';
import type { Scheme, Theme } from './palettes';

/**
 * Module-scope `StyleSheet.create` runs once, at import, so colours read there are frozen to whichever theme was current. This is
 * the replacement: declare the styles as a FACTORY of the theme; the returned hook builds each scheme's stylesheet once, caches it, and
 * re-renders the caller when the scheme changes.
 *
 *   const useStyles = createThemedStyles(({ color }) => StyleSheet.create({ card: { backgroundColor: color.surface.primary } }));
 *   function Card() { const styles = useStyles(); ... }
 *
 * Appearance-independent geometry (spacing, radii, sizing) belongs in the same factory or in a plain static StyleSheet — either is fine.
 */
export function createThemedStyles<T>(factory: (theme: Theme) => T): () => T {
  const cache = new Map<Scheme, T>();
  return function useThemedStyles(): T {
    const theme = useTheme();
    let styles = cache.get(theme.scheme);
    if (styles === undefined) {
      styles = factory(theme);
      cache.set(theme.scheme, styles);
    }
    return styles;
  };
}

/** Same idea for any module-scope VALUE that reads the theme (a tone map, a presentation table): a pure function of the theme, memoised per scheme. */
export function themed<T>(factory: (theme: Theme) => T): (theme: Theme) => T {
  const cache = new Map<Scheme, T>();
  return (theme) => {
    let value = cache.get(theme.scheme);
    if (value === undefined) {
      value = factory(theme);
      cache.set(theme.scheme, value);
    }
    return value;
  };
}
