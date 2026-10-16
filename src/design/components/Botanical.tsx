import { StyleSheet, View, useWindowDimensions, type ViewStyle } from 'react-native';
import { brandPalette, botanicalOpacity, botanicalPalette, botanicalStroke, decorationBudget, opacity, withAlpha } from '../tokens';
import { useReduceMotion } from '../motion';

/**
 * Original, locally maintained decorative vectors (HK-FE-UI-02 §8). Built from plain Views — rounded rectangles, rotated
 * strokes and clipped circles — so they add NO native dependency, ship NO image files and cost no more to render than a few
 * styled boxes. Provenance: see docs/design-system/HK-FE-UI-02-asset-register.md (all original, no third-party artwork, no
 * trace of the concept mockup).
 *
 * BOTANICAL LINEWORK (owner amendment 2026-10-16): the sprig is drawn as thin SAGE OUTLINES only — a 1.25 pt `Sage Outline` stroke
 * at 50% opacity for the stem and every leaf, with small `Sage Tip` accents at 60% opacity at each leaf tip and stem node. There
 * is no solid fill, no green surface and no green gradient anywhere. Sage is read ONLY here: it never appears on a control,
 * button, card, header or navigation chrome (tests/design-system/botanicalBoundary.test.mjs enforces who may import it). Under
 * Reduce Motion or increased contrast the outline drops to 30% (it is decorative, never load-bearing).
 *
 * Rules the components enforce themselves:
 *   - decoration is FAINT and secondary, placed in corners and empty regions only;
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
  /** Position of the leaf's node along the stem, −0.5 (tip end, growing into the screen) … +0.5 (base at the corner). */
  t: number;
  /** −1 left of the stem, +1 right. */
  side: -1 | 1;
  length: number;
}

// A sprig is a gently angled stem with alternating leaves. Hand-placed: this IS the asset.
const LEAVES: readonly Leaf[] = [
  { t: -0.4, side: 1, length: 16 },
  { t: -0.26, side: -1, length: 22 },
  { t: -0.1, side: 1, length: 28 },
  { t: 0.06, side: -1, length: 32 },
  { t: 0.2, side: 1, length: 30 },
  { t: 0.34, side: -1, length: 24 },
];

const STEM_ANGLE_DEG = 28;
const LEAF_SPREAD_DEG = 48;
const rad = (deg: number) => (deg * Math.PI) / 180;

/** The pure geometry of one leaf, exported so tests can assert placement without a renderer. */
export function leafGeometry(size: number, leaf: Leaf) {
  const theta = rad(STEM_ANGLE_DEG);
  const len = size * 0.9;
  // The leaf's node sits ON the stem.
  const node = { x: size / 2 + leaf.t * len * Math.sin(theta), y: size / 2 - leaf.t * len * Math.cos(theta) };
  // The sprig grows from its corner (the stem's +t end) toward the screen (−t end), so each leaf points toward the stem tip at
  // ±LEAF_SPREAD_DEG to the growth direction (θ + 90° on screen).
  const phi = STEM_ANGLE_DEG + 90 + leaf.side * LEAF_SPREAD_DEG;
  const width = leaf.length;
  const height = leaf.length * 0.5;
  const c = Math.cos(rad(phi));
  const s = Math.sin(rad(phi));
  const turn = (dx: number, dy: number) => ({ x: dx * c - dy * s, y: dx * s + dy * c });
  // The View's pointed corners are top-right (the tip) and bottom-left (the base); put the base corner on the node.
  const offset = turn(width / 2, -height / 2);
  const centre = { x: node.x + offset.x, y: node.y + offset.y };
  const tipOffset = turn(width, -height);
  return {
    left: centre.x - width / 2,
    top: centre.y - height / 2,
    width,
    height,
    rotate: phi,
    node,
    tip: { x: node.x + tipOffset.x, y: node.y + tipOffset.y },
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

/** A faint sage linework sprig tucked into a corner. Renders nothing on compact screens or at large text. */
export function BotanicalSprig({ corner = 'topRight', size = 132, style }: SprigProps) {
  const visible = useDecorationVisible();
  const reduceMotion = useReduceMotion();
  if (!visible) return null;
  const len = size * 0.9;
  const outline = withAlpha(botanicalPalette.sageOutline, reduceMotion ? botanicalOpacity.reduced : botanicalOpacity.outline);
  const tip = withAlpha(botanicalPalette.sageTip, botanicalOpacity.tip);
  const theta = rad(STEM_ANGLE_DEG);
  const dot = (x: number, y: number, diameter: number, key: string) => (
    <View
      key={key}
      testID="botanical-accent"
      style={[styles.dot, { left: x - diameter / 2, top: y - diameter / 2, width: diameter, height: diameter, borderRadius: diameter / 2, backgroundColor: tip }]}
    />
  );
  return (
    <View {...HIDDEN} testID="botanical-sprig" style={[styles.sprig, { width: size, height: size }, CORNER_STYLE[corner], style]}>
      <View
        style={[
          styles.stem,
          { height: len, left: size / 2 - botanicalStroke.outline / 2, top: (size - len) / 2, width: botanicalStroke.outline, backgroundColor: outline, transform: [{ rotate: `${STEM_ANGLE_DEG}deg` }] },
        ]}
      />
      {/* the stem's own tip */}
      {dot(size / 2 - 0.5 * len * Math.sin(theta), size / 2 + 0.5 * len * Math.cos(theta), botanicalStroke.tip + 1.5, 'stem-tip')}
      {LEAVES.map((leaf, index) => {
        const g = leafGeometry(size, leaf);
        return [
          <View
            key={`leaf-${index}`}
            testID="botanical-leaf"
            style={[
              styles.leaf,
              {
                left: g.left,
                top: g.top,
                width: g.width,
                height: g.height,
                borderTopLeftRadius: g.height,
                borderBottomRightRadius: g.height,
                borderColor: outline,
                borderWidth: botanicalStroke.outline,
                transform: [{ rotate: `${g.rotate}deg` }],
              },
            ]}
          />,
          dot(g.node.x, g.node.y, botanicalStroke.node + 1, `node-${index}`),
          dot(g.tip.x, g.tip.y, botanicalStroke.tip + 1.5, `tip-${index}`),
        ];
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
 * screen edge in otherwise empty space; never behind text or a form. (This is the brand decoration, not botanical linework: it
 * stays mauve/lilac.)
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
  stem: { position: 'absolute', borderRadius: 1 },
  // Outline only: the border carries the leaf; the fill stays transparent (no solid green).
  leaf: {
    position: 'absolute',
    backgroundColor: 'transparent',
    borderTopRightRadius: 2,
    borderBottomLeftRadius: 2,
  },
  dot: { position: 'absolute' },
  wave: { position: 'absolute', left: 0, right: 0, overflow: 'hidden' },
  washCircle: { position: 'absolute', backgroundColor: brandPalette.softLilac, opacity: 0.55 },
  lineCircle: {
    position: 'absolute',
    borderWidth: 1,
    borderColor: brandPalette.dustyMauve,
    opacity: opacity.decoration + 0.1,
  },
});
