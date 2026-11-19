import { readdir, copyFile, mkdir, stat } from 'node:fs/promises';
import path from 'node:path';

const mode = process.argv[2];
if (!['installer', 'portable'].includes(mode)) throw new Error('Usage: node scripts/collect-artifact.js installer|portable');
const root = path.resolve('build-output', mode);
const expectedName = mode === 'installer' ? 'CRYON CLIENT Setup.exe' : 'CRYON CLIENT Portable.exe';
const release = path.resolve('release');
await mkdir(release, { recursive: true });
async function findExe(dir) {
  let entries; try { entries = await readdir(dir, { withFileTypes: true }); } catch { return []; }
  const found = [];
  for (const entry of entries) {
    const target = path.join(dir, entry.name);
    if (entry.isDirectory()) found.push(...await findExe(target));
    else if (entry.isFile() && entry.name.toLowerCase().endsWith('.exe')) found.push(target);
  }
  return found;
}
const candidates = await findExe(root);
const source = candidates.find(file => path.basename(file) === expectedName) || (mode === 'installer' ? candidates.find(file => path.dirname(file) === root && /^CRYON-CLIENT-Setup-.+\.exe$/.test(path.basename(file))) : null);
if (!source) throw new Error(`No generated Windows EXE found under ${root}.`);
const info = await stat(source);
if (info.size < 1024 * 1024) throw new Error(`Generated EXE is suspiciously small (${info.size} bytes).`);
await copyFile(source, path.join(release, expectedName));
console.log(`Collected ${expectedName} (${info.size.toLocaleString()} bytes).`);
