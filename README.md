# Her Keys

An AI-powered Life Operating System that helps mothers rebuild their lives and household infrastructure after separation or divorce — reducing the mental load of coordinating kids, calendars, home, money, meals, work, and co-parenting.

## Tech Stack

- React Native
- Expo (SDK 57)
- TypeScript (strict mode)
- Expo Router

## Getting Started

Install dependencies:

```
npm install
```

Start the Expo dev server:

```
npm start
```

Then run on a platform:

```
npm run android
npm run ios
npm run web
```

## Product Contract

[HER_KEYS_PRODUCT.md](./HER_KEYS_PRODUCT.md) is the canonical product contract and source of truth for this project. Read it before making product or architectural decisions.

## Build Status

**Wave 2 engineering: COMPLETE** — tag `wave2-engineering-complete`.

| Area | Status |
|---|---|
| F01–F08 | Integrated |
| Integrated hostile audit | Pass |
| Local testing (TypeScript, application suite, backend harness) | Pass |
| Staging database/backend | Pass |
| Staging RLS/tenant isolation | Live verified |
| Sync/backend contracts | Pass |
| Production | Not deployed |
| OAuth (Google Sign-In) | Not part of the current product stage |
| Sign in with Apple | Not part of the current product stage |

OAuth is a deliberate, later-stage product decision — not an unfinished Wave 2 feature or a failed certification gate.
