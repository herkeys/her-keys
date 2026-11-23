/**
 * Build 5 adaptive layout foundation: pure geometry, no React, no device models.
 *
 * Every layout decision in the app comes from the ACTUAL window the app was given (`useWindowDimensions`), minus the ACTUAL
 * horizontal safe-area insets, scaled down by the user's Dynamic Type choice. It never asks which device it is running on:
 * an iPad in a narrow Split View window, Slide Over or a small Stage Manager window is compact; an iPhone Duo's outer display
 * is compact; its inner display is medium in portrait and expanded in landscape; a full-screen iPad is expanded. A window
 * that changes size (rotation, multitasking, folding, unfolding) produces a new answer on the next render, and nothing else.
 *
 * Breakpoints are on usable content width in points (the Material / Apple size-class neighbourhood):
 *   compact  < 600  single column, bottom tab bar (today's iPhone and Android presentation, unchanged)
 *   medium   < 840  single column at the readable measure, bottom tab bar, centered readable column
 *   expanded >= 840 sidebar navigation; two panes where a screen defines them AND the remaining width can hold both
 *
 * Platform policy (Build 5 is iOS-first, BUILD5 §14): Android always gets the compact presentation, i.e. exactly what it
 * renders today, whatever its window. Android large-screen work is a separate, explicitly reviewed change.
 */

export type SizeClass = 'compact' | 'medium' | 'expanded';
export type NavigationChrome = 'tabBar' | 'sidebar';

export interface EdgeInsets {
  top: number;
  right: number;
  bottom: number;
  left: number;
}

export interface WindowMetrics {
  width: number;
  height: number;
  /** Dynamic Type / Android font scale. 1 is the default text size. */
  fontScale?: number;
  insets?: Partial<EdgeInsets>;
}

/** Usable-width thresholds, in points, AFTER the horizontal safe-area insets and the Dynamic Type divisor. */
export const BREAKPOINTS = Object.freeze({ medium: 600, expanded: 840 });

/** Width of the sidebar navigation (the tab destinations, vertically, with labels). The left inset is added on top of it. */
export const SIDEBAR_WIDTH = 240;

/** The widest a two-pane workspace grows; past this the workspace is centered and the margins grow instead. */
export const WORKSPACE_MAX_WIDTH = 1120;

/** Gap between the primary and secondary panes. */
export const PANE_GAP = 32;

/** The narrowest primary pane worth splitting for: below it, a screen stays one column even with the sidebar showing. */
export const PRIMARY_PANE_MIN_WIDTH = 480;

/** The secondary (supporting) pane is restrained: never narrower than a comfortable card, never wider than a sidebar-and-a-half. */
export const SECONDARY_PANE_MIN_WIDTH = 320;
export const SECONDARY_PANE_MAX_WIDTH = 400;

/** The horizontal page margin inside a screen (mirrors `sizing.screenMargin`, kept here so this module stays dependency-free). */
export const SCREEN_MARGIN = 20;

/** The readable measure (mirrors `sizing.contentWidth`). */
export const READABLE_WIDTH = 680;

/** Dynamic Type stops shrinking the effective width past 2x: at accessibility sizes the layout is compact, which is the point. */
const MAX_TEXT_DIVISOR = 2;

/** Platforms that receive the adaptive (medium/expanded) presentation in Build 5. */
export const ADAPTIVE_PLATFORMS: ReadonlySet<string> = new Set(['ios']);

const finite = (value: number | undefined, fallback = 0): number => (typeof value === 'number' && Number.isFinite(value) ? value : fallback);

export function normalizedInsets(insets: Partial<EdgeInsets> | undefined): EdgeInsets {
  return {
    top: Math.max(0, finite(insets?.top)),
    right: Math.max(0, finite(insets?.right)),
    bottom: Math.max(0, finite(insets?.bottom)),
    left: Math.max(0, finite(insets?.left)),
  };
}

/** Window width minus BOTH horizontal insets — never assumed symmetric (iPhone Duo rail, Split View, landscape notch). */
export function usableWidth(metrics: WindowMetrics): number {
  const insets = normalizedInsets(metrics.insets);
  return Math.max(0, finite(metrics.width) - insets.left - insets.right);
}

/** Larger text needs more room per column, so it divides the width the layout decisions see. Smaller text never widens it. */
export function textScaleDivisor(fontScale: number | undefined): number {
  const scale = finite(fontScale, 1);
  return Math.min(MAX_TEXT_DIVISOR, Math.max(1, scale));
}

