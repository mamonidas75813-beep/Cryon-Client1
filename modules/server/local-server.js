import os from 'node:os';
import path from 'node:path';
import fs from 'node:fs/promises';
import net from 'node:net';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';
import crypto from 'node:crypto';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const SERVER_SOFTWARE = new Set(['paper', 'purpur', 'vanilla', 'fabric']);
const TEXT_EXTENSIONS = new Set(['.txt', '.properties', '.json', '.yml', '.yaml', '.toml', '.cfg', '.conf', '.log', '.md']);
const MAX_TEXT_FILE_BYTES = 1024 * 1024;
let previousCpuSample = null;
let previousLinuxCpuSample = null;
const execFile = promisify(execFileCallback);

function httpError(response, url) {
  if (!response.ok) throw new Error(`Download request failed (${response.status}) from ${new URL(url).hostname}.`);
}
async function getJson(url, timeout = 25000) {
  if (new URL(url).protocol !== 'https:') throw new Error('Only secure HTTPS downloads are supported.');
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': 'CRYON-CLIENT/0.10.1 (https://github.com/)' } });
  httpError(response, url);
  return response.json();
}
async function downloadFile(url, destination, onProgress = () => {}, expectedChecksum = '', minBytes = 100 * 1024, checksumAlgorithm = 'sha256') {
  if (new URL(url).protocol !== 'https:') throw new Error('Only secure HTTPS downloads are supported.');
  const response = await fetch(url, { signal: AbortSignal.timeout(180000), headers: { 'User-Agent': 'CRYON-CLIENT/0.10.1 (https://github.com/)' } });
  httpError(response, url);
  if (new URL(response.url || url).protocol !== 'https:') throw new Error('The download redirected to an insecure URL.');
  if (!response.body) throw new Error('The download did not provide a readable response stream.');
  const total = Number(response.headers.get('content-length')) || 0;
  if (total > 1024 * 1024 * 1024) throw new Error('The server download is larger than the 1 GB safety limit.');
  let downloaded = 0;
  const hash = crypto.createHash(checksumAlgorithm);
  const progressStream = new Transform({
    transform(chunk, _encoding, callback) {
      downloaded += chunk.length;
      if (downloaded > 1024 * 1024 * 1024) return callback(new Error('The server download exceeded the 1 GB safety limit.'));
      hash.update(chunk);
      onProgress({ stage: 'download', downloaded, total: total || null, percent: total ? Math.min(99, Math.floor(downloaded / total * 100)) : null });
      callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body), progressStream, (await import('node:fs')).createWriteStream(destination, { flags: 'wx' }));
    if (downloaded < minBytes) throw new Error('The downloaded file is unexpectedly small and was rejected.');
    if (expectedChecksum) {
      const actual = hash.digest('hex');
      if (actual.toLowerCase() !== String(expectedChecksum).toLowerCase()) throw new Error(`The server download failed its ${checksumAlgorithm.toUpperCase()} integrity check.`);
    }
  } catch (error) {
    await fs.rm(destination, { force: true }).catch(() => {});
    throw error;
  }
  onProgress({ stage: 'download', downloaded, total: total || downloaded, percent: 100 });
}


async function assertJarArchive(filePath, label = 'JAR') {
  const handle = await fs.open(filePath, 'r');
  try {
    const header = Buffer.alloc(4);
    const { bytesRead } = await handle.read(header, 0, 4, 0);
    if (bytesRead < 4 || header[0] !== 0x50 || header[1] !== 0x4b) throw new Error(`${label} is not a valid ZIP/JAR archive. The download may be an error page or the file may be corrupt.`);
  } finally { await handle.close(); }
}

async function downloadModrinthJar(url, destination, hashes = {}) {
  const checksumAlgorithm = hashes.sha512 ? 'sha512' : hashes.sha1 ? 'sha1' : 'sha256';
  const checksum = hashes.sha512 || hashes.sha1 || '';
  await downloadFile(url, destination, () => {}, checksum, 1024, checksumAlgorithm);
  try { await assertJarArchive(destination, 'Downloaded mod/plugin'); }
  catch (error) { await fs.rm(destination, { force: true }).catch(() => {}); throw error; }
}


export function normalizeServerName(value) {
  const name = String(value || '').trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 32) throw new Error('Server name must be between 2 and 32 characters.');
  if (/[\\/<>:"|?*\u0000-\u001f]/.test(name) || name === '.' || name === '..') throw new Error('Server name contains unsupported characters.');
  return name;
}
export function normalizeMinecraftVersion(value) {
  const version = String(value || '').trim();
  if (!/^\d+\.\d+(?:\.\d+)?$/.test(version)) throw new Error('Choose a valid Minecraft Java release version.');
  return version;
}
export function normalizeMemoryMb(value, totalMemoryBytes = os.totalmem()) {
  const memory = Number(value);
  const totalMb = Math.floor(totalMemoryBytes / 1024 / 1024);
  // Creation stores the user's requested heap size. It intentionally does not
  // restrict the slider to currently available memory; availability is checked
  // immediately before the Java process is started.
  if (totalMb < 512) throw new Error('This PC reports less than 512 MB of installed RAM and cannot create a Minecraft server allocation.');
  if (!Number.isInteger(memory) || memory < 512 || memory > totalMb) {
    throw new Error(`Server RAM must be between 512 MB and ${totalMb} MB (the detected installed RAM). Current free memory is checked when you start the server.`);
  }
  return memory;
}

export function buildServerProperties({
  motd = 'CRYON Server', port = 25565, maxPlayers = 20, onlineMode = true,
  whitelist = false, difficulty = 'normal', gameMode = 'survival', viewDistance = 8,
  simulationDistance = 6, pvp = true, allowFlight = false, spawnProtection = 16,
  worldSeed = '', worldType = 'default', generateStructures = true, hardcore = false,
  allowNether = true, enableCommandBlocks = false,
} = {}) {
  const safeSeed = String(worldSeed || '').trim().replace(/[\r\n=#]/g, '').slice(0, 64);
  const types = new Set(['default', 'flat', 'large_biomes', 'amplified']);
  const selectedType = types.has(String(worldType)) ? String(worldType) : 'default';
  const safeDifficulty = ['peaceful', 'easy', 'normal', 'hard'].includes(difficulty) ? difficulty : 'normal';
  const safeGameMode = ['survival', 'creative', 'adventure', 'spectator'].includes(gameMode) ? gameMode : 'survival';
  const bounded = (value, min, max, fallback) => Math.min(max, Math.max(min, Number(value) || fallback));
  return [
    `motd=${String(motd || 'CRYON Server').replace(/[\r\n]/g, ' ').slice(0, 120)}`,
    `server-port=${bounded(port, 1, 65535, 25565)}`,
    `max-players=${bounded(maxPlayers, 1, 500, 20)}`,
    `online-mode=${onlineMode === false ? 'false' : 'true'}`,
    `pvp=${pvp === false ? 'false' : 'true'}`,
    `difficulty=${safeDifficulty}`,
    `gamemode=${safeGameMode}`,
    `view-distance=${bounded(viewDistance, 2, 32, 8)}`,
    `simulation-distance=${bounded(simulationDistance, 2, 32, 6)}`,
    `level-seed=${safeSeed}`,
    `level-type=minecraft:${selectedType === 'default' ? 'normal' : selectedType}`,
    `generate-structures=${generateStructures === false ? 'false' : 'true'}`,
    `hardcore=${hardcore === true ? 'true' : 'false'}`,
    `allow-nether=${allowNether === false ? 'false' : 'true'}`,
    `white-list=${whitelist === true ? 'true' : 'false'}`,
    `enable-command-block=${enableCommandBlocks === true ? 'true' : 'false'}`,
    `spawn-protection=${bounded(spawnProtection, 0, 64, 16)}`,
    `allow-flight=${allowFlight === true ? 'true' : 'false'}`,
    'network-compression-threshold=256',
    'use-native-transport=true',
    'sync-chunk-writes=true',
  ].join('\n') + '\n';
}

export function safeServerPath(serverDirectory, relativePath = '') {
  const raw = String(relativePath || '').replace(/\\/g, '/');
  if (raw.includes('\0') || raw.startsWith('/') || /^[a-zA-Z]:/.test(raw)) throw new Error('Invalid server file path.');
  const segments = raw.split('/').filter(Boolean);
  if (segments.some(segment => segment === '.' || segment === '..')) throw new Error('Path traversal is not allowed.');
  const root = path.resolve(serverDirectory);
  const target = path.resolve(root, ...segments);
  if (target !== root && !target.startsWith(`${root}${path.sep}`)) throw new Error('The requested path is outside this server folder.');
  return target;
}

async function assertNoSymlinkSegments(serverDirectory, relativePath = '') {
  const segments = String(relativePath || '').replace(/\\/g, '/').split('/').filter(Boolean);
  let current = path.resolve(serverDirectory);
  for (const segment of segments) {
    current = path.join(current, segment);
    const stat = await fs.lstat(current).catch(() => null);
    if (stat?.isSymbolicLink()) throw new Error('Symbolic links are not followed by the server file manager.');
  }
}

function percentFromCpuCounters(total, idle, previous) {
  if (!previous || !Number.isFinite(total) || !Number.isFinite(idle)) return null;
  const totalDelta = total - previous.total;
  const idleDelta = idle - previous.idle;
  if (totalDelta <= 0) return null;
  return Math.round(Math.max(0, Math.min(100, (1 - idleDelta / totalDelta) * 100)) * 10) / 10;
}

function parseLinuxCpuSnapshot(text) {
  const line = String(text || '').split('\n').find(row => /^cpu\s/.test(row));
  if (!line) return null;
  const values = line.trim().split(/\s+/).slice(1).map(Number);
  if (values.length < 4 || values.some(value => !Number.isFinite(value))) return null;
  return { total: values.reduce((sum, value) => sum + value, 0), idle: values[3] + (values[4] || 0) };
}

function countLinuxPhysicalCores(cpuInfo) {
  const pairs = new Set();
  let packageId = '0'; let coreId = null;
  for (const line of String(cpuInfo || '').split('\n')) {
    const packageMatch = line.match(/^physical id\s*:\s*(\d+)/i);
    const coreMatch = line.match(/^core id\s*:\s*(\d+)/i);
    if (packageMatch) packageId = packageMatch[1];
    if (coreMatch) { coreId = coreMatch[1]; pairs.add(`${packageId}:${coreId}`); }
  }
  return pairs.size || null;
}

async function readWindowsSystemInfo(cpus) {
  const script = [
    "$ErrorActionPreference='Stop'",
    "$perf=Get-CimInstance Win32_PerfFormattedData_PerfOS_Processor -Filter \"Name='_Total'\"",
    "$memory=Get-CimInstance Win32_PerfFormattedData_PerfOS_Memory -ErrorAction SilentlyContinue",
    "$os=Get-CimInstance Win32_OperatingSystem",
    "$cpu=Get-CimInstance Win32_Processor",
    "$availableMb=if ($memory -and $memory.AvailableMBytes -ge 0) { [double]$memory.AvailableMBytes } else { [double]$os.FreePhysicalMemory / 1024 }",
    "[pscustomobject]@{ cpuPercent=[double]$perf.PercentProcessorTime; totalKb=[double]$os.TotalVisibleMemorySize; availableMb=$availableMb; physicalCores=[double](($cpu | Measure-Object -Property NumberOfCores -Sum).Sum); maxClockMhz=[double](($cpu | Measure-Object -Property MaxClockSpeed -Average).Average); cpuModel=[string]($cpu | Select-Object -First 1 -ExpandProperty Name) } | ConvertTo-Json -Compress",
  ].join('; ');
  const { stdout } = await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 5000, windowsHide: true, maxBuffer: 24 * 1024 });
  const data = JSON.parse(stdout.trim());
  const totalMemoryMb = Math.max(1, Math.floor(Number(data.totalKb) / 1024));
  const availableMemoryMb = Math.max(0, Math.min(totalMemoryMb, Math.floor(Number(data.availableMb))));
  const cpuPercent = Number.isFinite(Number(data.cpuPercent)) ? Math.round(Math.max(0, Math.min(100, Number(data.cpuPercent))) * 10) / 10 : null;
  return {
    cpuPercent, totalMemoryMb, availableMemoryMb,
    physicalCores: Number(data.physicalCores) > 0 ? Math.round(Number(data.physicalCores)) : null,
    cpuSpeedMhz: Number(data.maxClockMhz) > 0 ? Math.round(Number(data.maxClockMhz)) : null,
    cpuModel: String(data.cpuModel || cpus[0]?.model || 'Unknown CPU').trim(),
    source: 'Windows CIM performance counters',
  };
}

async function readMacSystemInfo() {
  const [memoryResult, physicalResult, frequencyResult, vmResult] = await Promise.allSettled([
    execFile('sysctl', ['-n', 'hw.memsize'], { timeout: 2500, maxBuffer: 4096 }),
    execFile('sysctl', ['-n', 'hw.physicalcpu'], { timeout: 2500, maxBuffer: 4096 }),
    execFile('sysctl', ['-n', 'hw.cpufrequency'], { timeout: 2500, maxBuffer: 4096 }),
    execFile('vm_stat', [], { timeout: 2500, maxBuffer: 16 * 1024 }),
  ]);
  const totalBytes = memoryResult.status === 'fulfilled' ? Number(memoryResult.value.stdout.trim()) : os.totalmem();
  let availableBytes = os.freemem();
  if (vmResult.status === 'fulfilled') {
    const text = vmResult.value.stdout;
    const pageSize = Number(text.match(/page size of (\d+) bytes/i)?.[1] || 4096);
    const readPages = label => Number(text.match(new RegExp(`^${label}:\\s*([\\d.]+)`, 'mi'))?.[1]?.replace(/\./g, '') || 0);
    const availablePages = readPages('Pages free') + readPages('Pages inactive') + readPages('Pages speculative') + readPages('Pages purgeable');
    if (availablePages > 0) availableBytes = availablePages * pageSize;
  }
  const physicalCores = physicalResult.status === 'fulfilled' ? Number(physicalResult.value.stdout.trim()) : null;
  const cpuSpeedMhz = frequencyResult.status === 'fulfilled' ? Math.round(Number(frequencyResult.value.stdout.trim()) / 1e6) : null;
  return { totalMemoryMb: Math.floor(totalBytes / 1024 / 1024), availableMemoryMb: Math.floor(Math.min(totalBytes, availableBytes) / 1024 / 1024), physicalCores: Number.isFinite(physicalCores) && physicalCores > 0 ? physicalCores : null, cpuSpeedMhz: Number.isFinite(cpuSpeedMhz) && cpuSpeedMhz > 0 ? cpuSpeedMhz : null };
}

export async function getLocalSystemInfo() {
  const cpus = os.cpus();
  const total = cpus.reduce((sum, cpu) => sum + Object.values(cpu.times).reduce((a, b) => a + b, 0), 0);
  const idle = cpus.reduce((sum, cpu) => sum + cpu.times.idle, 0);
  let cpuPercent = percentFromCpuCounters(total, idle, previousCpuSample);
  previousCpuSample = { total, idle };
  const totalBytes = os.totalmem();
  let availableBytes = os.freemem();
  let totalMemoryMb = Math.floor(totalBytes / 1024 / 1024);
  let availableMemoryMb = Math.max(0, Math.min(totalMemoryMb, Math.floor(availableBytes / 1024 / 1024)));
  let physicalCores = null;
  let cpuSpeedMhz = cpus.length ? Math.round(cpus.reduce((sum, cpu) => sum + (Number(cpu.speed) || 0), 0) / cpus.length) : null;
  let cpuModel = cpus[0]?.model?.trim() || 'Unknown CPU';
  let detectionSource = 'Node.js OS counters';

  if (process.platform === 'win32') {
    try {
      const windows = await readWindowsSystemInfo(cpus);
      cpuPercent = windows.cpuPercent ?? cpuPercent;
      totalMemoryMb = windows.totalMemoryMb;
      availableMemoryMb = windows.availableMemoryMb;
      physicalCores = windows.physicalCores;
      cpuSpeedMhz = windows.cpuSpeedMhz;
      cpuModel = windows.cpuModel;
      detectionSource = windows.source;
    } catch {
      // Node's GetSystemTimes-backed counters remain as a safe fallback on older Windows builds.
      detectionSource = 'Node.js fallback (Windows CIM counters unavailable)';
    }
  } else if (process.platform === 'linux') {
    try {
      const [memInfo, statText, cpuInfo] = await Promise.all([
        fs.readFile('/proc/meminfo', 'utf8'), fs.readFile('/proc/stat', 'utf8'), fs.readFile('/proc/cpuinfo', 'utf8').catch(() => ''),
      ]);
      const totalMatch = memInfo.match(/^MemTotal:\s+(\d+)\s+kB/im);
      const availableMatch = memInfo.match(/^MemAvailable:\s+(\d+)\s+kB/im);
      if (totalMatch) totalMemoryMb = Math.floor(Number(totalMatch[1]) / 1024);
      if (availableMatch) availableMemoryMb = Math.floor(Number(availableMatch[1]) / 1024);
      const linuxCpu = parseLinuxCpuSnapshot(statText);
      if (linuxCpu) {
        const linuxPercent = percentFromCpuCounters(linuxCpu.total, linuxCpu.idle, previousLinuxCpuSample);
        // Linux /proc/stat is more stable than per-core snapshots on hot-plug/heterogeneous CPUs.
        if (linuxPercent !== null) cpuPercent = linuxPercent;
        previousLinuxCpuSample = linuxCpu;
      }
      physicalCores = countLinuxPhysicalCores(cpuInfo);
      detectionSource = '/proc/stat + /proc/meminfo';
    } catch { detectionSource = 'Node.js fallback (procfs unavailable)'; }
  } else if (process.platform === 'darwin') {
    try {
      const mac = await readMacSystemInfo();
      totalMemoryMb = mac.totalMemoryMb || totalMemoryMb;
      availableMemoryMb = mac.availableMemoryMb || availableMemoryMb;
      physicalCores = mac.physicalCores;
      cpuSpeedMhz = mac.cpuSpeedMhz;
      detectionSource = 'sysctl + vm_stat';
    } catch { detectionSource = 'Node.js fallback (macOS counters unavailable)'; }
  }

  totalMemoryMb = Math.max(1, Math.floor(totalMemoryMb));
  availableMemoryMb = Math.max(0, Math.min(totalMemoryMb, Math.floor(availableMemoryMb)));
  const usedMemoryMb = Math.max(0, totalMemoryMb - availableMemoryMb);
  const memoryUsagePercent = Math.round(usedMemoryMb / totalMemoryMb * 1000) / 10;
  return {
    cpuModel, cpuCores: cpus.length, cpuLogicalCores: cpus.length, cpuPhysicalCores: physicalCores,
    cpuSpeedMhz, cpuPercent, cpuUsagePercent: cpuPercent, cpuPercentPerCore: cpuPercent === null ? null : Math.round(cpuPercent / Math.max(1, cpus.length) * 10) / 10,
    totalMemoryMb, availableMemoryMb, usedMemoryMb, memoryUsagePercent, ramUsagePercent: memoryUsagePercent,
    platform: process.platform, platformRelease: os.release(), architecture: process.arch, hostname: os.hostname(), detectionSource,
    localIpv4Addresses: Object.values(os.networkInterfaces()).flatMap(items => (items || []).filter(item => !item.internal && (item.family === 'IPv4' || item.family === 4)).map(item => item.address)),
  };
}

export function calculateServerMemoryBudget({ totalMemoryMb, availableMemoryMb, runningAllocationsMb = [], reserveMb } = {}) {
  const total = Math.max(0, Math.floor(Number(totalMemoryMb) || 0));
  const available = Math.max(0, Math.min(total, Math.floor(Number(availableMemoryMb) || 0)));
  const reserve = Math.max(2048, Math.floor(Number(reserveMb) || Math.max(2048, total * 0.15)));
  const runningReserved = (Array.isArray(runningAllocationsMb) ? runningAllocationsMb : [])
    .reduce((sum, value) => sum + Math.max(0, Math.floor(Number(value) || 0)), 0);
  const byCapacity = total - reserve - runningReserved;
  const byAvailable = available - reserve;
  const maxAdditionalMb = Math.max(0, Math.floor(Math.min(byCapacity, byAvailable) / 256) * 256);
  return { totalMemoryMb: total, availableMemoryMb: available, reserveMb: reserve, runningReservedMb: runningReserved, maxAdditionalMb, canStartMinimumServer: maxAdditionalMb >= 512 };
}

/** Check whether the OS currently reports enough available RAM for this server's
 * configured Java heap plus the configured heaps of other running CRYON servers.
 * This check is performed at start time, not at server creation time.
 */
export function checkServerMemoryAvailability({ availableMemoryMb, requestedMemoryMb, runningAllocationsMb = [] } = {}) {
  const available = Math.max(0, Math.floor(Number(availableMemoryMb) || 0));
  const requested = Math.floor(Number(requestedMemoryMb));
  if (!Number.isInteger(requested) || requested < 512) throw new Error('Server RAM allocation is invalid. Recreate or edit this server with at least 512 MB.');
  const otherReserved = (Array.isArray(runningAllocationsMb) ? runningAllocationsMb : [])
    .reduce((sum, value) => sum + Math.max(0, Math.floor(Number(value) || 0)), 0);
  const required = requested + otherReserved;
  return {
    availableMemoryMb: available,
    requestedMemoryMb: requested,
    otherRunningAllocationsMb: otherReserved,
    requiredMemoryMb: required,
    canStart: available >= required,
    shortfallMb: Math.max(0, required - available),
  };
}

export function requiredJavaMajor(version) {
  const [major, minor, patch = 0] = normalizeMinecraftVersion(version).split('.').map(Number);
  if (major >= 26) return 25;
  if (major > 1 || minor >= 21 || (minor === 20 && patch >= 5)) return 21;
  if (minor >= 18) return 17;
  if (minor === 17) return 16;
  return 8;
}

export function parseJavaMajor(versionText) {
  const match = String(versionText || '').match(/version\s+"([^" ]+)"|openjdk\s+(?:version\s+)?"([^" ]+)"/i);
  const raw = match?.[1] || match?.[2] || String(versionText || '').match(/(?:java|openjdk)\s+(\d+(?:\.\d+)?)/i)?.[1];
  if (!raw) return null;
  const parts = raw.split(/[.+_-]/).map(Number);
  if (!parts.length || !Number.isFinite(parts[0])) return null;
  return parts[0] === 1 ? (parts[1] || null) : parts[0];
}


async function resolveServerArtifact(software, version) {
  if (software === 'paper') {
    const builds = await getJson(`https://fill.papermc.io/v3/projects/paper/versions/${encodeURIComponent(version)}/builds`);
    const stableBuilds = Array.isArray(builds) ? builds.filter(item => item.channel === 'STABLE') : [];
    const selected = stableBuilds.sort((a, b) => Number(b.id) - Number(a.id))[0];
    const download = selected?.downloads?.['server:default'];
    if (!download?.url) throw new Error(`Paper does not have a stable build for Minecraft ${version}.`);
    return { url: download.url, fileName: 'server.jar', build: String(selected.id), sha256: download.checksums?.sha256 || '' };
  }
  if (software === 'purpur') {
    const data = await getJson(`https://api.purpurmc.org/v2/purpur/${encodeURIComponent(version)}`);
    const build = data?.builds?.latest;
    if (!build) throw new Error(`Purpur does not have a build for Minecraft ${version}.`);
    return { url: `https://api.purpurmc.org/v2/purpur/${encodeURIComponent(version)}/latest/download`, fileName: 'server.jar', build: String(build) };
  }
  if (software === 'vanilla') {
    const manifest = await getJson('https://piston-meta.mojang.com/mc/game/version_manifest_v2.json');
    const selected = manifest.versions?.find(item => item.id === version && item.type === 'release');
    if (!selected?.url) throw new Error(`Minecraft ${version} was not found in Mojang's official release manifest.`);
    const details = await getJson(selected.url);
    const url = details.downloads?.server?.url;
    if (!url) throw new Error(`Mojang does not publish a server JAR for Minecraft ${version}.`);
    return { url, fileName: 'server.jar', build: 'official', checksum: details.downloads?.server?.sha1 || '', checksumAlgorithm: 'sha1' };
  }
  if (software === 'fabric') {
    const [loaders, installers] = await Promise.all([
      getJson(`https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(version)}`),
      getJson('https://meta.fabricmc.net/v2/versions/installer'),
    ]);
    const loader = Array.isArray(loaders) ? loaders.find(item => item?.loader?.stable) : null;
    const installer = Array.isArray(installers) ? installers.find(item => item?.stable) : null;
    if (!loader?.loader?.version || !installer?.version) throw new Error(`Fabric does not publish a stable server loader for Minecraft ${version}.`);
    const loaderVersion = loader.loader.version;
    const installerVersion = installer.version;
    return { url: `https://meta.fabricmc.net/v2/versions/loader/${encodeURIComponent(version)}/${encodeURIComponent(loaderVersion)}/${encodeURIComponent(installerVersion)}/server/jar`, fileName: 'server.jar', build: `Fabric Loader ${loaderVersion} / Installer ${installerVersion}` };
  }
  throw new Error('Unsupported server software. Choose Paper, Purpur, Vanilla or Fabric.');
}

export async function createLocalServer({ serverRoot, name, version, software, memoryMb, javaPath = '', performancePreset = 'balanced', port = 25565, maxPlayers = 20, acceptEula, motd = '§bCRYON Server', onlineMode = true, whitelist = false, difficulty = 'easy', gameMode = 'survival', viewDistance = 8, simulationDistance = 6, pvp = true, allowFlight = false, spawnProtection = 16, worldSeed = '', worldType = 'default', generateStructures = true, hardcore = false, allowNether = true, enableCommandBlocks = false, onProgress = () => {} }) {
  const safeName = normalizeServerName(name);
  const safeVersion = normalizeMinecraftVersion(version);
  const normalizedSoftware = String(software || '').toLowerCase();
  if (!SERVER_SOFTWARE.has(normalizedSoftware)) throw new Error('Choose Paper, Purpur, Vanilla or Fabric server software.');
  if (acceptEula !== true) throw new Error('You must accept the Minecraft EULA before creating a server.');
  const safeMemory = normalizeMemoryMb(memoryMb);
  const safePort = Number(port);
  const safeMaxPlayers = Number(maxPlayers);
  if (!Number.isInteger(safePort) || safePort < 1 || safePort > 65535) throw new Error('Server port must be between 1 and 65535.');
  if (!Number.isInteger(safeMaxPlayers) || safeMaxPlayers < 1 || safeMaxPlayers > 500) throw new Error('Maximum players must be between 1 and 500.');
  await fs.mkdir(serverRoot, { recursive: true });
  const id = `server-${crypto.randomUUID()}`;
  const directory = path.join(serverRoot, id);
  await fs.mkdir(directory, { recursive: false });
  try {
    onProgress({ stage: 'resolve', message: `Finding ${normalizedSoftware} ${safeVersion} server build…` });
    const artifact = await resolveServerArtifact(normalizedSoftware, safeVersion);
    onProgress({ stage: 'download', message: `Downloading ${normalizedSoftware} server…` });
    const jarPath = path.join(directory, 'server.jar');
    await downloadFile(artifact.url, jarPath, onProgress, artifact.sha256 || artifact.checksum || '', 100 * 1024, artifact.checksumAlgorithm || 'sha256');
    await assertJarArchive(jarPath, 'Downloaded server file');
    if (normalizedSoftware === 'paper' || normalizedSoftware === 'purpur') await fs.mkdir(path.join(directory, 'plugins'), { recursive: true });
    if (normalizedSoftware === 'fabric') await fs.mkdir(path.join(directory, 'mods'), { recursive: true });
    await fs.writeFile(path.join(directory, 'eula.txt'), '# By changing the setting below to TRUE you indicate your agreement to the Minecraft EULA (https://aka.ms/MinecraftEULA).\neula=true\n', 'utf8');
    const metadata = {
      id, name: safeName, version: safeVersion, software: normalizedSoftware,
      build: artifact.build, memoryMb: safeMemory, javaPath: String(javaPath || '').slice(0, 1024),
      performancePreset: ['low-resource', 'balanced', 'performance', 'custom'].includes(performancePreset) ? performancePreset : 'balanced',
      port: safePort, maxPlayers: safeMaxPlayers, createdAt: new Date().toISOString(), jarFile: 'server.jar',
    };
    await fs.writeFile(path.join(directory, 'cryon-server.json'), JSON.stringify(metadata, null, 2), 'utf8');
    await fs.writeFile(path.join(directory, 'server.properties'), buildServerProperties({
      motd, port: safePort, maxPlayers: safeMaxPlayers, onlineMode, whitelist, difficulty,
      gameMode, viewDistance, simulationDistance, pvp, allowFlight, spawnProtection,
      worldSeed, worldType, generateStructures, hardcore, allowNether, enableCommandBlocks,
    }), 'utf8');
    return metadata;
  } catch (error) {
    await fs.rm(directory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function listLocalServers(serverRoot, runtimeStatuses = {}) {
  await fs.mkdir(serverRoot, { recursive: true });
  const entries = await fs.readdir(serverRoot, { withFileTypes: true });
  const servers = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^server-[a-f0-9-]{36}$/.test(entry.name)) continue;
    try {
      const directory = path.join(serverRoot, entry.name);
      const metadata = JSON.parse(await fs.readFile(path.join(directory, 'cryon-server.json'), 'utf8'));
      if (metadata.id !== entry.name || typeof metadata.name !== 'string') continue;
      servers.push({ ...metadata, status: runtimeStatuses[metadata.id] || 'offline' });
    } catch { /* Ignore incomplete or externally modified server directories. */ }
  }
  return servers.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

export async function readServerMetadata(serverRoot, serverId) {
  if (!/^server-[a-f0-9-]{36}$/.test(String(serverId || ''))) throw new Error('Invalid server ID.');
  const rootStat = await fs.lstat(serverRoot).catch(() => null);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) throw new Error('CRYON server storage folder is missing or unsafe.');
  const directory = path.join(serverRoot, serverId);
  const directoryStat = await fs.lstat(directory).catch(() => null);
  if (!directoryStat?.isDirectory() || directoryStat.isSymbolicLink()) throw new Error('Server folder is missing or is not a real directory.');
  const metadataPath = path.join(directory, 'cryon-server.json');
  const metadataStat = await fs.lstat(metadataPath).catch(() => null);
  if (!metadataStat?.isFile() || metadataStat.isSymbolicLink()) throw new Error('Server metadata file is missing or unsafe.');
  const metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8'));
  if (metadata.id !== serverId) throw new Error('Server metadata does not match this server ID.');
  return { directory, metadata };
}

export async function updateServerPublicAddress(serverRoot, serverId, publicAddress) {
  const { directory, metadata } = await readServerMetadata(serverRoot, serverId);
  const value = String(publicAddress || '').trim();
  if (value.length > 253 || /[\s/\\?#@]/.test(value)) throw new Error('Enter a valid public server hostname, optionally followed by a port.');
  if (value) {
    const match = value.match(/^([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([0-9]{1,5}))?$/i);
    if (!match || match[1].includes('..') || match[1].split('.').some(part => !part || part.length > 63) || (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535))) {
      throw new Error('Enter a valid public server hostname such as my-world.joinmc.link or host:port.');
    }
  }
  const updated = { ...metadata, publicAddress: value };
  await fs.writeFile(path.join(directory, 'cryon-server.json'), JSON.stringify(updated, null, 2), 'utf8');
  return value;
}

export async function listServerFiles(serverRoot, serverId, relativePath = '') {
  const { directory } = await readServerMetadata(serverRoot, serverId);
  const target = safeServerPath(directory, relativePath);
  await assertNoSymlinkSegments(directory, relativePath);
  const stat = await fs.lstat(target);
  if (!stat.isDirectory() || stat.isSymbolicLink()) throw new Error('Choose a server folder.');
  const entries = await fs.readdir(target, { withFileTypes: true });
  const result = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const itemPath = safeServerPath(directory, path.posix.join(String(relativePath || '').replace(/\\/g, '/'), entry.name));
    const itemStat = await fs.stat(itemPath);
    result.push({ name: entry.name, path: path.relative(directory, itemPath).split(path.sep).join('/'), type: entry.isDirectory() ? 'directory' : 'file', size: itemStat.size, modifiedAt: itemStat.mtime.toISOString() });
  }
  return result.sort((a, b) => a.type === b.type ? a.name.localeCompare(b.name) : a.type === 'directory' ? -1 : 1);
}

export async function readServerTextFile(serverRoot, serverId, relativePath) {
  const { directory } = await readServerMetadata(serverRoot, serverId);
  const target = safeServerPath(directory, relativePath);
  await assertNoSymlinkSegments(directory, relativePath);
  const stat = await fs.lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Only regular text files can be opened in the editor.');
  if (!TEXT_EXTENSIONS.has(path.extname(target).toLowerCase())) throw new Error('This file type cannot be edited in the built-in text editor.');
  if (stat.size > MAX_TEXT_FILE_BYTES) throw new Error('This file is larger than 1 MB and cannot be opened in the built-in editor.');
  return { path: String(relativePath), content: await fs.readFile(target, 'utf8') };
}

export async function writeServerTextFile(serverRoot, serverId, relativePath, content) {
  const { directory } = await readServerMetadata(serverRoot, serverId);
  const target = safeServerPath(directory, relativePath);
  await assertNoSymlinkSegments(directory, relativePath);
  const stat = await fs.lstat(target);
  if (!stat.isFile() || stat.isSymbolicLink()) throw new Error('Only existing regular text files can be edited.');
  if (path.basename(target) === 'cryon-server.json') throw new Error('CRYON server metadata is protected.');
  if (!TEXT_EXTENSIONS.has(path.extname(target).toLowerCase())) throw new Error('This file type cannot be edited in the built-in text editor.');
  const value = String(content ?? '');
  if (Buffer.byteLength(value, 'utf8') > MAX_TEXT_FILE_BYTES) throw new Error('Text files are limited to 1 MB.');
  await fs.writeFile(target, value, 'utf8');
  return true;
}

export async function removeServerFile(serverRoot, serverId, relativePath) {
  const { directory } = await readServerMetadata(serverRoot, serverId);
  const target = safeServerPath(directory, relativePath);
  await assertNoSymlinkSegments(directory, relativePath);
  const relative = path.relative(directory, target).split(path.sep).join('/');
  if (!relative || ['server.jar', 'cryon-server.json', 'eula.txt'].includes(relative)) throw new Error('This core server file is protected.');
  const stat = await fs.lstat(target);
  if (stat.isSymbolicLink()) throw new Error('Symbolic links cannot be removed from the file manager.');
  await fs.rm(target, { recursive: stat.isDirectory(), force: false });
  return true;
}

export async function uploadServerFile(serverRoot, serverId, relativeDirectory, sourceFile) {
  const { directory } = await readServerMetadata(serverRoot, serverId);
  const targetDirectory = safeServerPath(directory, relativeDirectory);
  await assertNoSymlinkSegments(directory, relativeDirectory);
  const directoryStat = await fs.lstat(targetDirectory);
  if (!directoryStat.isDirectory() || directoryStat.isSymbolicLink()) throw new Error('Choose a valid server folder for the upload.');
  const source = path.resolve(String(sourceFile || ''));
  const sourceStat = await fs.stat(source);
  if (!sourceStat.isFile() || sourceStat.size > 500 * 1024 * 1024) throw new Error('Uploaded server files must be regular files no larger than 500 MB.');
  const base = path.basename(source).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 140) || 'upload.bin';
  let destination = path.join(targetDirectory, base);
  if (await fs.stat(destination).catch(() => null)) destination = path.join(targetDirectory, `${path.parse(base).name}-${Date.now()}${path.extname(base)}`);
  await fs.copyFile(source, destination);
  return path.relative(directory, destination).split(path.sep).join('/');
}

export async function installLocalPlugin(serverRoot, serverId, sourceFile) {
  const { directory, metadata } = await readServerMetadata(serverRoot, serverId);
  if (!['paper', 'purpur'].includes(metadata.software)) throw new Error('Only Paper and Purpur servers support Bukkit/Paper plugins. Use Fabric mods on a Fabric server.');
  if (path.extname(String(sourceFile || '')).toLowerCase() !== '.jar') throw new Error('Choose a plugin .jar file.');
  const source = path.resolve(String(sourceFile));
  const stat = await fs.stat(source);
  if (!stat.isFile() || stat.size > 100 * 1024 * 1024) throw new Error('Plugin file must be a regular file no larger than 100 MB.');
  await assertJarArchive(source, 'Selected plugin');
  const pluginsDirectory = path.join(directory, 'plugins');
  await fs.mkdir(pluginsDirectory, { recursive: true });
  const base = path.basename(source).replace(/[^a-zA-Z0-9._ -]/g, '_').slice(0, 120) || 'plugin.jar';
  let destination = path.join(pluginsDirectory, base);
  if (await fs.stat(destination).catch(() => null)) destination = path.join(pluginsDirectory, `${path.parse(base).name}-${Date.now()}.jar`);
  await fs.copyFile(source, destination);
  return path.basename(destination);
}

export async function listInstalledServerPlugins(serverRoot, serverId) {
  const { directory, metadata } = await readServerMetadata(serverRoot, serverId);
  const pluginDirectory = path.join(directory, 'plugins');
  const entries = await fs.readdir(pluginDirectory, { withFileTypes: true }).catch(() => []);
  const plugins = [];
  for (const entry of entries) {
    if (!entry.isFile() || entry.isSymbolicLink() || path.extname(entry.name).toLowerCase() !== '.jar') continue;
    const stat = await fs.stat(path.join(pluginDirectory, entry.name));
    plugins.push({ name: entry.name, path: `plugins/${entry.name}`, size: stat.size, modifiedAt: stat.mtime.toISOString() });
  }
  return { software: metadata.software, supported: ['paper', 'purpur'].includes(metadata.software), plugins: plugins.sort((a, b) => a.name.localeCompare(b.name)) };
}

export async function searchModrinthPlugins(query, gameVersion = '') {
  const params = new URLSearchParams({ query: String(query || '').slice(0, 80), limit: '15', facets: JSON.stringify([['all_project_types:plugin']]) });
  const search = await getJson(`https://api.modrinth.com/v2/search?${params.toString()}`);
  const hits = Array.isArray(search.hits) ? search.hits : [];
  const version = String(gameVersion || '');
  return hits.map(item => ({
    projectId: item.project_id, slug: item.slug, title: item.title,
    description: item.description, downloads: item.downloads, iconUrl: item.icon_url,
    url: `https://modrinth.com/plugin/${encodeURIComponent(item.slug)}`,
    gameVersions: (item.versions || []).slice(0, 4),
    compatible: !version || (item.versions || []).includes(version),
  }));
}

export async function downloadModrinthPlugin(serverRoot, serverId, projectId, gameVersion = '') {
  const { directory, metadata } = await readServerMetadata(serverRoot, serverId);
  if (!['paper', 'purpur'].includes(metadata.software)) throw new Error('Only Paper and Purpur servers support Bukkit/Paper plugins. Use Fabric mods on a Fabric server.');
  const id = String(projectId || '');
  if (!/^[a-zA-Z0-9]{8,64}$/.test(id)) throw new Error('Invalid Modrinth plugin project ID.');
  const params = new URLSearchParams({ loaders: JSON.stringify(['paper', 'purpur', 'spigot']), game_versions: JSON.stringify([String(gameVersion || metadata.version)]) });
  const versions = await getJson(`https://api.modrinth.com/v2/project/${encodeURIComponent(id)}/version?${params.toString()}`);
  const compatible = Array.isArray(versions) ? versions : [];
  const selected = compatible.find(item => item.version_type === 'release') || compatible[0];
  const file = selected?.files?.find(item => item.primary) || selected?.files?.[0];
  if (!file?.url || !String(file.filename || '').toLowerCase().endsWith('.jar')) throw new Error('No compatible Paper/Purpur plugin JAR was found for this server version.');
  const pluginDir = path.join(directory, 'plugins');
  await fs.mkdir(pluginDir, { recursive: true });
  const safeFile = path.basename(file.filename).replace(/[^a-zA-Z0-9._ -]/g, '_');
  let destination = path.join(pluginDir, safeFile);
  if (await fs.stat(destination).catch(() => null)) destination = path.join(pluginDir, `${path.parse(safeFile).name}-${Date.now()}.jar`);
  await downloadModrinthJar(file.url, destination, file.hashes || {});
  return { filename: path.basename(destination), version: selected.version_number, name: selected.name || selected.version_number };
}


export async function searchModrinthServerMods(query, gameVersion = '') {
  const serverEnvironments = ['client_and_server', 'server_only', 'server_only_client_optional', 'dedicated_server_only', 'client_or_server', 'client_or_server_prefers_both'];
  const facets = [['project_type:mod'], ['versions:' + String(gameVersion || '')], ['categories:fabric'], serverEnvironments.map(value => `environment:${value}`)];
  const params = new URLSearchParams({ query: String(query || '').slice(0, 80), limit: '15', facets: JSON.stringify(facets) });
  const search = await getJson(`https://api.modrinth.com/v2/search?${params.toString()}`);
  return (Array.isArray(search.hits) ? search.hits : []).map(item => {
    const environment = Array.isArray(item.environment) ? item.environment : [];
    const serverCompatible = environment.some(value => serverEnvironments.includes(value));
    const versionCompatible = !gameVersion || (item.versions || []).includes(gameVersion);
    return {
      projectId: item.project_id, slug: item.slug, title: item.title, description: item.description,
      downloads: item.downloads, iconUrl: item.icon_url, url: `https://modrinth.com/mod/${encodeURIComponent(item.slug)}`,
      gameVersions: (item.versions || []).slice(0, 4), environment, serverCompatible,
      compatible: versionCompatible && serverCompatible,
    };
  });
}

export async function downloadModrinthServerMod(serverRoot, serverId, projectId, gameVersion = '') {
  const { directory, metadata } = await readServerMetadata(serverRoot, serverId);
  if (metadata.software !== 'fabric') throw new Error('Modrinth server mods currently require a Fabric server.');
  const id = String(projectId || '');
  if (!/^[a-zA-Z0-9]{8,64}$/.test(id)) throw new Error('Invalid Modrinth mod project ID.');
  const params = new URLSearchParams({ loaders: JSON.stringify(['fabric']), game_versions: JSON.stringify([String(gameVersion || metadata.version)]) });
  const versions = await getJson(`https://api.modrinth.com/v2/project/${encodeURIComponent(id)}/version?${params.toString()}`);
  const serverCompatibleVersions = Array.isArray(versions) ? versions.filter(item => {
    const serverSide = item.environment?.server ?? item.server_side;
    return serverSide !== 'unsupported' && serverSide !== 'unknown';
  }) : [];
  const selected = serverCompatibleVersions.find(item => item.version_type === 'release') || serverCompatibleVersions[0];
  const file = selected?.files?.find(item => item.primary) || selected?.files?.[0];
  if (!file?.url || !String(file.filename || '').toLowerCase().endsWith('.jar')) throw new Error('No server-compatible Fabric mod JAR was found for this Minecraft version. Check the project environment and dependencies.');
  const modsDirectory = path.join(directory, 'mods'); await fs.mkdir(modsDirectory, { recursive: true });
  const safeFile = path.basename(file.filename).replace(/[^a-zA-Z0-9._ -]/g, '_');
  let destination = path.join(modsDirectory, safeFile);
  if (await fs.stat(destination).catch(() => null)) destination = path.join(modsDirectory, `${path.parse(safeFile).name}-${Date.now()}.jar`);
  await downloadModrinthJar(file.url, destination, file.hashes || {});
  return { filename: path.basename(destination), version: selected.version_number, name: selected.name || selected.version_number };
}

const BACKUP_CONTENT = new Set(['world', 'world_nether', 'world_the_end', 'plugins', 'mods', 'config', 'server.properties', 'bukkit.yml', 'spigot.yml', 'paper-global.yml', 'paper-world-defaults.yml', 'ops.json', 'whitelist.json', 'banned-players.json', 'banned-ips.json', 'usercache.json', 'server-icon.png', 'crash-reports']);

function getBackupContentNames(propertiesText = '') {
  const names = new Set(BACKUP_CONTENT);
  const match = String(propertiesText).match(/^level-name\s*=\s*(.+?)\s*$/mi);
  const levelName = String(match?.[1] || 'world').trim();
  if (/^[a-zA-Z0-9 _.-]{1,64}$/.test(levelName) && !['.', '..'].includes(levelName)) {
    names.add(levelName); names.add(`${levelName}_nether`); names.add(`${levelName}_the_end`);
  }
  return names;
}

async function copyServerTreeSafely(source, destination) {
  const stat = await fs.lstat(source);
  if (stat.isSymbolicLink()) return false;
  if (stat.isDirectory()) {
    await fs.mkdir(destination, { recursive: true });
    for (const entry of await fs.readdir(source)) await copyServerTreeSafely(path.join(source, entry), path.join(destination, entry));
    return true;
  }
  if (stat.isFile()) {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.copyFile(source, destination);
    return true;
  }
  return false;
}

async function ensureServerAuxDirectory(serverRoot, ...segments) {
  let current = path.resolve(serverRoot);
  const rootStat = await fs.lstat(current).catch(() => null);
  if (!rootStat?.isDirectory() || rootStat.isSymbolicLink()) throw new Error('Server storage folder is missing or unsafe.');
  for (const segment of segments) {
    if (!segment || segment === '.' || segment === '..' || path.basename(segment) !== segment) throw new Error('Invalid server storage path segment.');
    current = path.join(current, segment);
    const stat = await fs.lstat(current).catch(() => null);
    if (stat?.isSymbolicLink() || (stat && !stat.isDirectory())) throw new Error(`Unsafe server storage directory: ${segment}.`);
    if (!stat) await fs.mkdir(current);
  }
  return current;
}

async function measureServerTreeBytes(target) {
  const stat = await fs.lstat(target).catch(() => null);
  if (!stat || stat.isSymbolicLink()) return 0;
  if (stat.isFile()) return stat.size;
  if (!stat.isDirectory()) return 0;
  let total = 0;
  for (const entry of await fs.readdir(target)) total += await measureServerTreeBytes(path.join(target, entry));
  return total;
}

export async function createServerBackup(serverRoot, serverId) {
  const { directory, metadata } = await readServerMetadata(serverRoot, serverId);
  const backupId = `backup-${new Date().toISOString().replace(/[:.]/g, '-')}-${crypto.randomUUID().slice(0, 8)}`;
  const backupParent = await ensureServerAuxDirectory(serverRoot, '.backups', serverId);
  const backupDirectory = await ensureServerAuxDirectory(backupParent, backupId);
  const included = [];
  let bytes = 0;
  try {
    const propertiesText = await fs.readFile(path.join(directory, 'server.properties'), 'utf8').catch(() => '');
    for (const name of getBackupContentNames(propertiesText)) {
      const source = path.join(directory, name);
      const stat = await fs.lstat(source).catch(() => null);
      if (!stat || stat.isSymbolicLink()) continue;
      await copyServerTreeSafely(source, path.join(backupDirectory, name));
      included.push(name);
      bytes += await measureServerTreeBytes(path.join(backupDirectory, name));
    }
    if (!included.length) throw new Error('No world or server configuration files were found to back up.');
    const manifest = { id: backupId, serverId, serverName: metadata.name, createdAt: new Date().toISOString(), included, bytes, type: 'local-snapshot' };
    await fs.writeFile(path.join(backupDirectory, 'backup.json'), JSON.stringify(manifest, null, 2), 'utf8');
    return manifest;
  } catch (error) {
    await fs.rm(backupDirectory, { recursive: true, force: true }).catch(() => {});
    throw error;
  }
}

export async function listServerBackups(serverRoot, serverId) {
  await readServerMetadata(serverRoot, serverId);
  const backupRoot = await ensureServerAuxDirectory(serverRoot, '.backups', serverId).catch(error => {
    if (error?.code === 'ENOENT') return null;
    throw error;
  });
  if (!backupRoot) return [];
  const entries = await fs.readdir(backupRoot, { withFileTypes: true }).catch(() => []);
  const result = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^backup-[a-zA-Z0-9-]+$/.test(entry.name)) continue;
    try {
      const item = JSON.parse(await fs.readFile(path.join(backupRoot, entry.name, 'backup.json'), 'utf8'));
      if (item.serverId === serverId && item.id === entry.name) result.push(item);
    } catch { /* Ignore incomplete backup snapshots. */ }
  }
  return result.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
}

async function replaceServerEntrySafely(source, destination) {
  const existing = await fs.lstat(destination).catch(() => null);
  if (existing?.isSymbolicLink()) throw new Error(`Refusing to replace symbolic link ${path.basename(destination)}.`);
  if (existing) await fs.rm(destination, { recursive: existing.isDirectory(), force: true });
  await copyServerTreeSafely(source, destination);
}

export async function restoreServerBackup(serverRoot, serverId, backupId) {
  const { directory } = await readServerMetadata(serverRoot, serverId);
  const safeBackupId = String(backupId || '');
  if (!/^backup-[a-zA-Z0-9-]+$/.test(safeBackupId)) throw new Error('Invalid backup identifier.');
  const backupRoot = await ensureServerAuxDirectory(serverRoot, '.backups', serverId);
  const backupDirectory = path.join(backupRoot, safeBackupId);
  const backupStat = await fs.lstat(backupDirectory).catch(() => null);
  if (!backupStat?.isDirectory() || backupStat.isSymbolicLink()) throw new Error('Backup folder is missing or unsafe.');
  const manifest = JSON.parse(await fs.readFile(path.join(backupDirectory, 'backup.json'), 'utf8'));
  if (manifest.serverId !== serverId || manifest.id !== safeBackupId || !Array.isArray(manifest.included)) throw new Error('Backup metadata is invalid or does not belong to this server.');
  const backupProperties = await fs.readFile(path.join(backupDirectory, 'server.properties'), 'utf8').catch(() => '');
  const backupContentNames = getBackupContentNames(backupProperties);
  const allowed = [...new Set(manifest.included.filter(name => typeof name === 'string' && backupContentNames.has(name)))];
  if (!allowed.length) throw new Error('This backup does not contain any recognized server files.');
  const rollbackId = `restore-${Date.now()}-${crypto.randomUUID().slice(0, 8)}`;
  const rollbackParent = await ensureServerAuxDirectory(serverRoot, '.restore-rollback', serverId);
  const rollbackDirectory = await ensureServerAuxDirectory(rollbackParent, rollbackId);
  const previousEntries = new Set();
  try {
    for (const name of allowed) {
      const target = path.join(directory, name);
      const backup = path.join(backupDirectory, name);
      const backupItemStat = await fs.lstat(backup).catch(() => null);
      if (!backupItemStat || backupItemStat.isSymbolicLink()) throw new Error(`Backup entry ${name} is missing or unsafe.`);
      const currentStat = await fs.lstat(target).catch(() => null);
      if (currentStat?.isSymbolicLink()) throw new Error(`Current server entry ${name} is a symbolic link and cannot safely be replaced.`);
      if (currentStat) {
        previousEntries.add(name);
        await copyServerTreeSafely(target, path.join(rollbackDirectory, name));
      }
    }
    for (const name of allowed) {
      await replaceServerEntrySafely(path.join(backupDirectory, name), path.join(directory, name));
    }
    await fs.writeFile(path.join(rollbackDirectory, 'rollback.json'), JSON.stringify({ serverId, backupId: safeBackupId, createdAt: new Date().toISOString(), contents: allowed }, null, 2), 'utf8');
    return { restored: true, backupId: safeBackupId, rollbackDirectory, files: allowed };
  } catch (error) {
    for (const name of allowed) {
      const target = path.join(directory, name);
      const rollback = path.join(rollbackDirectory, name);
      const previous = await fs.lstat(rollback).catch(() => null);
      const current = await fs.lstat(target).catch(() => null);
      if (current?.isSymbolicLink()) continue;
      if (current) await fs.rm(target, { recursive: current.isDirectory(), force: true }).catch(() => {});
      if (previous) await copyServerTreeSafely(rollback, target).catch(() => {});
      else if (!previousEntries.has(name)) await fs.rm(target, { recursive: true, force: true }).catch(() => {});
    }
    throw error;
  }
}

function encodeVarInt(value) {
  const bytes = [];
  let current = value >>> 0;
  do { let temp = current & 0x7f; current >>>= 7; if (current !== 0) temp |= 0x80; bytes.push(temp); } while (current !== 0);
  return Buffer.from(bytes);
}
function readVarInt(buffer, offset = 0) {
  let result = 0; let position = offset; let byte;
  do { if (position >= buffer.length || position - offset > 4) throw new Error('Invalid status packet.'); byte = buffer[position++]; result |= (byte & 0x7f) << (7 * (position - offset - 1)); } while (byte & 0x80);
  return { value: result, offset: position };
}
export async function pingMinecraftServer(port = 25565, host = '127.0.0.1', handshakeHost = host) {
  const targetPort = Number(port);
  if (!Number.isInteger(targetPort) || targetPort < 1 || targetPort > 65535) throw new Error('Invalid server port.');
  return new Promise(resolve => {
    const socket = net.createConnection({ host, port: targetPort });
    let buffer = Buffer.alloc(0); let settled = false;
    const finish = value => { if (settled) return; settled = true; socket.destroy(); resolve(value); };
    socket.setTimeout(1800, () => finish({ online: false, playersOnline: 0, maxPlayers: 0, latencyMs: null }));
    socket.on('error', () => finish({ online: false, playersOnline: 0, maxPlayers: 0, latencyMs: null }));
    socket.on('connect', () => {
      const hostBytes = Buffer.from(String(handshakeHost || host), 'utf8');
      // A status ping does not know the target server's protocol yet. -1 is the
      // conventional unknown-version value; a stale hard-coded protocol can be
      // rejected by newer servers before they return their version/player count.
      const handshakeBody = Buffer.concat([Buffer.from([0x00]), encodeVarInt(-1), encodeVarInt(hostBytes.length), hostBytes, Buffer.from([targetPort >> 8, targetPort & 0xff, 0x01])]);
      const handshake = Buffer.concat([encodeVarInt(handshakeBody.length), handshakeBody]);
      const request = Buffer.from([0x01, 0x00]);
      socket.write(Buffer.concat([handshake, request]));
    });
    socket.on('data', chunk => {
      buffer = Buffer.concat([buffer, chunk]);
      try {
        const packetLength = readVarInt(buffer, 0);
        if (buffer.length < packetLength.offset + packetLength.value) return;
        let packetOffset = packetLength.offset;
        const packetId = readVarInt(buffer, packetOffset); packetOffset = packetId.offset;
        if (packetId.value !== 0) return finish({ online: false, playersOnline: 0, maxPlayers: 0, latencyMs: null });
        const jsonLength = readVarInt(buffer, packetOffset); packetOffset = jsonLength.offset;
        const json = JSON.parse(buffer.subarray(packetOffset, packetOffset + jsonLength.value).toString('utf8'));
        finish({ online: true, playersOnline: Number(json.players?.online) || 0, maxPlayers: Number(json.players?.max) || 0, latencyMs: null, version: json.version?.name || null, description: typeof json.description === 'string' ? json.description : (json.description?.text || '') });
      } catch { /* Wait for the rest of the TCP packet. */ }
    });
  });
}
