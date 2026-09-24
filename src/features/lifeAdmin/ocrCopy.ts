/**
 * HK-OCR-ASSIST — every word the scan/review surface says.
 *
 * Same rule as Life Admin's own copy (`lifeAdminCopy.ts`): factual and calm, no guilt, no legal conclusion, and — specific to OCR —
 * no claim that a recognized value is correct, confirmed, or "your" anything until she has said so herself. Her Keys reads
 * characters; it does not verify a policy, does not know which date is the expiration date, and never says a percentage.
 * (`tests/lifeAdmin/ocrCopy.test.mjs` holds this file to that, the same way `copyAudit.test.mjs` holds the rest of Life Admin.)
 */
export const OCR_COPY = {
  scanEntry: 'Scan with Her Keys',
  scanEntryHint: 'Take a photo or choose one to read text from, then review before anything is saved.',
  actionSheetTitle: 'Add a record from a photo',
  takePhoto: 'Take photo',
  choosePhoto: 'Choose photo',
  cancel: 'Cancel',

  permissionCameraTitle: 'Camera access was not given',
  permissionCameraBody: 'Her Keys can’t open the camera without it. You can still choose an existing photo, or enter the record by hand.',
  openSettings: 'Open settings',
  enterManuallyInstead: 'Enter manually instead',

  reading: 'Her Keys is reading your photo…',
  readingHint: 'This happens on this device. Nothing is sent anywhere.',
  readComplete: 'Her Keys finished reading the photo.',
  readNothing: 'Her Keys didn’t read anything usable from that photo.',
  readError: 'Her Keys couldn’t read that photo.',

  reviewTitle: 'Review before saving',
  reviewIntro: 'Her Keys read the photo below. Nothing here is saved yet — choose what to keep, and where it belongs, then save it as you would any record.',
  readByHerKeys: 'Read by Her Keys',
  lookRight: 'Does this look right?',
  chooseWhereItBelongs: 'Choose where this date belongs',
  reviewBeforeSaving: 'Review before saving',

  datesHeading: 'Dates Her Keys read',
  noDatesRead: 'Her Keys didn’t read a date it could offer.',
  issuersHeading: 'Names Her Keys read',
  noIssuersRead: 'Her Keys didn’t read a name it could offer.',
  referencesHeading: 'Numbers Her Keys read',
  noReferencesRead: 'Her Keys didn’t read a number it could offer.',

  fieldExpires: 'Expiration date',
  fieldRenewBy: 'Renew-by date',
  fieldReviewOn: 'Review date',
  fieldIssuer: 'Issuer',
  fieldReference: 'Reference number',

  none: 'None of these',
  enterManually: 'Enter manually',
  notSet: 'Not set',
  setTo: (value: string) => `Set to ${value}`,
  unconfirmedCandidate: (value: string) => `${value}. Unconfirmed — not yet chosen for any field.`,
  reveal: 'Reveal',
  hide: 'Hide',

  continueToRecord: 'Continue to record',
  continueHint: 'Opens the usual Add-record form with your choices already filled in. Nothing is saved until you save that form.',
  nothingSavedYet: 'Nothing is saved yet.',
  cancelScan: 'Discard this scan',
  cancelScanHint: 'Discards the photo and everything Her Keys read. Nothing is saved.',
} as const;
