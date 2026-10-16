# HK-FE-UI-02 — decorative asset register

All assets are **original, locally authored, code-built** (React Native `View` primitives and glyphs from the Ionicons set already
shipped in the app). **No third-party artwork, stock asset, image file, font file or SVG library is used.** No screenshot or trace
of the concept mockup is embedded anywhere. No new dependency was added to `package.json` (verified by `git diff` on
`package.json` / `package-lock.json` being empty for this workstream).

| Asset | Source | Original / third party | Licence / ownership | Intended screens | Format | Performance impact | Accessibility | Responsive behaviour |
|---|---|---|---|---|---|---|---|---|
| `BotanicalSprig` | `src/design/components/Botanical.tsx` | Original | Her Keys (owner) | Welcome, Premium introduction, account choice (top-right corner) | 1 stem `View` + 6 leaf `View`s | ~7 static boxes, no images, no animation, no blur | `accessibilityElementsHidden`, `importantForAccessibility="no-hide-descendants"`, `pointerEvents="none"` | Not rendered < 360 dp width or > 1.3× font scale; rendered first so all content paints above it |
| `CurvedWave` | same | Original | Her Keys | Welcome (top edge, 110 dp band) | 2 clipped oversized circle `View`s (wash + 1 px line) | 2 static boxes | hidden, touch-transparent | Not rendered < 360 dp or > 1.3× font; width follows the window |
| `IconBadge` | `Badges.tsx` | Original shell; glyphs are Ionicons (MIT, already bundled by `@expo/vector-icons`) | Her Keys / Ionicons MIT | Premium benefit rows, form step headers, state views | circle `View` + font glyph | 2 views | Decorative by default; with `accessibilityLabel` becomes `role=image` | Header use goes through `HeaderBadge`, which also hides on windows shorter than 640 dp |
| `KeyBadge` | `Badges.tsx` | Original | Her Keys | Welcome | 2 nested circles + `key-outline` glyph | 3 views | decorative | Fixed 72 dp; part of normal flow (not absolutely positioned) |
| `PremiumBadge` | `Badges.tsx` | Original | Her Keys | Premium introduction, final onboarding Premium decision | Luxury Black disc, lighter rim, 1 px glint, Dusty Mauve `sparkles` glyph (7.81:1 on black) | 3 views | decorative | Fixed 40/56 dp; never larger than 56 dp |
| `AiMark` | `intelligence.tsx` | Original shell; Ionicons glyphs | Her Keys / Ionicons MIT | every AI register component | 28 dp shape + glyph | 2 views | hidden; the adjacent text label is the accessible statement | fixed 28 dp |
| Dashed outlines | RN `borderStyle: 'dashed'` | Platform feature | — | unconfirmed AI readings | style only | none | meaning also carried by label + mark | — |

## Not added (and why)

- **`react-native-svg` or any vector library** — native dependency; brief stop-condition 11 requires separate approval. The View-built
  forms above cover the approved key/leaf/wave/sparkle set within the polish bar; a true Bézier botanical would justify the dependency
  and is recorded as a product-owner decision (OD-UI02-02).
- **A custom display typeface** — needs licensing/Expo/APK review and owner approval (OD-UI02-01).
- **Gradients** — none used; no native gradient dependency.
- **Splash / app icon changes** — out of scope without separate approval.
