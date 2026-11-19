import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { spawn } from 'node:child_process';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createWriteStream } from 'node:fs';
import { detectJavaRuntime } from './java-runtime.js';

const MAX_DOWNLOAD_BYTES = 300 * 1024 * 1024;
const ACTIVE_INSTALLS = new Map();

export function mapTemurinPlatform(platform = process.platform, architecture = process.arch) {
  const osName = ({ win32: 'windows', darwin: 'mac', linux: 'linux' })[platform];
  const arch = ({ x64: 'x64', arm64: 'aarch64', ia32: 'x86', arm: 'arm' })[architecture];
  if (!osName || !arch) throw new Error(`Temurin Java runtime is not available for ${platform}/${architecture} through CRYON automatic setup.`);
  return { os: osName, architecture: arch, extension: osName === 'windows' ? 'zip' : 'tar.gz' };
}

async function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], ...options });
    let output = '';
    child.stdout?.on('data', chunk => { output = `${output}${chunk}`.slice(-6000); });
    child.stderr?.on('data', chunk => { output = `${output}${chunk}`.slice(-6000); });
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve(output) : reject(new Error(`${path.basename(command)} failed (${code ?? 'unknown'}): ${output.trim().slice(-1200)}`)));
  });
}

async function downloadVerified(url, destination, expectedSha256, onProgress = () => {}) {
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:' || !['github.com', 'githubusercontent.com', 'api.adoptium.net', 'github-releases.githubusercontent.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) {
    throw new Error('Java download URL did not match an approved HTTPS download host.');
  }
  const response = await fetch(url, { redirect: 'follow', signal: AbortSignal.timeout(180000), headers: { 'User-Agent': 'CRYON-CLIENT-Java-Manager/0.10.3' } });
  if (!response.ok || !response.body) throw new Error(`Temurin download failed (${response.status}).`);
  const finalUrl = new URL(response.url);
  if (finalUrl.protocol !== 'https:' || !['github.com', 'githubusercontent.com', 'api.adoptium.net', 'github-releases.githubusercontent.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].some(host => finalUrl.hostname === host || finalUrl.hostname.endsWith(`.${host}`))) {
    throw new Error('Java download redirected outside the approved HTTPS runtime hosts.');
  }
  const total = Number(response.headers.get('content-length')) || 0;
  if (total > MAX_DOWNLOAD_BYTES) throw new Error('Java runtime download exceeds the 300 MB safety limit.');
  let received = 0;
  const hash = crypto.createHash('sha256');
  const progress = new Transform({
    transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > MAX_DOWNLOAD_BYTES) return callback(new Error('Java runtime download exceeded the 300 MB safety limit.'));
      hash.update(chunk);
      onProgress({ stage: 'download', received, total: total || null, percent: total ? Math.min(99, Math.floor(received / total * 100)) : null });
      callback(null, chunk);
    },
  });
  try {
    await pipeline(Readable.fromWeb(response.body), progress, createWriteStream(destination, { flags: 'wx' }));
    const actual = hash.digest('hex');
    if (!expectedSha256 || actual.toLowerCase() !== String(expectedSha256).toLowerCase()) throw new Error('Temurin SHA-256 verification failed. The downloaded runtime was rejected.');
  } catch (error) {
    await fs.rm(destination, { force: true }).catch(() => {});
    throw error;
  }
  onProgress({ stage: 'download', received, total: total || received, percent: 100 });
}

async function findJavaExecutable(root, platform = process.platform, depth = 0) {
  if (depth > 7) return null;
  const executableName = platform === 'win32' ? 'java.exe' : 'java';
  const direct = path.join(root, 'bin', executableName);
  const directStat = await fs.lstat(direct).catch(() => null);
  if (directStat?.isFile() && !directStat.isSymbolicLink()) return direct;
  const contentsHome = path.join(root, 'Contents', 'Home', 'bin', executableName);
  const macStat = await fs.lstat(contentsHome).catch(() => null);
  if (macStat?.isFile() && !macStat.isSymbolicLink()) return contentsHome;
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.slice(0, 80)) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const match = await findJavaExecutable(path.join(root, entry.name), platform, depth + 1);
    if (match) return match;
  }
  return null;
}

