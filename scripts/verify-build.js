import { readFile, stat, writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json' with { type: 'json' };

const release = path.resolve('release');
const expected = ['CRYON CLIENT Setup.exe', 'CRYON CLIENT Portable.exe'];
await mkdir(release, { recursive: true });
const checksums = [];
for (const name of expected) {
  const file = path.join(release, name);
  let data;
  try { data = await readFile(file); } catch { throw new Error(`Required release file is missing: ${file}`); }
  if (data.length < 1024 * 1024) throw new Error(`${name} is too small to be a complete Electron executable.`);
  if (data[0] !== 0x4d || data[1] !== 0x5a) throw new Error(`${name} does not have a Windows PE/DOS executable header.`);
  const hash = crypto.createHash('sha256').update(data).digest('hex');
  checksums.push(`${hash}  ${name}`);
  console.log(`[OK] ${name}: ${data.length.toLocaleString()} bytes, SHA-256 ${hash}`);
}
await writeFile(path.join(release, 'VERSION.txt'), `CRYON CLIENT ${pkg.version}\nBuilt: ${new Date().toISOString()}\nPlatform: Windows x64\n`, 'utf8');
await writeFile(path.join(release, 'README.txt'), 'CRYON CLIENT Windows release\n\nCRYON CLIENT Setup.exe: NSIS installer.\nCRYON CLIENT Portable.exe: portable Windows executable.\n\nRequirements: Windows 10/11 x64. A Microsoft account with a Minecraft: Java Edition entitlement is required to launch the game.\n\nThe CRYON HUD Fabric module currently targets Minecraft 1.21.1 only. Other versions require their own compatible game-side mods.\n', 'utf8');
await writeFile(path.join(release, 'SHA256SUMS.txt'), checksums.join('\n') + '\n', 'utf8');
console.log('Release verification passed.');