/** The geometric size class of a window, independent of platform policy. */
export function sizeClassFor(metrics: WindowMetrics): SizeClass {
  const effective = usableWidth(metrics) / textScaleDivisor(metrics.fontScale);
  if (effective >= BREAKPOINTS.expanded) return 'expanded';
  if (effective >= BREAKPOINTS.medium) return 'medium';
  return 'compact';
}

export interface AdaptiveLayout {
  /** The class this platform PRESENTS (Android: always compact). Screens branch on this one. */
  sizeClass: SizeClass;
  /** The geometric class before platform policy, for diagnostics and tests. */
  windowClass: SizeClass;
  width: number;
  height: number;
  fontScale: number;
  insets: EdgeInsets;
  usableWidth: number;
  orientation: 'portrait' | 'landscape';
  navigation: NavigationChrome;
  /** Points the sidebar occupies (0 with a tab bar), including the leading inset it absorbs. */
  sidebarWidth: number;
  /** Estimated width available to a screen's content (after the sidebar and page margins), capped at the workspace maximum. */
  contentWidth: number;
  /** True when a screen that defines two panes should show them side by side. */
  twoPane: boolean;
  /** Width of the secondary pane when `twoPane` (0 otherwise). */
  secondaryPaneWidth: number;
  /** Max width of a scrolling screen's content container: the workspace when two panes show, the readable measure otherwise. */
  contentMaxWidth: number;
  /** A readable column cap for surfaces outside the scrolling `Screen` (AI chat, Talk It Out). Null keeps today's full width. */
  bodyColumnMaxWidth: number | null;
  /** Overlay presentation for `Sheet`: a bottom sheet, or a centered dialog card on expanded windows. */
  sheetPresentation: 'bottom' | 'dialog';
}

export function computeAdaptiveLayout(platform: string, metrics: WindowMetrics): AdaptiveLayout {
  const insets = normalizedInsets(metrics.insets);
  const width = Math.max(0, finite(metrics.width));
  const height = Math.max(0, finite(metrics.height));
  const fontScale = finite(metrics.fontScale, 1);
  const usable = usableWidth({ width, height, insets });
  const windowClass = sizeClassFor({ width, height, fontScale, insets });
  const adaptive = ADAPTIVE_PLATFORMS.has(platform);
  const sizeClass: SizeClass = adaptive ? windowClass : 'compact';

  const navigation: NavigationChrome = sizeClass === 'expanded' ? 'sidebar' : 'tabBar';
  const sidebarWidth = navigation === 'sidebar' ? SIDEBAR_WIDTH + insets.left : 0;
  // The sidebar already absorbs the leading inset, so subtract only the trailing one from what remains.
  const available = navigation === 'sidebar' ? width - sidebarWidth - insets.right : usable;
  const contentWidth = Math.max(0, Math.min(WORKSPACE_MAX_WIDTH, available - 2 * SCREEN_MARGIN));

  const divisor = textScaleDivisor(fontScale);
  const secondaryPaneWidth = Math.round(Math.min(SECONDARY_PANE_MAX_WIDTH, Math.max(SECONDARY_PANE_MIN_WIDTH, contentWidth * 0.36)));
  const primaryWidth = contentWidth - PANE_GAP - secondaryPaneWidth;
  // Two panes need room for a primary pane that still reads well at the user's text size; otherwise the same content stays
  // one readable column (with the sidebar still showing).
  const twoPane = sizeClass === 'expanded' && primaryWidth >= PRIMARY_PANE_MIN_WIDTH * divisor;

  return {
    sizeClass,
    windowClass,
    width,
    height,
    fontScale,
    insets,
    usableWidth: usable,
    orientation: width > height ? 'landscape' : 'portrait',
    navigation,
    sidebarWidth,
    contentWidth,
    twoPane,
    secondaryPaneWidth: twoPane ? secondaryPaneWidth : 0,
    contentMaxWidth: twoPane ? WORKSPACE_MAX_WIDTH : READABLE_WIDTH,
    // Compact windows are narrower than the measure anyway, so they add nothing (and render exactly as before Build 5).
    bodyColumnMaxWidth: sizeClass === 'compact' ? null : READABLE_WIDTH,
    sheetPresentation: sizeClass === 'expanded' ? 'dialog' : 'bottom',
  };
}

/**
 * The bottom clearance a scrolling screen leaves below its last row. A bottom tab bar owns 68pt (fixed chrome) that content
 * must clear; a sidebar owns none of the bottom edge. The system bottom inset is added by the caller in both cases.
 */
export const TAB_BAR_CHROME_HEIGHT = 68;
export function tabChromeClearance(navigation: NavigationChrome): number {
  return navigation === 'tabBar' ? TAB_BAR_CHROME_HEIGHT : 0;
}
