# Her Keys — AI Data Processing Consent Copy

**Product decision:** October 8, 2026. **Status:** approved wording / implementation requirement, **NOT** an implemented or certified UI.  
**Source inspiration:** K Scan AI's legal-acceptance and permissions onboarding stages; adapted for Her Keys' text and household-context AI features.  
**Review required before release:** privacy counsel, true provider/data-handling map, storage/consent versioning, and signed-in Staging integration.

## Final user-facing term

Use **AI Data Processing** — **never "AI Image Processing"** — in the new Her Keys welcome/onboarding consent and permissions experience.

**Checkbox label (legal acceptance):**  
> I consent to AI data processing.

**On-screen description (consent / permissions explanation):**  
> Her Keys uses information you choose to share with its AI features — such as your messages and relevant tasks, schedules, and household details — to provide planning help and AI-generated recommendations. The information needed for an AI request may be processed by external AI providers, including Google Gemini. See the Privacy Policy for details.

**Expandable "Learn more" copy:**  
> When you use an AI feature, Her Keys may send your request and the context needed to respond to an AI service. That context can include sensitive family information you have entered, so please share only what is needed. AI suggestions may be inaccurate and do not replace professional advice. Her Keys will explain the applicable processing and retention practices in its full Privacy Policy.

**Links:** "Full Privacy Policy" and "Terms and Conditions" open the owner-published Her Keys documents; no K Scan names, URLs or provider accounts.

## Placement in the K Scan-inspired welcome tree

- **Legal / consent acceptance:** Use the checkbox exactly as above, alongside Terms agreement, Privacy acknowledgment and confirmation of age 18+. Do not silently record consent simply because someone tapped Google, Apple or Email.
- **Permissions information page:** Show an **AI Data Processing** disclosure (not AI image processing) separate from OS permission categories such as calendar, notifications or location. **AI data processing is not an Android/iOS device permission**; do not open a system permission prompt for it.
- **Sign in:** A returning user must not repeat consent unless the applicable legal policy version changed or acceptance was never recorded; unfinished setup resumes.
- **Consent storage:** Must write an account-scoped, versioned acceptance record, and block any mandatory-consent gate on failed persistence. The current Her Keys codebase does **not** yet have a dedicated Terms/Privacy/permissions stage or legal acceptance ledger; this document alone doesn't supply them.

## Scope and safety

1. Do **not** suggest Her Keys processes *only images* or automatically sends every calendar, child record or household note to an AI provider. Send only context necessary for the feature being used.
2. Do **not** claim that AI requests are entirely local, that third-party providers never retain data, or that any provider never uses data for training without verified contractual/procedural evidence.
3. Preserve existing Apple/Google/email-password authentication, account isolation, and native platform behavior.
4. Keep legal consent distinct from optional device privileges (notifications/location/calendar) and from subscription decisions.
5. This copy is approved product language, **not yet certified legal text** or an assertion that Staging/Production stores consent.

## Acceptance gate

```text
AI_PROCESSING_LABEL=AI Data Processing
AI_PROCESSING_CHECKBOX=I consent to AI data processing.
OLD_AI_IMAGE_PROCESSING_COPY=ABSENT_FROM_HER_KEYS_CUSTOMER_UI
LEGAL_ACCEPTANCE_VERSIONED=PASS|BLOCKED
PERMISSIONS_PAGE_RENDERED=PASS|BLOCKED
AI_PROVIDER_DISCLOSURE_ACCURATE=PASS|BLOCKED
STAGING_TESTED=PASS|BLOCKED
```
