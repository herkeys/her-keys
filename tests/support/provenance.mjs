/** Stored provenance values as they appear on v4 rows. Frozen so a test cannot mutate a shared literal. */
export const USER = Object.freeze({ producer: 'user-action', artifactId: null, confidence: null });
export const SYSTEM = Object.freeze({ producer: 'system-derived', artifactId: null, confidence: null });
export const LEGACY = Object.freeze({ producer: 'legacy-unknown', artifactId: null, confidence: null });
export const DEMO = Object.freeze({ producer: 'demo-seed', artifactId: null, confidence: null });
export const ONBOARDING = Object.freeze({ producer: 'onboarding', artifactId: null, confidence: null });
export const TALK = Object.freeze({ producer: 'talk-it-out', artifactId: null, confidence: null });
