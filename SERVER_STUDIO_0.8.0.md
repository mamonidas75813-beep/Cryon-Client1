# CRYON Server Studio — v0.8.0

## Purpose

Server Studio creates and supervises Minecraft Java Edition servers on the same machine running CRYON. It is a local server manager, not a VPS control panel or hosted-service backend.

## Software support

| Server software | Create | Plugins | Mods |
|---|---:|---:|---:|
| Paper | Yes | Yes | Not managed here |
| Purpur | Yes | Yes | Not managed here |
| Vanilla | Yes | No | No |
| Fabric | Yes | No | Yes, via Modrinth |

Forge and NeoForge dedicated-server installers are not part of v0.8.0. Their installation process and runtime layout differ from the Paper/Purpur/Fabric JAR workflows.

## Startup sequence

1. Confirm the server exists and its EULA acceptance file says `eula=true`.
2. Verify the configured server JAR exists, is a regular file and has a ZIP/JAR signature.
3. Read the current server port from `server.properties` and verify it is available for binding.
4. Detect Java from the selected runtime or PATH. Parse its version and compare it with the selected Minecraft version's minimum Java major.
5. Collect host memory and running server heap allocations. Reject the start request if the requested heap exceeds the current conservative budget.
6. Launch Java with `-Xms`/`-Xmx`, the server JAR, `nogui` and the server directory as the working directory.
7. Retain the state as `Starting` until the server emits its Minecraft `Done (...)!` readiness line or a status ping succeeds.
8. Capture stdout/stderr in the live console and append supervisor output to `logs/cryon-supervisor.log`.

Possible visible states are `Offline`, `Starting`, `Running`, `Stopping` and `Error`. Java spawn success alone is not considered Minecraft readiness.

## Java runtime requirements

CRYON checks the Java major version before launching. The mapping used in v0.8.0 is a practical release compatibility baseline:

| Minecraft version | Minimum Java major checked |
|---|---:|
| 1.16.x and earlier | 8 |
| 1.17.x | 16 |
| 1.18.x–1.20.4 | 17 |
| 1.20.5–1.21.x | 21 |
| 26.x | 25 |

A selected executable must be runnable. On Windows, if the selected path ends in `javaw.exe`, CRYON tries the sibling `java.exe` because the server manager needs console output for readiness and diagnostics. Java is not bundled or installed automatically in this release.

## Memory-budget model

The safe additional heap is the lower of:

- Installed memory minus a host reserve and the combined configured heaps of running/starting servers.
- Currently available physical memory minus the same host reserve.

The reserve is at least 1.5 GiB or 15% of installed RAM, whichever is greater. The result is rounded down to 256 MiB increments. At least 1 GiB must remain available for a server allocation. This is a conservative guardrail, not a guarantee against external memory pressure or oversized plugins/mods.

## Monitoring definitions

- **Host CPU:** sampled utilization across all logical processors.
- **Host memory:** installed, available and used physical memory. Linux prefers `/proc/meminfo` `MemAvailable` where present.
- **Server CPU:** Java process CPU time converted to a share of total host CPU capacity.
- **Server memory:** Java process working set / resident memory. It is not the same as committed heap or JVM heap-used.
- **JVM heap limit:** CRYON's configured `-Xmx` value.

Some data is platform-dependent. If a platform does not provide process counters, the UI reports that the metric is unavailable rather than fabricating a number.

## Backup behavior

Backups are created only while a server is stopped. A snapshot copies the world folders, plugins, mods, known server configuration files, player access lists and crash reports when present. JAR binaries and logs are intentionally excluded. Restore first copies the current matching entries to a rollback folder, then replaces the backed-up entries. This is a local same-disk safety snapshot, not a compressed or off-site backup.

## Network behavior

- `127.0.0.1:PORT` is for clients on the same PC.
- LAN IPv4 addresses are for devices on the same local network, subject to firewall rules.
- Internet access requires router/NAT port forwarding and a host firewall allow rule. CGNAT or ISP restrictions can prevent inbound connections.
- The displayed TCP port and LAN IP do not indicate that the server is reachable from the public internet.

## Troubleshooting server startup

1. **Java not detected:** Open Settings → Java Runtime, use Detect Java, or Browse to the correct `java.exe`. Do not select a JRE/JDK folder; select the executable itself.
2. **Wrong Java major:** Install a runtime matching the Minecraft version in the table above, then select its `java.exe`.
3. **Port unavailable:** Close the program using the port or change `server-port` in the server properties. A Minecraft client cannot use a server port already bound by another process.
4. **JAR missing/corrupt:** Re-create the server download. A web error page renamed to `.jar` is rejected.
5. **Not enough safe RAM:** Lower the server's allocation or close other applications/servers. The guardrail considers both installed and currently available memory.
6. **Still Starting:** Open Console. World generation and first-time initialization can take time. CRYON waits for the readiness line or a successful server ping; review Java stack traces and missing-library messages in the log.
7. **Crash after readiness:** Read the latest console output and `logs/` folder. Plugin/mod incompatibility and Java heap pressure are common causes outside CRYON's process supervisor.

## External API contracts

- Paper build metadata/downloads: [PaperMC Downloads Service](https://docs.papermc.io/misc/downloads-service/)
- Fabric loader/server bootstrap: [Fabric Meta API](https://meta.fabricmc.net/) and [Fabric Meta server bootstrap source](https://github.com/FabricMC/fabric-meta/blob/master/src/main/java/net/fabricmc/meta/web/ServerBootstrap.java)
- Mod discovery/version downloads: [Modrinth Search API](https://docs.modrinth.com/api/operations/searchprojects/)
