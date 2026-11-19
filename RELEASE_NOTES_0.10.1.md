# CRYON CLIENT v0.10.1 — Windows build pipeline fix

- Replaced the thin batch wrapper with a Windows x64 preflight and a single Node-based release runner.
- The runner installs devDependencies explicitly, validates Electron and electron-builder are present, then runs source checks and tests.
- Installer and portable packaging now execute as separate visible stages; each artifact is collected before the next build starts.
- Stale EXEs are removed before building so a failed new build cannot leave old binaries looking like fresh output.
- Full stdout/stderr is streamed to the console and saved under `build-logs/` for diagnosis.
- Final verification checks both EXE files and writes SHA-256 checksums.

This release-pipeline update has not been executed on a Windows host in this environment. Run `build.bat` on Windows 10/11 x64 with Node.js 22+; if it fails, share the newest `build-logs/windows-build-*.log` file.
