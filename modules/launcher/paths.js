import path from 'node:path';

export const EML_INSTANCE_NAME = 'cryon-client';
export const NOVA_GAME_FOLDER = '';

/** Convert a display/profile name into the exact safe EML root slug. */
export function normalizeEmlRootName(value = EML_INSTANCE_NAME) {
  const slug = String(value || EML_INSTANCE_NAME)
    .normalize('NFKC')
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 48)
    .replace(/_+$/g, '');
  return slug || EML_INSTANCE_NAME;
}

export function getDefaultGameDirectoryParent(appDataPath = '') {
  const base = appDataPath || process.env.APPDATA || (process.platform === 'win32' && process.env.USERPROFILE
    ? path.join(process.env.USERPROFILE, 'AppData', 'Roaming')
    : process.env.HOME || process.cwd());
  return path.resolve(base);
}

/** Known parents used by pre-0.6 builds. These must never remain active as the EML root parent. */
export function getLegacyGameDirectoryParents(appDataPath = '') {
  const base = getDefaultGameDirectoryParent(appDataPath);
  return [
    path.join(base, 'nova-client'),
    path.join(base, 'nova-client', 'profiles'),
    path.join(base, '.nova'),
    path.join(base, '.nova', 'profiles'),
    path.join(base, '.cryonclient', 'profiles'),
    path.join(base, 'CRYON-CLIENT', 'profiles'),
  ].map(item => path.resolve(item));
}

function samePath(a, b) {
  const left = path.resolve(a).replace(/[\\/]+$/g, '');
  const right = path.resolve(b).replace(/[\\/]+$/g, '');
  return process.platform === 'win32' ? left.toLowerCase() === right.toLowerCase() : left === right;
}

export function isLegacyGameDirectoryParent(candidate, appDataPath = '') {
  if (!candidate) return false;
  return getLegacyGameDirectoryParents(appDataPath).some(parent => samePath(candidate, parent));
}

export function getGameDirectoryParent(settings = {}, fallback = '') {
  const defaultParent = getDefaultGameDirectoryParent(fallback);
  const configured = typeof settings?.gameDirectory === 'string' ? settings.gameDirectory.trim() : '';
  if (!configured || isLegacyGameDirectoryParent(configured, defaultParent)) return defaultParent;
  return path.resolve(configured);
}

export function getActiveProfile(settings = {}) {
  const profiles = Array.isArray(settings.profiles) ? settings.profiles : [];
  return profiles.find(profile => profile.id === settings.activeProfileId) || null;
}

/** EML accepts the instance slug without a dot and prepends the dot itself. */
export function getGameInstanceName(settings = {}) {
  const profile = getActiveProfile(settings);
  return normalizeEmlRootName(profile?.instanceName || EML_INSTANCE_NAME);
}

/** One authoritative runtime contract for EML, Mods, pending options and Open Folder. */
export function getProfileRuntimePaths(settings = {}, profile = null, fallback = '') {
  const selectedProfile = profile || getActiveProfile(settings) || { id: null, instanceName: EML_INSTANCE_NAME };
  const isolatedSettings = { ...settings, activeProfileId: selectedProfile.id };
  const parent = getGameDirectoryParent(isolatedSettings, fallback);
  const rootName = normalizeEmlRootName(selectedProfile.instanceName || EML_INSTANCE_NAME);
  const folder = path.resolve(parent, `.${rootName}`);
  return Object.freeze({ parent, rootName, folder, profileId: selectedProfile.id });
}

export function getGameInstancePath(settings = {}, fallback = '') {
  return getProfileRuntimePaths(settings, null, fallback).folder;
}
