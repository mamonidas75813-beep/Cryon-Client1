# CRYON CLIENT v0.10.3 — Java Runtime Install Reliability

## Fixes
- Java runtime installation no longer renames or replaces an existing `temurin-<major>` folder. Each Temurin package is extracted into a checksum-specific immutable runtime directory to avoid Windows `EPERM` errors caused by locked runtime files or directory replacement.
- Existing checksum-matched runtimes are validated and reused. Corrupt or partial installs are left untouched and a fresh versioned destination is used.
- Managed Java discovery now searches bounded nested vendor/version folders inside known runtime roots.
- Create Server Java selection includes compatible missing Java majors as download-on-selection options. Selecting one downloads, SHA-256 verifies, installs, verifies the version, and selects it for that server.
- The manual Install Java button remains available as a fallback.
- Concurrent requests for the same Java major share a single install task.

## Verification
- `npm run check` passes.
- `npm test` passes: 86 tests.
- JavaScript syntax checks pass.
- A real Windows Temurin download/install and Minecraft server launch still require Windows-side validation.