/**
 * CRYON installs each Temurin package into an immutable checksum-specific folder.
 * It never renames or replaces the active temurin-<major> folder, avoiding Windows
 * EPERM failures when java.exe or a runtime DLL is held open by a running process,
 * Defender, or the filesystem indexer.
 */
export function getManagedJavaDirectory(userDataDirectory, major = 21, checksum = '') {
  const version = Number(major);
  if (![8, 16, 17, 21, 25].includes(version)) throw new Error(`CRYON does not manage Java ${major}; select an installed runtime or use a supported version.`);
  const suffix = /^[a-f0-9]{12,64}$/i.test(String(checksum)) ? `-${String(checksum).slice(0, 16).toLowerCase()}` : '';
  return path.join(path.resolve(userDataDirectory), 'runtimes', `temurin-${version}${suffix}`);
}

export async function getManagedJavaExecutable(userDataDirectory, platform = process.platform, major = 21) {
  const root = path.join(path.resolve(userDataDirectory), 'runtimes');
  const prefix = `temurin-${Number(major)}`;
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  const candidates = entries
    .filter(entry => entry.isDirectory() && !entry.isSymbolicLink() && (entry.name === prefix || entry.name.startsWith(`${prefix}-`)))
    .map(entry => path.join(root, entry.name));
  // Prefer immutable checksum-versioned installs over the legacy mutable directory.
  candidates.sort((a, b) => path.basename(b).localeCompare(path.basename(a)));
  for (const directory of candidates) {
    const executable = await findJavaExecutable(directory, platform);
    if (!executable) continue;
    const runtime = await detectJavaRuntime(executable);
    if (runtime.found && Number(runtime.major) === Number(major)) return executable;
  }
  return null;
}

