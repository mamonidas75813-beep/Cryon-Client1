# CRYON Server Studio — v0.9.0

## Java runtime setup

Settings → Java Runtime can install Eclipse Temurin Java 21 JRE into CRYON's user-data directory. CRYON requests the latest GA Java 21 runtime for the current supported OS/architecture from the Adoptium API, downloads the package over HTTPS, verifies the SHA-256 checksum supplied by Adoptium, extracts it to the managed runtime directory, runs `java -version`, and selects the verified executable in launcher settings. For a Minecraft server that requires Java 21, the server manager automatically prefers this managed runtime when it is present and the configured Java is missing or too old.

Java runtime downloads are optional and user-triggered. The installer does not silently download an executable in the background. Network access is required. The Java 21 auto-installer supports Windows x64, Linux x64/ARM64 and macOS x64/ARM64 where Adoptium publishes a matching JRE package. Other platform/architecture pairs receive a clear unsupported-platform error.

## Resource monitor

The dashboard separates host metrics from the selected Java server process:

- Host CPU: overall CPU use, CPU model, physical/logical core counts, reported frequency and detection source.
- Host memory: used percentage, used/total GB and available GB.
- Server CPU: selected Java process CPU use normalized to total logical CPU capacity.
- Server memory: selected Java process working set as a percentage of total host RAM, with its GB working set and PID.
- JVM heap limit: configured `-Xmx`; this is a configured cap, not measured resident memory.

Windows uses CIM performance/operating-system counters and PowerShell process metrics where available. Linux uses `/proc/stat`, `/proc/meminfo`, `/proc/<pid>/stat` and `/proc/<pid>/status`. macOS uses `sysctl`, `vm_stat` and process utilities. Node.js OS counters provide a labelled fallback when platform-specific data is unavailable. CPU temperature, fan speed, voltage and GPU telemetry are not guaranteed: those require hardware/vendor sensor interfaces and are intentionally not fabricated.

## Playit.gg

The Network tab can download and checksum-verify the official Playit Windows x64 agent, start/stop it, show agent output and open the detected account-claim URL. After authorizing the agent in a browser, create a **Minecraft Java** tunnel in the Playit dashboard and set its local destination to `127.0.0.1:<server-port>`. Paste or use the detected public hostname in CRYON and save it with the server metadata.

CRYON does not create a Playit tunnel or mint a hostname automatically. Tunnel provisioning/hostname assignment requires the user's Playit account and dashboard; the current supported integration uses the official agent process and user-entered/detected public address. A Playit tunnel can provide public access without router port forwarding, subject to Playit's service and account limits.

Automatic Playit agent download currently targets Windows x64. Other operating systems must use Playit's official download/install process outside CRYON for now.

## Reliability and security notes

- Java and Playit packages are rejected when the expected SHA-256 metadata is missing or the digest does not match.
- Download redirects must remain HTTPS and within approved provider hosts.
- Local server process CPU/RAM values are reported separately from host CPU/RAM.
- On app exit, CRYON attempts to stop local server processes and the Playit agent.
- Public address is informational metadata; CRYON does not expose router credentials or modify router configuration.
- Server backups remain local snapshots. Copy important backups to a separate drive for disaster recovery.

## Build / run

Requirements: Windows 10/11 x64, Node.js 22+ and npm for the primary supported desktop build. Run `npm install`, then `npm start`. Run `npm run check` and `npm test` before packaging. `build.bat` creates Windows installer and portable builds on a Windows build host.
