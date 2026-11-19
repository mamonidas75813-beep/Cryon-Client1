import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { getGameInstancePath } from '../launcher/paths.js';

const API = 'https://api.modrinth.com/v2';
const DOWNLOAD_HOST = 'cdn.modrinth.com';
const MAX_MOD_BYTES = 180 * 1024 * 1024;
const ID_PATTERN = /^[a-zA-Z0-9_-]{1,64}$/;
const BACKUP_PATTERN = /^mods-[0-9TZ-]+$/;
const LOADERS = new Set(['fabric', 'forge', 'neoforge', 'quilt']);
const RELEASE_CHANNELS = new Set(['release', 'beta', 'alpha', 'all']);

function getRoot(settings) { return getGameInstancePath(settings); }
function getModsDir(settings) { return path.join(getRoot(settings), 'mods'); }
function getBackupDir(settings) { return path.join(getRoot(settings), 'nova-backups'); }
function validateSettings(settings) {
  const version = String(settings?.minecraftVersion || '').trim();
  const loader = String(settings?.loader || '').toLowerCase();
  if (!version || !/^\d+\.\d+(?:\.\d+)?$/.test(version)) throw new Error('Select a valid Minecraft version in Profiles first.');
  if (!LOADERS.has(loader)) throw new Error('Select Fabric, Forge, NeoForge or Quilt before managing mods.');
  return { version, loader };
}
function safeFilename(value) {
  const raw = String(value ?? '');
  const name = path.basename(raw);
  // Modrinth filenames commonly contain '+', spaces and parentheses. Keep the
  // published filename unchanged, but reject traversal and Windows-invalid names.
  const invalidCharacters = /[\\/<>"|?*\u0000-\u001f]/u;
  const reservedWindowsName = /^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
  const isJar = /\.jar(?:\.disabled)?$/i.test(name);
  if (
    !name || name !== raw || name === '.' || name === '..' || name.length > 180 ||
    invalidCharacters.test(name) || /[. ]$/.test(name) || reservedWindowsName.test(name) || !isJar
  ) throw new Error('Unsafe mod filename.');
  return name;
}
function safeProjectId(value) {
  const id = String(value || '');
  if (!ID_PATTERN.test(id)) throw new Error('Invalid Modrinth project or version ID.');
  return id;
}
async function readManifest(settings) {
  const file = path.join(getModsDir(settings), '.nova-mods.json');
  try {
    const value = JSON.parse(await fs.readFile(file, 'utf8'));
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw new Error(`CRYON mod manifest is unreadable: ${error.message}`);
  }
}
async function writeManifest(settings, manifest) {
  const dir = getModsDir(settings);
  await fs.mkdir(dir, { recursive: true });
  const file = path.join(dir, '.nova-mods.json');
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(manifest, null, 2), 'utf8');
  await fs.rename(temp, file);
}
async function requestJson(url) {
  const response = await fetch(url, {
    headers: { 'User-Agent': 'CRYON-CLIENT/0.5.5 (Minecraft launcher; Modrinth mod manager)' },
    signal: AbortSignal.timeout(20000),
  });
  if (!response.ok) {
    let detail = '';
    try { detail = (await response.text()).slice(0, 240); } catch { /* no body */ }
    throw new Error(`Modrinth API request failed (${response.status})${detail ? `: ${detail}` : ''}`);
  }
  return response.json();
}
function compatibleVersion(versionData, settings) {
  const { version, loader } = validateSettings(settings);
  return Array.isArray(versionData?.game_versions) && versionData.game_versions.includes(version)
    && Array.isArray(versionData?.loaders) && versionData.loaders.includes(loader);
}
function channelMatches(versionType, channel) {
  return channel === 'all' || versionType === channel;
}

const PROJECT_TYPES = new Set(['mod', 'modpack', 'resourcepack', 'shader', 'datapack']);
const TYPE_SLUGS = { mod: 'mod', modpack: 'modpack', resourcepack: 'resourcepack', shader: 'shader', datapack: 'datapack' };
const TYPE_DIRS = { mod: 'mods', modpack: 'modpacks', resourcepack: 'resourcepacks', shader: 'shaderpacks', datapack: 'datapacks' };
const TYPE_EXTENSIONS = { mod: /\.jar$/i, modpack: /\.mrpack$/i, resourcepack: /\.zip$/i, shader: /\.zip$/i, datapack: /\.zip$/i };

