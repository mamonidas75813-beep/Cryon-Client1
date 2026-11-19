# CRYON CLIENT 0.10.6

## Automatic Fabric performance mods
- Added first-launch automatic installation of the 12 configured Fabric performance mods for every Fabric profile.
- Resolve versions against the exact Minecraft release and Fabric loader selected by the profile.
- Prefer release versions, using beta/alpha only when no release is available for that exact version. Unsupported mods are skipped rather than copied from another Minecraft version.
- Install required Modrinth dependencies recursively and verify Modrinth checksums.
- Keep an installation record inside each isolated profile, avoid repeat downloads, respect already-installed/disabled managed mods, and retry transient failures on later launches.
- Mod installation is attempted before Minecraft starts. A failed mod download is logged and does not block the game launch.
