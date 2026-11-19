import { app, BrowserWindow, ipcMain, dialog, shell, safeStorage, nativeImage } from 'electron';
import path from 'node:path';
import fs from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import crypto from 'node:crypto';
import os from 'node:os';
import net from 'node:net';
import { resolveSrv } from 'node:dns/promises';
import { validateLaunchRequest } from '../modules/launcher/compatibility.js';
import { getDefaultGameDirectoryParent, getGameDirectoryParent, getGameInstancePath, getProfileRuntimePaths, getLegacyGameDirectoryParents, isLegacyGameDirectoryParent, normalizeEmlRootName, getActiveProfile } from '../modules/launcher/paths.js';
import { hasInstalledProfileVersion } from '../modules/launcher/profile-layout.js';
import { initializeProfileWorkspace, applyPendingProfileOptions } from '../modules/launcher/profile-workspace.js';
import { migrateDefaultProfileDirectory } from '../modules/launcher/profile-migration.js';
import { normalizeProfile, updateProfileMetadata } from '../modules/launcher/profiles.js';
import { getPerformancePreset, validatePerformanceSettings, applyPerformanceOptions } from '../modules/performance/presets.js';
import { searchModrinth, getModrinthProjectVersions, installModrinthProject, installDefaultFabricPerformanceMods, updateModrinthProject, listInstalledMods, importLocalMod, removeInstalledMod, setModEnabled, backupMods, listModBackups, restoreModBackup, checkModUpdates, searchModrinthContent, getModrinthContentVersions, installModrinthContent, listInstalledContent, setContentEnabled, removeInstalledContent, listProfileWorlds } from '../modules/mods/modrinth.js';
import { createDefaultSettings, sanitizeSettings } from '../modules/settings/settings.js';
import {
  createLocalServer, listLocalServers, getLocalSystemInfo, readServerMetadata,
  listServerFiles, readServerTextFile, writeServerTextFile, removeServerFile,
  installLocalPlugin, uploadServerFile, listInstalledServerPlugins, searchModrinthPlugins, downloadModrinthPlugin, pingMinecraftServer,
  checkServerMemoryAvailability, requiredJavaMajor, parseJavaMajor, searchModrinthServerMods, downloadModrinthServerMod,
  createServerBackup, listServerBackups, restoreServerBackup, updateServerPublicAddress,
} from '../modules/server/local-server.js';
import { getServerProcessMetrics } from '../modules/server/monitor.js';
import { detectJavaRuntime, listJavaRuntimes } from '../modules/server/java-runtime.js';
import { isUnexpectedServerExit, buildServerJvmArgs } from '../modules/server/lifecycle.js';
import { installTemurin21, installTemurinRuntime, getManagedJavaExecutable } from '../modules/server/java-installer.js';
import { downloadPlayitAgent, getPlayitAgentPath, normalizePlayitAddress } from '../modules/server/playit-manager.js';
import { inspectMinecraftSkin, normalizeSkinVariant } from '../modules/cosmetics/skin-manager.js';
import { buildServerLaunchArgs, ensurePartnerServerInList, normalizeCommunityServer } from '../modules/partners/partner-servers.js';

import { LauncherUpdater } from '../modules/updates/launcher-updater.js';
import { GlobalPartnerStore } from '../modules/partners/global-partner-store.js';

app.setName('Cryon Client');
const LEGACY_USER_DATA = path.join(app.getPath('appData'), 'nova-client');
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const VERSION_MANIFEST_URL = 'https://piston-meta.mojang.com/mc/game/version_manifest_v2.json';
const VERSION_CACHE_FILE = () => path.join(app.getPath('userData'), 'mojang-versions-cache.json');
const SETTINGS_FILE = () => path.join(app.getPath('userData'), 'settings.json');
const ACCOUNT_META_FILE = () => path.join(app.getPath('userData'), 'accounts.json');
const ACCOUNT_SECRET_FILE = () => path.join(app.getPath('userData'), 'accounts.enc');
const LEGACY_ACCOUNT_FILE = () => path.join(app.getPath('userData'), 'account.enc');
const LOG_DIR = () => path.join(app.getPath('userData'), 'logs');
const SERVER_ROOT = () => path.join(app.getPath('userData'), 'servers');
const COMMUNITY_SERVERS_FILE = () => path.join(app.getPath('userData'), 'community-servers.json');
const partnerAssets = path.resolve(__dirname, '..', 'assets', 'partner-servers');
const partnerStore = new GlobalPartnerStore({ directory: path.join(app.getPath('userData'), 'global-partners'), seedFile: path.resolve(__dirname, '..', 'configs', 'partners.json'), sourceFile: path.resolve(__dirname, '..', 'configs', 'partner-source.json'), bundledAssets: partnerAssets });
let mainWindow;
let launcherUpdater;
let activeAccount = null;
let activeAccountId = null;
let accountProfiles = [];
let accountCredentials = [];
let launcherRunning = false;
let versionManifestCache = null;
let appSettings = createDefaultSettings();
const runningServerProcesses = new Map();
const recentServerStatuses = new Map();
const serverLogQueues = new Map();
let pendingSkinUpload = null;
let playitProcess = null;
let playitStatus = { installed: false, running: false, version: null, claimUrl: null, detectedAddress: null, message: 'Playit agent is not installed.' };
const playitLogTail = [];

function send(channel, payload) {
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
}
function plainError(error) { return error instanceof Error ? error.message : String(error ?? 'Unknown error'); }
function detailedError(error) {
  const message = plainError(error);
  const code = error && typeof error === 'object' && error.code ? `\nCode: ${String(error.code).slice(0, 120)}` : '';
  const stack = error instanceof Error && error.stack ? `\n${error.stack}` : '';
  return `${message}${code}${stack}`.slice(0, 12000);
}
async function ensureDir(target) { await fs.mkdir(target, { recursive: true }); return target; }
function secureStorageAvailable() {
  if (!safeStorage.isEncryptionAvailable()) return false;
  if (process.platform === 'linux' && typeof safeStorage.getSelectedStorageBackend === 'function') return safeStorage.getSelectedStorageBackend() !== 'basic_text';
  return true;
}
async function writeJsonAtomic(file, value) {
  await ensureDir(path.dirname(file));
  const temp = `${file}.${process.pid}.tmp`;
  await fs.writeFile(temp, JSON.stringify(value, null, 2), { mode: 0o600 });
  await fs.rename(temp, file);
}
async function loadSettings() {
  let rawSettings = null;
  try { rawSettings = JSON.parse(await fs.readFile(SETTINGS_FILE(), 'utf8')); }
  catch {
    try { rawSettings = JSON.parse(await fs.readFile(path.join(LEGACY_USER_DATA, 'settings.json'), 'utf8')); }
    catch { rawSettings = null; }
  }
  appSettings = sanitizeSettings(rawSettings || createDefaultSettings());

  const appData = path.resolve(app.getPath('appData'));
  const legacyParents = getLegacyGameDirectoryParents(appData);
  const currentParent = appSettings.gameDirectory ? path.resolve(appSettings.gameDirectory) : '';
  const isLegacyParent = currentParent && isLegacyGameDirectoryParent(currentParent, appData);

  // Persist one explicit parent for every subsystem. This prevents process.env.APPDATA,
  // Electron appData and a stale v0.5 nova-client setting from resolving to different roots.
  if (!currentParent || isLegacyParent) {
    // Also scan known old parents on first run when settings.json is absent or did not
    // contain gameDirectory. Each migration is collision-safe and never merges/overwrites.
    for (const legacyParent of legacyParents) {
      try { await migrateDefaultProfileDirectory(legacyParent, appData, appSettings.profiles); }
      catch (error) { console.warn(`[CRYON CLIENT] Could not migrate old profile folders from ${legacyParent}: ${plainError(error)}`); }
    }
    appSettings.gameDirectory = appData;
    await persistSettings();
  } else {
    appSettings.gameDirectory = getGameDirectoryParent(appSettings, appData);
  }

  // Persist the canonical snake_case instance slugs produced by sanitizeSettings.
  // Existing roots such as %APPDATA%\.26_3_fabric are therefore found exactly,
  // rather than creating a second nova-client/<display-name> placeholder.
  if (rawSettings && JSON.stringify(rawSettings.profiles || []) !== JSON.stringify(appSettings.profiles)) {
    await persistSettings();
  }
  return appSettings;
}
async function persistSettings() { await writeJsonAtomic(SETTINGS_FILE(), appSettings); }

function accountMeta(account, type, id) {
  return {
    id,
    type,
    username: String(account?.name || account?.username || 'Player').slice(0, 48),
    uuid: String(account?.uuid || account?.id || '').slice(0, 64),
  };
}
function accountSummary() {
  if (!activeAccount) return null;
  const meta = accountProfiles.find(item => item.id === activeAccountId);
  return { username: meta?.username || String(activeAccount.name || activeAccount.username || 'Player').slice(0, 48), uuid: meta?.uuid || String(activeAccount.uuid || activeAccount.id || '').slice(0, 64), type: meta?.type || activeAccount.novaAccountType || 'microsoft', id: activeAccountId };
}
function publicAccounts() { return accountProfiles.map(({ id, type, username, uuid }) => ({ id, type, username, uuid, active: id === activeAccountId })); }
async function persistAccountState() {
  const persistentProfiles = secureStorageAvailable() ? accountProfiles : accountProfiles.filter(item => item.type === 'offline');
  const persistentActiveId = persistentProfiles.some(item => item.id === activeAccountId) ? activeAccountId : null;
  await writeJsonAtomic(ACCOUNT_META_FILE(), { activeAccountId: persistentActiveId, accounts: persistentProfiles });
  if (secureStorageAvailable()) {
    const encrypted = safeStorage.encryptString(JSON.stringify(accountCredentials));
    await ensureDir(path.dirname(ACCOUNT_SECRET_FILE()));
    const temp = `${ACCOUNT_SECRET_FILE()}.${process.pid}.tmp`;
    await fs.writeFile(temp, encrypted, { mode: 0o600 });
    await fs.rename(temp, ACCOUNT_SECRET_FILE());
  } else {
    await fs.rm(ACCOUNT_SECRET_FILE(), { force: true }).catch(() => {});
  }
}
async function restoreAccounts() {
  let meta = null;
  try { meta = JSON.parse(await fs.readFile(ACCOUNT_META_FILE(), 'utf8')); } catch { try { meta = JSON.parse(await fs.readFile(path.join(LEGACY_USER_DATA, 'accounts.json'), 'utf8')); } catch { /* new install */ } }
  accountProfiles = Array.isArray(meta?.accounts) ? meta.accounts.filter(item => item && typeof item.id === 'string' && ['offline', 'microsoft'].includes(item.type)).slice(0, 20) : [];
  activeAccountId = typeof meta?.activeAccountId === 'string' ? meta.activeAccountId : null;
  if (secureStorageAvailable()) {
    try { let encrypted; try { encrypted = await fs.readFile(ACCOUNT_SECRET_FILE()); } catch { encrypted = await fs.readFile(path.join(LEGACY_USER_DATA, 'accounts.enc')); } accountCredentials = JSON.parse(safeStorage.decryptString(encrypted)); }
    catch { accountCredentials = []; }
  }
  // Migrate the prior single-account encrypted file without storing tokens as plaintext.
  if (!accountProfiles.length && secureStorageAvailable()) {
    try {
      const old = JSON.parse(safeStorage.decryptString(await fs.readFile(LEGACY_ACCOUNT_FILE())));
      const metaEntry = accountMeta(old, 'microsoft', `microsoft-${old.uuid || old.id || crypto.randomUUID()}`);
      accountProfiles = [metaEntry]; accountCredentials = [{ id: metaEntry.id, account: old }]; activeAccountId = metaEntry.id;
      await persistAccountState(); await fs.rm(LEGACY_ACCOUNT_FILE(), { force: true });
    } catch { /* no old account */ }
  }
  if (!activeAccountId) return;
  const selected = accountProfiles.find(item => item.id === activeAccountId);
  if (!selected) { activeAccountId = null; return; }
  if (selected.type === 'offline') {
    try {
      const eml = await import('eml-lib');
      const CrackAuth = eml.CrackAuth || eml.default?.CrackAuth;
      if (CrackAuth) { activeAccount = new CrackAuth().auth(selected.username); activeAccount.novaAccountType = 'offline'; }
    } catch { activeAccount = null; }
  } else {
    activeAccount = accountCredentials.find(item => item.id === selected.id)?.account || null;
    if (!activeAccount) activeAccountId = null;
  }
}
async function storeMicrosoftAccount(account) {
  pendingSkinUpload = null;
  const username = String(account?.name || account?.username || 'Microsoft account');
  const accountKey = String(account?.uuid || account?.id || username).replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 48) || crypto.randomUUID();
  const id = `microsoft-${accountKey}`;
  const meta = accountMeta(account, 'microsoft', id);
  accountProfiles = [meta, ...accountProfiles.filter(item => item.id !== id)].slice(0, 20);
  accountCredentials = [{ id, account }, ...accountCredentials.filter(item => item.id !== id)].slice(0, 20);
  activeAccount = account; activeAccountId = id;
  await persistAccountState();
  if (!secureStorageAvailable()) send('app:notice', { type: 'warning', message: 'Microsoft sign-in works for this session, but secure OS storage is unavailable so this account will not be remembered after closing CRYON.' });
  return accountSummary();
}