async function installTemurinRuntimeInternal(userDataDirectory, major, onProgress, platform, architecture) {
  const version = Number(major);
  const platformInfo = mapTemurinPlatform(platform, architecture);
  const runtimesRoot = path.join(path.resolve(userDataDirectory), 'runtimes');
  await fs.mkdir(runtimesRoot, { recursive: true });
  onProgress({ stage: 'resolve', percent: 0, message: `Finding Eclipse Temurin Java ${version} for ${platformInfo.os}/${platformInfo.architecture}…` });
  const metadataUrl = `https://api.adoptium.net/v3/assets/latest/${version}/hotspot?architecture=${encodeURIComponent(platformInfo.architecture)}&image_type=jre&os=${encodeURIComponent(platformInfo.os)}&vendor=eclipse&release_type=ga`;
  const metadataResponse = await fetch(metadataUrl, { signal: AbortSignal.timeout(30000), headers: { 'User-Agent': 'CRYON-CLIENT-Java-Manager/0.10.3' } });
  if (!metadataResponse.ok) throw new Error(`Temurin metadata request failed (${metadataResponse.status}).`);
  const metadata = await metadataResponse.json();
  const asset = Array.isArray(metadata) ? metadata[0]?.binaries?.find(item => item?.image_type === 'jre') || metadata[0]?.binary : metadata?.binary;
  const pack = asset?.package;
  if (!pack?.link || !/^[a-f0-9]{64}$/i.test(String(pack.checksum || ''))) throw new Error('Temurin did not return a runtime package with a SHA-256 checksum for this platform.');

  const checksum = String(pack.checksum).toLowerCase();
  let targetRoot = getManagedJavaDirectory(userDataDirectory, version, checksum);
  // A complete installation is reused. A partial/corrupt folder is never overwritten;
  // use a fresh immutable destination so Windows does not need to rename a locked tree.
  const existingExecutable = await findJavaExecutable(targetRoot, platform);
  if (existingExecutable) {
    const existingRuntime = await detectJavaRuntime(existingExecutable);
    if (existingRuntime.found && Number(existingRuntime.major) === version) {
      onProgress({ stage: 'complete', percent: 100, message: `Verified Temurin Java ${existingRuntime.version} is already installed.` });
      return { executable: existingExecutable, major: existingRuntime.major, version: existingRuntime.version, vendor: 'Eclipse Temurin', packageName: pack.name || null, reused: true };
    }
    targetRoot = `${targetRoot}-retry-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  } else if (await fs.lstat(targetRoot).catch(() => null)) {
    targetRoot = `${targetRoot}-retry-${Date.now()}-${crypto.randomBytes(3).toString('hex')}`;
  }

  const archive = path.join(runtimesRoot, `.temurin-${version}-${process.pid}-${crypto.randomUUID()}.${platformInfo.extension}`);
  let targetCreated = false;
  try {
    onProgress({ stage: 'download', percent: 0, message: `Downloading Eclipse Temurin Java ${version} (${pack.name || 'runtime'})…` });
    await downloadVerified(pack.link, archive, checksum, progress => onProgress({ ...progress, message: `Downloading and verifying Temurin Java ${version}…` }));
    // Extract directly into a new checksum-specific path. No fs.rename() of an existing
    // runtime directory is attempted, which is the operation failing with EPERM on Windows.
    await fs.mkdir(targetRoot, { recursive: false });
    targetCreated = true;
    onProgress({ stage: 'extract', percent: 0, message: `Extracting Java ${version} runtime…` });
    if (platform === 'win32') {
      const quote = value => `'${String(value).replace(/'/g, "''")}'`;
      await run('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', `$ErrorActionPreference='Stop'; Expand-Archive -LiteralPath ${quote(archive)} -DestinationPath ${quote(targetRoot)} -Force`]);
    } else {
      await run('tar', ['-xzf', archive, '-C', targetRoot]);
    }
    const installedExecutable = await findJavaExecutable(targetRoot, platform);
    if (!installedExecutable) throw new Error('Java archive was extracted, but its java executable could not be found.');
    if (platform !== 'win32') await fs.chmod(installedExecutable, 0o755);
    const verified = await detectJavaRuntime(installedExecutable);
    if (!verified.found || Number(verified.major) !== version) throw new Error(`Installed runtime did not pass the Java ${version} check: ${verified.message}`);
    onProgress({ stage: 'complete', percent: 100, message: `Temurin Java ${verified.major} installed and verified.` });
    return { executable: installedExecutable, major: verified.major, version: verified.version, vendor: 'Eclipse Temurin', packageName: pack.name || null, reused: false };
  } catch (error) {
    if (targetCreated) await fs.rm(targetRoot, { recursive: true, force: true, maxRetries: 4, retryDelay: 250 }).catch(() => {});
    throw error;
  } finally {
    await fs.rm(archive, { force: true, maxRetries: 4, retryDelay: 250 }).catch(() => {});
  }
}

export async function installTemurinRuntime(userDataDirectory, major = 21, onProgress = () => {}, platform = process.platform, architecture = process.arch) {
  const version = Number(major);
  if (![8, 16, 17, 21, 25].includes(version)) throw new Error(`CRYON does not manage Java ${major}; select an installed runtime or use a supported version.`);
  const key = `${path.resolve(userDataDirectory)}|${version}|${platform}|${architecture}`;
  if (ACTIVE_INSTALLS.has(key)) return ACTIVE_INSTALLS.get(key);
  const task = installTemurinRuntimeInternal(userDataDirectory, version, onProgress, platform, architecture);
  ACTIVE_INSTALLS.set(key, task);
  try { return await task; }
  finally { if (ACTIVE_INSTALLS.get(key) === task) ACTIVE_INSTALLS.delete(key); }
}

export async function installTemurin21(userDataDirectory, onProgress = () => {}, platform = process.platform, architecture = process.arch) {
  return installTemurinRuntime(userDataDirectory, 21, onProgress, platform, architecture);
}
