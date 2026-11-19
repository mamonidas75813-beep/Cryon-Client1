# CRYON CLIENT v0.11.7

A Windows-focused Minecraft Java launcher with a FastClient-inspired profile workflow, isolated version/loader instances, Modrinth content management, account assignment, performance presets, and pending first-run settings.

## Code signing policy

[Code signing policy](CODE_SIGNING_POLICY.md) · [Privacy policy](PRIVACY.md) · [Security reporting](SECURITY.md)

SignPath Foundation signing is proposed, not approved or active. See [application and CI setup](SIGNPATH_SETUP.md) before publishing or submitting binaries. The legacy release workflow is opt-in; the SignPath workflow produces candidates only.

## Partner servers and quick join

Version 0.11.1 adds a dedicated **Partners** category with a FastClient-inspired server directory, search, recommended/online sorting, featured partner cards, and a separate **Your Servers** collection. The home page keeps a compact featured-server panel with a View all servers shortcut. The directory includes a **Join using profile** selector so players can choose a Minecraft version/loader that the server accepts. Solvane MC (`play.solvanemc.fun`) is the current featured partner, using the supplied logo. Users can save and remove up to 50 personal community server entries.

On each profile's first launch, CRYON places Solvane MC at the top of that profile's Minecraft multiplayer list with the 64×64 server icon and a gold star in its display name. Clicking a server card's **PLAY** action selects the active profile (or the first saved profile if no active ID is available), writes the selected destination to that profile's `servers.dat`, and passes the direct-join arguments to EML Lib through its `minecraft.args` configuration field. Minecraft 1.20+ uses `--quickPlayMultiplayer`; older versions use legacy server/port arguments. New `servers.dat` files are gzip-compressed NBT, existing entries are preserved, and duplicate addresses are replaced. Each profile maintains its own server list. A live Solvane MC connection still needs to be confirmed on a Windows machine using a compatible Minecraft version and signed-in account.

## Account-first skins and navigation update

Version 0.10.9 removes Performance and Cosmetics from the primary category rail. Skin management is opened from each saved account card using its **Skins** action; CRYON selects that account first so the existing skin tools act on the intended identity. Offline accounts can preview PNG skins, while upload remains limited to eligible Microsoft Minecraft accounts. Default-account and remove actions are available in the account card menu. The Performance page logic remains in the source but is no longer a primary sidebar category.

## Graphite / Frost theme refresh

Version 0.10.8 introduced the larger icon-first category selector inspired by the supplied FastClient reference, while retaining CRYON’s graphite and frost palette.

## Automatic Fabric performance mods

On the first PLAY for each Fabric profile, CRYON checks Modrinth and installs compatible versions of Sodium, Sodium Extra, Lithium, Krypton, Entity Culling, More Culling, C2ME, FerriteCore, ImmediatelyFast, BadOptimizations and Mod Menu. Noisium is server-side only and is therefore not placed in the client profile. Required dependencies are resolved automatically; unsupported versions are skipped.

## Run from source

Requirements: Windows 10/11 x64, Node.js 22+ and npm.

```bat
npm install
npm start
```

The application footer displays the running package version. Confirm it says **v0.11.7** before testing features; an older installed EXE is not updated when you extract a new source ZIP.

## Build Windows packages

On Windows 10/11 x64:

```bat
build.bat
```

This runs Windows x64/Node/npm preflight, installs development dependencies, runs source checks and tests, then creates the NSIS installer and portable EXE in `release/`. Full console output is saved in `build-logs/`. For build failures, open the newest `build-logs/windows-build-*.log` file and share it for diagnosis. This source archive is not a compiled Windows executable. It does not contain Minecraft itself; game versions, assets, libraries, Java runtimes and Modrinth files download on demand.

## Profile directory contract

By default, CRYON sets the game-directory parent to Electron's Windows AppData/Roaming path and persists that explicit parent in settings. EML Lib receives only a safe root slug **without a leading dot** and prepends the dot itself. Thus a display name `26.3-Fabric` becomes the folder:

```text
%APPDATA%\.26_3_fabric
```

The one runtime path resolver in `modules/launcher/paths.js` is used by:

- EML Lib launch (`root` + `process.cwd()` parent)
- first-PLAY workspace and `.cryon-options-pending`
- Modrinth install/list/enable/disable/remove/backup
- profile folder status and Open Profile Folder
- version profile path preview

The profile card now visibly displays the exact resolved path and install state. The launcher must show **v0.11.7** before testing; otherwise the old EXE is still running.

## Version profiles

A saved profile's Minecraft version and loader are its identity. They cannot be mutated in place; use **Add Version** to create another version/loader profile. Renaming changes only its display name and preserves its disk root. Duplicate Version creates a separate profile with its own root, not a copy of another profile's saves or mods.

Profile name defaults to `<Minecraft-version>-<Loader>`. The root slug is lowercase snake_case and is bounded to a safe folder name. Distinct profile roots are validated in settings.

## Pending first-run options