async function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440, height: 900, minWidth: 1100, minHeight: 700,
    backgroundColor: '#07121a', title: 'CRYON CLIENT', autoHideMenuBar: true, show: false,
    icon: path.join(__dirname, '..', 'assets', 'icon.png'),
    webPreferences: { preload: path.join(__dirname, 'preload.cjs'), nodeIntegration: false, contextIsolation: true, sandbox: true, webSecurity: true },
  });
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    const allowedHosts = new Set(['microsoft.com', 'live.com', 'xbox.com', 'minecraft.net', 'aka.ms', 'modrinth.com', 'emlproject.com', 'github.com']);
    try {
      const parsed = new URL(url);
      if (parsed.protocol === 'https:' && [...allowedHosts].some(host => parsed.hostname === host || parsed.hostname.endsWith(`.${host}`))) shell.openExternal(parsed.toString());
    } catch { /* deny malformed URLs */ }
    return { action: 'deny' };
  });
  mainWindow.webContents.on('will-navigate', event => event.preventDefault());
  mainWindow.once('ready-to-show', () => mainWindow.show());
  mainWindow.webContents.on('did-fail-load', (_event, code, description, validatedURL) => console.error('[CRYON CLIENT] Renderer failed:', { code, description, validatedURL }));
  await mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));
  if (process.argv.includes('--dev')) mainWindow.webContents.openDevTools({ mode: 'detach' });
}

async function fetchJson(url, timeout = 15000) {
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { 'User-Agent': 'CRYON-CLIENT/0.5.0' } });
  if (!response.ok) throw new Error(`HTTP ${response.status} while requesting ${new URL(url).hostname}.`);
  return response.json();
}
async function latestLoaderBuild(version, loader) {
  if (loader === 'vanilla') return '';
  const encodedVersion = encodeURIComponent(version);
  if (loader === 'fabric' || loader === 'quilt') {
    const host = loader === 'fabric' ? 'https://meta.fabricmc.net/v2/versions/loader' : 'https://meta.quiltmc.org/v3/versions/loader';
    const items = await fetchJson(`${host}/${encodedVersion}`);
    const match = items.find(item => item.loader?.stable) || items[0];
    if (!match?.loader?.version) throw new Error(`No ${loader} build is published for Minecraft ${version}.`);
    return match.loader.version;
  }
  if (loader === 'forge') {
    const data = await fetchJson('https://files.minecraftforge.net/net/minecraftforge/forge/promotions_slim.json');
    const build = data.promos?.[`${version}-recommended`] || data.promos?.[`${version}-latest`];
    if (!build) throw new Error(`Forge has no promoted build for Minecraft ${version}. Enter a compatible Forge build manually.`);
    return `${version}-${build}`;
  }
  if (loader === 'neoforge') {
    const data = await fetchJson('https://maven.neoforged.net/api/maven/versions/releases/net/neoforged/neoforge');
    const [, minor, patch = '0'] = version.split('.');
    const prefix = `${minor}.${patch}.`;
    const list = Array.isArray(data) ? data : (data.versions || []);
    const candidates = list.filter(item => String(item).startsWith(prefix));
    candidates.sort((a, b) => String(b).localeCompare(String(a), undefined, { numeric: true }));
    if (!candidates.length) throw new Error(`No NeoForge release found for Minecraft ${version}.`);
    return String(candidates[0]);
  }
  throw new Error(`Automatic loader detection is not available for ${loader}.`);
}

async function readCommunityServers() {
  try {
    const data = JSON.parse(await fs.readFile(COMMUNITY_SERVERS_FILE(), 'utf8'));
    if (!Array.isArray(data)) return [];
    return data.slice(0, 50).map(item => normalizeCommunityServer(item)).map((item, index) => ({ ...item, id: String(data[index]?.id || item.id) })).filter(item => item.id);
  } catch (error) {
    if (error?.code === 'ENOENT') return [];
    throw new Error(`Could not read your saved community servers: ${plainError(error)}`);
  }
}
async function writeCommunityServers(servers) {
  await writeJsonAtomic(COMMUNITY_SERVERS_FILE(), servers.slice(0, 50));
}
async function getPlayableServerById(id) {
  const partner = partnerStore.partners.find(item => item.id === id);
  if (partner) return partner;
  return (await readCommunityServers()).find(item => item.id === id) || null;
}
function registerPartnerServerHandlers() {
  ipcMain.handle('partner-servers:list', async (_event, force) => {
    const { partners, error, source } = await partnerStore.refresh(force === true);
    const imageUrl = async filename => {
      const bytes = await partnerStore.imageBytes(filename);
      return bytes ? `data:image/png;base64,${bytes.toString('base64')}` : '';
    };
    return {
      partners: await Promise.all(partners.map(async ({ id, name, address, description, logo, icon }) => ({ id, name, address, description, logoUrl: await imageUrl(logo || icon), iconUrl: await imageUrl(icon || logo), partner: true }))),
      community: (await readCommunityServers()).filter(item => !partners.some(partner => partner.id === item.id || partner.address === item.address)), error, source,
    };
  });
  ipcMain.handle('partner-servers:add', async (_event, rawServer) => {
    const clean = normalizeCommunityServer(rawServer || {});
    const servers = await readCommunityServers();
    if (partnerStore.partners.some(item => normalizeCommunityServer(item).address.toLowerCase() === clean.address.toLowerCase())) throw new Error('This server is already listed in Partner Servers.');
    if (servers.some(item => item.address.toLowerCase() === clean.address.toLowerCase())) throw new Error('This server is already in Your Servers.');
    if (servers.length >= 50) throw new Error('You can save up to 50 community servers.');
    const server = { ...clean, id: crypto.randomUUID() };
    servers.push(server);
    await writeCommunityServers(servers);
    return server;
  });
  ipcMain.handle('partner-servers:remove', async (_event, rawId) => {
    const id = String(rawId || '').slice(0, 80);
    const servers = await readCommunityServers();
    const filtered = servers.filter(item => item.id !== id);
    if (filtered.length === servers.length) return { removed: false, servers };
    await writeCommunityServers(filtered);
    return { removed: true, servers: filtered };
  });
  ipcMain.handle('partner-servers:ping', async (_event, rawId) => {
    const server = await getPlayableServerById(String(rawId || '').slice(0, 80));
    if (!server) throw new Error('This saved server could not be found.');
    const clean = normalizeCommunityServer({ name: server.name, address: server.address });
    let targets = [{ host: clean.host, port: clean.port }];
    if (clean.port === 25565 && !net.isIP(clean.host)) {
      const records = await resolveSrv(`_minecraft._tcp.${clean.host}`).catch(() => []);
      if (records.length) targets = records.filter(item => item.name && item.name !== '.').sort((a, b) => a.priority - b.priority || b.weight - a.weight).slice(0, 3).map(item => ({ host: item.name.replace(/\.$/, ''), port: item.port }));
    }
    for (const target of targets) {
      const result = await pingMinecraftServer(target.port, target.host, clean.host);
      if (result.online) return { id: server.id, ...result };
    }
    return { id: server.id, online: false, playersOnline: 0, maxPlayers: 0, latencyMs: null };
  });
}

