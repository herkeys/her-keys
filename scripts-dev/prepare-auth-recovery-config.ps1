# Read-only preparation. Never PATCH Auth settings or emit credential values.
param([Parameter(Mandatory=$true)][ValidateSet('staging','production')][string]$Environment)
$ErrorActionPreference = 'Stop'
$projectRefs = @{ staging='fhhudicklmpofuzkxeqe'; production='npykvnxnehlsdlbumzwk' }
$projectRef = $projectRefs[$Environment]
$templatePath = Join-Path $PSScriptRoot '../supabase/email-templates/herkeys-recovery.html'
$template = [IO.File]::ReadAllText($templatePath)
if ($template -notmatch '\{\{\s*\.Token\s*\}\}' -or $template -match '\.ConfirmationURL|\.TokenHash|href\s*=') {
  throw 'Recovery template must contain only the supported numeric OTP flow.'
}
$tokenReference = 'HK_HERKEYS_SUPABASE_MANAGEMENT_TOKEN'
$smtpReference = 'HK_' + $Environment.ToUpperInvariant() + '_RESEND_SMTP_PASSWORD'
$managementToken = [Environment]::GetEnvironmentVariable($tokenReference, 'Process')
$inspected = $false
$current = $null
if ($managementToken) {
  try {
    $headers = @{ Authorization=('Bearer '+$managementToken) }
    $project = Invoke-RestMethod -Method Get -Uri ('https://api.supabase.com/v1/projects/'+$projectRef) -Headers $headers
    if ($project.id -ne $projectRef) { throw 'wrong_project' }
    $current = Invoke-RestMethod -Method Get -Uri ('https://api.supabase.com/v1/projects/'+$projectRef+'/config/auth') -Headers $headers
    $inspected = $true
  } catch {
    # Server/SDK exceptions can contain authorization headers or full settings.
    throw 'Her Keys Auth-management inspection failed; no settings were changed.'
  } finally {
    $managementToken = $null
    $headers = $null
  }
}
$smtpConfigured = if ($inspected) { -not [string]::IsNullOrWhiteSpace($current.smtp_host) } else { $null }
$allowlist = if ($inspected) { @(([string]$current.uri_allow_list).Split(',') | Where-Object { $_ }) } else { @() }
$loopback = @($allowlist | Where-Object { $_ -match '^[a-z][a-z0-9+.-]*://(?:localhost|127\.0\.0\.1|\[::1\])(?=[:/]|$)' })
$plan = [ordered]@{
  environment=$Environment
  projectRef=$projectRef
  operation='READ_ONLY_PREPARATION_NO_CONFIGURATION_WRITE'
  authSettingsInspected=$inspected
  status= $(if($inspected){'PREPARED_REQUIRES_REVIEW_AND_LIVE_CERTIFICATION'}else{'BLOCKED_AUTH_MANAGEMENT_ACCESS'})
  requiredSecureReferences=@($tokenReference)
  smtpCredentialReference=$smtpReference
  smtpCurrentlyConfigured=$smtpConfigured
  sendEmailHookEnabled= $(if($inspected){$current.hook_send_email_enabled -eq $true}else{$null})
  preserveExistingProductionSmtp=$true
  recoveryTemplate='supabase/email-templates/herkeys-recovery.html'
  nonSecretTemplatePatch=@{
    mailer_subjects_recovery='Your Her Keys password reset code'
    mailer_templates_recovery_content=$template
  }
  proposedStagingSmtp=@{smtp_host='smtp.resend.com';smtp_port='465';smtp_user='resend';smtp_admin_email='accounts@herkeys.app';smtp_sender_name='Her Keys'}
  redirectReview=@{
    liveAllowlistInspected=$inspected
    loopbackEntryCount=$loopback.Count
    proposedSiteUrl='https://herkeys.app'
    requiredIdentityCallback='herkeys://auth/callback'
    preserveCalendarCallback='herkeys://calendar-connected'
    instruction='Read current values; preserve legitimate callbacks, remove unintended loopback entries and validate exact callbacks before writing. No redirect policy was applied by this script.'
  }
  productionPrerequisite='Successful independent Staging SMTP and full numeric recovery certification; inspect Production and apply only verified differences.'
  rollback='Before writing, securely retain only touched old settings, preserve existing SMTP credentials, and prepare exact field restoration. If replacing a configured SMTP credential, require its secure rollback reference first.'
}
$planDirectory = Join-Path $env:TEMP 'HerKeysAuthRecovery'
[IO.Directory]::CreateDirectory($planDirectory) | Out-Null
$planPath = Join-Path $planDirectory ($Environment+'-recovery-plan.json')
[IO.File]::WriteAllText($planPath, ($plan | ConvertTo-Json -Depth 8), [Text.UTF8Encoding]::new($false))
@{ environment=$Environment; status=$plan.status; authSettingsInspected=$inspected; smtpCurrentlyConfigured=$smtpConfigured; configMutated=$false; planPath=$planPath; missingManagementReference= $(if(-not $inspected){$tokenReference}else{$null}) } | ConvertTo-Json -Compress
$current = $null