No placeholder `options.txt`, version JAR, assets or libraries are generated by CRYON. When PLAY is pressed, CRYON prepares the actual EML root, creates `mods` only for modded loaders, and stores `.cryon-options-pending`. When Minecraft creates its real `options.txt`, CRYON applies the queued performance options and removes the marker only after a successful write. If the game has not created `options.txt` (or crashes before first-run initialization), the marker remains for a retry.

## Legacy path recovery

Known older parents such as `%APPDATA%\nova-client`, `%APPDATA%\.nova`, `%APPDATA%\.cryonclient\profiles`, and `%APPDATA%\CRYON-CLIENT\profiles` are no longer selected as the active parent. Legacy profile folders are moved directly under `%APPDATA%` only when the canonical destination does not exist. Existing canonical instance directories are never merged, overwritten or deleted. If a destination collision occurs, legacy data remains untouched; use the profile path displayed by the current build to see the actual selected target.

## Included systems

- Mojang release manifest sync with an on-disk cache and conservative offline fallback
- Vanilla, Fabric, Forge, NeoForge and Quilt profile support with compatibility validation
- Microsoft account authentication through EML Lib and local offline identity for permitted offline-mode testing
- Modrinth mods, modpacks, resource packs, shaders and data packs
- Per-profile mods, settings, saves, resource packs and screenshots
- Performance presets, RAM selection and pending options synchronization
- Profile duplicate, rename, delete, account assignment, Open Profile Folder and visible root path
- Advanced local Paper/Purpur/Vanilla/Fabric server management with Java compatibility checks, per-process metrics, combined RAM budgeting, Fabric mods, plugins, console, file manager and world/config backups
- Windows NSIS/portable build pipeline and artifact verification scripts

## Server Studio Advanced v0.10.0

See [RELEASE_NOTES_0.10.1.md](RELEASE_NOTES_0.10.1.md) for the Windows build-pipeline fix and [RELEASE_NOTES_0.10.0.md](RELEASE_NOTES_0.10.0.md) for the current Java selectors, live host-memory display, numeric + slider RAM allocation, per-server memory budgeting, server tuning and world settings. The previous [v0.9.0 server notes](SERVER_STUDIO_0.9.0.md) document the Java installer, host/process monitoring and Playit.gg agent integration. CRYON creates servers locally on this PC. Playit still requires the user to authorize the agent and create a Minecraft Java tunnel in their Playit account.

## Windows build troubleshooting

The primary `build.bat` and `npm run build:windows` use the same logged runner. It requires Windows 10/11 x64 and 64-bit Node.js 22 or newer. It explicitly installs `devDependencies` (Electron and electron-builder), then runs checks, tests, NSIS packaging, portable packaging and PE/SHA-256 verification. If a stage fails, use the newest log in `build-logs/`; do not use old EXEs left in another folder as evidence of a successful current build.

If you configured `forceCodeSigning: true`, the build also requires a valid code-signing certificate (for example through `WIN_CSC_LINK` and `WIN_CSC_KEY_PASSWORD`, or a supported certificate store). Without that, a public signed release is expected to fail. A build without a certificate is unsigned and is only for local testing.

## Verification and limits

- `npm run check` validates JavaScript syntax and renderer selectors.
- `npm test` exercises paths, migrations, profile identity, workspace marker behavior, loader compatibility, Modrinth file validation, local server safety, Java runtime detection, RAM budgeting, backup/restore and settings.
- The current development container is Linux and did not run the Windows Electron GUI, Microsoft OAuth, live Modrinth/Paper downloads, Windows Explorer, or a live external Minecraft server. The partner-server NBT writer, duplicate handling, icon embedding, launch-argument selection and source checks are covered by automated tests; the live Solvane MC connection and Windows EXE packaging still need verification on Windows. Windows EXE packaging must be run on Windows with `build.bat` or through the included Windows CI workflow.

## v0.7.0 changes (historical)

- Canonicalized legacy `nova-client` and `.nova` game-directory parent settings to the actual AppData/Roaming parent; known legacy folders migrate only when their canonical instance folder is absent.
- Made the one instance path contract explicit across EML, pending options, Modrinth and Open Profile Folder; added path audit logging for launches.
- Prevented in-place Minecraft version or loader mutation for existing profiles. Add Version makes a new isolated instance; rename preserves the existing root.
- Added Duplicate Version action and an exact, visible resolved folder path on each profile card.
- Added pending-options state to profile diagnostics and made the current app version visible in the launcher sidebar.
- Added regression tests for legacy path normalization, hidden EML folder migration, version-profile identity and the screenshot root slug (`26.3-Fabric` -> `%APPDATA%\\.26_3_fabric`).


## v0.7.2 — Local Server Manager (historical)
See [RELEASE_NOTES_0.7.2.md](RELEASE_NOTES_0.7.2.md) for the original local server manager.

## Official global partner servers (0.11.6)

Owner setup: see [PARTNER_SETUP.md](PARTNER_SETUP.md). Configure the public feed URL once before building, then manage the hosted `partner-feed/partners.json` for all users.
