/**
 * HK-OCR-ASSIST — the transient candidate model.
 *
 * Everything here lives in component state for the length of one scan and is discarded on confirm, cancel, error or navigation
 * away. None of it is a LifeRecord field, none of it is written to AppState, none of it is synced, and none of it is a new
 * provenance: a confirmed value leaves this file behind entirely and re-enters Life Admin through the existing, unmodified
 * RecordSheet -> submitRecord -> addLifeRecord/updateLifeRecord path, with the same default (user-action) provenance a typed
 * record already gets. "Recognized" and "extracted" are not "confirmed": every candidate here starts unconfirmed and stays that
 * way until she has picked, edited or skipped it herself.
 */

/** One date Her Keys read, not yet assigned to any Life Admin field. */
export interface OcrDateCandidate {
  /** `YYYY-MM-DD`, already validated against the calendar (never a raw OCR string). */
  date: string;
  /** A short run of nearby recognized words, shown as a hint only. Never used to choose a field. */
  context: string | null;
}

/** A short run of text that might be an issuer/provider name, a reference number, or a title. Never classified further here. */
export interface OcrTextCandidate {
  text: string;
  context: string | null;
}

/**
 * What one scan produced, entirely in memory. `confirmed` starts false and this module never sets it true: only the review
 * screen's explicit "Use these values" action, itself gated on her picks, moves anything past this model.
 */
export interface OcrCandidate {
  /** The recognized text Her Keys read, kept only for candidate extraction inside this same scan. Never persisted, never logged. */
  recognizedText: string;
  dates: readonly OcrDateCandidate[];
  issuers: readonly OcrTextCandidate[];
  references: readonly OcrTextCandidate[];
  /** Native recognition confidence, if the engine offered one. In-memory only: never shown, never used to sort, rank or auto-pick. */
  engineConfidence: number | null;
  confirmed: false;
}

export const EMPTY_OCR_CANDIDATE: OcrCandidate = {
  recognizedText: '',
  dates: [],
  issuers: [],
  references: [],
  engineConfidence: null,
  confirmed: false,
};

/** The three Life Admin date fields OCR may help fill. Assignment is always explicit; this is only the closed set of choices. */
export const OCR_DATE_TARGETS = ['expiresOn', 'renewBy', 'reviewOn'] as const;
export type OcrDateTarget = (typeof OCR_DATE_TARGETS)[number];

/** Her per-field picks, built entirely from taps: never pre-filled from `context`, order, or engine confidence. */
export interface OcrAssignment {
  expiresOn: string | null;
  renewBy: string | null;
  reviewOn: string | null;
  issuerName: string | null;
  referenceNumber: string | null;
  title: string | null;
}

export const EMPTY_OCR_ASSIGNMENT: OcrAssignment = {
  expiresOn: null,
  renewBy: null,
  reviewOn: null,
  issuerName: null,
  referenceNumber: null,
  title: null,
};
