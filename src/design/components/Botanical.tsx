import { StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { brandPalette, color, decorationBudget, opacity } from '../tokens';

/**
 * Original, locally maintained decorative vectors (HK-FE-UI-02 §8). Built from plain Views — rounded rectangles, rotated
 * strokes and clipped circles — so they add NO native dependency, ship NO image files and cost no more to render than a few
 * styled boxes. Provenance: see docs/design-system/HK-FE-UI-02-asset-register.md (all original, no third-party artwork, no
 * trace of the concept mockup).
 *
 * Rules the components enforce themselves:
 *   - decoration is FAINT and secondary (`opacity.decoration`), placed in corners and empty regions only;
 *   - it is hidden from screen readers and never receives touches;
 *   - it yields to function: below 360 dp window width, or above 1.3× font scale, it renders nothing at all
 *     (`useDecorationVisible`), so it can never push content off screen or sit behind a form on a small phone;
 *   - no animation, no continuous motion, no blur.
 */

/** True when the window is wide enough and the text scale small enough for ornament to be shown (spec §9). */
export function useDecorationVisible(): boolean {
  const { width, fontScale } = useWindowDimensions();
  return width >= decorationBudget.minWidth && fontScale <= decorationBudget.maxFontScale;
}

const HIDDEN = {
  pointerEvents: 'none' as const,
  accessibilityElementsHidden: true,
  importantForAccessibility: 'no-hide-descendants' as const,
};

export type Corner = 'topRight' | 'topLeft' | 'bottomRight' | 'bottomLeft';

interface Leaf {
  /** Position along the stem, −0.5 (tip) … +0.5 (base). */
  t: number;
  /** −1 left of the stem, +1 right. */
  side: -1 | 1;
  length: number;
}

// A sprig is a gently angled stem with alternating leaves. Hand-placed: this IS the asset.
const LEAVES: readonly Leaf[] = [
  { t: -0.46, side: 1, length: 14 },
  { t: -0.32, side: -1, length: 20 },
  { t: -0.16, side: 1, length: 26 },
  { t: 0, side: -1, length: 30 },
  { t: 0.16, side: 1, length: 30 },
  { t: 0.3, side: -1, length: 26 },
];

const STEM_ANGLE_DEG = 28;

/** The pure geometry of one leaf, exported so tests can assert placement without a renderer. */
export function leafGeometry(size: number, leaf: Leaf) {
  const theta = (STEM_ANGLE_DEG * Math.PI) / 180;
  const len = size * 0.9;
  const cx = size / 2 + leaf.t * len * Math.sin(theta);
  const cy = size / 2 - leaf.t * len * Math.cos(theta);
  const width = leaf.length;
  const height = leaf.length * 0.5;
  const rotate = STEM_ANGLE_DEG + leaf.side * 52;
  return {
    left: cx - width / 2 + leaf.side * 3,
    top: cy - height / 2,
    width,
    height,
    rotate,
  };
}

interface SprigProps {
  corner?: Corner;
  /** Square footprint in dp. Default 132. */
  size?: number;
  style?: ViewStyle;
}

const CORNER_STYLE: Record<Corner, ViewStyle> = {
  topRight: { top: -16, right: -20 },
  topLeft: { top: -16, left: -20, transform: [{ scaleX: -1 }] },
  bottomRight: { bottom: -16, right: -20, transform: [{ scaleY: -1 }] },
  bottomLeft: { bottom: -16, left: -20, transform: [{ scaleX: -1 }, { scaleY: -1 }] },
};

/** A faint botanical sprig tucked into a corner. Renders nothing on compact screens or at large text. */
export function BotanicalSprig({ corner = 'topRight', size = 132, style }: SprigProps) {
  const visible = useDecorationVisible();
  if (!visible) return null;
  const len = size * 0.9;
  return (
    <View
      {...HIDDEN}
      testID="botanical-sprig"
      style={[styles.sprig, { width: size, height: size, opacity: opacity.decoration }, CORNER_STYLE[corner], style]}
    >
      <View
        style={[
          styles.stem,
          { height: len, left: size / 2 - 1, top: (size - len) / 2, transform: [{ rotate: `${STEM_ANGLE_DEG}deg` }] },
        ]}
      />
      {LEAVES.map((leaf, index) => {
        const g = leafGeometry(size, leaf);
        return (
          <View
            key={index}
            style={[
              styles.leaf,
              {
                left: g.left,
                top: g.top,
                width: g.width,
                height: g.height,
                borderTopLeftRadius: g.height,
                borderBottomRightRadius: g.height,
                backgroundColor: index % 2 === 0 ? color.brand.dustyMauve : color.brand.softLilac,
                transform: [{ rotate: `${g.rotate}deg` }],
              },
            ]}
          />
        );
      })}
    </View>
  );
}

interface WaveProps {
  /** Which screen edge the soft curve hangs from. */
  edge?: 'top' | 'bottom';
  /** Height of the visible curve band in dp. Default 120. */
  height?: number;
  style?: ViewStyle;
}

/**
 * A soft, wide curve: a Soft Lilac wash plus one fine Dusty Mauve line, produced by clipping oversized circles. Sits at a
 * screen edge in otherwise empty space; never behind text or a form.
 */
export function CurvedWave({ edge = 'top', height = 120, style }: WaveProps) {
  const { width } = useWindowDimensions();
  const visible = useDecorationVisible();
  if (!visible) return null;
  const d = width * 1.7;
  // Show only the arc that bulges into the screen: the circle sits mostly off the edge.
  const wash = edge === 'top' ? { top: height - d } : { bottom: height - d };
  const line = edge === 'top' ? { top: height - d - 14 } : { bottom: height - d - 14 };
  return (
    <View
      {...HIDDEN}
      testID="curved-wave"
      style={[styles.wave, edge === 'top' ? { top: 0 } : { bottom: 0 }, { height }, style]}
    >
      <View style={[styles.washCircle, { width: d, height: d, borderRadius: d / 2, left: (width - d) / 2 }, wash]} />
      <View style={[styles.lineCircle, { width: d, height: d, borderRadius: d / 2, left: (width - d) / 2 }, line]} />
    </View>
  );
}

const styles = StyleSheet.create({
  sprig: { position: 'absolute' },
  stem: { position: 'absolute', width: 2, borderRadius: 1, backgroundColor: color.brand.dustyMauve },
  leaf: {
    position: 'absolute',
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 2,
  },
  wave: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  washCircle: { position: 'absolute', backgroundColor: color.brand.softLilac, opacity: 0.55 },
  lineCircle: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: brandPalette.dustyMauve,
    opacity: opacity.decoration + 0.1,
  },
});
