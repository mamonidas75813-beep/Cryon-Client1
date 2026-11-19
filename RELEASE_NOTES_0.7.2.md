# CRYON CLIENT v0.7.2

## Local Server Manager
- Added a **Create Server** sidebar category directly above Settings.
- Added local Paper, Purpur and official Vanilla server creation with Minecraft version, server port, max-player and RAM allocation settings. The Minecraft EULA must be explicitly accepted before a server is created.
- Added host CPU and memory detection, JVM allocation display, local server status and player-count ping.
- Added Start, Stop and Restart controls with a live server console and command input.
- Added a Modrinth plugin search/installer for Paper/Purpur servers and local plugin JAR import.
- Added a server file manager with folder navigation, text configuration editing, upload and deletion safeguards.
- Local server processes are asked to stop cleanly when CRYON exits.
- Server files are stored under the application user-data directory in `servers/`.

## Notes / limitations
- The server runs on the user's own PC. Public access from outside the home network may require router port forwarding or a secure tunnel; CRYON does not provide a hosted VPS or relay.
- The current UI offers Paper, Purpur and Vanilla. Bukkit/Paper plugins are not available on Vanilla.
- The built-in editor supports text/configuration files up to 1 MB. Binary assets and larger files should be managed through the server folder in Explorer.
- TPS, per-process CPU/RAM and automated world backups are not included in this first local-manager build.

## Verification
- `node scripts/check-source.js` passed.
- `npm test` passed (71 tests).
- The Windows EXE was not built in this Linux environment; run `build.bat` or the Windows packaging workflow on Windows to produce the installer/portable EXE.
