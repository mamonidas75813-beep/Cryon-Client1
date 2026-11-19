# CRYON CLIENT Windows build troubleshooting

## Supported build host

- Windows 10/11 x64
- 64-bit Node.js 22 or newer (Node.js 26.13.0 LTS is supported and recommended for this setup)
- npm installed with Node.js
- Internet access to npm and Electron/electron-builder download endpoints
- Enough free disk space for npm dependencies, Electron caches and both release artifacts

Run `build.bat` from the extracted `CRYON-CLIENT` project folder. Do not run it from inside the ZIP preview or from a different directory.

## What the build does

1. Checks Node.js, npm and x64 process architecture.
2. Removes old build outputs and old release EXEs to avoid stale files being mistaken for new builds.
3. Installs dependencies with `--include=dev` (Electron and electron-builder are development dependencies).
4. Runs `npm run check` and `npm test`.
5. Builds the NSIS installer and copies the generated EXE to `release/`.
6. Builds the portable EXE and copies it to `release/`.
7. Verifies Windows PE headers, minimum artifact size and SHA-256; writes `release/SHA256SUMS.txt`.

All console output is saved to `build-logs/windows-build-<timestamp>.log`.

## Common error meanings

- `Node.js 22+ is required`: install 64-bit Node.js 22 or newer (26.13.0 LTS is recommended), close/reopen the terminal, and check `node -v` and `node -p process.arch`.
- `electron-builder is not recognized` / missing build dependency: dependencies were not installed, or npm omitted devDependencies. The current runner explicitly uses `npm install --include=dev`.
- `ECONNRESET`, `ETIMEDOUT`, `ENOTFOUND`, download failures: npm/Electron/toolset downloads could not reach their servers. Check network/proxy/DNS and rerun; do not disable TLS certificate verification.
- `No identity found`, `certificate`, `signtool`, or `forceCodeSigning`: the installer config requires signing but no usable code-signing certificate is available. For a signed public release, configure a valid certificate using `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD` (or the supported Windows certificate store). Do not embed the certificate password in the project.
- `EPERM`, `EBUSY`, or access denied: close CRYON and Explorer windows using the output folders, check that the project is in a writable folder, and retry. Keep Windows Defender enabled.
- `ENOSPC` or disk-full errors: free space on the project drive and the user temp/cache drive.
- `Cannot find module` during packaging: share the log; this can indicate a missing production dependency or an incomplete npm install.

## What is not guaranteed

The build runner can check source/tests and verify the EXE structure/checksums, but this does not prove Windows SmartScreen reputation, successful installation on every Windows PC, or live Minecraft login/gameplay. Those require a real Windows test machine.
