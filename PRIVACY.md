# Privacy policy (draft for maintainer review)

CRYON CLIENT is a Windows Minecraft Java launcher and local server manager. This disclosure describes the supplied source; dependency and live-network behavior must be reviewed before submitting it as final. It does not promise that the program makes no network requests.

## Local data

The launcher stores settings, account metadata (username, ID/UUID and account type), profiles, selected paths and server configuration locally; game instances, logs, worlds, mods, skins and backups may also be stored locally. Microsoft credentials handled by the launcher are persisted using Electron safeStorage when available; the main source avoids saving Microsoft profiles/credentials without secure storage. Never share account or log files containing secrets. Remove saved accounts through the app, and delete unwanted local files after backing up worlds and closing the app; remote service data requires separate requests to that service.

## External services

- Microsoft/Xbox/Minecraft and the EML Lib authentication/launch library: login, account/profile and entitlement operations, game metadata/assets/libraries and supported skin operations. [Microsoft privacy statement](https://privacy.microsoft.com/privacystatement), [Minecraft](https://www.minecraft.net/), [EML project](https://emlproject.com/). Verify EML dependency behavior and its applicable privacy policy before publication.
- Mojang and loader services (Fabric, Quilt, Forge, NeoForge): version information, manifests and downloads; [Fabric](https://fabricmc.net/), [Quilt](https://quiltmc.org/), [Forge](https://files.minecraftforge.net/), [NeoForge](https://neoforged.net/).
- Modrinth: search, project IDs, dependency and file downloads, including automatic compatible Fabric performance mods on first play. [Privacy policy](https://modrinth.com/legal/privacy).
- GitHub: partner feed, images, release and updater checks and downloads; the source uses scheduled refreshes, so requests can occur without clicking a download. [GitHub privacy statement](https://docs.github.com/en/site-policy/privacy-policies/github-general-privacy-statement).
- Local server setup may download Java and server software from Eclipse Adoptium, Paper, Purpur, Mojang, Fabric and related hosts. [Adoptium](https://adoptium.net/), [Paper](https://papermc.io/), [Purpur](https://purpurmc.org/).
- Optional Playit integration downloads/starts a third-party agent and opens its authorization/dashboard; tunnels send traffic through Playit infrastructure. [Playit](https://playit.gg/). Connecting to a Minecraft server exposes connection and game/account information to that server; partner and user-selected servers have their own terms.

These services can receive normal connection metadata (IP address, request timing, user agent), requested content identifiers, and feature-specific account or game information. Downloaded mods, plugins, servers and agents may have independent network/data behavior; consult their own policies. No blanket no-telemetry guarantee is made for dependencies. Review actual traffic and publish verified third-party privacy links before application. For questions or deletion of project-held records, contact the verified maintainer via the source repository; never send credentials.
