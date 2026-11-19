# CRYON CLIENT v0.9.0 — Server Studio Upgrade

## Added

- Settings button to install managed Eclipse Temurin Java 21 JRE.
- SHA-256 verification, safe staging/extraction, runtime verification and automatic selection of the managed Java executable.
- Java runtime compatibility status on Settings, including an explicit warning when an older Java runtime is selected for Minecraft 1.21.8+.
- Host CPU and RAM percentage display, physical/logical CPU topology and detection-source reporting.
- Separate Java server-process CPU and RAM percentage display.
- Playit.gg Windows x64 agent download with release SHA-256 verification, start/stop, agent output, claim-link opening and public hostname storage per server.

## Updated

- Java 21 managed runtime is automatically preferred for server releases requiring Java 21 when the selected runtime is absent or older.
- Resource cards distinguish host utilization, individual server process use and configured JVM heap maximum.
- Application exit attempts to shut down active local servers and the Playit agent cleanly.

## Important limitations

- Playit account claim and Minecraft Java tunnel creation still happen in the user's Playit account dashboard. CRYON does not create a tunnel automatically or fabricate a public hostname.
- Playit agent auto-download currently supports Windows x64. Java 21 runtime setup supports the platforms for which Adoptium publishes a matching package.
- Temperature/fan/GPU sensors are not guaranteed across hardware; unavailable readings are not invented.
- This is a source project ZIP, not a precompiled Windows EXE. Build on Windows with `build.bat`.

## Verification

`npm run check` and `npm test` are part of the release validation. Automated tests confirm local code behavior, but they do not substitute for testing an actual Minecraft server and Playit tunnel on the target Windows PC.
