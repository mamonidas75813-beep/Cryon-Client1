import fs from 'node:fs/promises';
import path from 'node:path';
import { validateGlobalPartners } from '../modules/partners/global-partner-store.js';
const dir = path.resolve(process.argv[2] || 'partner-feed');
const partners = validateGlobalPartners(JSON.parse((await fs.readFile(path.join(dir,'partners.json'),'utf8')).replace(/^\uFEFF/,'')));
for (const row of partners) {
  for (const [field, name] of [['logo',row.logo],['icon',row.icon]]) {
    if (!name) continue;
    const bytes = await fs.readFile(path.join(dir,'images',name));
    if (bytes.length < 33 || bytes.length > 512 * 1024 || !bytes.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])) || bytes.toString('ascii',12,16) !== 'IHDR') throw new Error(`${name}: use a PNG up to 512 KB`);
    const w = bytes.readUInt32BE(16), h = bytes.readUInt32BE(20);
    if (!w || !h || w > 1024 || h > 1024 || (field === 'icon' && (w !== 64 || h !== 64))) throw new Error(`${name}: invalid image dimensions (icon must be 64×64, logo max 1024×1024)`);
  }
}
console.log(`Feed valid: ${partners.length} official partner(s).`);
