# CRYON CLIENT v0.8.0 — Server Studio

## Server engine and startup reliability

- Added a preflight before Java is launched: accepted EULA, valid server JAR archive, existing JAR file, valid port, free TCP port, detected Java executable, compatible Java major version and safe RAM budget are all checked.
- The dashboard stays in **Starting** until the Minecraft server emits its readiness message or responds to a live status ping. A Java process merely spawning is no longer treated as a ready server.
- Startup failures are published into the server status and console with the underlying diagnostic. A process that exits before Minecraft becomes ready is reported as an error unless the user requested a stop.
- Graceful shutdown sends `stop`, waits for confirmed process exit, then escalates to termination signals. CRYON does not claim the server is offline until the process confirms exit.
- Java detection now reports executable, detected version and major version. If a Windows user selected `javaw.exe`, CRYON attempts to use its sibling `java.exe` for console-based detection and hosting.
- Added release-aware Java requirements, including Java 16 for Minecraft 1.17, Java 17 for 1.18–1.20.4, Java 21 for 1.20.5–1.21.x and Java 25 for current 26.x releases.

## Server creation and administration

- Added Fabric Dedicated Server creation alongside Paper, Purpur and Vanilla.
- Added Fabric server mod search/install through Modrinth. Search filters for Fabric, game version and server-capable environments; versions explicitly marked unsupported for servers are not installed.
- Kept plugin installation restricted to Paper/Purpur, rather than treating plugins as Fabric mods.
- Added configurable MOTD, online/offline authentication mode, whitelist, difficulty, game mode, view/simulation distance, PvP and flight settings.
- Server JAR and Modrinth JAR downloads stream to disk, enforce a 1 GB server-download limit, and verify published SHA-256/SHA-1 checksums where available. JAR archive signatures are checked before acceptance.
- Added persistent supervisor logs in each server's `logs/` folder.

## Monitoring and resource safety

- Host CPU reports processor model, logical cores, average reported clock and sampled overall utilization.
- Host memory reports installed, available and used RAM; Linux uses `MemAvailable` when available.
- Added Java process CPU and working-set memory monitoring through `/proc` on Linux, PowerShell process counters on Windows and `ps` on macOS.
- The dashboard distinguishes host resources, actual Java process working set and configured JVM `-Xmx` limit.
- Server RAM allocation now accounts for current available memory, a host reserve and the sum of other running servers' configured heap allocations. It refuses to create/start an instance above the current safe budget.

## Backups and network

- Added offline world/config snapshots for world dimensions, plugins, Fabric mods, configuration, player lists and crash reports.
- Restore replaces the backed-up entries rather than merging them, and first creates a rollback copy of the current entries.
- Added localhost, detected LAN IPv4 addresses and configured TCP port to the Network tab.

## Known limits

- Hosting remains local to this PC. CRYON does not provision VPS machines, offer managed cloud nodes, create public tunnels, or configure router NAT automatically.
- Public reachability still depends on the host firewall, router port forwarding and ISP policy. LAN/localhost addresses do not prove public reachability.
- Java must be installed and available on PATH or selected in Settings → Java Runtime. CRYON does not download or install a Java runtime for the server manager in this release.
- Temperature, GPU utilization/VRAM and JVM heap-used metrics are not displayed where the platform does not expose a reliable source. The current Java memory metric is process working set, not exact JVM heap use.
- Backup snapshots are uncompressed and stored on the same drive as server data. They are not off-site disaster recovery.
- Windows Electron GUI, Windows-specific process monitoring, and production Paper/Purpur/Vanilla/Fabric server launches were not available for end-to-end validation in the Linux build environment. Run `build.bat` and verify on the target Windows PC before using it for a public server.
