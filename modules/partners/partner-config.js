import path from 'node:path';
import { normalizeCommunityServer } from './partner-servers.js';

export function loadPartners(records, assetsDirectory) {
  if (!Array.isArray(records)) throw new Error('partners.json must contain an array.');
  const ids = new Set(), addresses = new Set();
  const filename = value => {
    if (!value) return '';
    if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]+\.png$/i.test(value)) throw new Error('Partner image must be a PNG filename.');
    return value;
  };
  return Object.freeze(records.map((record, index) => {
    const clean = normalizeCommunityServer(record);
    if (!/^[a-z0-9_-]{1,80}$/.test(clean.id) || ids.has(clean.id) || addresses.has(clean.address)) throw new Error(`Invalid or duplicate partner at entry ${index + 1}.`);
    ids.add(clean.id); addresses.add(clean.address);
    const logo = filename(record.logo), icon = filename(record.icon);
    return Object.freeze({ ...clean, description: String(record.description || ''), logo, icon, iconPath: icon ? path.join(assetsDirectory, icon) : null, multiplayerName: `§6★ §f${clean.name}` });
  }));
}
