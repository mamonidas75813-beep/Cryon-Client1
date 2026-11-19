import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { createWriteStream } from 'node:fs';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';

const MAX_AGENT_BYTES = 100 * 1024 * 1024;
const PLAYIT_RELEASES_API = 'https://api.github.com/repos/playit-cloud/playit-agent/releases/latest';

export function selectPlayitWindowsAsset(release) {
  const assets = Array.isArray(release?.assets) ? release.assets : [];
  const asset = assets.find(item => item.name === 'playit-windows-x86_64-signed.exe')
    || assets.find(item => item.name === 'playit-windows-x86_64.exe');
  if (!asset?.browser_download_url || !/^https:\/\//i.test(asset.browser_download_url)) throw new Error('The official Playit release does not contain a Windows x64 portable agent.');
  const digest = String(asset.digest || '').match(/^sha256:([a-f0-9]{64})$/i)?.[1] || null;
  return { name: asset.name, url: asset.browser_download_url, digest, size: Number(asset.size) || 0, version: String(release.tag_name || release.name || 'latest') };
}

export async function downloadPlayitAgent(userDataDirectory, onProgress = () => {}) {
  if (process.platform !== 'win32' || process.arch !== 'x64') throw new Error('CRYON automatic Playit setup currently supports Windows x64. Use the official Playit download page on this platform.');
  onProgress({ stage: 'resolve', percent: 0, message: 'Finding the latest official Playit agent…' });
  const releaseResponse = await fetch(PLAYIT_RELEASES_API, { signal: AbortSignal.timeout(30000), headers: { 'Accept': 'application/vnd.github+json', 'User-Agent': 'CRYON-CLIENT-Playit-Manager' } });
  if (!releaseResponse.ok) throw new Error(`Could not check official Playit releases (${releaseResponse.status}).`);
  const release = await releaseResponse.json();
  const asset = selectPlayitWindowsAsset(release);
  if (asset.size > MAX_AGENT_BYTES) throw new Error('The official Playit agent exceeds the 100 MB safety limit.');
  const destinationDirectory = path.join(path.resolve(userDataDirectory), 'tools');
  await fs.mkdir(destinationDirectory, { recursive: true });
  const destination = path.join(destinationDirectory, 'playit-agent.exe');
  const temp = `${destination}.${process.pid}.${crypto.randomUUID()}.download`;
  const previous = `${destination}.${process.pid}.${crypto.randomUUID()}.previous`;
  try {
    const response = await fetch(asset.url, { redirect: 'follow', signal: AbortSignal.timeout(180000), headers: { 'User-Agent': 'CRYON-CLIENT-Playit-Manager' } });
    if (!response.ok || !response.body) throw new Error(`Playit agent download failed (${response.status}).`);
    const finalUrl = new URL(response.url || asset.url);
    if (finalUrl.protocol !== 'https:' || !['github.com', 'githubusercontent.com', 'github-releases.githubusercontent.com', 'release-assets.githubusercontent.com', 'objects.githubusercontent.com'].some(host => finalUrl.hostname === host || finalUrl.hostname.endsWith(`.${host}`))) throw new Error('Playit download redirected outside the approved GitHub release hosts.');
    const hash = crypto.createHash('sha256');
    let received = 0;
    const stream = new Transform({ transform(chunk, _encoding, callback) {
      received += chunk.length;
      if (received > MAX_AGENT_BYTES) return callback(new Error('Playit agent download exceeded the 100 MB safety limit.'));
      hash.update(chunk);
      onProgress({ stage: 'download', received, total: asset.size || null, percent: asset.size ? Math.min(99, Math.floor(received / asset.size * 100)) : null, message: 'Downloading Playit agent…' });
      callback(null, chunk);
    } });
    await pipeline(Readable.fromWeb(response.body), stream, createWriteStream(temp, { flags: 'wx' }));
    const actual = hash.digest('hex');
    if (!asset.digest || actual.toLowerCase() !== asset.digest.toLowerCase()) throw new Error('Playit release checksum could not be verified or did not match. The executable was rejected.');
    const existing = await fs.lstat(destination).catch(() => null);
    if (existing && (!existing.isFile() || existing.isSymbolicLink())) throw new Error('Existing Playit agent path is not a regular file; refusing to replace it.');
    if (existing) await fs.rename(destination, previous);
    try { await fs.rename(temp, destination); }
    catch (error) {
      if (existing) await fs.rename(previous, destination).catch(() => {});
      throw error;
    }
    await fs.rm(previous, { force: true }).catch(() => {});
    onProgress({ stage: 'complete', percent: 100, message: `Playit ${asset.version} downloaded and SHA-256 verified.` });
    return { executable: destination, version: asset.version, asset: asset.name };
  } catch (error) {
    await fs.rm(temp, { force: true }).catch(() => {});
    throw error;
  }
}

export async function getPlayitAgentPath(userDataDirectory) {
  const executable = path.join(path.resolve(userDataDirectory), 'tools', 'playit-agent.exe');
  const stat = await fs.lstat(executable).catch(() => null);
  return stat?.isFile() && !stat.isSymbolicLink() ? executable : null;
}

export function normalizePlayitAddress(value) {
  const address = String(value || '').trim().replace(/^https?:\/\//i, '').replace(/\/$/, '');
  if (!address) return '';
  if (address.length > 253 || /[\s/\\?#@]/.test(address)) throw new Error('Enter a public Playit address such as my-world.joinmc.link or host:port.');
  const match = address.match(/^([a-z0-9](?:[a-z0-9.-]*[a-z0-9])?)(?::([0-9]{1,5}))?$/i);
  if (!match || match[1].includes('..') || match[1].split('.').some(part => !part || part.length > 63)) throw new Error('Enter a valid public hostname or IPv4 address, optionally followed by a port.');
  if (match[2] && (Number(match[2]) < 1 || Number(match[2]) > 65535)) throw new Error('Public address port must be between 1 and 65535.');
  return address;
}
