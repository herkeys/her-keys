#!/bin/bash
C=/c/Users/jsmit/ui02-cap.sh
$C 02-welcome "mode=welcome&scene=welcome" 40
$C 03-premium-intro "mode=welcome&scene=premium" 30
$C 04-account-selection-ios "mode=welcome&scene=choice&platform=ios" 30
$C 05-account-selection-android "mode=welcome&scene=choice&platform=android" 30
$C 06-signup "mode=welcome&scene=signup" 30
$C 07-signin "mode=welcome&scene=signin" 30
$C 08-invalid-credentials "mode=welcome&scene=password-invalid" 30
$C 09-connection-error "mode=welcome&scene=password-unreachable" 30
$C 10-provider-unavailable "mode=welcome&scene=provider-unavailable" 30
$C 11-confirm-email "mode=welcome&scene=confirm-email" 30
$C 12-forgot-password "mode=welcome&scene=recovery" 30
$C 13-otp "mode=welcome&scene=otp" 30
$C 14-provider-pending-disabled "mode=welcome&scene=pending" 30
$C 15-session-restore-degraded "mode=welcome&scene=degraded" 30
$C 16-account-conflict "mode=welcome&scene=conflict" 30
$C 17-consent-legal "mode=consent&stage=legal" 30
$C 18-consent-legal-filled "mode=consent&stage=legal-filled" 30
$C 19-consent-recovery-error "mode=consent&stage=error" 30
$C 20-permissions "mode=consent&stage=permissions" 30
$C 21-audit-goals "mode=audit&step=1" 30
$C 22-audit-strengths "mode=audit&step=2" 30
$C 23-audit-struggles "mode=audit&step=3" 30
$C 24-audit-talk-it-out "mode=audit&step=4" 30
$C 25-components "mode=components" 30
$C 26-ai-language "mode=ai" 30
$C 27-assets "mode=assets" 30
echo ALLDONE
