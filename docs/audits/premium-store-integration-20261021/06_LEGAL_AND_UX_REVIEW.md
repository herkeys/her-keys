# Legal and UX review
Reviewed the existing owner-hosted eight-page Terms and Privacy PDFs directly. Current source URLs are in src/config/legal.ts. Terms identify store-returned duration/price/first billing date, automatic renewal, store cancellation/refund rules, and the distinction between account deletion and subscription cancellation. No substantive policy was changed or published; no attorney certification is asserted.

Published RevenueCat paywall revision 12 had example.com Terms/Privacy destinations, an unsupported video benefit, an unrelated food hero, and a second web-checkout button with hardcoded 'save 30%' copy. These are commercial release blockers.

A corrected UNPUBLISHED draft was saved and inspected structurally and via light render: Her Keys Premium, exactly the delivered three capabilities, monthly and annual price variables, eligible-trial conditional CTA, one native purchase button, immediate close, restore, automatic renewal/cancellation and Free-tool disclosure, and the actual Terms/Privacy PDFs. Unused old localization strings do not imply a remaining visible component; check bindings. The preview renderer uses a representative one-week offer; that sample is not store trial evidence. Live store reads verify P1M / ONE_MONTH.

The draft has not been published. Native price/offer rendering, accessibility focus, dark mode and all small-device layouts are not claimed certified from a static render. Existing full V2 UI/accessibility regression suites are retained.

The native Account surface was inspected on the Android emulator after preserved-session restoration: server-confirmed Premium status/date and all three tool descriptions are present. Debug QA found a React sibling-key collision between Premium and Restore; distinct account-scoped keys repair it without altering purchase authorization. Focused UI checks passed 41/41. This is Account UI evidence, not store checkout accessibility certification.

Account UX now shows verified trial and cancellation status, removes the unsupported promise that a pending customer 'won’t be charged twice', and tells them to check their store before attempting another purchase. D06 local-only access shows a calm offline/sync-paused notice and retry. Free planning/capture remains available; no wholesale redesign or new Premium plan was introduced.

[Paywall draft for owner review](https://app.revenuecat.com/projects/93809efe/paywalls/pw9aa8edf9bdb34338/builder).
[Apple subscription requirements](https://developer.apple.com/app-store/review/guidelines/#subscriptions).
[Google subscription disclosure requirements](https://support.google.com/googleplay/android-developer/answer/9900533).

