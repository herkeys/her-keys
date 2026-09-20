import { z } from 'zod';
import { isLocalDate } from './logicalDay';

/**
 * The value shapes every stored record is built from.
 *
 * They live here, and not in `state.ts`, so the foundation modules that
 * `state.ts` composes (provenance, source artifacts, observations, ...) can use
 * them without importing `state.ts` back. Every definition below is the one
 * `state.ts` used before this file existed; nothing about a stored shape
 * changes because it moved.
 */

/** Letters, digits and `._:-`, starting with a letter or digit — never `__proto__` or similar. */
export const ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;

export const Id = z.string().regex(ID_PATTERN, { message: 'Invalid id' });

export const LocalDateSchema = z.string().refine(isLocalDate, { message: 'Expected a calendar date (YYYY-MM-DD)' });

/** A UTC moment. The round-trip rejects impossible dates such as 30 February that a pattern alone lets through. */
export const InstantSchema = z.iso.datetime().refine((value) => {
  const ms = Date.parse(value);
  return Number.isFinite(ms) && new Date(ms).toISOString().slice(0, 19) === value.slice(0, 19);
}, { message: 'Expected a real UTC instant' });

export const NonBlank = (max: number) => z.string().max(max).refine((value) => value.trim().length > 0, { message: 'Must not be blank' });

export const SYSTEM_ROLES = ['kids', 'home', 'money', 'meals', 'work', 'wellbeing', 'relationships', 'coparenting'] as const;
export type SystemRole = (typeof SYSTEM_ROLES)[number];

export const VISIBILITY_SCOPES = ['personal', 'household', 'child', 'coparent-shared', 'professional'] as const;
export type VisibilityScope = (typeof VISIBILITY_SCOPES)[number];

export const Scope = z.enum(VISIBILITY_SCOPES);

/**
 * An OPEN vocabulary code: a lowercase token, format-checked and size-bounded.
 *
 * Used where a vocabulary must widen without rewriting a CHECK per new value
 * (reasoning evidence codes, clarification codes, providers). The vocabulary
 * that is actually understood lives in TypeScript; an unknown code is stored and
 * read back intact, and is simply not acted on.
 */
export const OPEN_CODE_PATTERN = /^[a-z][a-z0-9_.-]{0,63}$/;
export const OpenCode = z.string().regex(OPEN_CODE_PATTERN, { message: 'Expected a lowercase code token' });

/** A lowercase hex SHA-256. Used to recognise an artifact without storing its content. */
export const Sha256Hex = z.string().regex(/^[0-9a-f]{64}$/, { message: 'Expected a lowercase hex SHA-256' });

export const CONFIDENCE_LEVELS = ['possible', 'likely', 'established'] as const;
export const ConfidenceLevelSchema = z.enum(CONFIDENCE_LEVELS);
