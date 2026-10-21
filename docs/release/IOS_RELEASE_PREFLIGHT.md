# iOS Production release preflight

The release identity guard authorizes `integration/build2-candidate-20261020` as a release source alongside
`build/02-gemini-integration`. This is a source authorization only; it does not approve an App Store submission or start a
build. The current V2 candidate at the time this change was prepared was `672714e7077f568c1577b01fab3dd35653bfa82c`.

The preflight resolves the Expo public configuration and preserves all existing checks: canonical Her Keys Android and
iOS identifiers, slug, EAS owner and project, Production Supabase project, mandatory V2 consent gate, empty data mode,
clean tracked tree, branch upstream at HEAD, full commit SHA, and a live `git ls-remote` match for the exact source SHA.
It prints the candidate SHA and identity fields; it does not print environment key values.

## Tracked checkout in PowerShell

From an existing Her Keys checkout, with all intended changes committed and pushed:

```powershell
git fetch origin
git switch integration/build2-candidate-20261020
git pull --ff-only origin integration/build2-candidate-20261020
npm ci
eas env:exec production 'npm run release:preflight'
```

For a fresh tracked checkout:

```powershell
git clone git@github-herkeys:herkeys/her-keys.git
Set-Location .\her-keys
git fetch origin integration/build2-candidate-20261020
git switch --track origin/integration/build2-candidate-20261020
npm ci
eas env:exec production 'npm run release:preflight'
```

The EAS Production environment must contain the Her Keys Production backend URL, client publishable key,
`EXPO_PUBLIC_HERKEYS_BACKEND=production`, `EXPO_PUBLIC_HERKEYS_DATA_MODE=empty`, and
`EXPO_PUBLIC_HERKEYS_V2_CONSENT_GATE=true`. EAS CLI authentication must resolve to the Her Keys EAS project. If the
preflight fails, do not build; resolve the reported identity, environment, branch, tree, upstream, or remote-SHA failure
and rerun it.

## Production iOS environment preflight

```powershell
eas env:exec production 'npm run release:preflight'
```

Require the final line `RELEASE_IDENTITY=PASS` and retain the printed `BRANCH`, `SOURCE_SHA`, and `REMOTE_SOURCE_SHA`
with the release record. Confirm the two SHA values match. This command runs only the preflight; no IPA is built, no
TestFlight upload is made, and no App Store release is submitted.
