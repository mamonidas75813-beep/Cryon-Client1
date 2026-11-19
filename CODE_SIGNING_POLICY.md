# Code signing policy

**Status: proposed; Foundation approval and technical validation pending.** No present release is represented as Foundation-signed by this policy.

If accepted: Free code signing provided by [SignPath.io](https://signpath.io/), certificate by [SignPath Foundation](https://signpath.org/).

## People and controls

Proposed maintainer/committer, reviewer and release approver: the owner of the source repository (currently intended GitHub account `mamonidas75813-beep`). The owner must confirm these role assignments and list any additional authorized members before application. The source owner must review external contributions before merging; every signing request requires an explicit, authorized human approval in SignPath. No automated approval is permitted.

Protect the public source repository's default branch and version tags; require checks and reviews as appropriate, restrict changes to workflow/build files, use MFA, and restrict signing credentials to the protected release environment. Never expose signing credentials to pull requests, logs, artifacts or the app.

## Scope and verification

The proposed signing pipeline is `.github/workflows/signpath-windows.yml`. It uses GitHub-hosted Windows runners, a committed dependency lockfile, source checks, tests and an exact installer artifact from a version tag. The initial trial signs the outer project NSIS installer only; inner launcher, uninstaller and portable signing require a separately approved and tested packaging design. Do not re-sign upstream binaries. The artifact configuration restricts product name and version. Signed candidates are checked for a valid timestamped Foundation signature and a SHA-256 checksum is produced after signing. No candidate is auto-published.

No public release or automatic update should use the trial artifact until installed-file signature coverage, upgrade behavior, final metadata and application security have been reviewed with SignPath. Publish exact approved artifacts from the reviewed source tag, never a modified or rebuilt copy. Users can inspect Windows Properties → Digital Signatures or use `Get-AuthenticodeSignature` in PowerShell.

See the [Privacy policy](PRIVACY.md), [Security policy](SECURITY.md) and [Foundation conditions](https://signpath.org/terms). Report suspected signing misuse privately to SignPath at support@signpath.io and the project maintainer.