function registerBasicHandlers() {
  ipcMain.handle('app:get-state', async () => ({ settings: appSettings, account: accountSummary(), accounts: publicAccounts(), launcherRunning, platform: process.platform, appVersion: app.getVersion(), appDataPath: app.getPath('appData'), secureStorageAvailable: secureStorageAvailable() }));
  ipcMain.handle('app:get-versions', async () => {
    if (versionManifestCache && Date.now() - versionManifestCache.time < 10 * 60 * 1000) return { versions: versionManifestCache.versions, latest: versionManifestCache.latest, source: 'network-cache' };
    try {
      const manifest = await fetchJson(VERSION_MANIFEST_URL, 12000);
      const versions = manifest.versions.filter(item => item.type === 'release').map(item => ({ id: item.id, type: item.type, releaseTime: item.releaseTime }));
      const latest = manifest.latest?.release || null;
      versionManifestCache = { time: Date.now(), versions, latest };
      await writeJsonAtomic(VERSION_CACHE_FILE(), { savedAt: new Date().toISOString(), latest, versions });
      return { versions, latest, source: 'mojang' };
    } catch (error) {
      try {
        const cached = JSON.parse(await fs.readFile(VERSION_CACHE_FILE(), 'utf8'));
        if (Array.isArray(cached.versions) && cached.versions.some(item => item?.type === 'release' && /^\d+\.\d+(?:\.\d+)?$/.test(item.id))) {
          const versions = cached.versions.filter(item => item?.type === 'release' && /^\d+\.\d+(?:\.\d+)?$/.test(item.id));
          versionManifestCache = { time: Date.now(), versions, latest: cached.latest || null };
          return { versions, latest: cached.latest || null, source: 'disk-cache', warning: plainError(error) };
        }
      } catch { /* first run without network or a previous official cache */ }
      const knownStableFallback = ['1.21.1', '1.20.4', '1.19.4', '1.16.5', '1.12.2', '1.8.9'];
      return { versions: knownStableFallback.map(id => ({ id, type: 'release', offlineFallback: true })), source: 'offline-fallback', warning: plainError(error) };
    }
  });
  ipcMain.handle('launcher:resolve-loader', async (_event, version, loader) => latestLoaderBuild(String(version || ''), String(loader || 'vanilla').toLowerCase()));
  ipcMain.handle('app:pick-game-directory', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openDirectory', 'createDirectory'] });
    if (result.canceled || !result.filePaths[0]) return null;
    appSettings.gameDirectory = path.resolve(result.filePaths[0]); await persistSettings(); return appSettings.gameDirectory;
  });
  ipcMain.handle('app:pick-java', async () => {
    const result = await dialog.showOpenDialog(mainWindow, { properties: ['openFile'], filters: [{ name: 'Java executable', extensions: process.platform === 'win32' ? ['exe'] : ['*'] }] });
    if (result.canceled || !result.filePaths[0]) return null;
    appSettings.javaPath = path.resolve(result.filePaths[0]); await persistSettings(); return appSettings.javaPath;
  });
  ipcMain.handle('settings:save', async (_event, patch) => {
    const allowed = ['ramMin', 'ramMax', 'performancePreset', 'startOnLogin', 'hideLauncherOnGameStart', 'hide3DCharacter', 'fullscreen', 'windowWidth', 'windowHeight', 'javaArgs', 'downloadConcurrency']; const safePatch = {};
    if (patch && typeof patch === 'object') for (const key of allowed) if (Object.hasOwn(patch, key)) safePatch[key] = patch[key];
    appSettings = sanitizeSettings({ ...appSettings, ...safePatch }); await persistSettings();
    if (Object.hasOwn(safePatch, 'ramMin') || Object.hasOwn(safePatch, 'ramMax')) {
      const active = appSettings.profiles.find(profile => profile.id === appSettings.activeProfileId);
      if (active) {
        appSettings.profiles = appSettings.profiles.map(profile => profile.id === active.id
          ? { ...profile, ramMin: appSettings.ramMin, ramMax: appSettings.ramMax }
          : profile);
        await persistSettings();
      }
    }
    if (Object.hasOwn(safePatch, 'startOnLogin') && process.platform !== 'linux') app.setLoginItemSettings({ openAtLogin: appSettings.startOnLogin, name: 'CRYON CLIENT' });
    return appSettings;
  });
  ipcMain.handle('java:detect', async () => detectJava(appSettings.javaPath));
  ipcMain.handle('java:list-runtimes', async () => listJavaRuntimes({ configuredPath: appSettings.javaPath || '', managedDirectory: path.join(app.getPath('userData'), 'runtimes') }));
  ipcMain.handle('java:select', async (_event, rawPath) => {
    const selectedPath = String(rawPath || '').trim();
    if (selectedPath) {
      const runtime = await detectJavaRuntime(selectedPath);
      if (!runtime.found) throw new Error(`Selected Java runtime is not usable: ${runtime.message}`);
      appSettings.javaPath = runtime.executable;
    } else appSettings.javaPath = '';
    await persistSettings();
    return { javaPath: appSettings.javaPath, runtime: appSettings.javaPath ? await detectJavaRuntime(appSettings.javaPath) : null, settings: appSettings };
  });
  ipcMain.handle('java:install-major', async (_event, rawMajor) => {
    const major = Number(rawMajor);
    if (![8, 16, 17, 21, 25].includes(major)) throw new Error('Choose Java 8, 16, 17, 21 or 25 for managed runtime installation.');
    return installTemurinRuntime(app.getPath('userData'), major, progress => send('java:install-progress', progress));
  });
  ipcMain.handle('java:install-21', async () => {
    const installed = await installTemurin21(app.getPath('userData'), progress => send('java:install-progress', progress));
    appSettings.javaPath = installed.executable;
    await persistSettings();
    return { ...installed, settings: appSettings };
  });
  ipcMain.handle('app:open-logs', async () => { await ensureDir(LOG_DIR()); const latest = await latestLogFile(); return shell.openPath(latest || LOG_DIR()); });
  ipcMain.handle('app:open-game-directory', async () => { const dir = getGameDirectoryParent(appSettings, getDefaultGameDirectoryParent(app.getPath('appData'))); await ensureDir(dir); const error = await shell.openPath(dir); if (error) throw new Error(error); return dir; });
  ipcMain.handle('app:open-install-directory', async () => { const dir = app.isPackaged ? path.dirname(process.execPath) : app.getAppPath(); const error = await shell.openPath(dir); if (error) throw new Error(error); return dir; });
  ipcMain.handle('app:open-config-directory', async () => { const dir = app.getPath('userData'); await ensureDir(dir); const error = await shell.openPath(dir); if (error) throw new Error(error); return dir; });
}

function registerProfileHandlers() {
  ipcMain.handle('profiles:list', () => ({ profiles: appSettings.profiles, activeProfileId: appSettings.activeProfileId }));
  const getProfileFolderInfo = async profile => {
    const runtime = getProfileRuntimePaths(appSettings, profile, app.getPath('appData'));
    const folderStat = await fs.stat(runtime.folder).catch(() => null);
    const pendingPath = path.join(runtime.folder, '.cryon-options-pending');
    const pendingStat = await fs.stat(pendingPath).catch(() => null);
    return { folder: runtime.folder, parent: runtime.parent, rootName: runtime.rootName, exists: Boolean(folderStat?.isDirectory()), installed: await hasInstalledProfileVersion(runtime.folder, profile), pendingOptions: Boolean(pendingStat?.isFile()) };
  };
  ipcMain.handle('profiles:get-folder-info', async (_event, id) => {
    const profile = appSettings.profiles.find(item => item.id === String(id || ''));
    if (!profile) throw new Error('Profile not found.');
    return getProfileFolderInfo(profile);
  });
  ipcMain.handle('profiles:open-folder', async (_event, id) => {
    const profile = appSettings.profiles.find(item => item.id === String(id || ''));
    if (!profile) throw new Error('Profile not found.');
    const info = await getProfileFolderInfo(profile);
    // Do not manufacture a replacement/demo directory when the runtime root is
    // missing. Opening must always reveal the exact path used by EML Lib.
    if (!info.exists) throw new Error('The real Minecraft profile folder does not exist yet. Press PLAY first so CRYON can prepare or install this profile.');
    const error = await shell.openPath(info.folder);
    if (error) throw new Error(error);
    return info.folder;
  });
  ipcMain.handle('profiles:create', async (_event, raw) => {
    const profile = normalizeProfile(raw);
    if (appSettings.profiles.length >= 50) throw new Error('You can create up to 50 profiles.');
    if (appSettings.profiles.some(item => item.name.toLowerCase() === profile.name.toLowerCase())) throw new Error('A profile with that name already exists.');
    if (appSettings.profiles.some(item => item.instanceName === profile.instanceName)) throw new Error('That profile folder already exists.');
    // Creating a profile only saves metadata. The real game directory and its
    // pending-options marker are prepared on first PLAY, not as an empty demo.
    appSettings.profiles.push(profile); appSettings.activeProfileId = profile.id;
    appSettings = sanitizeSettings({ ...appSettings, minecraftVersion: profile.version, loader: profile.loader, loaderVersion: profile.loaderVersion, ramMin: profile.ramMin, ramMax: profile.ramMax });
    await persistSettings();
    const runtime = getProfileRuntimePaths(appSettings, profile, app.getPath('appData'));
    return { settings: appSettings, profile, folder: runtime.folder, rootName: runtime.rootName };
  });
  ipcMain.handle('profiles:duplicate', async (_event, id) => {
    const source = appSettings.profiles.find(item => item.id === String(id || ''));
    if (!source) throw new Error('Profile not found.');
    if (appSettings.profiles.length >= 50) throw new Error('You can create up to 50 profiles.');
    const copyBase = `${source.name.slice(0, 24)}-Copy`;
    let name = copyBase;
    let suffix = 2;
    while (appSettings.profiles.some(item => item.name.toLowerCase() === name.toLowerCase() || item.instanceName === normalizeEmlRootName(name))) {
      name = `${source.name.slice(0, Math.max(8, 21 - String(suffix).length))}-Copy-${suffix++}`;
    }
    const duplicate = normalizeProfile({ ...source, id: undefined, name, instanceName: undefined, createdAt: new Date().toISOString() });
    appSettings.profiles.push(duplicate);
    appSettings.activeProfileId = duplicate.id;
    appSettings = sanitizeSettings({ ...appSettings, minecraftVersion: duplicate.version, loader: duplicate.loader, loaderVersion: duplicate.loaderVersion, ramMin: duplicate.ramMin, ramMax: duplicate.ramMax });
    await persistSettings();
    const runtime = getProfileRuntimePaths(appSettings, duplicate, app.getPath('appData'));
    return { settings: appSettings, profile: duplicate, folder: runtime.folder };
  });
  ipcMain.handle('profiles:select', async (_event, id) => {
    const profile = appSettings.profiles.find(item => item.id === id);
    if (!profile) throw new Error('Selected profile no longer exists.');
    appSettings.activeProfileId = profile.id;
    appSettings = sanitizeSettings({ ...appSettings, minecraftVersion: profile.version, loader: profile.loader, loaderVersion: profile.loaderVersion, ramMin: profile.ramMin, ramMax: profile.ramMax });
    await persistSettings(); return appSettings;
  });
  ipcMain.handle('profiles:assign-account', async (_event, profileId, accountId) => {
    const profile = appSettings.profiles.find(item => item.id === profileId);
    if (!profile) throw new Error('Profile not found.');
    const nextAccountId = accountId ? String(accountId) : null;
    if (nextAccountId && !accountProfiles.some(item => item.id === nextAccountId)) throw new Error('Choose a saved account from the Accounts page.');
    appSettings.profiles = appSettings.profiles.map(item => item.id === profileId ? { ...item, accountId: nextAccountId } : item);
    appSettings = sanitizeSettings(appSettings); await persistSettings(); return appSettings;
  });
  ipcMain.handle('profiles:update-active', async (_event, patch) => {
    const active = getActiveProfile(appSettings);
    if (!active) throw new Error('Create a profile before changing its configuration.');
    const updated = updateProfileMetadata(active, patch);
    if (appSettings.profiles.some(item => item.id !== active.id && item.name.toLowerCase() === updated.name.toLowerCase())) throw new Error('Another profile already uses that name.');
    appSettings.profiles = appSettings.profiles.map(item => item.id === active.id ? updated : item);
    appSettings = sanitizeSettings({ ...appSettings, minecraftVersion: updated.version, loader: updated.loader, loaderVersion: updated.loaderVersion });
    await persistSettings(); return appSettings;
  });
  ipcMain.handle('profiles:delete', async (_event, id) => {
    if (appSettings.profiles.length <= 1) throw new Error('At least one profile must remain.');
    const target = appSettings.profiles.find(item => item.id === id);
    if (!target) throw new Error('Profile not found.');
    appSettings.profiles = appSettings.profiles.filter(item => item.id !== id);
    if (appSettings.activeProfileId === id) {
      const next = appSettings.profiles[0]; appSettings.activeProfileId = next.id;
      appSettings.minecraftVersion = next.version; appSettings.loader = next.loader; appSettings.loaderVersion = next.loaderVersion;
    }
    await persistSettings(); return appSettings;
  });
}

async function detectJava(customPath = '') { return detectJavaRuntime(customPath); }

async function latestLogFile() { try { const names = (await fs.readdir(LOG_DIR())).filter(name => name.endsWith('.log')).sort().reverse(); return names.length ? path.join(LOG_DIR(), names[0]) : null; } catch { return null; } }

