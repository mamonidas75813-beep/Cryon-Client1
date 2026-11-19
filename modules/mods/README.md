# CRYON Modrinth Content Manager

CRYON uses the official Modrinth API v2 for its catalogue and Modrinth CDN for project files. CurseForge is not queried. The catalogue has five project tabs: Mods, Modpacks, Resource Packs, Shaders and Data Packs. Empty-search browse sorts by downloads and scopes results to the active profile's Minecraft version; Mods additionally require a supported loader.

## Mods

- On the first PLAY of each Fabric profile, automatically install CRYON's default performance set: Sodium, Sodium Extra, Lithium, Krypton, Entity Culling, More Culling, C2ME, Noisium (server-side only; not installed in client profiles), FerriteCore, ImmediatelyFast, BadOptimizations and Mod Menu.
- Resolve each mod against the profile's exact Minecraft version and Fabric loader; prefer release builds, then beta/alpha only if no release exists. Missing compatible builds are skipped. Required dependencies are installed recursively and checksummed.
- Store per-profile install state so already-installed mods are not downloaded again; failed downloads are retried on a later launch. Existing user-disabled managed mods remain disabled.
- Search, sort and filter by active Minecraft version and Fabric / Forge / NeoForge / Quilt loader.
- Select release, beta, alpha or all compatible versions.
- Install latest or a selected version.
- Recursively install required Modrinth dependencies (depth limit 8 and cycle detection); pinned dependency version IDs are respected.
- Verify available Modrinth SHA-512 and SHA-1 checksums before writing JARs to the selected profile's `mods/` folder.
- Check and apply individual updates; enable/disable/remove managed or locally imported JARs.
- Import local `.jar` files through the Electron main-process file picker.
- Create profile-specific backups and restore a selected backup (restore backs up current mods first).

## Other catalogue types

- **Modpacks**: install `.mrpack` files into the active profile. CRYON validates Minecraft and loader requirements, pins the exact loader build on the profile (Forge is normalized to EML's `MC-FORGE` format), rejects ZIP symlinks and path traversal, verifies both SHA-1 and SHA-512 for manifest dependencies, follows at most three HTTPS redirects on a host allowlist, and applies `overrides/` then `client-overrides/`. Optional client files are skipped until a per-file selection UI exists. Modpack updates are manual; a fresh profile is recommended for another pack.
- **Resource Packs**: verified ZIP installation in the active profile's `resourcepacks/` folder, with enable/disable/remove and update checks.
- **Shaders**: verified ZIP installation in the active profile's `shaderpacks/` folder, with enable/disable/remove and update checks.
- **Data Packs**: Modrinth search uses the `all_project_types:datapack` facet; installation requires a saved world selection and writes to that profile's `saves/<world>/datapacks/` folder.

## Safety and limitations

- Mods require Fabric, Forge, NeoForge or Quilt; Vanilla profiles cannot load JAR mods.
- Each profile uses a separate EML instance root, so different Minecraft versions/loaders do not share managed content folders.
- Data Pack installation is world-specific; it cannot be installed until the selected profile contains a world with `level.dat`.
- Local JAR import verifies extension and file size only. It does not establish that the JAR is compatible or safe.
- Optional Modrinth modpack client files are skipped rather than installed without user selection.
- A modpack archive removal only removes the stored `.mrpack` file. It does not uninstall files already applied to the profile; use a fresh profile when replacing a pack.
- Modrinth project licenses and the compatibility statements of each project author remain the user's responsibility.
