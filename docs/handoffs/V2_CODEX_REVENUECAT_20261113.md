# RevenueCat integration evidence — in progress

No native purchase certification, paywall publication or store/product mutation in this pass. Checkout remains disabled.

Project proj93809efe; Apple app app55f51de583 (com.herkeys.app); Google app app3311d4868e (com.heykeys.app). Default offering ofrng40c3008072 is current, attached to paywall pw9aa8edf9bdb34338. Preserve these identities.

## Credentials and live products

Apple subscription key validation passes. App Store Connect API key is missing. Live product-state reads for monthly prod67a939caaa and yearly prod8423a82588 each return HTTP 422 explicitly requiring App Store Connect credentials. The intended reusable key is XTNYDBS8T8; its previously documented encrypted local path and exact-key-file searches in Downloads/Documents did not find private material. A secure location was requested; no secrets were requested in chat. No sibling Apple app in this RevenueCat project supplies a reusable key.

Google service account reads the catalog/base plans. Subscription-purchase permission validation remains unknown: the purchase API reports package not found. Store registration, permissions and native/sandbox evidence remain outstanding. Do not change the Android package as a workaround.

Live get-product-store-state responses at 2026-11-13T13:54:00Z:

| Product | Identifier | Base plan | Live US price | US availability | Trial |
| --- | --- | --- | --- | --- | --- |
| prod0b5bd5665b | monthly:monthly | monthly ACTIVE, P1M | USD 9.99 | enabled | monthly-free-trial ACTIVE, one P1M free phase |
| prod813df0d181 | yearly:yearly | yearly ACTIVE, P1Y | USD 79.99 | enabled | yearly-free-trial ACTIVE, one P1M free phase |

Monthly grace P7D; annual P14D. Both acquisition rules use anySubscriptionInApp. Returned regional maps contain US; do not infer other territories. Eligibility must still come from the store for the actual purchaser. RevenueCat catalog subscription metadata alone was not used as store-price/trial evidence.

## Paywall

Read the full published revision 12 and draft revision 13 component trees and localization bindings. Rendered draft light/no-offer. Renderer values are not native certification.

Published revision 12 has confirmed defects: Terms and Privacy both point to https://example.com; visible video-content claim is unsupported by the product contract; a web-checkout action says “Or, save 30%” without validated commercial support. Keep access gated until a validated correction is published.

Draft revision 13 has the Her Keys Premium title, three supported capabilities (Daily Load proposals approved by the user, consented Smart Inbox, Momentum reviews), annual default selection, dynamic store price/period bindings, renewal wording, purchase/dismiss/restore actions and canonical legal PDFs. No reachable video row or web-checkout/savings action. Old video/savings localization strings are unused; they are not visible draft defects.

The draft intro-offer variant says free/Start free trial. Google offers inspected here are free; Apple offers remain unverified. Do not certify both stores' trial language until Apple is checked. A future paid introductory offer must not use a free-trial claim. The screenshot confirms ordinary-plan copy, CTA and legal links; native restore visibility/interaction, scrolling, eligibility, dismissal/error handling and rendering remain NOT_RUN. Configured actions alone do not prove those native interactions.

Publication BLOCKED pending Apple product/offer validation and required commercial/native evidence. No change was justified solely by unused localization strings. Branding and product identities preserved.

## Webhooks and gates

Staging sandbox whintgr2afbbcfb32 and Production whintgrf7d1c93842 point to their intended Supabase environments and are active. Signing/authentication, delivery, lifecycle mapping, idempotency/replay, reconciliation and failure recovery remain to be challenged; configuration alone is insufficient evidence.

Both live environments: premium_enabled=true, webhook_processing=true, checkout_enabled=false, test_store_checkout_enabled=false. Production allow_test_fixtures=false; Staging true. Daily Load Premium, Smart Inbox and Momentum are enabled/released in both. These are configuration observations, not proof of a purchase or completed Premium journey.