function registerAuthHandlers() {
  ipcMain.handle('auth:login', async () => {
    if (!mainWindow) throw new Error('Launcher window is not ready.');
    const eml = await import('eml-lib'); const MicrosoftAuth = eml.MicrosoftAuth || eml.default?.MicrosoftAuth;
    if (!MicrosoftAuth) throw new Error('Microsoft authentication is unavailable in this EML Lib installation.');
    const account = await new MicrosoftAuth(mainWindow).auth();
    const summary = await storeMicrosoftAccount(account); send('accounts:updated', publicAccounts()); return summary;
  });
  ipcMain.handle('auth:offline-login', async (_event, rawName) => {
    pendingSkinUpload = null;
    const name = String(rawName || '').trim();
    if (!/^[A-Za-z0-9_]{3,16}$/.test(name)) throw new Error('Offline username must be 3–16 characters (letters, numbers or underscore).');
    const eml = await import('eml-lib'); const CrackAuth = eml.CrackAuth || eml.default?.CrackAuth;
    if (!CrackAuth) throw new Error('Offline local profiles are unavailable in this EML Lib installation.');
    const account = new CrackAuth().auth(name); account.novaAccountType = 'offline';
    const id = `offline-${name.toLowerCase()}`; const meta = accountMeta(account, 'offline', id);
    accountProfiles = [meta, ...accountProfiles.filter(item => item.id !== id)].slice(0, 20);
    accountCredentials = accountCredentials.filter(item => item.id !== id);
    activeAccount = account; activeAccountId = id; await persistAccountState(); send('accounts:updated', publicAccounts());
    send('app:notice', { type: 'warning', message: 'Offline identity is for local testing and servers that explicitly allow offline-mode authentication. It does not provide a paid Minecraft licence or premium-server access.' });
    return accountSummary();
  });
  ipcMain.handle('auth:select', async (_event, id) => {
    pendingSkinUpload = null;
    const meta = accountProfiles.find(item => item.id === id); if (!meta) throw new Error('Account not found.');
    if (meta.type === 'offline') {
      const eml = await import('eml-lib'); const CrackAuth = eml.CrackAuth || eml.default?.CrackAuth;
      activeAccount = new CrackAuth().auth(meta.username); activeAccount.novaAccountType = 'offline';
    } else {
      activeAccount = accountCredentials.find(item => item.id === id)?.account || null;
      if (!activeAccount) throw new Error('This Microsoft account was not saved because secure OS credential storage was unavailable. Sign in again.');
    }
    activeAccountId = id; await persistAccountState(); send('accounts:updated', publicAccounts()); return accountSummary();
  });
  ipcMain.handle('auth:remove', async (_event, id) => {
    if (activeAccountId === id) pendingSkinUpload = null;
    accountProfiles = accountProfiles.filter(item => item.id !== id); accountCredentials = accountCredentials.filter(item => item.id !== id);
    appSettings.profiles = appSettings.profiles.map(profile => profile.accountId === id ? { ...profile, accountId: null } : profile); await persistSettings();
    if (activeAccountId === id) { activeAccount = null; activeAccountId = null; }
    await persistAccountState(); send('accounts:updated', publicAccounts()); return { account: accountSummary(), accounts: publicAccounts(), settings: appSettings };
  });
  ipcMain.handle('auth:logout', async () => {
    pendingSkinUpload = null;
    activeAccount = null; activeAccountId = null; await persistAccountState(); send('accounts:updated', publicAccounts()); return true;
  });
}

function registerLauncherHandlers() {
  ipcMain.handle('launcher:launch', async (_event, rawRequest) => {
    if (launcherRunning) throw new Error('Minecraft is already starting or running.');
    const profile = rawRequest?.profileId ? appSettings.profiles.find(item => item.id === rawRequest.profileId) : getActiveProfile(appSettings);
    if (!profile) throw new Error('Select a valid saved profile before launching.');
    const partnerServerId = typeof rawRequest?.partnerServerId === 'string' ? rawRequest.partnerServerId.slice(0, 80) : '';
    const launchServer = partnerServerId ? await getPlayableServerById(partnerServerId) : null;
    if (partnerServerId && !launchServer) throw new Error('The selected partner/community server is no longer available. Refresh the server list and try again.');
    const launchAccountId = profile.accountId || activeAccountId;
    const launchMeta = accountProfiles.find(item => item.id === launchAccountId);
    let launchAccount = null;
    if (launchMeta?.type === 'offline') { const eml = await import('eml-lib'); const CrackAuth = eml.CrackAuth || eml.default?.CrackAuth; if (!CrackAuth) throw new Error('Offline test identity adapter is unavailable.'); launchAccount = new CrackAuth().auth(launchMeta.username); launchAccount.novaAccountType = 'offline'; }
    else if (launchMeta?.type === 'microsoft') launchAccount = accountCredentials.find(item => item.id === launchAccountId)?.account || null;
    else if (!profile.accountId) launchAccount = activeAccount;
    if (!launchAccount) throw new Error(`No usable account is assigned to profile ${profile.name}. Open Accounts and assign a Microsoft account or offline test identity.`);
    let loaderVersion = profile.loaderVersion;
    if (profile.loader !== 'vanilla' && !loaderVersion) {
      send('launcher:status', { state: 'resolving', message: `Finding a compatible ${profile.loader} build for Minecraft ${profile.version}…` });
      try { loaderVersion = await latestLoaderBuild(profile.version, profile.loader); }
      catch (error) { send('launcher:status', { state: 'error', message: plainError(error) }); throw error; }
      const updated = { ...profile, loaderVersion };
      appSettings.profiles = appSettings.profiles.map(item => item.id === profile.id ? updated : item);
      await persistSettings();
    }
    const request = validateLaunchRequest({ version: profile.version, loader: profile.loader, loaderVersion }, appSettings);
    appSettings.activeProfileId = profile.id; appSettings.minecraftVersion = request.version; appSettings.loader = request.loader; appSettings.loaderVersion = request.loaderVersion;
    await persistSettings();
    launcherRunning = true;
    send('launcher:status', { state: 'preparing', message: `Preparing ${profile.name}…` });
    let logLines = [];
    const previousWorkingDirectory = process.cwd();
    let changedWorkingDirectory = false;
    try {
      const eml = await import('eml-lib');
      const MicrosoftAuth = eml.MicrosoftAuth || eml.default?.MicrosoftAuth;
      if (launchAccount.novaAccountType !== 'offline' && MicrosoftAuth && mainWindow) {
        const auth = new MicrosoftAuth(mainWindow);
        try { const valid = await auth.validate(launchAccount); if (!valid) { launchAccount = await auth.refresh(launchAccount); const item = accountCredentials.find(record => record.id === launchAccountId); if (item) item.account = launchAccount; if (activeAccountId === launchAccountId) activeAccount = launchAccount; await persistAccountState(); } }
        catch (authError) { if (activeAccountId === launchAccountId) { activeAccount = null; activeAccountId = null; } await persistAccountState(); throw new Error(`Microsoft session expired. Sign in again. ${plainError(authError)}`); }
      }
      const Launcher = eml.Launcher || eml.default?.Launcher;
      if (!Launcher) throw new Error('Minecraft launcher engine could not be loaded. Reinstall CRYON dependencies.');
      const runtime = getProfileRuntimePaths(appSettings, profile, app.getPath('appData'));
      const gameDirectoryParent = runtime.parent;
      const profileGameRoot = runtime.folder;
      const emlRootName = runtime.rootName;
      await ensureDir(gameDirectoryParent);
      // FastClient-style local first-run flow: create a pending settings marker
      // only when PLAY is pressed. EML/Minecraft then populate the real instance.
      await initializeProfileWorkspace(appSettings, profile, appSettings.performance);
      // Recover a previous pending marker if Minecraft already created options.txt.
      await applyPendingProfileOptions(profileGameRoot);
      if (launchServer && !partnerStore.partners.some(item => item.id === launchServer.id)) {
        await ensurePartnerServerInList(profileGameRoot, launchServer);
      }
      for (const partner of [...partnerStore.partners].reverse()) {
        const bytes = await partnerStore.imageBytes(partner.icon || partner.logo);
        const image = bytes ? nativeImage.createFromBuffer(bytes) : null;
        const icon = image && !image.isEmpty() ? image.resize({ width: 64, height: 64 }).toPNG() : null;
        const saved = await ensurePartnerServerInList(profileGameRoot, partner, icon);
        logLines.push(`Partner pinned: ${partner.name} (${partner.address}) · ${saved.path}`);
      }
      process.chdir(gameDirectoryParent);
      changedWorkingDirectory = true;
      const resolvedByEmlContract = path.resolve(process.cwd(), `.${emlRootName}`);
      if (resolvedByEmlContract !== profileGameRoot) {
        throw new Error(`Profile path mismatch. CRYON expects ${profileGameRoot}, but EML root resolves to ${resolvedByEmlContract}.`);
      }
      logLines.push(`CRYON path audit: ${JSON.stringify({ appData: app.getPath('appData'), configuredParent: appSettings.gameDirectory, processCwd: process.cwd(), emlRoot: emlRootName, expectedGameRoot: profileGameRoot })}`);
      if (request.loader === 'fabric') {
        send('launcher:status', { state: 'installing', message: `Checking compatible CRYON performance mods for Minecraft ${request.version}…` });
        try {
          const modSettings = { ...appSettings, activeProfileId: profile.id, minecraftVersion: request.version, loader: 'fabric', loaderVersion: request.loaderVersion };
          const autoMods = await installDefaultFabricPerformanceMods(modSettings, { onProgress: progress => {
            const detail = `${progress.name}: ${progress.status}${progress.versionNumber ? ` (${progress.versionNumber})` : ''}`;
            logLines.push(`Auto Fabric mod: ${detail}${progress.message ? ` — ${progress.message}` : ''}`);
            send('launcher:status', { state: 'installing', message: `Fabric optimization mods · ${progress.completed}/${progress.total}: ${progress.name} — ${progress.status}` });
          } });
          logLines.push(`CRYON default Fabric optimization set: ${autoMods.installed} installed/already present, ${autoMods.skipped} incompatible with ${request.version}, ${autoMods.failed} failed.`);
          if (autoMods.failed > 0) {
            send('app:notice', { type: 'warning', message: `${autoMods.installed}/12 CRYON performance mods are ready. ${autoMods.failed} could not be downloaded; CRYON will retry them on the next launch.` });
          } else if (autoMods.skipped > 0) {
            send('app:notice', { type: 'info', message: `${autoMods.installed} CRYON performance mods are ready. ${autoMods.skipped} do not publish a compatible build for Minecraft ${request.version} and were skipped.` });
          }
        } catch (modError) {
          logLines.push(`CRYON automatic Fabric mod installation error: ${detailedError(modError)}`);
          send('app:notice', { type: 'warning', message: `Automatic performance mod installation was incomplete: ${plainError(modError)}. Minecraft will still start.` });
        }
      }
      const loaderConfig = { loader: request.loader };
      if (request.loader !== 'vanilla') loaderConfig.version = request.loaderVersion;
      const requiredClientJava = requiredJavaMajor(request.version);
      let manualJavaPath = '';
      if (appSettings.javaPath) {
        const configuredRuntime = await detectJavaRuntime(appSettings.javaPath);
        if (configuredRuntime.found && Number(configuredRuntime.major) >= requiredClientJava) manualJavaPath = configuredRuntime.executable;
        else logLines.push(`Configured Java ${configuredRuntime.major || 'unknown'} is not compatible with Minecraft ${request.version} (Java ${requiredClientJava}+ required). EML automatic Java management will be used for this launch.`);
      }
      const serverLaunchArgs = launchServer ? buildServerLaunchArgs(launchServer, request.version) : [];
      if (launchServer) {
        // Quick Play writes a small receipt after a successful join. This makes the
        // direct-connect attempt diagnosable without changing the user's saved worlds.
        const [serverMajor, serverMinor] = String(request.version).split('.').map(Number);
        if (serverMajor > 1 || (serverMajor === 1 && serverMinor >= 20)) {
          await ensureDir(path.join(profileGameRoot, 'quickPlay'));
          serverLaunchArgs.push('--quickPlayPath', 'quickPlay/cryon-partner-last-join.json');
        }
        logLines.push(`Direct multiplayer launch requested: ${launchServer.name} · ${launchServer.address} · Minecraft ${request.version} · args=${JSON.stringify(serverLaunchArgs)}`);
      }
      const config = {
        root: emlRootName, account: launchAccount,
        // EML Lib's documented global minecraft.args field forwards custom client arguments.
        minecraft: { version: request.version, loader: loaderConfig, ...(serverLaunchArgs.length ? { args: serverLaunchArgs } : {}) },
        java: { ...(manualJavaPath ? { install: 'manual', absolutePath: manualJavaPath } : { install: 'auto' }), args: String(appSettings.javaArgs || '').split(/\s+/).filter(Boolean).slice(0, 80) },
        memory: { min: profile.ramMin || appSettings.ramMin, max: profile.ramMax || appSettings.ramMax },
        window: { width: appSettings.windowWidth, height: appSettings.windowHeight, fullscreen: Boolean(appSettings.fullscreen) },
        storage: 'isolated', cleaning: { enabled: false },
      };
      const launcher = new Launcher(config);
      const events = ['launch_compute_download', 'launch_download', 'launch_install_loader', 'launch_copy_assets', 'launch_extract_natives', 'launch_patch_loader', 'launch_check_java', 'launch_clean', 'launch_launch', 'launch_data', 'launch_close', 'launch_crash', 'launch_debug', 'download_progress', 'download_error', 'download_end', 'extract_progress', 'extract_end', 'copy_progress', 'copy_end', 'patch_progress', 'patch_end', 'patch_error', 'java_info'];
      for (const eventName of events) launcher.on(eventName, async payload => {
        const safePayload = typeof payload === 'string' ? payload.slice(0, 5000) : payload;
        send('launcher:event', { type: eventName, payload: safePayload });
        if (eventName === 'launch_launch') {
          logLines.push(`Minecraft process launch event received. ${launchServer ? `Connecting to ${launchServer.name} (${launchServer.address}).` : ''}`);
          send('launcher:status', { state: 'starting', message: launchServer ? `Minecraft is starting and connecting to ${launchServer.name}…` : `Minecraft ${request.version} is starting…` });
          if (appSettings.hideLauncherOnGameStart && mainWindow && !mainWindow.isDestroyed()) mainWindow.hide();
        }
        if (eventName === 'launch_data' || eventName === 'launch_debug') { logLines.push(String(payload)); if (logLines.length > 1000) logLines = logLines.slice(-800); }
        if (eventName === 'download_error' || eventName === 'patch_error') { logLines.push(`${eventName}: ${JSON.stringify(payload)}`); }
        if (eventName === 'launch_crash') { logLines.push(`CRASH: ${JSON.stringify(payload)}`); await writeCrashLog(logLines.join('\n')); if (mainWindow && !mainWindow.isDestroyed() && appSettings.hideLauncherOnGameStart) mainWindow.show(); }
        if (eventName === 'launch_close') {
          launcherRunning = false;
          if (launchServer) {
            const resolvedArgs = Array.isArray(launcher.launchArgs) ? launcher.launchArgs : [];
            logLines.push(`EML resolved Minecraft process arguments: ${JSON.stringify(resolvedArgs)}`);
            const expectedJoinArgument = request.version.startsWith('1.') && Number(request.version.split('.')[1]) < 20
              ? '--server'
              : '--quickPlayMultiplayer';
            if (!resolvedArgs.includes(expectedJoinArgument)) {
              logLines.push(`WARNING: EML process arguments did not contain ${expectedJoinArgument}; the selected server may not have been passed to Minecraft.`);
            }
            const quickPlayReceipt = path.join(profileGameRoot, 'quickPlay', 'cryon-partner-last-join.json');
            const receipt = await fs.readFile(quickPlayReceipt, 'utf8').catch(() => '');
            if (receipt) logLines.push(`Minecraft Quick Play receipt: ${receipt.slice(0, 4000)}`);
            else if (expectedJoinArgument === '--quickPlayMultiplayer') logLines.push('No Quick Play receipt was written before Minecraft closed. Check the in-game server/authentication message if it did not connect.');
          }
          try {
            const appliedPending = await applyPendingProfileOptions(profileGameRoot);
            if (!appliedPending) await applyPerformanceOptions(profileGameRoot, appSettings.performance);
          }
          catch (performanceError) { logLines.push(`Performance preset apply error: ${plainError(performanceError)}`); }
          await writeLaunchLog(profile, logLines, Number(payload));
          if (mainWindow && !mainWindow.isDestroyed() && appSettings.hideLauncherOnGameStart) { mainWindow.show(); mainWindow.focus(); }
          send('launcher:status', { state: 'closed', code: Number(payload), message: Number(payload) === 0 ? 'Minecraft closed normally.' : `Minecraft closed with exit code ${payload}.` });
        }
      });
      send('launcher:status', { state: 'installing', message: launchServer ? `Preparing ${launchServer.name} and connecting…` : `Checking and installing Minecraft ${request.version} (${request.loader})…` });
      await launcher.launch();
      const rootStat = await fs.stat(profileGameRoot).catch(() => null);
      const installedNow = await hasInstalledProfileVersion(profileGameRoot, { ...profile, loaderVersion: request.loaderVersion });
      logLines.push(`Post-launch path audit: rootExists=${Boolean(rootStat?.isDirectory())}; matchingVersionInstalled=${installedNow}; path=${profileGameRoot}`);
      logLines.push(`Minecraft process exited. Profile folder: ${profileGameRoot}; matchingVersionInstalled=${installedNow}.`);
      return { started: true, version: request.version, profile: profile.name, folder: profileGameRoot, installed: installedNow };
    } catch (error) {
      launcherRunning = false;
      await writeLaunchLog(profile, logLines, -1, detailedError(error));
      send('launcher:status', { state: 'error', message: plainError(error) });
      throw new Error(plainError(error), { cause: error });
    } finally {
      if (changedWorkingDirectory) {
        try { process.chdir(previousWorkingDirectory); }
        catch (cwdError) { console.error('[CRYON CLIENT] Could not restore working directory:', cwdError); }
      }
    }
  });
}
async function writeLaunchLog(profile, lines, exitCode, error = '') {
  await ensureDir(LOG_DIR());
  const filename = `cryon-${String(profile?.name || 'launch').toLowerCase().replace(/[^a-z0-9]+/g, '-')}-${new Date().toISOString().replace(/[:.]/g, '-')}.log`;
  const header = [`CRYON CLIENT launch log`, `App version: ${app.getVersion()}`, `Profile: ${profile?.name || 'unknown'}`, `Minecraft: ${profile?.version || 'unknown'}`, `Loader: ${profile?.loader || 'unknown'} ${profile?.loaderVersion || ''}`, `Exit code: ${exitCode}`, error ? `Error: ${error}` : '', '---'].filter(Boolean).join('\n');
  await fs.writeFile(path.join(LOG_DIR(), filename), `${header}\n${lines.join('\n')}`, 'utf8');
}
async function writeCrashLog(payload) { await ensureDir(LOG_DIR()); const filename = `cryon-crash-${new Date().toISOString().replace(/[:.]/g, '-')}.log`; const body = typeof payload === 'string' ? payload : JSON.stringify(payload, null, 2); await fs.writeFile(path.join(LOG_DIR(), filename), body || 'Minecraft crash reported without details.', 'utf8'); }