function validateContentType(type) {
  const value = String(type || 'mod').toLowerCase();
  if (!PROJECT_TYPES.has(value)) throw new Error('Unsupported Modrinth project category.');
  return value;
}
function validateContentSettings(settings, type) {
  const version = String(settings?.minecraftVersion || '').trim();
  const loader = String(settings?.loader || 'vanilla').toLowerCase();
  if (!version || !/^\d+\.\d+(?:\.\d+)?$/.test(version)) throw new Error('Select a valid Minecraft version in Profiles first.');
  if (type === 'mod' && !LOADERS.has(loader)) throw new Error('Select Fabric, Forge, NeoForge or Quilt before managing mods.');
  return { version, loader };
}
function validateWorldFolder(value) {
  const name = String(value || '');
  if (!/^[a-zA-Z0-9 _.-]{1,64}$/.test(name) || name === '.' || name === '..') throw new Error('Choose a valid saved world before installing a data pack.');
  return name;
}
async function resolveWorldRoot(settings, worldFolder) {
  const root = getRoot(settings);
  const world = path.resolve(root, 'saves', validateWorldFolder(worldFolder));
  if (!world.startsWith(`${path.resolve(root, 'saves')}${path.sep}`)) throw new Error('Selected world is outside this profile.');
  const levelFile = path.join(world, 'level.dat');
  const stat = await fs.stat(levelFile).catch(() => null);
  if (!stat?.isFile()) throw new Error('Selected folder is not a Minecraft world (level.dat was not found).');
  return world;
}
function getContentDir(settings, type, worldFolder = null) {
  const contentType = validateContentType(type);
  if (contentType === 'datapack' && worldFolder) return path.join(getRoot(settings), 'saves', validateWorldFolder(worldFolder), 'datapacks');
  return path.join(getRoot(settings), TYPE_DIRS[contentType]);
}
export async function listProfileWorlds(settings) {
  const saves = path.join(getRoot(settings), 'saves');
  let entries;
  try { entries = await fs.readdir(saves, { withFileTypes: true }); }
  catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
  const worlds = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !/^[a-zA-Z0-9 _.-]{1,64}$/.test(entry.name) || entry.name === '.' || entry.name === '..') continue;
    const stat = await fs.stat(path.join(saves, entry.name, 'level.dat')).catch(() => null);
    if (stat?.isFile()) worlds.push({ folder: entry.name, name: entry.name });
  }
  return worlds.sort((a,b) => a.name.localeCompare(b.name));
}
function safeAssetFilename(value, type) {
  const raw = String(value ?? '');
  const name = path.basename(raw);
  const pattern = TYPE_EXTENSIONS[type];
  const invalidCharacters = /[\\/<>"|?*\u0000-\u001f]/u;
  if (!name || name !== raw || name === '.' || name === '..' || name.length > 220 || invalidCharacters.test(name) || /[. ]$/.test(name) || !pattern.test(name)) {
    throw new Error(`Unsafe ${type} filename.`);
  }
  return name;
}
function compatibleContentVersion(versionData, settings, type) {
  const { version, loader } = validateContentSettings(settings, type);
  if (!Array.isArray(versionData?.game_versions) || !versionData.game_versions.includes(version)) return false;
  if (type === 'mod') return Array.isArray(versionData?.loaders) && versionData.loaders.includes(loader);
  if (type === 'modpack' && Array.isArray(versionData?.loaders) && LOADERS.has(loader)) return versionData.loaders.includes(loader) || versionData.loaders.includes('minecraft');
  return true;
}

export async function searchModrinth({ query = '', settings, version, loader, index = 'downloads', type = 'mod' }) {
  const contentType = validateContentType(type);
  const resolvedSettings = settings || { minecraftVersion: version, loader };
  const { version: gameVersion, loader: modLoader } = validateContentSettings(resolvedSettings, contentType);
  const allowedIndexes = new Set(['relevance', 'downloads', 'follows', 'newest', 'updated']);
  const projectFacet = contentType === 'datapack' ? 'all_project_types' : 'project_type';
  const facets = [[`${projectFacet}:${contentType}`], [`versions:${gameVersion}`]];
  if (contentType === 'mod' || (contentType === 'modpack' && LOADERS.has(modLoader))) facets.push([`categories:${modLoader}`]);
  const params = new URLSearchParams({ limit: '24', index: allowedIndexes.has(index) ? index : 'downloads', facets: JSON.stringify(facets) });
  if (String(query || '').trim()) params.set('query', String(query).trim().slice(0, 80));
  const data = await requestJson(`${API}/search?${params}`);
  return (data.hits || []).map(item => ({
    project_id: item.project_id, title: item.title, description: item.description, downloads: item.downloads,
    author: item.author, icon_url: item.icon_url, slug: item.slug, project_type: contentType, source_project_type: item.project_type,
    project_url: `https://modrinth.com/${TYPE_SLUGS[item.project_type] || TYPE_SLUGS[contentType]}/${encodeURIComponent(item.slug || item.project_id)}`,
  }));
}

export async function getModrinthProjectVersions({ projectId, settings, channel = 'release', type = 'mod' }) {
  safeProjectId(projectId);
  const contentType = validateContentType(type);
  const { version, loader } = validateContentSettings(settings, contentType);
  if (!RELEASE_CHANNELS.has(channel)) throw new Error('Invalid release channel.');
  const params = new URLSearchParams({ game_versions: JSON.stringify([version]) });
  if (contentType === 'mod' || (contentType === 'modpack' && LOADERS.has(loader))) params.set('loaders', JSON.stringify([loader]));
  const versions = await requestJson(`${API}/project/${encodeURIComponent(projectId)}/version?${params}`);
  return (Array.isArray(versions) ? versions : [])
    .filter(item => compatibleContentVersion(item, settings, contentType) && channelMatches(item.version_type, channel))
    .slice(0, 30)
    .map(item => ({
      id: item.id,
      project_id: item.project_id,
      project_type: contentType,
      name: item.name,
      version_number: item.version_number,
      version_type: item.version_type,
      date_published: item.date_published,
      changelog: item.changelog || '',
      files: (item.files || []).map(file => ({ filename: file.filename, primary: Boolean(file.primary) })),
    }));
}

async function downloadVerified(file) {
  const url = new URL(file.url);
  if (url.protocol !== 'https:' || url.hostname !== DOWNLOAD_HOST) throw new Error('Mod download host is not trusted.');
  const response = await fetch(url, { signal: AbortSignal.timeout(60000), redirect: 'error' });
  if (!response.ok) throw new Error(`Mod download failed (${response.status}).`);
  const declared = Number(response.headers.get('content-length') || 0);
  if (declared > MAX_MOD_BYTES) throw new Error('Mod file is larger than the 180 MB safety limit.');
  const buffer = Buffer.from(await response.arrayBuffer());
  if (buffer.length > MAX_MOD_BYTES) throw new Error('Mod file is larger than the 180 MB safety limit.');
  const hashes = file.hashes || {};
  const algorithms = ['sha512', 'sha1'].filter(algorithm => Boolean(hashes[algorithm]));
  if (!algorithms.length) throw new Error('Modrinth did not provide a supported integrity hash.');
  const actualHashes = {};
  for (const algorithm of algorithms) {
    actualHashes[algorithm] = crypto.createHash(algorithm).update(buffer).digest('hex');
    if (actualHashes[algorithm].toLowerCase() !== String(hashes[algorithm]).toLowerCase()) throw new Error(`Mod ${algorithm.toUpperCase()} checksum verification failed.`);
  }
  return { buffer, sha512: hashes.sha512 || null, sha1: hashes.sha1 || null };
}

async function resolveProjectVersion(projectId, settings, channel = 'release') {
  const versions = await getModrinthProjectVersions({ projectId, settings, channel });
  if (!versions.length) throw new Error(`No ${channel === 'all' ? 'compatible' : channel} version found for ${projectId} on ${settings.minecraftVersion} / ${settings.loader}.`);
  return requestJson(`${API}/version/${encodeURIComponent(versions[0].id)}`);
}

async function writeVersionFile(versionData, settings) {
  const root = getModsDir(settings);
  await fs.mkdir(root, { recursive: true });
  const primary = (versionData.files || []).find(file => file.primary) || versionData.files?.[0];
  if (!primary) throw new Error('The selected Modrinth version has no downloadable file.');
  if (!/\.jar$/i.test(primary.filename)) throw new Error('The selected Modrinth file is not a JAR.');
  const safeName = safeFilename(primary.filename);
  const { buffer, sha512, sha1 } = await downloadVerified(primary);
  const target = path.join(root, safeName);
  const temp = `${target}.${process.pid}.download`;
  await fs.writeFile(temp, buffer, { flag: 'w' });
  await fs.rename(temp, target);

  const manifest = await readManifest(settings);
  for (const [oldName, oldMeta] of Object.entries(manifest)) {
    if (oldName !== safeName && oldMeta?.projectId === versionData.project_id) {
      await fs.rm(path.join(root, safeFilename(oldName)), { force: true });
      delete manifest[oldName];
    }
  }
  manifest[safeName] = {
    projectId: versionData.project_id,
    versionId: versionData.id,
    versionNumber: versionData.version_number,
    versionType: versionData.version_type,
    title: versionData.name,
    enabled: true,
    source: 'modrinth',
    installedAt: new Date().toISOString(),
    sha512,
    sha1,
  };
  await writeManifest(settings, manifest);
  return safeName;
}

async function installVersionTree(versionData, settings, visited, depth) {
  if (depth > 8) throw new Error('Mod dependency chain exceeded the safety limit (8 levels).');
  if (!compatibleVersion(versionData, settings)) throw new Error(`Dependency ${versionData.project_id || versionData.id} is not compatible with ${settings.minecraftVersion} / ${settings.loader}.`);
  const projectId = versionData.project_id;
  if (projectId && visited.has(projectId)) return null;
  if (projectId) visited.add(projectId);

  for (const dependency of versionData.dependencies || []) {
    if (dependency.dependency_type !== 'required') continue;
    let dependencyVersion = null;
    if (dependency.version_id) {
      safeProjectId(dependency.version_id);
      dependencyVersion = await requestJson(`${API}/version/${encodeURIComponent(dependency.version_id)}`);
      if (dependency.project_id && dependencyVersion.project_id !== dependency.project_id) {
        throw new Error('Modrinth returned a dependency version that does not match its project.');
      }
    } else if (dependency.project_id) {
      safeProjectId(dependency.project_id);
      try {
        dependencyVersion = await resolveProjectVersion(dependency.project_id, settings, 'release');
      } catch (releaseError) {
        try { dependencyVersion = await resolveProjectVersion(dependency.project_id, settings, 'all'); }
        catch { throw releaseError; }
      }
    }
    if (dependencyVersion) await installVersionTree(dependencyVersion, settings, visited, depth + 1);
    else if (dependency.file_name) throw new Error(`Required external dependency is not hosted on Modrinth: ${dependency.file_name}`);
  }
  return writeVersionFile(versionData, settings);
}

export async function installModrinthProject({ projectId, settings, versionId = null, channel = 'release' }) {
  validateSettings(settings);
  safeProjectId(projectId);
  let versionData;
  if (versionId) {
    safeProjectId(versionId);
    versionData = await requestJson(`${API}/version/${encodeURIComponent(versionId)}`);
    if (versionData.project_id !== projectId) throw new Error('Selected version does not belong to this Modrinth project.');
    if (!compatibleVersion(versionData, settings)) throw new Error('Selected mod version is not compatible with the active profile.');
  } else {
    versionData = await resolveProjectVersion(projectId, settings, channel);
  }
  const filename = await installVersionTree(versionData, settings, new Set(), 0);
  return { filename, versionId: versionData.id, versionNumber: versionData.version_number };
}

export const DEFAULT_FABRIC_PERFORMANCE_MODS = Object.freeze([
  { projectId: 'AANobbMI', name: 'Sodium' },
  { projectId: 'PtjYWJkn', name: 'Sodium Extra' },
  { projectId: 'gvQqBUqZ', name: 'Lithium' },
  { projectId: 'fQEb0iXm', name: 'Krypton' },
  { projectId: 'NNAgCjsB', name: 'Entity Culling' },
  { projectId: '51shyZVL', name: 'More Culling' },
  { projectId: 'VSNURh3q', name: 'C2ME' },
  { projectId: 'KuNKN7d2', name: 'Noisium', clientSide: false },
  { projectId: 'uXXizFIs', name: 'FerriteCore' },
  { projectId: '5ZwdcRci', name: 'ImmediatelyFast' },
  { projectId: 'g96Z4WVZ', name: 'BadOptimizations' },
  { projectId: 'mOgUt4GM', name: 'Mod Menu' },
]);

const AUTO_FABRIC_MODS_STATE_FILE = '.cryon-default-fabric-mods.json';
const AUTO_FABRIC_MOD_CHANNEL_PRIORITY = ['release', 'beta', 'alpha'];
const AUTO_FABRIC_UNSUPPORTED_RECHECK_MS = 24 * 60 * 60 * 1000;

async function readAutoFabricModsState(settings, version) {
  const file = path.join(getRoot(settings), AUTO_FABRIC_MODS_STATE_FILE);
  try {
    const state = JSON.parse(await fs.readFile(file, 'utf8'));
    if (state?.schemaVersion !== 1 || state?.minecraftVersion !== version || state?.loader !== 'fabric' || !state?.projects || typeof state.projects !== 'object') {
      return { schemaVersion: 1, minecraftVersion: version, loader: 'fabric', projects: {} };
    }
    return state;
  } catch (error) {
    if (error?.code === 'ENOENT') return { schemaVersion: 1, minecraftVersion: version, loader: 'fabric', projects: {} };
    throw new Error(`CRYON automatic mod-install state is unreadable: ${error.message}`);
  }
}

async function writeAutoFabricModsState(settings, state) {
  const root = getRoot(settings);
  await fs.mkdir(root, { recursive: true });
  const file = path.join(root, AUTO_FABRIC_MODS_STATE_FILE);
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(state, null, 2), { mode: 0o600 });
  await fs.rename(temp, file);
}

