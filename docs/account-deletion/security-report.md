# Security review — in progress

Proved locally with real SQL: authenticated/anon cannot execute the internal command; stale user tokens lose RLS access and privileged bootstrap access; other-account access remains isolated; recent-auth checks reject stale sessions; duplicate requests do not reset deadline; replacement/single-use restoration; no early claim; restore wins only before claim; lease/fence rejection; kill switch; complete Auth absence required for terminal success. Mutation tests detect removal of RLS, worker execution grants, and early-eligibility guards.

Service credentials remain server-side. Recovery/receipt hashes use SHA-256 with 256-bit random proof input. Outbox ciphertext uses AES-GCM with the existing server encryption key. Recovery links use URL fragments, explicit POST confirmation, no-referrer/no-store pages and no account-page analytics attributes. Resend errors remain generic; service/provider errors must not expose email existence. Full adversarial timing/captcha certification remains outstanding.

Staging baseline advisors: existing intentional service-only tables have no client policies; bootstrap/claim are intentional authenticated SECURITY DEFINER RPCs; leaked-password protection is disabled. New advisor findings must be reviewed after deployment. No production security configuration was changed.

Shared immutable-ledger triggers remain enabled globally. Purge executes under a constrained service-only SECURITY DEFINER command, preserving the trusted-current_user contract. No client-controlled GUC authorizes purge.

Open security work: full stale-JWT coverage for every privileged service; storage ownership against Production census; stale external-call races; all provider error reconciliation; shared-household safe partial cleanup; approval of terminal audit/backup/provider retention. Source is not certified while these remain.