function registerModHandlers() {
  ipcMain.handle('mods:list', async () => listInstalledMods(appSettings));
  ipcMain.handle('mods:search', async (_event, query, options = {}) => searchModrinth({
    query: String(query || '').slice(0, 80), settings: appSettings, index: String(options?.index || 'downloads'),
  }));
  ipcMain.handle('catalog:search', async (_event, query, options = {}) => searchModrinthContent({
    query: String(query || '').slice(0, 80), settings: appSettings, index: String(options?.index || 'downloads'), type: String(options?.type || 'mod'),
  }));
  ipcMain.handle('catalog:versions', async (_event, projectId, type = 'mod', channel = 'release') => getModrinthContentVersions({
    projectId: String(projectId || ''), settings: appSettings, type: String(type || 'mod'), channel: String(channel || 'release'),
  }));
  ipcMain.handle('catalog:install', async (_event, projectId, type = 'mod', versionId = null, channel = 'release', worldFolder = null) => {
    const contentType = String(type || 'mod');
    const result = await installModrinthContent({
      projectId: String(projectId || ''), settings: appSettings, type: contentType, versionId: versionId ? String(versionId) : null, channel: String(channel || 'release'), worldFolder: worldFolder ? String(worldFolder) : null,
    });
    if (contentType === 'modpack' && result.loaderVersion) {
      const active = getActiveProfile(appSettings);
      if (active && active.loaderVersion !== result.loaderVersion) {
        appSettings.profiles = appSettings.profiles.map(profile => profile.id === active.id ? { ...profile, loaderVersion: result.loaderVersion } : profile);
        appSettings = sanitizeSettings(appSettings); await persistSettings();
      }
      return { ...result, settings: appSettings };
    }
    return result;
  });
  ipcMain.handle('catalog:list', async (_event, type = 'mod', worldFolder = null) => listInstalledContent(appSettings, String(type || 'mod'), worldFolder ? String(worldFolder) : null));
  ipcMain.handle('catalog:toggle', async (_event, type, filename, enabled, worldFolder = null) => setContentEnabled(appSettings, String(type || 'mod'), String(filename || ''), Boolean(enabled), worldFolder ? String(worldFolder) : null));
  ipcMain.handle('catalog:remove', async (_event, type, filename, worldFolder = null) => removeInstalledContent(appSettings, String(type || 'mod'), String(filename || ''), worldFolder ? String(worldFolder) : null));
  ipcMain.handle('catalog:worlds', async () => listProfileWorlds(appSettings));
  ipcMain.handle('mods:versions', async (_event, projectId, channel = 'release') => getModrinthProjectVersions({
    projectId: String(projectId || ''), settings: appSettings, channel: String(channel || 'release'),
  }));
  ipcMain.handle('mods:install', async (_event, projectId, versionId = null, channel = 'release') => installModrinthProject({
    projectId: String(projectId || ''), versionId: versionId ? String(versionId) : null,
    channel: String(channel || 'release'), settings: appSettings,
  }));
  ipcMain.handle('mods:update-one', async (_event, projectId, channel = 'release') => updateModrinthProject({
    projectId: String(projectId || ''), channel: String(channel || 'release'), settings: appSettings,
  }));
  ipcMain.handle('mods:remove', async (_event, filename) => removeInstalledMod(appSettings, String(filename || '')));
  ipcMain.handle('mods:toggle', async (_event, filename, enabled) => setModEnabled(appSettings, String(filename || ''), Boolean(enabled)));
  ipcMain.handle('mods:backup', async () => backupMods(appSettings));
  ipcMain.handle('mods:backups:list', async () => listModBackups(appSettings));
  ipcMain.handle('mods:backup:restore', async (_event, backupId) => restoreModBackup(appSettings, String(backupId || '')));
  ipcMain.handle('mods:updates', async (_event, channel = 'release') => checkModUpdates(appSettings, String(channel || 'release')));
  ipcMain.handle('mods:import-local', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Import a Minecraft mod JAR',
      properties: ['openFile'],
      filters: [{ name: 'Minecraft mod JAR', extensions: ['jar'] }],
    });
    if (result.canceled || !result.filePaths?.[0]) return null;
    return importLocalMod(appSettings, result.filePaths[0]);
  });
}
function currentServerStatuses() {
  return Object.fromEntries([...recentServerStatuses.entries(), ...[...runningServerProcesses.entries()].map(([id, entry]) => [id, entry.status || 'starting'])]);
}
function publishServerStatus(id, status, message = '') {
  recentServerStatuses.set(id, status);
  send('server:status', { id, status, message });
}
function persistServerOutput(id, stream, text) {
  const logPath = path.join(SERVER_ROOT(), id, 'logs', 'cryon-supervisor.log');
  const previous = serverLogQueues.get(id) || Promise.resolve();
  const task = previous.catch(() => {}).then(async () => {
    await fs.mkdir(path.dirname(logPath), { recursive: true });
    await fs.appendFile(logPath, `[${new Date().toISOString()}] [${stream}] ${text}`, 'utf8');
  });
  serverLogQueues.set(id, task);
  task.finally(() => { if (serverLogQueues.get(id) === task) serverLogQueues.delete(id); }).catch(() => {});
}
function appendServerOutput(id, stream, chunk) {
  const text = String(chunk || '').slice(-12000);
  if (!text) return;
  persistServerOutput(id, stream, text);
  send('server:log', { id, stream, text, time: new Date().toISOString() });
  const entry = runningServerProcesses.get(id);
  if (entry) {
    entry.startupBuffer = `${entry.startupBuffer || ''}${text}`.slice(-16000);
    if (entry.status === 'starting' && /Done\s+\([^)]+\)!/i.test(entry.startupBuffer)) {
      entry.ready = true;
      entry.status = 'running';
      if (entry.startupTimer) clearTimeout(entry.startupTimer);
      publishServerStatus(id, 'running', 'Minecraft finished startup and is ready for connections.');
    }
    const failure = entry.startupBuffer.match(/(Invalid or corrupt jarfile[^\r\n]*|UnsupportedClassVersionError[^\r\n]*|A JNI error has occurred[^\r\n]*|Could not reserve enough space[^\r\n]*|Unable to access jarfile[^\r\n]*)/i);
    if (failure && !entry.ready) entry.failureMessage = failure[1];
  }
}

