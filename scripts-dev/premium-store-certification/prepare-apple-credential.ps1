# Owner-run handoff only. Never prints private material or submits credentials to a browser.
[CmdletBinding()]
param([switch]$ExportForOwnerUpload, [switch]$Cleanup)
$ErrorActionPreference = 'Stop'
$billingDirectory = Join-Path $env:LOCALAPPDATA 'HerKeys\billing'
$uploadDirectory = Join-Path $billingDirectory 'owner-upload'
$keyFile = Join-Path $uploadDirectory 'AuthKey_XTNYDBS8T8.p8'
if ($Cleanup) {
    if (Test-Path -LiteralPath $keyFile) { Remove-Item -LiteralPath $keyFile -Force }
    Write-Output 'Temporary upload key removed. The encrypted original is preserved.'
    return
}
if (-not $ExportForOwnerUpload) {
    Write-Output 'Run with -ExportForOwnerUpload when ready to upload in RevenueCat; run with -Cleanup immediately afterward.'
    return
}
$encrypted = Import-Clixml -LiteralPath (Join-Path $billingDirectory 'herkeys-revenuecat-asc-key.clixml')
$credential = ([Net.NetworkCredential]::new('', $encrypted).Password | ConvertFrom-Json)
if ($credential.verifiedBundle -ne 'com.herkeys.app' -or $credential.keyIdentifier -ne 'XTNYDBS8T8') { throw 'Her Keys credential identity mismatch.' }
New-Item -ItemType Directory -Path $uploadDirectory -Force | Out-Null
$acl = [Security.AccessControl.DirectorySecurity]::new()
$sid = [Security.Principal.WindowsIdentity]::GetCurrent().User
$acl.SetOwner($sid)
$acl.SetAccessRuleProtection($true, $false)
$rule = [Security.AccessControl.FileSystemAccessRule]::new($sid, 'FullControl', 'ContainerInherit,ObjectInherit', 'None', 'Allow')
$acl.AddAccessRule($rule)
Set-Acl -LiteralPath $uploadDirectory -AclObject $acl
[IO.File]::WriteAllText($keyFile, $credential.keyP8, [Text.UTF8Encoding]::new($false))
Write-Output ('Upload file: ' + $keyFile)
Write-Output ('Key ID: ' + $credential.keyIdentifier)
Write-Output ('Issuer ID: ' + $credential.issuerIdentifier)
Write-Output 'Use Her Keys / Apple app app55f51de583 in RevenueCat. After saving and verifying, run this script with -Cleanup.'
$credential = $null
$encrypted = $null
