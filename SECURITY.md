# Security policy

Report security issues privately to the repository owner through GitHub private vulnerability reporting (enable this under repository Settings before publishing). If unavailable, use the maintainer's verified private contact; do not post tokens, credentials, exploit details or user data in public issues.

Include affected version, impact, reproduction steps and redacted logs. Do not test on others' accounts or systems without permission. The maintainer should acknowledge, investigate, fix and coordinate disclosure; no response SLA is promised. Verify current signed releases and do not install unverified binaries. Suspected SignPath signature misuse should also be reported to support@signpath.io.

Before release, review dependencies, download/execution integrity, Electron IPC and account-token handling, offline authentication behavior, third-party licenses and network disclosures. Rotate exposed credentials and revoke affected artifacts if appropriate.