async function checkServerPortAvailable(port) {
  await new Promise((resolve, reject) => {
    const tester = net.createServer();
    tester.once('error', error => reject(new Error(`Port ${port} is unavailable: ${error.code === 'EADDRINUSE' ? 'another application is already using it' : plainError(error)}.`)));
    tester.listen({ port, host: '0.0.0.0', exclusive: true }, () => tester.close(error => error ? reject(error) : resolve()));
  });
}

function waitForServerClose(child, timeoutMs) {
  return new Promise((resolve, reject) => {
    if (child.exitCode !== null || child.signalCode) return resolve(true);
    let settled = false;
    const finish = value => { if (settled) return; settled = true; clearTimeout(timer); child.removeListener('close', onClose); resolve(value); };
    const onClose = () => finish(true);
    const timer = setTimeout(() => finish(false), timeoutMs);
    child.once('close', onClose);
  });
}

async function startLocalServer(serverId) {
  const id = String(serverId || '');
  if (runningServerProcesses.has(id)) throw new Error('This server is already running or starting.');
  const { directory, metadata } = await readServerMetadata(SERVER_ROOT(), id);
  const eula = await fs.readFile(path.join(directory, 'eula.txt'), 'utf8').catch(() => '');
  if (!/^eula=true\s*$/im.test(eula)) throw new Error('Minecraft EULA has not been accepted for this server. Open its eula.txt file and set eula=true after reading the EULA.');
  const jarName = String(metadata.jarFile || 'server.jar');
  if (path.basename(jarName) !== jarName || !jarName.toLowerCase().endsWith('.jar')) throw new Error('This server has an invalid launch JAR setting.');
  const jarPath = path.join(directory, jarName);
  const jarStat = await fs.lstat(jarPath).catch(() => null);
  if (!jarStat?.isFile() || jarStat.isSymbolicLink() || jarStat.size < 100 * 1024) throw new Error(`Server JAR is missing or incomplete (${jarName}). Re-create the server download before starting it.`);
  const jarHandle = await fs.open(jarPath, 'r');
  try { const header = Buffer.alloc(4); await jarHandle.read(header, 0, 4, 0); if (header[0] !== 0x50 || header[1] !== 0x4b) throw new Error('Server JAR is not a valid ZIP/JAR archive. The download may be an error page; delete and recreate this server.'); } finally { await jarHandle.close(); }
  const properties = await fs.readFile(path.join(directory, 'server.properties'), 'utf8').catch(() => '');
  const portMatch = properties.match(/^server-port\s*=\s*(\d+)/mi);
  const port = Number(portMatch?.[1] || metadata.port || 25565);
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('This server has an invalid port in server.properties.');
  await checkServerPortAvailable(port);
  const requiredMajor = requiredJavaMajor(metadata.version);
  const explicitServerJava = String(metadata.javaPath || '').trim();
  const preferredJavaPath = explicitServerJava || appSettings.javaPath || '';
  let java = await detectJava(preferredJavaPath);
  if (!java.found || Number(java.major) < requiredMajor) {
    if (explicitServerJava) throw new Error(`This server is assigned Java ${java.major || 'unknown'}, but Minecraft ${metadata.version} needs Java ${requiredMajor} or newer. Change this server's Java Runtime selection.`);
    const discovered = await listJavaRuntimes({ configuredPath: appSettings.javaPath || '', managedDirectory: path.join(app.getPath('userData'), 'runtimes') });
    const compatible = discovered.filter(runtime => Number(runtime.major) >= requiredMajor).sort((a, b) => (a.major === requiredMajor ? -1 : b.major === requiredMajor ? 1 : a.major - b.major));
    if (compatible.length) java = { ...compatible[0], found: true, message: `Java ${compatible[0].major} detected` };
  }
  if (!java.found || !Number.isInteger(Number(java.major)) || Number(java.major) < requiredMajor) {
    const managedJavaPath = [8, 16, 17, 21, 25].includes(requiredMajor) ? await getManagedJavaExecutable(app.getPath('userData'), process.platform, requiredMajor) : null;
    if (managedJavaPath) {
      const managedJava = await detectJava(managedJavaPath);
      if (managedJava.found && Number(managedJava.major) >= requiredMajor) java = managedJava;
    }
  }
  if (!java.found || !Number.isInteger(Number(java.major)) || Number(java.major) < requiredMajor) {
    throw new Error(`Minecraft ${metadata.version} requires Java ${requiredMajor} or newer. No compatible runtime was found. Open Create Server → Java Runtime and install Java ${requiredMajor}, or select an installed compatible runtime.`);
  }
  const system = await getLocalSystemInfo();
  const runningAllocations = [...runningServerProcesses.entries()].filter(([otherId]) => otherId !== id).map(([, entry]) => entry.memoryMb || 0);
  const requestedMemoryMb = Number(metadata.memoryMb) || 2048;
  const memoryCheck = checkServerMemoryAvailability({
    availableMemoryMb: system.availableMemoryMb,
    requestedMemoryMb,
    runningAllocationsMb: runningAllocations,
  });
  if (!memoryCheck.canStart) {
    const formatGb = value => `${(value / 1024).toFixed(2)} GB`;
    throw new Error(`Not enough RAM to start this server. It requests ${formatGb(requestedMemoryMb)} heap`+
      `${memoryCheck.otherRunningAllocationsMb ? ` plus ${formatGb(memoryCheck.otherRunningAllocationsMb)} allocated to other running CRYON servers` : ''}, `+
      `but Windows currently reports only ${formatGb(memoryCheck.availableMemoryMb)} available. `+
      `Free RAM by closing apps or stopping another server, then try Start again.`);
  }
  const executable = java.executable;
  const jvmArgs = buildServerJvmArgs({ memoryMb: requestedMemoryMb, javaMajor: java.major, performancePreset: metadata.performancePreset || 'balanced' });
  appendServerOutput(id, 'system', `[CRYON] Runtime selected: Java ${java.major} (${java.executable}) · JVM preset: ${metadata.performancePreset || 'balanced'}\n`);
  const child = spawn(executable, [...jvmArgs, '-jar', jarName, 'nogui'], {
    cwd: directory, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'],
  });
  const entry = { child, status: 'starting', memoryMb: requestedMemoryMb, startedAt: new Date().toISOString(), ready: false, startupBuffer: '', failureMessage: null };
  runningServerProcesses.set(id, entry);
  publishServerStatus(id, 'starting', `Launching with Java ${java.major || java.version || 'runtime'} · ${requestedMemoryMb} MB heap · port ${port}. Waiting for Minecraft readiness…`);
  child.stdout?.on('data', chunk => appendServerOutput(id, 'stdout', chunk));
  child.stderr?.on('data', chunk => appendServerOutput(id, 'stderr', chunk));
  child.stdin?.on('error', error => appendServerOutput(id, 'system', `[CRYON] Console input closed: ${plainError(error)}\n`));
  child.once('spawn', () => appendServerOutput(id, 'system', `[CRYON] Java process spawned (PID ${child.pid || 'unknown'}). Minecraft is still starting.\n`));
  child.once('error', error => {
    entry.failureMessage = plainError(error);
    appendServerOutput(id, 'stderr', `[CRYON] Could not start Java: ${plainError(error)}\n`);
  });
  child.once('close', (code, signal) => {
    if (entry.startupTimer) clearTimeout(entry.startupTimer);
    runningServerProcesses.delete(id);
    const failed = isUnexpectedServerExit({ ready: entry.ready, stopRequested: entry.stopRequested, code, signal });
    const status = failed ? 'error' : 'offline';
    const phase = entry.ready ? 'after Minecraft became ready' : 'before Minecraft became ready';
    const message = failed
      ? `${entry.failureMessage ? `Startup error: ${entry.failureMessage}. ` : ''}Server exited unexpectedly ${phase} (code ${code ?? 'unknown'}${signal ? `, signal ${signal}` : ''}). Check Console; CRYON kept the startup output for diagnosis.`
      : `Server process exited (${code ?? signal ?? 'unknown'}).`;
    publishServerStatus(id, status, message);
    appendServerOutput(id, 'system', `\n[CRYON] ${message}\n`);
  });
  entry.startupTimer = setTimeout(() => {
    if (runningServerProcesses.get(id) === entry && !entry.ready) {
      const warning = 'Startup is taking longer than expected. Check Java errors, missing dependencies or world-generation progress in the console.';
      appendServerOutput(id, 'system', `[CRYON] ${warning}\n`);
      publishServerStatus(id, 'starting', warning);
    }
  }, 120000);
  return { id, status: 'starting', pid: child.pid || null, javaMajor: java.major, memoryMb: requestedMemoryMb, port };
}

async function stopLocalServer(serverId) {
  const id = String(serverId || '');
  const entry = runningServerProcesses.get(id);
  if (!entry) { publishServerStatus(id, 'offline', 'No Java server process is running.'); return { id, status: 'offline' }; }
  if (entry.status !== 'stopping') {
    entry.stopRequested = true;
    entry.status = 'stopping'; publishServerStatus(id, 'stopping', 'Sending the Minecraft stop command…');
    try { if (entry.child.stdin?.writable) entry.child.stdin.write('stop\n'); } catch { /* The process may already have closed stdin. */ }
  }
  let closed = await waitForServerClose(entry.child, 20000);
  if (!closed) {
    appendServerOutput(id, 'system', '[CRYON] Graceful shutdown timed out; requesting process termination.\n');
    try { entry.child.kill('SIGTERM'); } catch { /* The process may already have exited. */ }
    closed = await waitForServerClose(entry.child, 7000);
  }
  if (!closed) {
    try { entry.child.kill('SIGKILL'); } catch { /* The process may already have exited. */ }
    closed = await waitForServerClose(entry.child, 5000);
  }
  if (!closed) throw new Error('CRYON sent termination signals but the Java process has not confirmed exit. It remains tracked; do not delete its server folder yet.');
  if (entry.startupTimer) clearTimeout(entry.startupTimer);
  if (runningServerProcesses.get(id) === entry) runningServerProcesses.delete(id);
  publishServerStatus(id, 'offline', 'Server process has fully exited.');
  return { id, status: 'offline' };
}

