import crypto from 'node:crypto';
import { isLoaderCompatible } from './compatibility.js';
import { normalizeEmlRootName } from './paths.js';

const LOADERS = new Set(['vanilla', 'fabric', 'forge', 'neoforge', 'quilt']);
const CATEGORIES = new Set(['standard', 'fastclient', 'legacy-pvp']);
const VERSION_PATTERN = /^\d+\.\d+(?:\.\d+)?$/;
const NAME_PATTERN = /^[\p{L}\p{N} _.-]{2,32}$/u;

export function makeInstanceName(name) {
  return normalizeEmlRootName(name || 'Profile');
}

export function normalizeProfile(input, { allowId = true } = {}) {
  if (!input || typeof input !== 'object') throw new Error('Profile data is required.');
  const name = String(input.name || '').trim();
  const category = CATEGORIES.has(input.category) ? input.category : 'standard';
  const version = String(input.version || '');
  const loader = String(input.loader || 'vanilla').toLowerCase();
  const loaderVersion = String(input.loaderVersion || '').trim().slice(0, 64);
  const ramMin = Number(input.ramMin ?? 1024);
  const ramMax = Number(input.ramMax ?? 4096);
  if (!NAME_PATTERN.test(name)) throw new Error('Profile name must be 2–32 characters (letters, numbers, spaces, . _ -).');
  if (!VERSION_PATTERN.test(version)) throw new Error('Choose a valid Minecraft release version.');
  if (!LOADERS.has(loader)) throw new Error('Unsupported Minecraft loader.');
  if (!isLoaderCompatible(version, loader)) throw new Error(`${loader} is not supported for Minecraft ${version}.`);
  if (loader !== 'vanilla' && loaderVersion && !/^[a-zA-Z0-9._+-]{1,64}$/.test(loaderVersion)) throw new Error('Invalid loader build identifier.');
  if (!Number.isInteger(ramMin) || ramMin < 512 || ramMin > 32768 || !Number.isInteger(ramMax) || ramMax < Math.max(1024, ramMin) || ramMax > 65536) throw new Error('Profile memory allocation is invalid.');
  const id = allowId && /^[a-zA-Z0-9_-]{8,64}$/.test(String(input.id || '')) ? String(input.id) : crypto.randomUUID();
  // EML prepends a dot, so every route uses this normalized slug as its root.
  // For example, `26.3-Fabric` maps to `%APPDATA%\\.26_3_fabric`.
  const instanceName = makeInstanceName(input.instanceName || name);
  const accountId = typeof input.accountId === 'string' && /^[a-zA-Z0-9_-]{1,96}$/.test(input.accountId) ? input.accountId : null;
  return { id, name, category, version, loader, loaderVersion, instanceName, accountId, ramMin, ramMax, createdAt: input.createdAt || new Date().toISOString() };
}

/** A saved profile's Minecraft version + loader define its instance identity. */
export function updateProfileMetadata(activeProfile, patch = {}) {
  if (!activeProfile || typeof activeProfile !== 'object') throw new Error('Active profile is required.');
  if (Object.hasOwn(patch, 'version') && String(patch.version) !== String(activeProfile.version)) {
    throw new Error('Minecraft version is fixed for this profile. Use Add Version to create a separate version profile.');
  }
  if (Object.hasOwn(patch, 'loader') && String(patch.loader).toLowerCase() !== String(activeProfile.loader).toLowerCase()) {
    throw new Error('Mod loader is fixed for this profile. Use Add Version to create a separate loader profile.');
  }
  return normalizeProfile({ ...activeProfile, ...patch, id: activeProfile.id, instanceName: activeProfile.instanceName, createdAt: activeProfile.createdAt });
}

export function createStarterProfiles(defaultVersion = '26.3') {
  const safeVersion = VERSION_PATTERN.test(defaultVersion) ? defaultVersion : '1.21.1';
  return [
    normalizeProfile({ id: 'nova-standard-0001', name: `${safeVersion}-Vanilla`, category: 'standard', version: safeVersion, loader: 'vanilla' }),
    normalizeProfile({ id: 'nova-fast-00001', name: '1.21.1-Fabric', category: 'fastclient', version: '1.21.1', loader: 'fabric', loaderVersion: '' }),
    normalizeProfile({ id: 'nova-pvp-000001', name: '1.8.9-Vanilla', category: 'legacy-pvp', version: '1.8.9', loader: 'vanilla' }),
  ];
}

export function validateProfileCollection(profiles, activeProfileId) {
  if (!Array.isArray(profiles) || profiles.length > 50) throw new Error('Profile list is invalid or exceeds 50 profiles.');
  const normalized = profiles.map(profile => normalizeProfile(profile));
  const ids = new Set();
  const roots = new Set();
  for (const profile of normalized) {
    if (ids.has(profile.id)) throw new Error('Duplicate profile ID.');
    const root = profile.instanceName.toLowerCase();
    if (roots.has(root)) throw new Error('Duplicate profile game folder.');
    ids.add(profile.id); roots.add(root);
  }
  if (!ids.has(activeProfileId)) throw new Error('Active profile does not exist.');
  return normalized;
}