/**
 * Installs CRYON's default optimization set into one isolated Fabric profile.
 * Modrinth version metadata is queried for the exact Minecraft/Fabric pair;
 * release builds are preferred, with beta/alpha used only when no release exists.
 * Required dependencies are installed by installModrinthProject's existing tree resolver.
 */
export async function installDefaultFabricPerformanceMods(settings, { onProgress } = {}) {
  const { version, loader } = validateSettings(settings);
  if (loader !== 'fabric') return { enabled: false, minecraftVersion: version, installed: 0, skipped: 0, failed: 0, results: [] };

  const state = await readAutoFabricModsState(settings, version);
  const installedRows = await listInstalledMods(settings);
  const installedProjects = new Set(installedRows.map(item => item.projectId).filter(Boolean));
  // Resolve versions up front in parallel. This prevents a missing network
  // connection from making the first launch wait through twelve sequential API timeouts.
  const lookups = await Promise.all(DEFAULT_FABRIC_PERFORMANCE_MODS.map(async mod => {
    if (installedProjects.has(mod.projectId)) return { mod, version: null, existing: true };
    if (mod.clientSide === false) return { mod, version: null, unsupported: true, reason: 'This project is server-side only and does not support client installation.' };
    const previous = state.projects[mod.projectId];
    const previousCheck = Date.parse(previous?.updatedAt || '');
    if (previous?.status === 'unsupported' && Number.isFinite(previousCheck) && Date.now() - previousCheck < AUTO_FABRIC_UNSUPPORTED_RECHECK_MS) {
      return { mod, version: null, unsupported: true, reason: previous.message || 'No compatible version was available at the last check.' };
    }
    try {
      const available = await getModrinthProjectVersions({ projectId: mod.projectId, settings, channel: 'all' });
      const selected = AUTO_FABRIC_MOD_CHANNEL_PRIORITY
        .map(channel => available.filter(item => item.version_type === channel).sort((a, b) => String(b.date_published || '').localeCompare(String(a.date_published || '')))[0])
        .find(Boolean) || null;
      return { mod, version: selected, unsupported: !selected };
    } catch (error) {
      return { mod, version: null, error };
    }
  }));

  const results = [];
  for (const choice of lookups) {
    const { mod } = choice;
    let result;
    if (choice.existing) {
      result = { projectId: mod.projectId, name: mod.name, status: 'already-installed' };
    } else if (choice.unsupported) {
      result = { projectId: mod.projectId, name: mod.name, status: 'unsupported', message: choice.reason || 'No release, beta or alpha build matches this Minecraft/Fabric version.' };
    } else if (choice.error) {
      result = { projectId: mod.projectId, name: mod.name, status: 'failed', message: plainErrorForModInstall(choice.error) };
    } else {
      try {
        const installed = await installModrinthProject({ projectId: mod.projectId, versionId: choice.version.id, settings });
        installedProjects.add(mod.projectId);
        result = { projectId: mod.projectId, name: mod.name, status: 'installed', versionNumber: installed.versionNumber, filename: installed.filename };
      } catch (error) {
        result = { projectId: mod.projectId, name: mod.name, status: 'failed', message: plainErrorForModInstall(error) };
      }
    }

    state.projects[mod.projectId] = {
      status: result.status === 'already-installed' ? 'installed' : result.status,
      name: mod.name,
      versionId: choice.version?.id || state.projects[mod.projectId]?.versionId || null,
      versionNumber: result.versionNumber || state.projects[mod.projectId]?.versionNumber || null,
      updatedAt: new Date().toISOString(),
      ...(result.message ? { message: result.message.slice(0, 400) } : {}),
    };
    await writeAutoFabricModsState(settings, state);
    results.push(result);
    try { onProgress?.({ ...result, total: DEFAULT_FABRIC_PERFORMANCE_MODS.length, completed: results.length }); } catch { /* UI progress callbacks must not break installation. */ }
  }

  const installed = results.filter(item => ['installed', 'already-installed'].includes(item.status)).length;
  const skipped = results.filter(item => item.status === 'unsupported').length;
  const failed = results.filter(item => item.status === 'failed').length;
  return { enabled: true, minecraftVersion: version, loader, installed, skipped, failed, results };
}