function publishPlayitStatus(message = playitStatus.message) {
  playitStatus = { ...playitStatus, installed: Boolean(playitStatus.installed), running: Boolean(playitProcess && playitProcess.exitCode === null), message };
  send('playit:status', { ...playitStatus });
}

function appendPlayitLog(text) {
  const value = String(text || '').slice(-8000);
  if (!value) return;
  const plain = value.replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, '').replace(/\u001b\][^\u0007]*(?:\u0007|\u001b\\)/g, '');
  playitLogTail.push(plain);
  while (playitLogTail.length > 160) playitLogTail.shift();
  const combined = playitLogTail.join('');
  const claimUrl = combined.match(/https:\/\/(?:www\.)?playit\.gg\/(?:claim|account\/setup)[^\s"'<>]*/i)?.[0] || null;
  const detectedAddress = combined.match(/\b[a-z0-9-]+(?:\.[a-z0-9-]+)*\.(?:joinmc\.link|playit\.gg)(?::\d{1,5})?\b/i)?.[0] || null;
  if (claimUrl && /^https:\/\/(?:www\.)?playit\.gg\//i.test(claimUrl)) playitStatus.claimUrl = claimUrl.replace(/[),.;]+$/, '');
  if (detectedAddress) playitStatus.detectedAddress = detectedAddress;
  send('playit:log', { text: plain, claimUrl: playitStatus.claimUrl, detectedAddress: playitStatus.detectedAddress });
  if (claimUrl || detectedAddress) publishPlayitStatus(claimUrl ? 'Playit agent needs account authorization. Open the claim link.' : 'Playit tunnel address detected.');
}

async function stopPlayitAgent() {
  const child = playitProcess;
  if (!child || child.exitCode !== null) { playitProcess = null; publishPlayitStatus('Playit agent is stopped.'); return { running: false }; }
  try { child.kill('SIGTERM'); } catch { /* It may have closed between the check and signal. */ }
  const closed = await new Promise(resolve => {
    if (child.exitCode !== null) return resolve(true);
    let done = false;
    const finish = value => { if (done) return; done = true; clearTimeout(timer); child.removeListener('close', onClose); resolve(value); };
    const onClose = () => finish(true);
    const timer = setTimeout(() => finish(false), 5000);
    child.once('close', onClose);
  });
  if (!closed) { try { child.kill('SIGKILL'); } catch { /* Already terminated. */ } }
  playitProcess = null;
  publishPlayitStatus(closed ? 'Playit agent stopped.' : 'Playit agent termination was requested.');
  return { running: false, confirmed: closed };
}

function registerServerHandlers() {
  ipcMain.handle('playit:status', async () => {
    const executable = await getPlayitAgentPath(app.getPath('userData'));
    playitStatus.installed = Boolean(executable);
    playitStatus.running = Boolean(playitProcess && playitProcess.exitCode === null);
    return { ...playitStatus, logs: playitLogTail.slice(-80).join('') };
  });
  ipcMain.handle('playit:download', async () => {
    const installed = await downloadPlayitAgent(app.getPath('userData'), progress => send('playit:download-progress', progress));
    playitStatus.installed = true;
    playitStatus.version = installed.version;
    publishPlayitStatus(`Playit ${installed.version} installed and checksum verified.`);
    return installed;
  });
  ipcMain.handle('playit:start', async () => {
    if (playitProcess && playitProcess.exitCode === null) return { running: true, claimUrl: playitStatus.claimUrl };
    const executable = await getPlayitAgentPath(app.getPath('userData'));
    if (!executable) throw new Error('Playit agent is not installed. Use Download Playit Agent first.');
    playitLogTail.length = 0;
    playitStatus = { ...playitStatus, installed: true, claimUrl: null, detectedAddress: null, message: 'Starting Playit agent…' };
    // Playit's official CLI supports --stdout to stream logs rather than its TUI.
    // With no installed service on Windows, the portable CLI starts its bundled
    // daemon and walks the user through the browser claim flow.
    const child = spawn(executable, ['--stdout'], { cwd: path.dirname(executable), windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    playitProcess = child;
    child.stdout?.on('data', chunk => appendPlayitLog(chunk));
    child.stderr?.on('data', chunk => appendPlayitLog(chunk));
    child.once('error', error => {
      appendPlayitLog(`[CRYON] Could not start Playit: ${plainError(error)}\n`);
      playitProcess = null;
      publishPlayitStatus(`Playit failed to start: ${plainError(error)}`);
    });
    child.once('close', (code, signal) => {
      if (playitProcess === child) playitProcess = null;
      publishPlayitStatus(`Playit agent exited (${code ?? signal ?? 'unknown'}).`);
    });
    publishPlayitStatus('Playit agent started. Complete account claim if a link appears, then create a Minecraft Java tunnel.');
    return { running: true };
  });
  ipcMain.handle('playit:stop', async () => stopPlayitAgent());
  ipcMain.handle('playit:open-dashboard', async () => { await shell.openExternal('https://playit.gg/account/tunnels'); return true; });
  ipcMain.handle('playit:open-claim', async (_event, rawUrl) => {
    const url = new URL(String(rawUrl || ''));
    if (url.protocol !== 'https:' || !['playit.gg', 'www.playit.gg'].includes(url.hostname) || !/^\/(?:claim|account\/setup)\//i.test(url.pathname)) throw new Error('This is not a verified Playit authorization URL.');
    await shell.openExternal(url.toString());
    return true;
  });
  ipcMain.handle('server:public-address:save', async (_event, id, rawAddress) => updateServerPublicAddress(SERVER_ROOT(), String(id || ''), normalizePlayitAddress(rawAddress)) );
  ipcMain.handle('server:system-info' , async () => getLocalSystemInfo());
  ipcMain.handle('server:process-metrics', async (_event, id) => {
    const entry = runningServerProcesses.get(String(id || ''));
    if (!entry?.child?.pid || entry.child.exitCode !== null) return { available: false, cpuPercent: null, memoryMb: null, note: 'Server is not running.' };
    return getServerProcessMetrics(entry.child.pid);
  });
  ipcMain.handle('server:list', async () => listLocalServers(SERVER_ROOT(), currentServerStatuses()));
  ipcMain.handle('server:create', async (_event, raw) => {
    const serverVersion = String(raw?.version || '');
    const requiredMajor = requiredJavaMajor(serverVersion);
    const javaPath = String(raw?.javaPath || '').trim();
    if (javaPath) {
      const selectedJava = await detectJava(javaPath);
      if (!selectedJava.found) throw new Error(`Selected Java runtime could not be started: ${selectedJava.message}`);
      if (Number(selectedJava.major) < requiredMajor) throw new Error(`Minecraft ${serverVersion} requires Java ${requiredMajor} or newer; selected Java is ${selectedJava.major}.`);
    }
    // Allow users to configure up to the full installed RAM. Current free RAM
    // is intentionally checked only when they press Start.
    const memoryMb = Number(raw?.memoryMb);
    return createLocalServer({
      serverRoot: SERVER_ROOT(), name: String(raw?.name || ''), version: String(raw?.version || ''),
      software: String(raw?.software || ''), memoryMb, javaPath, performancePreset: String(raw?.performancePreset || 'balanced'),
      port: Number(raw?.port || 25565), maxPlayers: Number(raw?.maxPlayers || 20), acceptEula: raw?.acceptEula === true,
      motd: String(raw?.motd || '§bCRYON Server'), onlineMode: raw?.onlineMode !== false, whitelist: raw?.whitelist === true,
      difficulty: String(raw?.difficulty || 'easy'), gameMode: String(raw?.gameMode || 'survival'),
      viewDistance: Number(raw?.viewDistance || 8), simulationDistance: Number(raw?.simulationDistance || 6),
      pvp: raw?.pvp !== false, allowFlight: raw?.allowFlight === true, spawnProtection: Number(raw?.spawnProtection ?? 16),
      worldSeed: String(raw?.worldSeed || '').slice(0, 64), worldType: String(raw?.worldType || 'default'),
      generateStructures: raw?.generateStructures !== false, hardcore: raw?.hardcore === true,
      allowNether: raw?.allowNether !== false, enableCommandBlocks: raw?.enableCommandBlocks === true,
      onProgress: payload => send('server:create-progress', payload),
    });
  });
  ipcMain.handle('server:start', async (_event, id) => {
    const serverId = String(id || '');
    try { return await startLocalServer(serverId); }
    catch (error) { appendServerOutput(serverId, 'system', `[CRYON] START FAILED: ${plainError(error)}\n`); publishServerStatus(serverId, 'error', plainError(error)); throw error; }
  });
  ipcMain.handle('server:stop', async (_event, id) => stopLocalServer(id));
  ipcMain.handle('server:restart', async (_event, id) => {
    const serverId = String(id || '');
    try { await stopLocalServer(serverId); return await startLocalServer(serverId); }
    catch (error) { appendServerOutput(serverId, 'system', `[CRYON] RESTART FAILED: ${plainError(error)}\n`); publishServerStatus(serverId, 'error', plainError(error)); throw error; }
  });
  ipcMain.handle('server:command', async (_event, id, rawCommand) => {
    const entry = runningServerProcesses.get(String(id || ''));
    const command = String(rawCommand || '').trim();
    if (!entry || !['running', 'starting'].includes(entry.status)) throw new Error('Start this server before sending commands.');
    if (!command || command.length > 1024 || /[\r\n\0]/.test(command)) throw new Error('Enter one server command (maximum 1024 characters).');
    if (!entry.child.stdin?.writable) throw new Error('The server console input is not available.');
    entry.child.stdin.write(`${command}\n`);
    return true;
  });
  ipcMain.handle('server:delete', async (_event, id) => {
    const serverId = String(id || '');
    await stopLocalServer(serverId);
    const { directory } = await readServerMetadata(SERVER_ROOT(), serverId);
    await fs.rm(directory, { recursive: true, force: false });
    recentServerStatuses.delete(serverId);
    return true;
  });
  ipcMain.handle('server:backup:create', async (_event, id) => {
    const serverId = String(id || '');
    if (runningServerProcesses.has(serverId)) throw new Error('Stop the server before creating a consistent world backup.');
    return createServerBackup(SERVER_ROOT(), serverId);
  });
  ipcMain.handle('server:backup:list', async (_event, id) => listServerBackups(SERVER_ROOT(), String(id || '')));
  ipcMain.handle('server:backup:restore', async (_event, id, backupId) => {
    const serverId = String(id || '');
    if (runningServerProcesses.has(serverId)) throw new Error('Stop the server before restoring a backup.');
    return restoreServerBackup(SERVER_ROOT(), serverId, String(backupId || ''));
  });
  ipcMain.handle('server:open-folder', async (_event, id) => {
    const { directory } = await readServerMetadata(SERVER_ROOT(), String(id || ''));
    const error = await shell.openPath(directory); if (error) throw new Error(error); return directory;
  });
  ipcMain.handle('server:files:list', async (_event, id, relativePath = '') => listServerFiles(SERVER_ROOT(), String(id || ''), String(relativePath || '')));
  ipcMain.handle('server:files:read', async (_event, id, relativePath) => readServerTextFile(SERVER_ROOT(), String(id || ''), String(relativePath || '')));
  ipcMain.handle('server:files:write', async (_event, id, relativePath, content) => writeServerTextFile(SERVER_ROOT(), String(id || ''), String(relativePath || ''), content));
  ipcMain.handle('server:files:remove', async (_event, id, relativePath) => removeServerFile(SERVER_ROOT(), String(id || ''), String(relativePath || '')));
  ipcMain.handle('server:files:upload', async (_event, id, relativeDirectory = '') => {
    const result = await dialog.showOpenDialog(mainWindow, { title: 'Upload file to server folder', properties: ['openFile'] });
    if (result.canceled || !result.filePaths?.[0]) return null;
    return uploadServerFile(SERVER_ROOT(), String(id || ''), String(relativeDirectory || ''), result.filePaths[0]);
  });
  ipcMain.handle('server:plugins:list', async (_event, id) => listInstalledServerPlugins(SERVER_ROOT(), String(id || '')));
  ipcMain.handle('server:plugins:search', async (_event, id, query) => {
    const { metadata } = await readServerMetadata(SERVER_ROOT(), String(id || ''));
    if (!['paper', 'purpur'].includes(metadata.software)) throw new Error('Plugin search is available for Paper and Purpur servers only.');
    return searchModrinthPlugins(String(query || ''), metadata.version);
  });
  ipcMain.handle('server:plugins:download', async (_event, id, projectId) => {
    const { metadata } = await readServerMetadata(SERVER_ROOT(), String(id || ''));
    return downloadModrinthPlugin(SERVER_ROOT(), String(id || ''), String(projectId || ''), metadata.version);
  });
  ipcMain.handle('server:mods:search', async (_event, id, query) => {
    const { metadata } = await readServerMetadata(SERVER_ROOT(), String(id || ''));
    if (metadata.software !== 'fabric') throw new Error('Mod search is available for Fabric servers only.');
    return searchModrinthServerMods(String(query || ''), metadata.version);
  });
  ipcMain.handle('server:mods:download', async (_event, id, projectId) => {
    const { metadata } = await readServerMetadata(SERVER_ROOT(), String(id || ''));
    return downloadModrinthServerMod(SERVER_ROOT(), String(id || ''), String(projectId || ''), metadata.version);
  });
  ipcMain.handle('server:plugins:import', async (_event, id) => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Install a server plugin JAR', properties: ['openFile'],
      filters: [{ name: 'Minecraft plugin JAR', extensions: ['jar'] }],
    });
    if (result.canceled || !result.filePaths?.[0]) return null;
    return installLocalPlugin(SERVER_ROOT(), String(id || ''), result.filePaths[0]);
  });
  ipcMain.handle('server:ping', async (_event, id) => {
    const { metadata } = await readServerMetadata(SERVER_ROOT(), String(id || ''));
    let port = Number(metadata.port) || 25565;
    try { const props = await fs.readFile(path.join(SERVER_ROOT(), String(id), 'server.properties'), 'utf8'); const match = props.match(/^server-port\s*=\s*(\d+)/m); if (match) port = Number(match[1]); } catch { /* Keep metadata default. */ }
    const result = await pingMinecraftServer(port);
    const entry = runningServerProcesses.get(String(id || ''));
    if (result.online && entry?.status === 'starting') {
      entry.ready = true;
      entry.status = 'running';
      if (entry.startupTimer) clearTimeout(entry.startupTimer);
      publishServerStatus(String(id || ''), 'running', 'Minecraft responded to a live status ping and is ready for connections.');
    }
    return result;
  });
}


function requireMicrosoftSkinAccount() {
  const metadata = accountProfiles.find(item => item.id === activeAccountId);
  if (!activeAccount || metadata?.type !== 'microsoft') {
    throw new Error('Sign in with a Microsoft account that owns Minecraft: Java Edition to upload an official skin. Local/offline accounts can only preview skin files.');
  }
  return activeAccount;
}

async function createSkinManager() {
  const account = requireMicrosoftSkinAccount();
  const eml = await import('eml-lib');
  const Skin = eml.Skin || eml.default?.Skin;
  if (typeof Skin !== 'function') throw new Error('Skin management is unavailable in the installed EML Lib version. Update the launcher dependencies and try again.');
  return new Skin(account);
}

function summarizeActiveSkin(skins) {
  const list = Array.isArray(skins) ? skins : (skins ? [skins] : []);
  const active = list.find(item => String(item?.state || '').toUpperCase() === 'ACTIVE') || list[0] || null;
  let url = null;
  try { const parsed = new URL(active?.url || ''); if (parsed.protocol === 'https:') url = parsed.toString(); } catch { /* no active skin URL */ }
  return active && url ? { url, variant: String(active.variant || 'CLASSIC').toLowerCase(), state: String(active.state || 'ACTIVE') } : null;
}

function registerSkinHandlers() {
  ipcMain.handle('skin:pick-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      title: 'Choose a Minecraft skin PNG', properties: ['openFile'],
      filters: [{ name: 'Minecraft skin PNG', extensions: ['png'] }],
    });
    if (result.canceled || !result.filePaths?.[0]) return null;
    const filePath = result.filePaths[0];
    const stat = await fs.stat(filePath);
    if (!stat.isFile() || stat.size > 5 * 1024 * 1024) throw new Error('Choose a PNG skin file no larger than 5 MB.');
    const buffer = await fs.readFile(filePath);
    const details = inspectMinecraftSkin(buffer);
    const image = nativeImage.createFromBuffer(buffer);
    if (image.isEmpty()) throw new Error('Windows could not decode this PNG. Please choose a valid Minecraft skin image.');
    const decoded = image.getSize();
    if (decoded.width !== details.width || decoded.height !== details.height) throw new Error('The PNG image dimensions are inconsistent. Choose a valid skin file.');
    pendingSkinUpload = { buffer, fileName: path.basename(filePath).slice(0, 160), accountId: activeAccountId, ...details };
    return {
      fileName: pendingSkinUpload.fileName,
      width: details.width,
      height: details.height,
      legacy: details.legacy,
      variant: details.variant,
      previewUrl: `data:image/png;base64,${buffer.toString('base64')}`,
    };
  });

  ipcMain.handle('skin:get-current', async () => {
    const manager = await createSkinManager();
    const skins = await manager.getSkin(true);
    return summarizeActiveSkin(skins);
  });

  ipcMain.handle('skin:upload', async (_event, rawVariant) => {
    const account = requireMicrosoftSkinAccount();
    if (!pendingSkinUpload?.buffer) throw new Error('Choose a skin PNG before uploading.');
    if (pendingSkinUpload.accountId && pendingSkinUpload.accountId !== activeAccountId) {
      pendingSkinUpload = null;
      throw new Error('The selected skin belongs to a previous account selection. Choose the PNG again.');
    }
    const variant = normalizeSkinVariant(rawVariant, pendingSkinUpload.legacy);
    const manager = await createSkinManager();
    // EML performs the authenticated multipart upload in the Electron main process.
    // The Minecraft access token never crosses the preload/renderer boundary.
    const imageBlob = new Blob([new Uint8Array(pendingSkinUpload.buffer)], { type: 'image/png' });
    await manager.updateSkin(imageBlob, variant);
    pendingSkinUpload = null;
    const skins = await manager.getSkin(true);
    const currentSkin = summarizeActiveSkin(skins);
    send('app:notice', { type: 'success', message: `Skin uploaded successfully for ${account.name || account.username || 'your Minecraft account'}.` });
    return { success: true, currentSkin };
  });
}

