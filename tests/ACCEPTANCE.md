# CRYON CLIENT manual acceptance matrix

These require a real Windows 10/11 x64 runtime and a Minecraft Java Edition account. The automated unit tests do not replace these checks.

| Test | Procedure | Expected result | Current evidence |
|---|---|---|---|
| Electron startup | `npm start` | Window opens with CRYON home screen | Not run in this Linux container |
| Microsoft sign-in | Sign in with an account that owns Java Edition | Account profile returned; token encrypted by OS safeStorage | Not run; OAuth needs GUI/network/account |
| Version manifest | Open the version selector | Mojang release manifest populates | Code implemented; live endpoint not verified here |
| Vanilla launch | Select a supported release and click Play | EML downloads assets/runtime and starts game | Not run |
| Legacy Forge | Select 1.8.9 or 1.12.2, Forge and a valid Forge build | Forge setup completes for valid combination | Not run |
| Fabric launch | Select supported Fabric version and loader build | Fabric profile starts | Not run |
| NeoForge launch | Select 1.20.2+ and NeoForge build | NeoForge profile starts | Not run |
| Invalid loader | Select an incompatible combination | Launch is blocked with an explanation | Unit tests cover validation rules |
| Modrinth search | Search a known mod with matching profile | Compatible results are displayed | Not run; live API needed |
| Mod install integrity | Install a known compatible mod | JAR saved only after SHA1/SHA512 verification | Code implemented; not run |
| Mod toggles | Disable then enable a JAR | `.jar.disabled` renamed back to `.jar` | Code implemented; not run |
| Mod backup | Click Backup mods | Timestamped copy created | Code implemented; not run |
| Profile directory access | Open profile action menu and choose Open Profile Folder | OS file manager opens that version’s isolated game directory | Main-process IPC implemented; manual Windows check pending |
| Fabric HUD module | Build with JDK 21/Gradle and launch MC 1.21.1 Fabric | HUD draws selected indicators | Not built in this environment |
| Settings persistence | Change RAM and restart launcher | Values persist | Unit tests cover sanitization; GUI not run |
| NSIS installer | Run `build.bat` | Setup EXE installs, shortcuts work and uninstall works | Windows build not run here |
| Portable EXE | Run portable EXE on clean Windows profile | App launches without traditional installation | Windows build not run here |
| Release validation | Run `node scripts/verify-build.js` | Both actual EXEs pass size and MZ checks; hashes created | Cannot pass until Windows EXEs exist |


## v0.5.2 content/profile checks

| Test | Procedure | Expected result | Current evidence |
|---|---|---|---|
| Profile selection | Click a profile header, then open Mods | Selected profile changes and its own folders are used | Browser harness smoke test; unit path tests |
| Account assignment | Assign different saved accounts to two profiles and launch each | Each profile launches with its assigned account; unassigned uses default | Assignment persistence tested; live authentication/launch not run |
| Modrinth categories | Open Mods, Modpacks, Resource Packs, Shaders and Data Packs | Each tab queries the corresponding Modrinth project type | Search facet logic tested; live API not run |
| Popular installs | Open Browse with blank query | Most-downloaded compatible projects appear first | UI/API implementation; live API not run |
| Resource pack isolation | Install a ZIP on profile A, switch to profile B | Only profile A contains the pack | Filesystem unit test |
| Shader pack isolation | Install a shader ZIP on profile A | File appears in profile A `shaderpacks/` | Manual Windows/Minecraft test required |
| Data Pack target | Select a saved world, install a Data Pack | ZIP appears in `saves/<world>/datapacks/` for that profile only | World discovery/isolation unit test |
| Modpack import | Install a compatible `.mrpack` | Required files and overrides install only in the selected profile; incompatible loaders are rejected | Fixture tests cover overrides and mismatch rejection; live downloads not run |
| Modpack safety | Try path traversal, untrusted download host or bad hash in a test pack | Install is rejected before writing pack files | Code guards; additional adversarial tests recommended |


## v0.5.2 visual and settings checks

| Test | Procedure | Expected result | Current evidence |
|---|---|---|---|
| CRYON branding | Start launcher and inspect logo/title | CRYON CLIENT branding and cyan accents appear | Static assets/CSS updated; desktop runtime not launched |
| Sheep background | Open Overview | Supplied sheep/Steve/Alex background is shown; old bat/cave art is absent | Asset reference and file checked |
| HUD Editor removal | Inspect sidebar and pages | No HUD Editor navigation or page is shown | Static HTML inspection |
| Profile Settings | Open a profile card action menu | Rename dialog/panel opens; version/loader/folder remain unchanged | Renderer and IPC source checks passed |
| Profile folder | Choose Open Profile Folder | OS file manager opens the exact profile instance folder | Main-process IPC source check; real OS action not run |
| Performance mod install | On a Fabric/Forge/NeoForge/Quilt profile, click Install for a recommendation | Compatible Modrinth version installs into that profile only | IPC and compatibility logic implemented; live download not run |
| Vanilla optimization guard | Click recommendation on a Vanilla profile | Navigates to Profiles with loader guidance | Renderer code implemented |
| Settings persistence | Save RAM, Java, fullscreen/window and startup options, restart | Valid preferences remain saved and launch args are applied | Unit tests cover sanitization; GUI/Windows not run |