function plainErrorForModInstall(error) {
  const message = error instanceof Error ? error.message : String(error ?? 'Unknown error');
  return message.slice(0, 400);
}

export async function updateModrinthProject({ projectId, settings, channel = 'release' }) {
  return installModrinthProject({ projectId, settings, channel });
}

export async function listInstalledMods(settings) {
  const dir = getModsDir(settings);
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
  const manifest = await readManifest(settings);
  return entries.filter(entry => entry.isFile() && /\.jar(?:\.disabled)?$/i.test(entry.name)).map(entry => {
    const filename = entry.name;
    const enabled = !filename.toLowerCase().endsWith('.jar.disabled');
    const meta = manifest[filename] || manifest[filename.replace(/\.disabled$/i, '')] || null;
    return {
      filename,
      enabled,
      managed: Boolean(meta),
      title: meta?.title || filename,
      versionNumber: meta?.versionNumber || null,
      source: meta?.source || 'local',
      projectId: meta?.projectId || null,
    };
  }).sort((a, b) => a.filename.localeCompare(b.filename));
}


function safeRelativePackPath(value) {
  const raw = String(value || '').replace(/\\/g, '/');
  const normalized = path.posix.normalize(raw);
  const segments = raw.split('/');
  if (!raw || raw.startsWith('/') || /^[a-zA-Z]:/.test(raw) || segments.includes('..') || segments.includes('.') || normalized === '..' || normalized.startsWith('../') || raw.includes('\0')) {
    throw new Error(`Unsafe Modrinth modpack path: ${raw.slice(0, 120)}`);
  }
  return normalized;
}
function extractZipBuffer(buffer, limits = {}) {
  const maxTotal = limits.maxTotal || 1024 * 1024 * 1024;
  let eocd = -1;
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--) {
    if (buffer.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) throw new Error('Modpack is not a valid ZIP archive.');
  const entries = buffer.readUInt16LE(eocd + 10);
  const directoryOffset = buffer.readUInt32LE(eocd + 16);
  const output = new Map(); let cursor = directoryOffset; let total = 0;
  for (let i = 0; i < entries; i++) {
    if (cursor + 46 > buffer.length || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('Modpack ZIP directory is damaged.');
    const method = buffer.readUInt16LE(cursor + 10);
    const compressedSize = buffer.readUInt32LE(cursor + 20);
    const uncompressedSize = buffer.readUInt32LE(cursor + 24);
    const nameLength = buffer.readUInt16LE(cursor + 28);
    const extraLength = buffer.readUInt16LE(cursor + 30);
    const commentLength = buffer.readUInt16LE(cursor + 32);
    const externalAttributes = buffer.readUInt32LE(cursor + 38);
    const localOffset = buffer.readUInt32LE(cursor + 42);
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8');
    cursor += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;
    const relative = safeRelativePackPath(name);
    const unixMode = externalAttributes >>> 16;
    if ((unixMode & 0o170000) === 0o120000) throw new Error('Modpack contains a symbolic link, which CRYON refuses to extract.');
    total += uncompressedSize;
    if (total > maxTotal || uncompressedSize > 256 * 1024 * 1024) throw new Error('Modpack expands beyond the 1 GB extraction safety limit.');
    if (localOffset + 30 > buffer.length || buffer.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('Modpack contains a damaged ZIP entry.');
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.subarray(dataStart, dataStart + compressedSize);
    let data;
    if (method === 0) data = Buffer.from(compressed);
    else if (method === 8) data = inflateRawSync(compressed, { maxOutputLength: 256 * 1024 * 1024 });
    else throw new Error(`Modpack uses an unsupported ZIP compression method (${method}).`);
    if (data.length !== uncompressedSize) throw new Error(`Modpack entry size mismatch: ${relative}`);
    output.set(relative, data);
  }
  return output;
}
async function downloadPackFile(file) {
  if (!Array.isArray(file?.downloads) || !file.downloads.length) throw new Error(`Modpack file has no direct download URL: ${file?.path || 'unknown file'}`);
  const allowed = new Set(['cdn.modrinth.com', 'github.com', 'raw.githubusercontent.com', 'gitlab.com']);
  let lastError;
  for (const raw of file.downloads.slice(0, 5)) {
    try {
      let url = new URL(raw);
      if (url.protocol !== 'https:' || !allowed.has(url.hostname)) throw new Error('Modpack contains a download URL outside CRYON\'s trusted host list.');
      let response = null;
      for (let redirectCount = 0; redirectCount <= 3; redirectCount++) {
        if (url.protocol !== 'https:' || !allowed.has(url.hostname)) throw new Error("Modpack redirect left CRYON's trusted host list.");
        response = await fetch(url, { signal: AbortSignal.timeout(60000), redirect: 'manual' });
        if (![301, 302, 303, 307, 308].includes(response.status)) break;
        const location = response.headers.get('location');
        if (!location || redirectCount === 3) throw new Error('Modpack dependency exceeded the redirect safety limit.');
        url = new URL(location, url);
      }
      if (!response?.ok) throw new Error(`Modpack dependency download failed (${response?.status || 'unknown'}).`);
      const bytes = Buffer.from(await response.arrayBuffer());
      if (bytes.length > MAX_MOD_BYTES) throw new Error('Modpack dependency exceeds 180 MB.');
      if (Number.isFinite(file.fileSize) && file.fileSize > 0 && bytes.length !== file.fileSize) throw new Error(`Modpack dependency size mismatch: ${file.path}`);
      const hashes = file.hashes || {};
      if (!hashes.sha1 || !hashes.sha512) throw new Error(`Modpack dependency is missing a required SHA-1 or SHA-512 hash: ${file.path}`);
      for (const algorithm of ['sha1', 'sha512']) {
        const actual = crypto.createHash(algorithm).update(bytes).digest('hex');
        if (actual.toLowerCase() !== String(hashes[algorithm]).toLowerCase()) throw new Error(`Modpack ${algorithm.toUpperCase()} checksum mismatch: ${file.path}`);
      }
      return bytes;
    } catch (error) { lastError = error; }
  }
  throw lastError || new Error('No usable Modrinth modpack dependency URL was provided.');
}
export async function installModrinthPackBuffer(bytes, settings, projectTitle = 'CRYON Test Pack') {
  return installMrpack(bytes, settings, projectTitle);
}

async function installMrpack(bytes, settings, projectTitle) {
  const files = extractZipBuffer(bytes);
  const indexBytes = files.get('modrinth.index.json');
  if (!indexBytes) throw new Error('This .mrpack is missing modrinth.index.json.');
  let index;
  try { index = JSON.parse(indexBytes.toString('utf8')); } catch { throw new Error('Modrinth modpack manifest is invalid JSON.'); }
  if (index.game !== 'minecraft' || Number(index.formatVersion) !== 1) throw new Error('Unsupported Modrinth modpack manifest format.');
  const dependencies = index.dependencies || {};
  if (dependencies.minecraft && dependencies.minecraft !== settings.minecraftVersion) throw new Error(`This modpack requires Minecraft ${dependencies.minecraft}; active profile uses ${settings.minecraftVersion}. Create a matching profile first.`);
  const loaderKeys = { fabric: 'fabric-loader', quilt: 'quilt-loader', forge: 'forge', neoforge: 'neoforge' };
  let requiredLoaderVersion = null;
  const requiredLoaders = Object.entries(loaderKeys).filter(([, key]) => Boolean(dependencies[key]));
  if (requiredLoaders.length > 1) throw new Error('This modpack declares more than one loader. CRYON cannot safely choose between them.');
  if (!requiredLoaders.length && settings.loader !== 'vanilla') throw new Error(`This modpack is Vanilla, but the active profile uses ${settings.loader}. Create a Vanilla profile first.`);
  for (const [loader, key] of requiredLoaders) {
    if (settings.loader !== loader) throw new Error(`This modpack requires ${loader}; active profile uses ${settings.loader}. Create a matching profile first.`);
    // Forge's Modrinth dependency stores only the Forge build; EML expects MC-FORGE.
    requiredLoaderVersion = loader === 'forge' ? `${dependencies.minecraft || settings.minecraftVersion}-${dependencies[key]}` : String(dependencies[key]);
    if (settings.loaderVersion && settings.loaderVersion !== requiredLoaderVersion) throw new Error(`This modpack requires ${loader} ${requiredLoaderVersion}; active profile uses ${settings.loaderVersion}. Create a profile with the required loader build first.`);
  }
  const root = getRoot(settings);
  const remoteItems = (Array.isArray(index.files) ? index.files : []).filter(item => item.env?.client !== 'unsupported' && item.env?.client !== 'optional');
  const concurrency = Math.max(1, Math.min(16, Number(settings.downloadConcurrency) || 6));
  const pendingWrites = new Array(remoteItems.length);
  let cursor = 0;
  async function worker() {
    while (true) {
      const position = cursor++;
      if (position >= remoteItems.length) return;
      const item = remoteItems[position];
      const relative = safeRelativePackPath(item.path);
      if (relative.startsWith('saves/') || relative.startsWith('screenshots/') || relative.startsWith('logs/')) throw new Error(`Modpack attempts to overwrite user data: ${relative}`);
      const target = path.resolve(root, relative);
      if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Modpack file escaped its profile folder.');
      pendingWrites[position] = { relative, data: await downloadPackFile(item) };
    }
  }
  await Promise.all(Array.from({ length: Math.min(concurrency, remoteItems.length) }, () => worker()));
  // Apply standard overrides first, then client-overrides as the final client layer.
  for (const prefix of ['overrides/', 'client-overrides/']) {
    for (const [name, data] of files) {
      if (!name.startsWith(prefix)) continue;
      const relative = safeRelativePackPath(name.slice(prefix.length));
      if (relative.startsWith('saves/') || relative.startsWith('screenshots/') || relative.startsWith('logs/')) throw new Error(`Modrinth modpack override attempts to overwrite user data: ${relative}`);
      const target = path.resolve(root, relative);
      if (!target.startsWith(`${path.resolve(root)}${path.sep}`)) throw new Error('Modpack override escaped its profile folder.');
      pendingWrites.push({ relative, data });
    }
  }
  // All remote files are downloaded and hash-checked before touching the active instance.
  let count = 0;
  for (const item of pendingWrites) {
    const target = path.resolve(root, item.relative);
    await fs.mkdir(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.download`;
    await fs.writeFile(temp, item.data, { flag: 'w' });
    await fs.rename(temp, target);
    if (index.files?.some(file => file.path === item.relative)) count++;
  }
  return { title: String(index.name || projectTitle || 'Modrinth Modpack').slice(0, 100), filesInstalled: count, minecraftVersion: dependencies.minecraft || settings.minecraftVersion, loaderVersion: requiredLoaderVersion };
}

export async function searchModrinthContent({ query = '', settings, index = 'downloads', type = 'mod' }) {
  return searchModrinth({ query, settings, index, type });
}
export async function getModrinthContentVersions({ projectId, settings, channel = 'release', type = 'mod' }) {
  return getModrinthProjectVersions({ projectId, settings, channel, type });
}
export async function installModrinthContent({ projectId, settings, versionId = null, channel = 'release', type = 'mod', worldFolder = null }) {
  const contentType = validateContentType(type);
  if (contentType === 'mod') return installModrinthProject({ projectId, settings, versionId, channel });
  validateContentSettings(settings, contentType); safeProjectId(projectId);
  let versionData;
  if (versionId) {
    safeProjectId(versionId);
    versionData = await requestJson(`${API}/version/${encodeURIComponent(versionId)}`);
    if (versionData.project_id !== projectId || !compatibleContentVersion(versionData, settings, contentType)) throw new Error('Selected version does not match this project or active profile.');
  } else {
    const versions = await getModrinthContentVersions({ projectId, settings, channel, type: contentType });
    if (!versions.length) throw new Error(`No compatible ${contentType} version is available for this profile.`);
    versionData = await requestJson(`${API}/version/${encodeURIComponent(versions[0].id)}`);
  }
  const primary = (versionData.files || []).find(file => file.primary) || versionData.files?.[0];
  if (!primary || !TYPE_EXTENSIONS[contentType].test(primary.filename)) throw new Error(`Modrinth did not provide a compatible file for ${contentType}.`);
  const { buffer } = await downloadVerified(primary);
  if (contentType === 'modpack') {
    const result = await installMrpack(buffer, settings, versionData.name);
    const dir = getContentDir(settings, contentType); await fs.mkdir(dir, { recursive: true });
    const filename = safeAssetFilename(primary.filename, contentType);
    await fs.writeFile(path.join(dir, filename), buffer);
    const manifestFile = path.join(dir, '.nova-assets.json');
    let manifest = {}; try { manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8')); } catch {}
    manifest[filename] = { projectId, versionId: versionData.id, title: result.title, enabled: true, installedAt: new Date().toISOString(), filesInstalled: result.filesInstalled };
    await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2));
    return { filename, versionId: versionData.id, versionNumber: versionData.version_number, ...result };
  }
  if (contentType === 'datapack') await resolveWorldRoot(settings, worldFolder);
  const dir = getContentDir(settings, contentType, worldFolder); await fs.mkdir(dir, { recursive: true });
  const filename = safeAssetFilename(primary.filename, contentType);
  const target = path.join(dir, filename);
  await fs.writeFile(`${target}.${process.pid}.download`, buffer);
  await fs.rename(`${target}.${process.pid}.download`, target);
  const manifestFile = path.join(dir, '.nova-assets.json');
  let manifest = {}; try { manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8')); } catch {}
  manifest[filename] = { projectId, versionId: versionData.id, versionNumber: versionData.version_number, title: versionData.name, enabled: true, installedAt: new Date().toISOString(), source: 'modrinth' };
  await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2));
  return { filename, versionId: versionData.id, versionNumber: versionData.version_number };
}
export async function listInstalledContent(settings, type = 'mod', worldFolder = null) {
  const contentType = validateContentType(type);
  if (contentType === 'mod') return listInstalledMods(settings);
  if (contentType === 'datapack' && worldFolder) await resolveWorldRoot(settings, worldFolder);
  const dir = getContentDir(settings, contentType, worldFolder);
  let entries;
  try { entries = await fs.readdir(dir, { withFileTypes: true }); }
  catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
  let manifest = {}; try { manifest = JSON.parse(await fs.readFile(path.join(dir, '.nova-assets.json'), 'utf8')); } catch {}
  return entries.filter(entry => entry.isFile() && TYPE_EXTENSIONS[contentType].test(entry.name.replace(/\.disabled$/i, ''))).map(entry => {
    const filename = entry.name; const base = filename.replace(/\.disabled$/i, ''); const meta = manifest[filename] || manifest[base] || {};
    return { filename, enabled: !filename.endsWith('.disabled'), title: meta.title || base, source: 'modrinth', projectId: meta.projectId || null, versionId: meta.versionId || null, versionNumber: meta.versionNumber || null };
  }).sort((a,b) => a.title.localeCompare(b.title));
}
export async function setContentEnabled(settings, type, filename, enabled, worldFolder = null) {
  const contentType = validateContentType(type); if (contentType === 'mod') return setModEnabled(settings, filename, enabled);
  if (contentType === 'datapack' && worldFolder) await resolveWorldRoot(settings, worldFolder);
  const dir = getContentDir(settings, contentType, worldFolder); const base = safeAssetFilename(String(filename).replace(/\.disabled$/i, ''), contentType);
  const sourceName = String(filename); const targetName = enabled ? base : `${base}.disabled`;
  if (sourceName !== targetName) await fs.rename(path.join(dir, sourceName), path.join(dir, targetName));
  return targetName;
}
export async function removeInstalledContent(settings, type, filename, worldFolder = null) {
  const contentType = validateContentType(type); if (contentType === 'mod') return removeInstalledMod(settings, filename);
  if (contentType === 'datapack' && worldFolder) await resolveWorldRoot(settings, worldFolder);
  const dir = getContentDir(settings, contentType, worldFolder); const base = safeAssetFilename(String(filename).replace(/\.disabled$/i, ''), contentType);
  await fs.rm(path.join(dir, String(filename)), { force: true });
  const manifestFile = path.join(dir, '.nova-assets.json'); let manifest = {}; try { manifest = JSON.parse(await fs.readFile(manifestFile, 'utf8')); } catch {}
  delete manifest[base]; delete manifest[`${base}.disabled`]; await fs.writeFile(manifestFile, JSON.stringify(manifest, null, 2)); return true;
}

export async function importLocalMod(settings, sourcePath) {
  validateSettings(settings);
  if (typeof sourcePath !== 'string' || !/\.jar$/i.test(sourcePath)) throw new Error('Select a local .jar mod file.');
  const stat = await fs.stat(sourcePath);
  if (!stat.isFile()) throw new Error('Select a local .jar mod file.');
  if (stat.size <= 0 || stat.size > MAX_MOD_BYTES) throw new Error('JAR must be larger than 0 bytes and no larger than 180 MB.');
  const dir = getModsDir(settings);
  await fs.mkdir(dir, { recursive: true });
  const originalName = safeFilename(path.basename(sourcePath));
  const parsed = path.parse(originalName);
  let filename = originalName;
  let suffix = 2;
  while (true) {
    try { await fs.access(path.join(dir, filename)); filename = `${parsed.name}-${suffix++}${parsed.ext}`; }
    catch { break; }
  }
  const target = path.join(dir, filename);
  await fs.copyFile(sourcePath, target, fs.constants?.COPYFILE_EXCL || 1);
  const bytes = await fs.readFile(target);
  const sha512 = crypto.createHash('sha512').update(bytes).digest('hex');
  const manifest = await readManifest(settings);
  manifest[filename] = { source: 'local', enabled: true, installedAt: new Date().toISOString(), sha512 };
  await writeManifest(settings, manifest);
  return { filename };
}

export async function removeInstalledMod(settings, filename) {
  const safe = safeFilename(filename);
  const target = path.join(getModsDir(settings), safe);
  const existing = await fs.stat(target).catch(() => null);
  if (existing?.isFile()) await fs.rm(target, { force: true });
  const manifest = await readManifest(settings);
  const changed = Object.hasOwn(manifest, safe) || Object.hasOwn(manifest, safe.replace(/\.disabled$/i, ''));
  delete manifest[safe];
  delete manifest[safe.replace(/\.disabled$/i, '')];
  if (changed) await writeManifest(settings, manifest);
  return true;
}

export async function setModEnabled(settings, filename, enabled) {
  const safe = safeFilename(filename);
  const dir = getModsDir(settings);
  const source = path.join(dir, safe);
  const isDisabled = safe.toLowerCase().endsWith('.jar.disabled');
  const targetName = enabled ? safe.replace(/\.jar\.disabled$/i, '.jar') : (isDisabled ? safe : `${safe}.disabled`);
  const target = path.join(dir, targetName);
  if (source !== target) await fs.rename(source, target);
  const manifest = await readManifest(settings);
  const entry = manifest[safe] || manifest[safe.replace(/\.disabled$/i, '')];
  if (entry) {
    delete manifest[safe];
    delete manifest[safe.replace(/\.disabled$/i, '')];
    manifest[targetName] = { ...entry, enabled: Boolean(enabled) };
    await writeManifest(settings, manifest);
  }
  return targetName;
}

export async function backupMods(settings) {
  const source = getModsDir(settings);
  const sourceStat = await fs.stat(source).catch(() => null);
  if (!sourceStat?.isDirectory()) throw new Error('No installed mods folder exists in this profile yet.');
  const backupRoot = getBackupDir(settings);
  await fs.mkdir(backupRoot, { recursive: true });
  const name = `mods-${new Date().toISOString().replace(/[:.]/g, '-')}`;
  const destination = path.join(backupRoot, name);
  await fs.cp(source, destination, { recursive: true, errorOnExist: true });
  return destination;
}

export async function listModBackups(settings) {
  const root = getBackupDir(settings);
  let entries;
  try { entries = await fs.readdir(root, { withFileTypes: true }); }
  catch (error) { if (error?.code === 'ENOENT') return []; throw error; }
  const backups = [];
  for (const entry of entries) {
    if (!entry.isDirectory() || !BACKUP_PATTERN.test(entry.name)) continue;
    const full = path.join(root, entry.name);
    const files = (await fs.readdir(full, { withFileTypes: true })).filter(item => item.isFile() && /\.jar(?:\.disabled)?$/i.test(item.name)).length;
    const stat = await fs.stat(full);
    backups.push({ id: entry.name, files, createdAt: stat.birthtime.toISOString() });
  }
  return backups.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export async function restoreModBackup(settings, backupId) {
  if (!BACKUP_PATTERN.test(String(backupId || ''))) throw new Error('Invalid backup selection.');
  const backupRoot = getBackupDir(settings);
  const source = path.join(backupRoot, backupId);
  const sourceStat = await fs.stat(source).catch(() => null);
  if (!sourceStat?.isDirectory()) throw new Error('Selected mod backup was not found.');
  await backupMods(settings);
  const target = getModsDir(settings);
  const staging = `${target}.restore-${process.pid}`;
  await fs.rm(staging, { recursive: true, force: true });
  await fs.cp(source, staging, { recursive: true, errorOnExist: true });
  await fs.rm(target, { recursive: true, force: true });
  await fs.rename(staging, target);
  return { restored: backupId };
}

export async function checkModUpdates(settings, channel = 'release') {
  validateSettings(settings);
  if (!RELEASE_CHANNELS.has(channel)) throw new Error('Invalid release channel.');
  const manifest = await readManifest(settings);
  const projects = new Map();
  for (const [filename, meta] of Object.entries(manifest)) {
    if (meta?.projectId && !filename.toLowerCase().endsWith('.disabled')) projects.set(meta.projectId, { filename, meta });
  }
  const updates = [];
  for (const [projectId, current] of projects) {
    try {
      const latest = await resolveProjectVersion(projectId, settings, channel);
      if (latest.id !== current.meta.versionId) updates.push({
        projectId,
        filename: current.filename,
        title: current.meta.title || current.filename,
        current: current.meta.versionNumber || 'installed',
        latest: latest.version_number || latest.id,
        versionId: latest.id,
      });
    } catch (error) {
      updates.push({ projectId, filename: current.filename, title: current.meta.title || current.filename, error: error.message });
    }
  }
  return updates;
}
