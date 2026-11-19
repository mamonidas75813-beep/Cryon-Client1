# CRYON CLIENT profile folders (v0.7.0)

Every saved profile has a unique EML instance slug based on Minecraft release and loader by default. The player may rename the display label, but the on-disk instance name stays stable so existing game data is not silently renamed.

## Before the first PLAY

Creating a profile saves profile metadata only. It does not create a fake game directory, `options.txt`, `versions/`, `assets/`, `libraries/` or `saves/`. On the first PLAY, CRYON prepares the actual EML root, creates a `mods/` folder only for modded profiles, and writes `.cryon-options-pending` with the selected performance settings.

EML Lib prepends a dot to its configured root. By default, `%APPDATA%` is the EML working parent, with no extra `.nova` or `nova-client` wrapper. A profile named `26.3-Fabric` maps to `%APPDATA%\\.26_3_fabric`; `1.21.1-Fabric` maps to `%APPDATA%\\.1_21_1_fabric`. The engine, Modrinth manager, pending settings and **Open Profile Folder** use the same exact directory resolver.

## After pressing PLAY

EML Lib downloads the selected Mojang version, loader, libraries, assets and Java runtime (when automatic Java is enabled) into the isolated instance. Minecraft and the selected loader populate actual files and user-data folders as needed, including `versions/`, `assets/`, `libraries/`, `logs/`, `saves/`, `resourcepacks/`, `screenshots/`, crash reports and `options.txt`.

The Profiles screen shows the exact resolved path for every profile and distinguishes an absent folder, a first-run pending folder, and a verified installation. Open Profile Folder opens that resolved folder; it does not open a substitute/demo directory.

When Minecraft first creates `options.txt`, CRYON applies queued performance settings and removes `.cryon-options-pending` only after the write succeeds. If the file does not exist yet, the queue remains for the next successful game run.

## Loader-specific folders

- Vanilla: CRYON does not create a `mods/` directory.
- Fabric: CRYON prepares `mods/`; Fabric creates its own loader/config data when required.
- Forge / NeoForge: CRYON prepares `mods/`; the loader creates its config data when required.
- Quilt: CRYON prepares `mods/`; Quilt creates its own loader/config data when required.

Shader packs are stored under `shaderpacks/` when shader support is installed. Resource packs are stored under `resourcepacks/`. These directories are created when content needs them rather than as fake placeholders.

Minecraft binaries, libraries, assets, natives and Java runtimes are downloaded when needed and are not bundled into CRYON. Mods, configs, worlds, resource packs, shaders, screenshots, options and logs remain isolated per profile.
