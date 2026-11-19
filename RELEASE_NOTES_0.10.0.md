# CRYON CLIENT v0.10.0 — Server Studio Advanced

## Create Server
- Added a live host-memory card with used percentage, used/total memory and available memory.
- Added synchronized RAM allocation controls: numeric MB entry and draggable slider.
- RAM maximum is recalculated from detected available memory, a host safety reserve and allocations held by other running servers.
- Added per-server Java runtime selection and installation for supported Java majors (8, 16, 17, 21 and 25).
- Added compatibility labels based on the selected Minecraft server release.
- Added advanced world/server options: seed, world type, structures, hardcore, Nether, command blocks and spawn protection.
- Added server resource optimization presets and validated JVM settings.
- Added clearer PREPARING / ONLINE / STOPPING / FAILED status presentation.

## Launcher and Settings
- Added global Java runtime selection in Settings.
- Settings refresh Java compatibility when the active profile/version changes.
- An old globally selected Java is not forced onto a newer Minecraft version; the launcher falls back to EML-managed compatible Java.
- Updated the home Launch Game action to a blue visual treatment and shows PREPARING / GAME RUNNING status.

## Notes and limitations
- This archive is the Electron source project, not a compiled Windows installer.
- Windows packaging requires running `build.bat` on Windows 10/11 x64 with Node.js 22+.
- Hardware sensor availability varies by operating system and hardware; unsupported measurements are not fabricated.
- The launcher UI reports GAME RUNNING but does not add a fake stop-game action where the integrated launcher API does not expose a supported stop call.
- Public Playit hosting still requires the user to claim the agent and create a tunnel in their Playit account.