function registerFeatureHandlers() {
  ipcMain.handle('performance:get-presets', () => getPerformancePreset('balanced'));
  ipcMain.handle('performance:save', async (_event, value) => {
    appSettings.performance = validatePerformanceSettings(value); appSettings.performancePreset = appSettings.performance.preset; await persistSettings();
    const gameRoot = getGameInstancePath(appSettings, getDefaultGameDirectoryParent(app.getPath('appData')));
    await applyPerformanceOptions(gameRoot, appSettings.performance); return appSettings.performance;
  });
}

async function registerUpdateHandlers() {
  let updater;
  let enabled = false;
  try {
    const config = JSON.parse(await fs.readFile(path.resolve(__dirname, '..', 'configs', 'update-source.json'), 'utf8'));
    enabled = app.isPackaged && process.platform === 'win32' && !process.env.PORTABLE_EXECUTABLE_FILE && !process.env.PORTABLE_EXECUTABLE_DIR && /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(config.repository || '');
    if (enabled) {
      await fs.access(path.join(process.resourcesPath, 'app-update.yml'));
      const imported = await import('electron-updater');
      updater = imported.autoUpdater || imported.default?.autoUpdater;
      if (!updater) throw new Error('Updater unavailable');
    }
  } catch (error) { enabled = false; console.warn('[CRYON updater]', error.message); }
  launcherUpdater = new LauncherUpdater({ updater, enabled, version: app.getVersion(),
    canRestart: () => !launcherRunning && runningServerProcesses.size === 0 && !(playitProcess && playitProcess.exitCode === null),
    onState: value => send('updates:state', value) });
  ipcMain.handle('updates:get-state', () => launcherUpdater.snapshot());
  ipcMain.handle('updates:check', () => launcherUpdater.check());
  ipcMain.handle('updates:install', async () => {
    if (launcherUpdater.snapshot().status !== 'ready') throw new Error('No update is ready.');
    const result = await dialog.showMessageBox(mainWindow, { type: 'question', buttons: ['Restart and update', 'Later'], defaultId: 1, cancelId: 1, message: 'Restart CRYON CLIENT to install the downloaded update?' });
    if (result.response === 0) return launcherUpdater.install();
    return launcherUpdater.snapshot();
  });
  if (enabled) {
    setTimeout(() => launcherUpdater.check(), 5000).unref();
    setInterval(() => launcherUpdater.check(), 5 * 60 * 1000).unref();
  }
}

app.whenReady().then(async () => {
  await loadSettings();
  await partnerStore.refresh();
  // Keep profiles as metadata until PLAY is pressed. EML creates each real
  // isolated game directory and downloads the selected Minecraft version.
  await restoreAccounts();
  if (appSettings.startOnLogin && process.platform !== 'linux') app.setLoginItemSettings({ openAtLogin: true, name: 'CRYON CLIENT' });
  const knownAccountIds = new Set(accountProfiles.map(item => item.id));
  const hasOrphanedAssignments = appSettings.profiles.some(profile => profile.accountId && !knownAccountIds.has(profile.accountId));
  if (hasOrphanedAssignments) { appSettings.profiles = appSettings.profiles.map(profile => profile.accountId && !knownAccountIds.has(profile.accountId) ? { ...profile, accountId: null } : profile); appSettings = sanitizeSettings(appSettings); await persistSettings(); }
  registerBasicHandlers(); registerProfileHandlers(); registerAuthHandlers(); registerSkinHandlers(); registerLauncherHandlers(); registerModHandlers(); registerFeatureHandlers(); registerServerHandlers(); registerPartnerServerHandlers();
  await registerUpdateHandlers();
  await createWindow();
  app.on('activate', async () => { if (BrowserWindow.getAllWindows().length === 0) await createWindow(); });
}).catch(error => { console.error('[CRYON CLIENT] Startup failed:', error); app.quit(); });
app.on('window-all-closed', () => { if (process.platform !== 'darwin') app.quit(); });
let finalQuitAfterServerShutdown = false;
app.on('before-quit', event => {
  launcherRunning = false;
  const activeIds = [...runningServerProcesses.keys()];
  const hasPlayitAgent = Boolean(playitProcess && playitProcess.exitCode === null);
  if ((activeIds.length || hasPlayitAgent) && !finalQuitAfterServerShutdown) {
    event.preventDefault();
    finalQuitAfterServerShutdown = true;
    Promise.allSettled([...activeIds.map(id => stopLocalServer(id)), stopPlayitAgent()]).finally(() => app.quit());
  }
});
