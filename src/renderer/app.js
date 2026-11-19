import { sortPartnerServersByLiveStatus } from '../../modules/partners/partner-ranking.js';
const api = window.nova;
const $ = selector => document.querySelector(selector);
const $$ = selector => [...document.querySelectorAll(selector)];
const state = { settings: null, account: null, accounts: [], versions: [], selectedPreset: 'balanced', performance: null, installedMods: [], modBackups: [], modUpdates: [], modType: 'mod', catalogView: 'browse', catalogLoaded: false, catalogResults: [], selectedWorldFolder: '', profileNameTouched: false, selectedAuthMethod: 'microsoft', servers: [], selectedServerId: null, serverTab: 'console', serverSystemInfo: null, serverJavaRuntimes: [], serverOnlineSince: {}, serverJavaInstallInProgress: false, serverLogs: [], serverFilePath: '', selectedServerFile: null, serverMonitorTimer: null, serverMetricsRefreshing: false, serverMemoryInitialized: false, playitStatus: null, playitClaimUrl: null, playitDownloading: false, javaInstallInProgress: false, selectedSkin: null, currentSkin: null, skinUploading: false, partnerTab: 'partners', partnerServers: [], communityServers: [], partnerServerStatus: {}, partnerPingTimer: null, partnerServersLoaded: false };
let partnerLoadSequence = 0;
const PRESETS = {
  low: { name: 'Low-end PC', renderDistance: 6, particles: 'minimal', entityDistance: 50, clouds: false, smoothLighting: false, vSync: false, fullscreen: false },
  balanced: { name: 'Balanced', renderDistance: 10, particles: 'decreased', entityDistance: 75, clouds: false, smoothLighting: true, vSync: false, fullscreen: false },
  high: { name: 'High FPS', renderDistance: 8, particles: 'minimal', entityDistance: 60, clouds: false, smoothLighting: false, vSync: false, fullscreen: false },
  extreme: { name: 'Extreme FPS', renderDistance: 5, particles: 'minimal', entityDistance: 50, clouds: false, smoothLighting: false, vSync: false, fullscreen: false },
  custom: { name: 'Custom', renderDistance: 10, particles: 'decreased', entityDistance: 75, clouds: false, smoothLighting: true, vSync: false, fullscreen: false },
};

function partnerStatusText(server) {
  const ping = state.partnerServerStatus[server.id];
  if (ping?.online) return `${ping.playersOnline}/${ping.maxPlayers} online${ping.version ? ` · ${ping.version}` : ''}`;
  if (ping) return 'Offline · retrying status';
  return 'Checking server status…';
}

function renderPartnerServers() {
  const host = $('#partner-server-list');
  if (!host) return;
  host.replaceChildren();
  const servers = sortPartnerServersByLiveStatus(state.partnerServers, state.partnerServerStatus);
  // The overview rail shows the configured partner servers only.
  // No placeholder cards are shown; the area stays empty until another partner is added.
  for (const server of servers) {
    const card = document.createElement('article'); card.className = 'partner-server-card featured-partner';
    const logo = document.createElement('div'); logo.className = 'partner-server-logo';
    if (server.logoUrl) {
      const image = document.createElement('img'); image.src = server.logoUrl; image.alt = `${server.name} logo`; image.addEventListener('error', () => { logo.textContent = server.name.slice(0, 1).toUpperCase(); }); logo.append(image);
    } else { const fallback = document.createElement('span'); fallback.textContent = (server.name || 'S').slice(0, 1).toUpperCase(); logo.append(fallback); }
    const info = document.createElement('div'); info.className = 'partner-server-info';
    const titleRow = document.createElement('div'); titleRow.className = 'partner-server-title-row';
    const name = document.createElement('b'); name.textContent = server.name;
    const star = document.createElement('span'); star.className = 'partner-server-star'; star.textContent = '★'; star.title = 'Featured partner'; titleRow.append(name, star);
    const address = document.createElement('small'); address.className = 'partner-server-address'; address.textContent = server.address;
    const status = document.createElement('small'); status.className = 'partner-server-status';
    const ping = state.partnerServerStatus[server.id]; status.dataset.online = ping?.online ? 'true' : ping ? 'false' : 'unknown'; status.textContent = `● ${partnerStatusText(server)}`;
    info.append(titleRow, address, status);
    const actions = document.createElement('div'); actions.className = 'partner-server-actions';
    const play = document.createElement('button'); play.type = 'button'; play.className = 'partner-server-play'; play.textContent = '▶  PLAY';
    play.addEventListener('click', () => launchSelectedServer(server, play));
    actions.append(play); card.append(logo, info, actions); host.append(card);
  }
}

function makePartnerTile(server, isPartner) {
  const card = document.createElement('article');
  card.className = `partner-directory-card${isPartner ? ' featured-partner' : ' community-server'}`;
  card.dataset.serverId = server.id;

  const hero = document.createElement('div');
  hero.className = 'partner-tile-hero';
  hero.dataset.serverId = server.id;

  const backdrop = document.createElement('div'); backdrop.className = 'partner-tile-backdrop';
  if (server.logoUrl) { const bg = document.createElement('img'); bg.src = server.logoUrl; bg.alt = ''; bg.className = 'partner-blurred-logo'; backdrop.append(bg); }
  const emblem = document.createElement('div'); emblem.className = 'partner-tile-emblem';
  if (server.logoUrl) {
    const image = document.createElement('img'); image.src = server.logoUrl; image.alt = `${server.name} logo`; image.addEventListener('error', () => { emblem.textContent = server.name.slice(0, 1).toUpperCase(); }); emblem.append(image);
  } else {
    const initials = document.createElement('span');
    initials.textContent = String(server.name || 'S').split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase();
    emblem.append(initials);
  }
  const kind = document.createElement('span'); kind.className = 'partner-tile-kind'; kind.textContent = isPartner ? '★ FEATURED PARTNER' : 'YOUR SERVER';
  const count = document.createElement('span'); count.className = 'partner-tile-player-count';
  const ping = state.partnerServerStatus[server.id];
  count.dataset.online = ping?.online ? 'true' : ping ? 'false' : 'unknown';
  count.textContent = ping?.online ? `● ${ping.playersOnline} online` : ping ? '● Offline' : '● Checking';
  const play = document.createElement('button'); play.type = 'button'; play.className = 'partner-tile-play'; play.textContent = '▶  PLAY';
  play.addEventListener('click', event => { event.stopPropagation(); launchSelectedServer(server, play); });
  const actionRow = document.createElement('div'); actionRow.className = 'partner-tile-action-row'; actionRow.append(play);
  hero.append(backdrop, emblem, actionRow, kind, count);

  const details = document.createElement('div'); details.className = 'partner-tile-details';
  const logo = document.createElement('div'); logo.className = 'partner-tile-small-logo';
  if (server.iconUrl || server.logoUrl) {
    const image = document.createElement('img'); image.src = server.iconUrl || server.logoUrl; image.alt = ''; image.addEventListener('error', () => { logo.textContent = server.name.slice(0, 1).toUpperCase(); }); logo.append(image);
  } else { logo.textContent = String(server.name || 'S').slice(0, 1).toUpperCase(); }
  const copy = document.createElement('div'); copy.className = 'partner-tile-copy';
  const name = document.createElement('b'); name.textContent = server.name;
  const address = document.createElement('small'); address.textContent = server.address;
  const subtitle = document.createElement('span'); subtitle.textContent = partnerStatusText(server);
  copy.append(name, address, subtitle);
  if (server.description) { const description = document.createElement('small'); description.textContent = server.description; description.title = server.description; copy.append(description); }
  details.append(logo, copy);
  if (!isPartner) {
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'partner-tile-remove'; remove.textContent = '⋯'; remove.title = `Remove ${server.name}`;
    remove.addEventListener('click', async () => {
      if (!confirm(`Remove ${server.name} from Your Servers?`)) return;
      remove.disabled = true;
      try {
        const result = await api.removeCommunityServer(server.id);
        state.communityServers = result.servers || state.communityServers.filter(item => item.id !== server.id);
        delete state.partnerServerStatus[server.id]; renderPartnerServers(); renderPartnerDirectory();
        toast(`${server.name} removed.`);
      } catch (error) { toast(error.message, 'error'); remove.disabled = false; }
    });
    details.append(remove);
  }
  card.append(hero, details);
  return card;
}

function renderPartnerDirectory() {
  const host = $('#partner-directory-grid');
  if (!host) return;
  host.replaceChildren();
  const isPartnerTab = state.partnerTab === 'partners';
  $$('[data-partner-tab]').forEach(button => button.classList.toggle('active', button.dataset.partnerTab === state.partnerTab));
  const profileSelect = $('#partner-launch-profile');
  if (profileSelect) {
    const previousProfile = profileSelect.value;
    profileSelect.replaceChildren();
    const profiles = state.settings?.profiles || [];
    if (!profiles.length) {
      const option = document.createElement('option'); option.value = ''; option.textContent = 'Create a Minecraft profile first'; option.disabled = true; profileSelect.append(option);
    } else {
      for (const profile of profiles) {
        const option = document.createElement('option'); option.value = profile.id;
        option.textContent = `${profile.name} · ${profile.version} · ${String(profile.loader || 'vanilla').toUpperCase()}`;
        profileSelect.append(option);
      }
      const selected = profiles.some(profile => profile.id === previousProfile) ? previousProfile : state.settings?.activeProfileId;
      profileSelect.value = profiles.some(profile => profile.id === selected) ? selected : profiles[0].id;
    }
  }
  const add = $('#partner-add-toggle');
  const form = $('#community-server-form');
  if (add) { add.hidden = isPartnerTab; add.textContent = '＋ Add your server'; }
  $('#partner-manager-bar').hidden = !isPartnerTab;
  if (form) form.hidden = isPartnerTab || form.dataset.open !== 'true';

  const query = ($('#partner-directory-search')?.value || '').trim().toLowerCase();
  let servers = (isPartnerTab ? state.partnerServers : state.communityServers)
    .filter(server => `${server.name} ${server.address}`.toLowerCase().includes(query));
  if ($('#partner-sort-toggle')?.dataset.sort === 'name') {
    servers.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    servers = sortPartnerServersByLiveStatus(servers, state.partnerServerStatus);
  }

  setText('#partner-directory-count', `${servers.length} ${isPartnerTab ? 'FEATURED PARTNER' : 'SAVED SERVER'}${servers.length === 1 ? '' : 'S'}`);
  if (!servers.length) {
    const empty = document.createElement('div'); empty.className = 'partner-directory-empty';
    const title = document.createElement('b'); title.textContent = query ? 'No matching servers' : isPartnerTab ? 'Partner servers are coming soon' : 'Your server list is empty';
    const note = document.createElement('small'); note.textContent = query ? 'Try a different name or server address.' : isPartnerTab ? 'Official partners are managed by the CRYON team.' : 'Add your favourite Minecraft server to keep it close.';
    empty.append(title, note); host.append(empty); return;
  }
  for (const server of servers) host.append(makePartnerTile(server, isPartnerTab));
}

async function launchSelectedServer(server, button) {
  const profiles = state.settings?.profiles || [];
  const preferredId = $('#partner-launch-profile')?.value || state.settings?.activeProfileId;
  const profile = profiles.find(item => item.id === preferredId) || profiles.find(item => item.id === state.settings?.activeProfileId) || profiles[0];
  if (!profile) {
    toast('Create a Minecraft profile before joining a server.', 'warning');
    showPage('profiles');
    return;
  }
  const account = accountForProfile(profile);
  if (!account) {
    toast(`Assign an account to ${profile.name} before joining ${server.name}.`, 'warning');
    showPage('accounts');
    return;
  }
  if (account.type === 'offline') {
    toast(`Using Local account ${account.username}. Only servers that allow offline-mode authentication will accept it.`, 'warning');
  }
  await launchProfile(profile.id, server.id, button);
}

async function loadPartnerServers(force = false) {
  const sequence = ++partnerLoadSequence;
  try {
    const result = await api.listPartnerServers(force);
    if (sequence !== partnerLoadSequence) return;
    const oldAddresses = new Map([...state.partnerServers, ...state.communityServers].map(server => [server.id, server.address]));
    const nextAddresses = new Map([...(result.partners || []), ...(result.community || [])].map(server => [server.id, server.address]));
    for (const id of Object.keys(state.partnerServerStatus)) if (!nextAddresses.has(id) || oldAddresses.get(id) !== nextAddresses.get(id)) delete state.partnerServerStatus[id];
    const warning = $('#partner-config-error'); warning.hidden = !result.error; warning.textContent = result.error || '';
    setText('#partner-sync-status', result.source === 'online' ? 'Synced online · Updates automatically' : result.source === 'cache' ? 'Offline · Last synced list' : 'Bundled partner list');
    state.partnerServers = Array.isArray(result.partners) ? result.partners : [];
    state.communityServers = Array.isArray(result.community) ? result.community : [];
    state.partnerServersLoaded = true;
    renderPartnerServers(); renderPartnerDirectory();
    refreshPartnerServerStatus().catch(() => {});
  } catch (error) {
    if (sequence !== partnerLoadSequence) return;
    const warning = $('#partner-config-error'); warning.hidden = false; warning.textContent = error.message;
    for (const selector of ['#partner-server-list', '#partner-directory-grid']) {
      const host = $(selector); if (!host) continue;
      host.replaceChildren(); const message = document.createElement('div'); message.className = 'partner-server-empty'; message.textContent = `Could not load server list: ${error.message}`; host.append(message);
    }
  }
}
async function refreshPartnerServerStatus() {
  if (!state.partnerServersLoaded) return;
  const sequence = partnerLoadSequence;
  const servers = [...state.partnerServers, ...state.communityServers];
  await Promise.all(servers.map(async server => {
    let status;
    try { status = await api.pingPartnerServer(server.id); }
    catch { status = { id: server.id, online: false, playersOnline: 0, maxPlayers: 0 }; }
    if (sequence === partnerLoadSequence && [...state.partnerServers, ...state.communityServers].some(item => item.id === server.id && item.address === server.address)) state.partnerServerStatus[server.id] = status;
  }));
  if (sequence !== partnerLoadSequence) return;
  renderPartnerServers(); renderPartnerDirectory();
}

function toast(message, type = 'success') {
  const node = document.createElement('div'); node.className = `toast ${type}`; node.textContent = message;
  $('#toast-host').append(node); setTimeout(() => node.remove(), 4200);
}
function setText(selector, value) { const el = $(selector); if (el) el.textContent = value ?? ''; }
function showPage(page) {
  document.body.classList.toggle('home-active', page === 'home');
  $$('.page').forEach(node => node.classList.toggle('active', node.id === `page-${page}`));
  const navPage = page === 'add-version' ? 'profiles' : page === 'add-account' || page === 'cosmetics' ? 'accounts' : page;
  $$('.nav-item[data-page]').forEach(node => node.classList.toggle('active', node.dataset.page === navPage));
  const titles = { home: 'Overview', profiles: 'Profiles', 'add-version': 'Create Profile', accounts: 'Accounts', 'add-account': 'Add Account', partners: 'Partner Servers', mods: 'Mod Manager', performance: 'Performance', cosmetics: 'Skins', servers: 'Create Server', settings: 'Settings' };
  setText('#page-title', titles[page] || 'Overview');
  if (page === 'partners') { renderPartnerDirectory(); loadPartnerServers(); }
  if (page === 'mods' && !state.catalogLoaded) loadCatalog('');
  if (page === 'performance') renderPerformance();
  if (page === 'cosmetics') refreshCurrentSkin().catch(error => setSkinStatus(error.message, 'error'));
  if (state.serverMonitorTimer) { clearInterval(state.serverMonitorTimer); state.serverMonitorTimer = null; }
  if (page === 'servers') { refreshServerPage().catch(error => toast(error.message, 'error')); state.serverMonitorTimer = setInterval(() => refreshServerMetrics().catch(() => {}), 2500); }
}
function updateProfileFromUI() {
  const version = $('#version-select').value;
  const loader = $('#loader-select').value;
  state.settings.minecraftVersion = version;
  state.settings.loader = loader;
  setText('#profile-tag', loader.toUpperCase());
  setText('#home-version', version);
  setText('#mod-filter-tag', `${loader.toUpperCase()} · ${version}`);
  updateHomeProfileSummary();
  setText('#catalog-profile-name', state.settings?.profiles?.find(item => item.id === state.settings.activeProfileId)?.name || 'CRYON Profile');
  setText('#catalog-profile-meta', `Minecraft ${version} · ${loader.toUpperCase()}`);
  const needsModLoader = state.modType === 'mod';
  const supportsCurrentCategory = !needsModLoader || loader !== 'vanilla';
  $('#mod-search-button').disabled = !supportsCurrentCategory;
  $('#import-local-mod').disabled = needsModLoader && loader === 'vanilla';
  $('#check-mod-updates').disabled = needsModLoader && loader === 'vanilla';
  $('#mod-loader-warning').hidden = supportsCurrentCategory;
  const compatibility = loaderCompatibility(version, loader);
  setText('#compatibility-note', compatibility.message);
  $('#play-button').disabled = !compatibility.ok;
  setText('#play-label', 'LAUNCH GAME');
  const launchSub = $('#play-subtitle');
  if (launchSub) launchSub.textContent = loader === 'vanilla' ? 'Minecraft Java Edition' : 'Manage mods & packs';
  const modQuick = $('#home-mods-quick');
  if (modQuick) modQuick.hidden = loader === 'vanilla';
  const modsTab = $('[data-mod-type="mod"]');
  if (modsTab) modsTab.hidden = loader === 'vanilla';
  if (loader === 'vanilla' && state.modType === 'mod') { state.modType = 'resourcepack'; setModType('resourcepack'); }
}
function loaderCompatibility(version, loader) {
  const [major, minor] = version.split('.').map(Number);
  if (loader === 'vanilla') return { ok: true, message: 'Vanilla works across the supported Java Edition versions.' };
  if (loader === 'fabric' && (major < 1 || (major === 1 && minor < 14))) return { ok: false, message: 'Fabric is not available for this legacy version. Choose Forge or Vanilla.' };
  if (loader === 'quilt' && (major < 1 || (major === 1 && minor < 14))) return { ok: false, message: 'Quilt is not available for this legacy version.' };
  if (loader === 'neoforge' && (major < 1 || (major === 1 && minor < 20) || (major === 1 && minor === 20 && Number(version.split('.')[2] || 0) < 2))) return { ok: false, message: 'NeoForge requires Minecraft 1.20.2 or newer.' };
  return { ok: true, message: loader === 'vanilla' ? 'Vanilla profile ready.' : 'A compatible loader build will be detected automatically when possible.' };
}
async function refreshMods() {
  try {
    state.installedMods = state.modType === 'mod' ? await api.listMods() : (state.modType === 'datapack' && !state.selectedWorldFolder ? [] : await api.listCatalogItems(state.modType, state.selectedWorldFolder || null));
    renderInstalledMods();
    if (state.modType === 'mod') setText('#home-mods', state.installedMods.length);
  } catch (error) { toast(error.message, 'error'); }
  if (state.modType === 'mod') await refreshModBackups();
  else {
    const restore = $('#restore-mod-backup'); if (restore) restore.disabled = true;
    const row = $('.mod-backup-row'); if (row) row.hidden = true;
    const tools = $('#import-local-mod'); if (tools) tools.hidden = true;
    const update = $('#check-mod-updates'); if (update) update.hidden = state.modType === 'modpack';
    const backup = $('#backup-mods'); if (backup) backup.hidden = true;
  }
}
function renderInstalledMods() {
  const host = $('#installed-mods'); if (!host) return; host.replaceChildren();
  const type = state.modType;
  setText('#catalog-installed-title', `Installed ${({mod:'Mods',modpack:'Modpacks',resourcepack:'Resource Packs',shader:'Shaders',datapack:'Data Packs'})[type] || 'Items'}`);
  if (!state.installedMods.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state compact'; empty.textContent = `Nothing installed in this profile yet. Browse Modrinth to add ${type === 'mod' ? 'mods' : `${type} content`}.`; host.append(empty); return;
  }
  for (const item of state.installedMods) {
    const row = document.createElement('div'); row.className = 'installed-row';
    const details = document.createElement('div'); details.className = 'installed-mod-details';
    const name = document.createElement('b'); name.className = 'file-name'; name.textContent = item.title || item.filename;
    const sub = document.createElement('small'); sub.className = 'mod-meta'; sub.textContent = `${item.filename} · ${item.source === 'local' ? 'Local file' : 'Modrinth'}${item.versionNumber ? ` · ${item.versionNumber}` : ''}`;
    details.append(name, sub);
    const label = document.createElement('span'); label.className = `disabled-label ${item.enabled ? 'enabled-label' : ''}`; label.textContent = item.enabled ? 'ENABLED' : 'DISABLED';
    const toggle = document.createElement('button'); toggle.className = 'small-ghost'; toggle.textContent = item.enabled ? 'Disable' : 'Enable';
    toggle.addEventListener('click', async () => {
      toggle.disabled = true;
      try {
        if (type === 'mod') await api.toggleMod(item.filename, !item.enabled);
        else await api.toggleCatalogItem(type, item.filename, !item.enabled, state.selectedWorldFolder || null);
        await refreshMods(); toast(`${item.title || item.filename} ${item.enabled ? 'disabled' : 'enabled'}.`);
      } catch (error) { toast(error.message, 'error'); } finally { toggle.disabled = false; }
    });
    const remove = document.createElement('button'); remove.className = 'small-ghost danger-button'; remove.textContent = type === 'modpack' ? 'Remove file' : 'Remove';
    remove.addEventListener('click', async () => {
      if (!confirm(type === 'modpack' ? `Remove the downloaded modpack archive ${item.filename}? Already installed pack files remain in this profile.` : `Remove ${item.filename} from this profile?`)) return;
      remove.disabled = true;
      try { if (type === 'mod') await api.removeMod(item.filename); else await api.removeCatalogItem(type, item.filename, state.selectedWorldFolder || null); await refreshMods(); toast('Item removed from this profile.'); }
      catch (error) { toast(error.message, 'error'); } finally { remove.disabled = false; }
    });
    if (type === 'modpack') row.append(details, remove); else row.append(details, label, toggle, remove);
    host.append(row);
  }
}
function currentModChannel() { return $('#mod-release-channel')?.value || 'release'; }
const MOD_TYPE_LABELS = { mod: 'Mods', modpack: 'Modpacks', resourcepack: 'Resource Packs', shader: 'Shaders', datapack: 'Data Packs' };
function setModType(type) {
  if (!Object.hasOwn(MOD_TYPE_LABELS, type)) return;
  state.modType = type; state.catalogLoaded = false;
  const updatesHost = $('#mod-update-results'); if (updatesHost) { updatesHost.hidden = true; updatesHost.replaceChildren(); }
  $$('[data-mod-type]').forEach(button => button.classList.toggle('active', button.dataset.modType === type));
  $('#mod-search-input').placeholder = `Search ${MOD_TYPE_LABELS[type].toLowerCase()}…`;
  setText('#catalog-results-title', `Popular ${MOD_TYPE_LABELS[type]}`);
  const descriptions = { mod: 'Compatible mods for this profile', modpack: 'Modpacks install into this isolated profile', resourcepack: 'Stored in this profile’s resourcepacks folder', shader: 'Stored in this profile’s shaderpacks folder', datapack: 'Choose a saved world to install its data pack' };
  setText('#catalog-category-desc', descriptions[type]);
  const worldWrap = $('#datapack-world-wrapper');
  if (worldWrap) worldWrap.hidden = type !== 'datapack';
  if (type === 'datapack') refreshDatapackWorlds(); else state.selectedWorldFolder = '';
  const importButton = $('#import-local-mod'); if (importButton) importButton.hidden = type !== 'mod';
  const updateButton = $('#check-mod-updates'); if (updateButton) updateButton.hidden = type === 'modpack';
  const backupButton = $('#backup-mods'); if (backupButton) backupButton.hidden = type !== 'mod';
  const backupRow = $('.mod-backup-row'); if (backupRow) backupRow.hidden = type !== 'mod';
  updateProfileFromUI();
  if (state.catalogView === 'installed') refreshMods(); else loadCatalog('');
}
async function refreshDatapackWorlds() {
  const select = $('#datapack-world-select'); if (!select) return;
  const previous = state.selectedWorldFolder; select.replaceChildren();
  const placeholder = document.createElement('option'); placeholder.value = ''; placeholder.textContent = 'Choose a saved world…'; select.append(placeholder);
  try {
    const worlds = await api.listProfileWorlds();
    for (const world of worlds) { const option = document.createElement('option'); option.value = world.folder; option.textContent = world.name; select.append(option); }
    state.selectedWorldFolder = worlds.some(world => world.folder === previous) ? previous : '';
    select.value = state.selectedWorldFolder;
    if (!worlds.length) setText('#catalog-category-desc', 'No saved worlds found in this profile. Launch once and create a world first.');
  } catch (error) { toast(`Could not list saved worlds: ${error.message}`, 'error'); }
}
async function loadCatalog(query = '') {
  const host = $('#mod-search-results'); if (!host) return;
  const type = state.modType;
  if (type === 'mod' && $('#loader-select').value === 'vanilla') {
    host.replaceChildren(); const message = document.createElement('div'); message.className = 'empty-state compact'; message.textContent = 'Mods require Fabric, Forge, NeoForge or Quilt. Select a compatible modded profile first.'; host.append(message); state.catalogLoaded = true; return;
  }
  const button = $('#mod-search-button'); if (button) { button.disabled = true; button.textContent = 'Loading…'; }
  host.replaceChildren(); const loading = document.createElement('div'); loading.className = 'empty-state'; loading.innerHTML = '<span>◌</span><b>Loading Modrinth projects…</b><small>Filtering against your selected Minecraft profile</small>'; host.append(loading);
  try {
    state.catalogResults = await api.searchCatalog(query, { type, index: $('#mod-sort')?.value || 'downloads' });
    renderSearchResults(state.catalogResults); state.catalogLoaded = true;
  } catch (error) { host.replaceChildren(); const empty = document.createElement('div'); empty.className = 'empty-state compact'; empty.textContent = error.message; host.append(empty); toast(error.message, 'error'); }
  finally { if (button) { button.disabled = false; button.textContent = 'Search'; } }
}
async function installSearchProject(project, versionId = null, button = null) {
  if (state.modType === 'datapack' && !state.selectedWorldFolder) return toast('Choose a saved world before installing a data pack.', 'warning');
  if (state.modType === 'modpack') {
    try { const existingMods = await api.listMods(); if (existingMods.length && !confirm('This profile already contains mods. Installing a modpack will add its files and may create conflicts. Recommended: create a fresh profile for this modpack. Continue anyway?')) return; }
    catch (error) { return toast(`Could not inspect the active profile before installing the pack: ${error.message}`, 'error'); }
  }
  const oldText = button?.textContent;
  if (button) { button.disabled = true; button.textContent = 'Installing…'; }
  try {
    const result = state.modType === 'mod'
      ? await api.installMod(project.project_id, versionId, currentModChannel())
      : await api.installCatalogItem(project.project_id, state.modType, versionId, currentModChannel(), state.selectedWorldFolder || null);
    if (result.settings) { state.settings = result.settings; applySettingsToForm(); }
    toast(`${project.title} ${result.versionNumber ? `(${result.versionNumber}) ` : ''}installed in this profile.`);
    await refreshMods();
  } catch (error) { toast(error.message, 'error'); }
  finally { if (button) { button.disabled = false; button.textContent = oldText || 'Install'; } }
}
function renderSearchResults(results) {
  const host = $('#mod-search-results'); host.replaceChildren();
  if (!results.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state compact'; empty.textContent = `No compatible ${MOD_TYPE_LABELS[state.modType].toLowerCase()} found. Try another search or check this profile's Minecraft version.`; host.append(empty); return;
  }
  for (const project of results) {
    const card = document.createElement('div'); card.className = 'mod-card';
    const image = document.createElement('img'); image.alt = ''; image.loading = 'lazy'; image.src = project.icon_url || ''; image.onerror = () => { image.style.visibility = 'hidden'; };
    const info = document.createElement('div'); info.className = 'mod-info';
    const title = document.createElement('b'); title.textContent = project.title;
    const desc = document.createElement('p'); desc.textContent = project.description || 'No description provided.';
    const meta = document.createElement('div'); meta.className = 'mod-meta'; meta.textContent = `${Number(project.downloads || 0).toLocaleString()} downloads · ${project.author || 'Modrinth'}`;
    const external = document.createElement('a'); external.className = 'modrinth-link'; external.href = project.project_url; external.target = '_blank'; external.rel = 'noreferrer'; external.textContent = 'View on Modrinth ↗';
    info.append(title, desc, meta, external);
    const actions = document.createElement('div'); actions.className = 'mod-result-actions';
    const install = document.createElement('button'); install.className = 'small-ghost'; install.textContent = state.modType === 'modpack' ? 'Install pack' : 'Install';
    install.addEventListener('click', () => installSearchProject(project, null, install));
    const versionsButton = document.createElement('button'); versionsButton.className = 'small-ghost'; versionsButton.textContent = 'Versions';
    const versionArea = document.createElement('div'); versionArea.className = 'mod-version-picker'; versionArea.hidden = true;
    const versionSelect = document.createElement('select'); versionSelect.setAttribute('aria-label', `Version for ${project.title}`);
    const installSelected = document.createElement('button'); installSelected.className = 'small-ghost'; installSelected.textContent = 'Install selected'; installSelected.disabled = true;
    installSelected.addEventListener('click', () => { if (versionSelect.value) installSearchProject(project, versionSelect.value, installSelected); });
    versionArea.append(versionSelect, installSelected);
    versionsButton.addEventListener('click', async () => {
      versionsButton.disabled = true; versionsButton.textContent = 'Loading…';
      try {
        const versions = await api.getCatalogVersions(project.project_id, state.modType, currentModChannel()); versionSelect.replaceChildren();
        if (!versions.length) { const option = document.createElement('option'); option.value = ''; option.textContent = 'No compatible versions'; versionSelect.append(option); installSelected.disabled = true; }
        else { for (const version of versions) { const option = document.createElement('option'); option.value = version.id; option.textContent = `${version.version_number} · ${String(version.version_type || 'release').toUpperCase()} · ${new Date(version.date_published).toLocaleDateString()}`; versionSelect.append(option); } installSelected.disabled = false; }
        versionArea.hidden = false; versionsButton.textContent = 'Refresh versions';
      } catch (error) { toast(error.message, 'error'); versionsButton.textContent = 'Versions'; }
      finally { versionsButton.disabled = false; }
    });
    actions.append(install, versionsButton, versionArea); card.append(image, info, actions); host.append(card);
  }
}

async function refreshModBackups() {
  try {
    state.modBackups = await api.listModBackups();
    const select = $('#mod-backup-select');
    const previous = select.value;
    select.replaceChildren();
    if (!state.modBackups.length) {
      const option = document.createElement('option'); option.value = ''; option.textContent = 'No backups available'; select.append(option);
    } else {
      for (const backup of state.modBackups) {
        const option = document.createElement('option'); option.value = backup.id;
        option.textContent = `${new Date(backup.createdAt).toLocaleString()} · ${backup.files} JAR(s)`;
        select.append(option);
      }
      if (state.modBackups.some(item => item.id === previous)) select.value = previous;
    }
    $('#restore-mod-backup').disabled = !state.modBackups.length;
  } catch (error) { toast(`Could not load mod backups: ${error.message}`, 'error'); }
}
function renderModUpdates(updates) {
  const host = $('#mod-update-results'); host.replaceChildren();
  host.hidden = !updates.length;
  if (!updates.length) return;
  const heading = document.createElement('div'); heading.className = 'mod-update-heading'; heading.textContent = 'Mod updates'; host.append(heading);
  for (const item of updates) {
    const row = document.createElement('div'); row.className = 'installed-row';
    const text = document.createElement('span'); text.className = 'file-name';
    text.textContent = item.error ? `${item.title}: ${item.error}` : `${item.title} · ${item.current} → ${item.latest}`;
    row.append(text);
    if (!item.error) {
      const apply = document.createElement('button'); apply.className = 'small-ghost'; apply.textContent = 'Update';
      apply.addEventListener('click', async () => {
        apply.disabled = true; apply.textContent = 'Updating…';
        try { await api.updateMod(item.projectId, currentModChannel()); toast(`${item.title} updated.`); await refreshMods(); const remaining = await api.checkModUpdates(currentModChannel()); renderModUpdates(remaining); }
        catch (error) { toast(error.message, 'error'); }
        finally { apply.disabled = false; apply.textContent = 'Update'; }
      });
      row.append(apply);
    }
    host.append(row);
  }
}
async function checkContentUpdates() {
  if (state.modType === 'mod') {
    const updates = await api.checkModUpdates(currentModChannel());
    renderModUpdates(updates);
    return updates.length;
  }
  if (state.modType === 'modpack') return 0;
  const updates = [];
  for (const item of state.installedMods) {
    if (!item.projectId || !item.versionId) continue;
    try {
      const versions = await api.getCatalogVersions(item.projectId, state.modType, currentModChannel());
      if (versions[0] && versions[0].id !== item.versionId) updates.push({ ...item, latestVersion: versions[0] });
    } catch (error) { updates.push({ ...item, error: error.message }); }
  }
  const host = $('#mod-update-results'); host.replaceChildren(); host.hidden = !updates.length;
  if (!updates.length) { toast('All managed items in this category are up to date.'); return 0; }
  const heading = document.createElement('div'); heading.className = 'mod-update-heading'; heading.textContent = `${MOD_TYPE_LABELS[state.modType]} updates`; host.append(heading);
  for (const item of updates) {
    const row = document.createElement('div'); row.className = 'installed-row';
    const label = document.createElement('span'); label.className = 'file-name';
    label.textContent = item.error ? `${item.title}: ${item.error}` : `${item.title} · ${item.versionNumber || 'installed'} → ${item.latestVersion.version_number}`;
    row.append(label);
    if (!item.error) {
      const apply = document.createElement('button'); apply.className = 'small-ghost'; apply.textContent = 'Update';
      apply.addEventListener('click', async () => {
        apply.disabled = true; apply.textContent = 'Updating…';
        try {
          const result = await api.installCatalogItem(item.projectId, state.modType, item.latestVersion.id, currentModChannel(), state.selectedWorldFolder || null);
          if (item.filename !== result.filename) await api.removeCatalogItem(state.modType, item.filename, state.selectedWorldFolder || null);
          if (!item.enabled) await api.toggleCatalogItem(state.modType, result.filename, false, state.selectedWorldFolder || null);
          toast(`${item.title} updated in this profile.`); await refreshMods(); await checkContentUpdates();
        } catch (error) { toast(error.message, 'error'); }
        finally { apply.disabled = false; apply.textContent = 'Update'; }
      });
      row.append(apply);
    }
    host.append(row);
  }
  return updates.length;
}
function renderPerformance() {
  const perf = state.performance || PRESETS.balanced;
  const host = $('#optimization-list'); host.replaceChildren();
  const suggestions = [
    ['Sodium', 'Rendering optimisation for Fabric and supported loaders.', 'AANobbMI'],
    ['Lithium', 'Game logic and server tick optimisations.', 'gvQqBUqZ'],
    ['FerriteCore', 'Reduces memory use in supported environments.', 'uXXizFIs'],
    ['Entity Culling', 'Skips rendering entities hidden from the camera.', 'NNAgCjsB'],
    ['ImmediatelyFast', 'Optimises immediate-mode rendering paths.', '5ZwdcRci'],
    ['ModernFix', 'Fixes and memory/performance improvements.', 'nmDcB62a'],
  ];
  const loader = state.settings?.loader || 'vanilla';
  const canInstall = ['fabric', 'forge', 'neoforge', 'quilt'].includes(loader);
  for (const [name, desc, projectId] of suggestions) {
    const item = document.createElement('div'); item.className = 'optimization-item';
    const icon = document.createElement('div'); icon.className = 'mod-icon'; icon.textContent = '◈';
    const body = document.createElement('div'); body.className = 'optimization-copy';
    const title = document.createElement('b'); title.textContent = name;
    const sub = document.createElement('small'); sub.textContent = desc;
    body.append(title, sub);
    const installed = (state.installedMods || []).some(mod => mod.projectId === projectId && mod.enabled);
    const button = document.createElement('button'); button.className = 'small-ghost optimization-install';
    button.textContent = installed ? 'Installed' : canInstall ? 'Install' : 'Choose modded profile';
    button.disabled = installed;
    button.addEventListener('click', async () => {
      if (!canInstall) {
        showPage('profiles');
        toast('Select or create a Fabric, Forge, NeoForge or Quilt profile before installing optimization mods.', 'warning');
        return;
      }
      button.disabled = true; button.textContent = 'Checking…';
      try {
        const versions = await api.getModVersions(projectId, 'release');
        if (!versions.length) throw new Error(`${name} has no release compatible with Minecraft ${state.settings.minecraftVersion} / ${loader}.`);
        button.textContent = 'Installing…';
        await api.installMod(projectId, versions[0].id, 'release');
        state.installedMods = await api.listMods();
        renderInstalledMods(); renderPerformance();
        toast(`${name} installed in ${state.settings.profiles.find(p => p.id === state.settings.activeProfileId)?.name || 'this profile'}.`);
      } catch (error) { toast(error.message, 'error'); button.disabled = false; button.textContent = 'Install'; }
    });
    item.append(icon, body, button); host.append(item);
  }
  setText('#home-performance', perf.name || 'Balanced');
  $$('.preset-card').forEach(el => el.classList.toggle('selected', el.dataset.preset === state.selectedPreset));
}
function applySettingsToForm() {
  const settings = state.settings || {};
  $('#ram-min').value = settings.ramMin ?? 1024;
  $('#ram-max').value = settings.ramMax ?? 4096;
  setText('#ram-min-value', `${$('#ram-min').value} MB`);
  setText('#ram-max-value', `${$('#ram-max').value} MB`);
  $('#java-path').value = settings.javaPath || '';
  setText('#game-directory-label', settings.gameDirectory || 'Default profile folder (%APPDATA%)');
  $('#setting-start-on-login').checked = Boolean(settings.startOnLogin);
  $('#setting-hide-launcher').checked = Boolean(settings.hideLauncherOnGameStart);
  $('#setting-hide-character').checked = Boolean(settings.hide3DCharacter);
  $('#setting-fullscreen').checked = Boolean(settings.fullscreen);
  $('#setting-window-width').value = settings.windowWidth || 1280;
  $('#setting-window-height').value = settings.windowHeight || 720;
  $('#setting-java-args').value = settings.javaArgs || '';
  $('#setting-download-concurrency').value = settings.downloadConcurrency || 6;
  setText('#download-concurrency-value', $('#setting-download-concurrency').value);
  document.body.classList.toggle('hide-home-player-name', Boolean(settings.hide3DCharacter));
  const active = (settings.profiles || []).find(profile => profile.id === settings.activeProfileId);
  setText('#active-profile-directory-label', active ? `${active.name} · Minecraft ${active.version} · ${active.loader}` : 'No active profile');
  $('#loader-select').value = settings.loader || 'vanilla';
  populateVersionSelect($('#version-select'), settings.minecraftVersion || '26.3');
  $('#loader-version').value = settings.loaderVersion || '';
  renderProfiles();
  updateProfileFromUI();
  refreshActiveProfileFolderInfo();
}
async function refreshActiveProfileFolderInfo() {
  const active = (state.settings?.profiles || []).find(profile => profile.id === state.settings?.activeProfileId);
  if (!active) { setText('#active-profile-directory-label', 'No active profile'); return; }
  try {
    const info = await api.getProfileFolderInfo(active.id);
    setText('#active-profile-directory-label', info.installed
      ? `${info.folder} · Installed`
      : `${info.folder} · Not installed — press PLAY to download`);
  } catch (error) {
    setText('#active-profile-directory-label', `${active.name} · ${error.message}`);
  }
}
function populateVersionSelect(select, selected = '1.21.1') {
  if (!select) return;
  select.replaceChildren();
  const buckets = [
    ['Latest releases', id => /^(2[6-9]|[3-9]\d)\./.test(id) || /^1\.21\./.test(id)],
    ['Modern (1.20)', id => /^1\.20\./.test(id)],
    ['Modern (1.18–1.19)', id => /^1\.(18|19)\./.test(id)],
    ['Legacy (1.16.5)', id => id === '1.16.5'],
    ['Legacy PvP (1.12.2 / 1.8.9)', id => ['1.12.2', '1.8.9'].includes(id)],
    ['Other releases', () => true],
  ];
  const assigned = new Set();
  for (const [label, predicate] of buckets) {
    const group = document.createElement('optgroup'); group.label = label;
    for (const item of state.versions) if (!assigned.has(item.id) && predicate(item.id)) {
      const option = document.createElement('option'); option.value = item.id; option.textContent = item.id; group.append(option); assigned.add(item.id);
    }
    if (group.children.length) select.append(group);
  }
  if (![...select.options].some(option => option.value === selected)) {
    const option = document.createElement('option'); option.value = selected; option.textContent = `${selected} (saved)`; select.add(option, 0);
  }
  select.value = selected;
}
function accountForProfile(profile) {
  if (profile?.accountId) return state.accounts.find(item => item.id === profile.accountId) || null;
  return state.account || null;
}
function updateHomeProfileSummary() {
  const profile = state.settings?.profiles?.find(item => item.id === state.settings.activeProfileId);
  if (!profile) return;
  const account = accountForProfile(profile);
  setText('#home-player-name', account?.username || 'CRYON PLAYER');
  setText('#home-profile-label', `${profile.name} · Minecraft ${profile.version} · ${profile.loader}`);
  setText('#rail-profile-name', profile.name);
  setText('#rail-profile-sub', `${profile.loader.toUpperCase()} · Minecraft ${profile.version}`);
  setText('#home-version', profile.version);
  const shortcuts = $('#home-profile-shortcuts');
  if (shortcuts) {
    shortcuts.replaceChildren();
    const profiles = state.settings.profiles;
    for (const item of profiles) {
      const button = document.createElement('button'); button.textContent = item.name; button.classList.toggle('active', item.id === profile.id);
      button.addEventListener('click', async () => { try { state.settings = await api.selectProfile(item.id); applySettingsToForm(); await afterProfileSwitch(); } catch (error) { toast(error.message, 'error'); } });
      shortcuts.append(button);
    }
    const add = document.createElement('button'); add.className = 'profile-picker-add'; add.textContent = '+  Add a Profile'; add.addEventListener('click', () => { shortcuts.hidden = true; resetProfileFormMode(); showPage('add-version'); }); shortcuts.append(add);
  }
  // Header identity follows the active profile's assigned account, while Accounts retains the default identity selector.
  const headerAccount = account;
  setText('#account-name', headerAccount?.username || 'Not signed in');
  setText('#account-sub', headerAccount ? (headerAccount.type === 'offline' ? 'Offline local identity' : 'Microsoft account') : 'Assign an account');
  setText('#account-avatar', headerAccount?.username?.[0]?.toUpperCase() || 'N');
  setText('#account-action', headerAccount ? 'Manage' : 'Sign in');
}
function renderProfiles() {
  const profiles = state.settings?.profiles || [];
  const activeId = state.settings?.activeProfileId;
  const select = $('#active-profile-select');
  if (select) { select.replaceChildren(); for (const profile of profiles) { const option = document.createElement('option'); option.value = profile.id; option.textContent = profile.name; select.append(option); } select.value = activeId; }
  const host = $('#profile-list'); if (!host) return; host.replaceChildren();
  const query = ($('#profile-search')?.value || '').trim().toLowerCase();
  let visible = profiles.filter(profile => `${profile.name} ${profile.version} ${profile.loader}`.toLowerCase().includes(query));
  const sort = $('#profile-sort')?.value || 'version';
  visible = [...visible].sort((a,b) => sort === 'name' ? a.name.localeCompare(b.name) : sort === 'created' ? String(b.createdAt).localeCompare(String(a.createdAt)) : String(b.version).localeCompare(String(a.version), undefined, { numeric: true }));
  setText('#profile-count', `${profiles.length} PROFILE${profiles.length === 1 ? '' : 'S'}`);
  for (const profile of visible) {
    const card = document.createElement('article'); card.className = `profile-card${profile.id === activeId ? ' active' : ''}`;
    const top = document.createElement('div'); top.className = 'profile-card-top'; top.setAttribute('role', 'button'); top.setAttribute('tabindex', '0'); top.setAttribute('aria-label', `Select ${profile.name}`);
    const chooseProfile = async () => { try { await selectProfileForShortcut(profile.id); toast(`${profile.name} is now the active profile.`); } catch (error) { toast(error.message, 'error'); } };
    top.addEventListener('click', chooseProfile); top.addEventListener('keydown', event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); chooseProfile(); } });
    const icon = document.createElement('div'); icon.className = 'profile-card-icon';
    const heading = document.createElement('div'); heading.className = 'profile-card-heading';
    const name = document.createElement('b'); name.textContent = profile.name;
    const category = document.createElement('small'); category.textContent = `MINECRAFT ${profile.version}  +  ${profile.loader.toUpperCase()}`;
    heading.append(name, category); top.append(icon, heading);
    const meta = document.createElement('div'); meta.className = 'profile-card-meta'; meta.textContent = `Minecraft ${profile.version} · ${profile.loader.toUpperCase()}${profile.loaderVersion ? ` ${profile.loaderVersion}` : profile.loader !== 'vanilla' ? ' · auto build' : ''}`;
    const installState = document.createElement('div'); installState.className = 'profile-install-state'; installState.textContent = 'Checking game files…';
    const folderPath = document.createElement('div'); folderPath.className = 'profile-card-path'; folderPath.textContent = 'Resolving actual game folder…';
    api.getProfileFolderInfo(profile.id).then(info => {
      installState.textContent = info.installed ? 'GAME INSTALLED' : info.pendingOptions ? 'FIRST RUN PENDING · PLAY TO FINISH' : info.exists ? 'INSTANCE FOLDER FOUND · INSTALL INCOMPLETE' : 'NOT INSTALLED · PLAY TO INSTALL';
      installState.classList.toggle('installed', info.installed);
      installState.title = info.folder;
      folderPath.textContent = info.folder; folderPath.title = info.folder;
    }).catch(() => { installState.textContent = 'PROFILE DIRECTORY UNAVAILABLE'; folderPath.textContent = 'Cannot resolve profile folder'; });
    const assigned = accountForProfile(profile); const accountLine = document.createElement('div'); accountLine.className = 'profile-card-account'; accountLine.textContent = `Account: ${assigned?.username || 'Use default account'}`;
    const actions = document.createElement('div'); actions.className = 'profile-card-actions';
    const play = document.createElement('button'); play.className = 'small-ghost'; play.textContent = '▷ Play'; play.addEventListener('click', () => launchProfile(profile.id));
    const mods = document.createElement('button'); mods.className = 'small-ghost'; mods.textContent = '♧ Mods'; mods.addEventListener('click', async () => { await selectProfileForShortcut(profile.id); setModType('mod'); showPage('mods'); });
    const packs = document.createElement('button'); packs.className = 'small-ghost'; packs.textContent = '▧ Resource packs'; packs.addEventListener('click', async () => { await selectProfileForShortcut(profile.id); setModType('resourcepack'); showPage('mods'); });
    const more = document.createElement('button'); more.className = 'small-ghost profile-more'; more.textContent = '•••'; more.title = 'Profile actions';
    const menu = document.createElement('div'); menu.className = 'profile-card-context-menu'; menu.hidden = true;
    const editProfile = document.createElement('button'); editProfile.textContent = '✎  Rename Profile';
    editProfile.addEventListener('click', async () => {
      try {
        if (state.settings.activeProfileId !== profile.id) state.settings = await api.selectProfile(profile.id);
        const nextName = window.prompt('New profile display name:', profile.name);
        if (!nextName?.trim()) return;
        state.settings = await api.updateActiveProfile({ name: nextName.trim() });
        renderProfiles(); renderProfileAccountAssignments();
        toast('Profile name updated. Its game folder remains unchanged.');
        menu.hidden = true;
      } catch (error) { toast(error.message, 'error'); }
    });
    const openFolder = document.createElement('button'); openFolder.textContent = '▱  Open Profile Folder';
    openFolder.addEventListener('click', async () => { try { const folder = await api.openProfileFolder(profile.id); menu.hidden = true; toast(`Opened ${folder}`); } catch (error) { toast(error.message, 'error'); } });
    const duplicateProfile = document.createElement('button'); duplicateProfile.textContent = '⧉  Duplicate Version';
    duplicateProfile.addEventListener('click', async () => {
      try {
        const result = await api.duplicateProfile(profile.id);
        state.settings = result.settings; applySettingsToForm(); await afterProfileSwitch(); renderProfiles();
        menu.hidden = true;
        toast(`${result.profile.name} created. Its game files will install separately on PLAY.`);
      } catch (error) { toast(error.message, 'error'); }
    });
    const removeProfile = document.createElement('button'); removeProfile.className = 'danger-button'; removeProfile.textContent = '⌫  Delete Profile';
    removeProfile.addEventListener('click', async () => { if (!confirm(`Remove profile “${profile.name}”? Its game folder and installed files will be kept on disk.`)) return; try { state.settings = await api.deleteProfile(profile.id); applySettingsToForm(); await afterProfileSwitch(); renderProfiles(); renderProfileAccountAssignments(); toast('Profile removed. Its game data remains on disk.'); } catch (error) { toast(error.message, 'error'); } });
    menu.append(editProfile, duplicateProfile, openFolder, removeProfile);
    more.addEventListener('click', event => { event.stopPropagation(); menu.hidden = !menu.hidden; });
    actions.append(play, mods, packs, more); card.append(top, meta, installState, folderPath, accountLine, actions, menu); host.append(card);
  }
  if (!query) {
    const create = document.createElement('button'); create.className = 'profile-create-tile'; create.innerHTML = '<span>＋</span><b>ADD VERSION</b>';
    create.addEventListener('click', () => { resetProfileFormMode(); showPage('add-version'); }); host.append(create);
  }
  renderProfileAccountAssignments(); updateHomeProfileSummary();
}
async function afterProfileSwitch() {
  state.selectedWorldFolder = '';
  if (state.modType === 'datapack') await refreshDatapackWorlds();
  await refreshMods();
  updateHomeProfileSummary();
  await refreshJavaRuntimeStatus().catch(error => setText('#java-detect-result', `Java compatibility refresh failed: ${error.message}`));
}
async function selectProfileForShortcut(id) {
  if (state.settings.activeProfileId !== id) { state.settings = await api.selectProfile(id); applySettingsToForm(); await afterProfileSwitch(); }
}
function renderProfileAccountAssignments() {
  const host = $('#profile-account-assignments'); if (!host) return; host.replaceChildren();
  const profiles = state.settings?.profiles || [];
  for (const profile of profiles) {
    const card = document.createElement('div'); card.className = 'profile-account-card';
    const label = document.createElement('div'); const name = document.createElement('b'); name.textContent = profile.name; const meta = document.createElement('small'); meta.textContent = `${profile.version} · ${profile.loader.toUpperCase()}`; label.append(name, meta);
    const select = document.createElement('select'); select.setAttribute('aria-label', `Account assigned to ${profile.name}`);
    const defaultOption = document.createElement('option'); defaultOption.value = ''; defaultOption.textContent = 'Use default account'; select.append(defaultOption);
    for (const account of state.accounts) { const option = document.createElement('option'); option.value = account.id; option.textContent = `${account.username} · ${account.type === 'offline' ? 'Offline' : 'Microsoft'}`; select.append(option); }
    select.value = profile.accountId || '';
    select.addEventListener('change', async () => { select.disabled = true; try { state.settings = await api.assignAccountToProfile(profile.id, select.value || null); renderProfiles(); renderProfileAccountAssignments(); updateHomeProfileSummary(); toast(`Account assignment updated for ${profile.name}.`); } catch (error) { toast(error.message, 'error'); } finally { select.disabled = false; } });
    card.append(label, select); host.append(card);
  }
}
function renderAccounts() {
  const host = $('#account-list'); if (!host) return; host.replaceChildren();
  setText('#account-count', `${state.accounts.length} ACCOUNT${state.accounts.length === 1 ? '' : 'S'}`);
  setText('#account-storage-status', $('#secure-status')?.textContent || 'OS-managed');
  const query = ($('#account-search')?.value || '').trim().toLowerCase();
  let accounts = state.accounts.filter(account => `${account.username} ${account.type}`.toLowerCase().includes(query));
  if ($('#account-sort')?.value === 'name') accounts.sort((a,b) => a.username.localeCompare(b.username));
  if (!accounts.length && state.accounts.length) { const empty = document.createElement('div'); empty.className = 'empty-state compact'; empty.textContent = 'No matching accounts.'; host.append(empty); }
  for (const account of accounts) {
    const row = document.createElement('div'); row.className = `account-row${account.active ? ' active' : ''}`;
    const avatar = document.createElement('div'); avatar.className = 'avatar'; avatar.textContent = account.username[0]?.toUpperCase() || 'N';
    const info = document.createElement('div'); info.className = 'account-row-info';
    const name = document.createElement('b'); name.textContent = account.username;
    const linked = (state.settings?.profiles || []).filter(profile => profile.accountId === account.id).map(profile => profile.name);
    const detail = document.createElement('small'); detail.textContent = `${account.type === 'offline' ? 'Local' : 'Microsoft'} account${linked.length ? ` · Assigned: ${linked.join(', ')}` : ''}`;
    info.append(name, detail);

    const actions = document.createElement('div'); actions.className = 'account-row-actions';
    const linkState = document.createElement('span');
    linkState.className = `account-link-state${linked.length ? ' linked' : ' unlinked'}`;
    linkState.textContent = linked.length ? `✓ Linked · ${linked.length} profile${linked.length === 1 ? '' : 's'}` : '⚠ Account not linked';
    linkState.title = linked.length ? `Assigned to: ${linked.join(', ')}` : 'Assign this account to a Minecraft profile to use it for that profile.';

    const skins = document.createElement('button'); skins.type = 'button'; skins.className = 'account-skins-button'; skins.textContent = '▣  Skins';
    skins.setAttribute('aria-label', `Manage Minecraft skin for ${account.username}`);
    skins.addEventListener('click', async () => {
      skins.disabled = true; skins.textContent = 'Opening…';
      try {
        // Skin IPC uses the currently selected account; make the clicked account active first.
        state.account = await api.selectAccount(account.id);
        state.accounts = state.accounts.map(item => ({ ...item, active: item.id === account.id }));
        updateAccount(state.account);
        renderAccounts();
        showPage('cosmetics');
        toast(`Skin manager opened for ${account.username}.`);
      } catch (error) {
        skins.disabled = false; skins.textContent = '▣  Skins';
        toast(error.message, 'error');
      }
    });

    const more = document.createElement('button'); more.type = 'button'; more.className = 'small-ghost account-more-button';
    more.textContent = '•••'; more.title = 'Account actions'; more.setAttribute('aria-label', `More actions for ${account.username}`);
    const menu = document.createElement('div'); menu.className = 'account-row-context-menu'; menu.hidden = true;
    const use = document.createElement('button'); use.type = 'button'; use.textContent = account.active ? '✓  Default account' : '↗  Use as default'; use.disabled = account.active;
    use.addEventListener('click', async () => {
      menu.hidden = true;
      try {
        state.account = await api.selectAccount(account.id);
        state.accounts = state.accounts.map(item => ({ ...item, active: item.id === account.id }));
        updateAccount(state.account); renderAccounts(); renderProfileAccountAssignments();
        toast(`${account.username} selected as default.`);
      } catch (error) { toast(error.message, 'error'); }
    });
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'danger-button'; remove.textContent = '⌫  Remove account';
    remove.addEventListener('click', async () => {
      menu.hidden = true;
      if (!confirm(`Remove saved account ${account.username}? Profiles using it will fall back to the default account.`)) return;
      try {
        const result = await api.removeAccount(account.id);
        state.account = result.account; state.accounts = result.accounts;
        if (result.settings) state.settings = result.settings;
        updateAccount(state.account); renderAccounts(); renderProfileAccountAssignments(); renderProfiles();
        toast('Account removed from CRYON.');
      } catch (error) { toast(error.message, 'error'); }
    });
    menu.append(use, remove);
    more.addEventListener('click', event => {
      event.stopPropagation();
      $$('.account-row-context-menu').forEach(other => { if (other !== menu) other.hidden = true; });
      menu.hidden = !menu.hidden;
    });
    actions.append(linkState, skins, more); row.append(avatar, info, actions, menu); host.append(row);
  }
  if (!query) {
    const add = document.createElement('button'); add.className = 'account-add-tile';
    add.innerHTML = '<span>＋</span><b>ADD ACCOUNT</b>';
    add.addEventListener('click', () => { setAuthMethod('microsoft'); showPage('add-account'); });
    host.append(add);
  }
  renderProfileAccountAssignments();
}
async function resolveLoaderInto(versionSelector, loaderSelector, buildSelector) {
  const version = $(versionSelector).value; const loader = $(loaderSelector).value;
  if (loader === 'vanilla') { $(buildSelector).value = ''; return ''; }
  const button = versionSelector === '#version-select' ? $('#resolve-home-loader') : $('#resolve-new-loader');
  if (button) { button.disabled = true; button.textContent = '…'; }
  try {
    const build = await api.resolveLoader(version, loader);
    $(buildSelector).value = build;
    if (versionSelector === '#version-select') await saveActiveProfileFromHome();
    toast(`${loader} ${build} selected for Minecraft ${version}.`); return build;
  } catch (error) { toast(error.message, 'error'); throw error; }
  finally { if (button) { button.disabled = false; button.textContent = 'Auto'; } }
}
async function saveActiveProfileFromHome() {
  const patch = { version: $('#version-select').value, loader: $('#loader-select').value, loaderVersion: $('#loader-version').value.trim() };
  state.settings = await api.updateActiveProfile(patch);
  renderProfiles(); updateProfileFromUI(); await refreshMods();
  await refreshJavaRuntimeStatus().catch(error => setText('#java-detect-result', `Java compatibility refresh failed: ${error.message}`));
}
function resetProfileFormMode() {
  state.profileNameTouched = false;
  const latest = state.versions.find(item => item.type === 'release')?.id || state.versions[0]?.id || '1.21.1';
  populateVersionSelect($('#new-profile-version'), latest);
  $('#new-profile-version').value = latest;
  $('#new-profile-loader').value = 'fabric';
  $('#new-profile-loader-version').value = '';
  $('#new-profile-memory').value = '3072';
  setText('#new-profile-memory-value', '3.0 GB');
  setGeneratedProfileName(true);
  renderVersionChoices();
}

function selectedServer() {
  return state.servers.find(server => server.id === state.selectedServerId) || null;
}
function setServerStatus(status, message = '') {
  const current = status || 'offline';
  const server = selectedServer();
  const pill = $('#server-status-pill');
  if (pill) {
    pill.className = `server-status-pill ${current}`;
    pill.textContent = `● ${current.toUpperCase()}`;
  }
  const running = ['running', 'starting'].includes(current);
  $('#server-start-button').disabled = running || current === 'stopping';
  $('#server-stop-button').disabled = !running;
  $('#server-restart-button').disabled = current !== 'running';
  const banner = $('#server-operation-banner');
  const visible = ['starting', 'running', 'stopping', 'error'].includes(current);
  banner.hidden = !visible;
  banner.className = `server-operation-banner ${current}`;
  $('#server-operation-spinner').hidden = current === 'running' || current === 'error';
  $('#server-operation-stop').hidden = !['starting', 'running'].includes(current);
  $('#server-operation-stop').disabled = current !== 'running' && current !== 'starting';
  const versionLine = server ? `Minecraft ${server.version} · ${server.software.toUpperCase()}` : 'Minecraft server';
  const elapsed = server && state.serverOnlineSince[server.id] ? Math.max(0, Math.floor((Date.now() - state.serverOnlineSince[server.id]) / 1000)) : 0;
  const clock = `${String(Math.floor(elapsed / 60)).padStart(2, '0')}:${String(elapsed % 60).padStart(2, '0')}`;
  const titles = { starting: 'PREPARING…', running: 'SERVER ONLINE', stopping: 'STOPPING SERVER…', error: 'START FAILED' };
  setText('#server-operation-title', titles[current] || 'SERVER');
  setText('#server-operation-subtitle', current === 'running' ? `${versionLine} · ${clock}` : (message || (current === 'starting' ? `Preparing ${server?.version || ''}-${server?.software || ''}` : current === 'stopping' ? `Stopping ${versionLine}` : message || versionLine)));
}
function renderServerList() {
  const host = $('#server-list');
  host.replaceChildren();
  if (!state.servers.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state compact'; empty.textContent = 'No local servers yet. Create one to get started.'; host.append(empty); return;
  }
  for (const server of state.servers) {
    const button = document.createElement('button'); button.type = 'button'; button.className = `server-list-item${server.id === state.selectedServerId ? ' active' : ''}`; button.dataset.serverId = server.id;
    const title = document.createElement('b'); title.textContent = server.name;
    const details = document.createElement('small'); details.textContent = `${server.software.toUpperCase()} · ${server.version} · ${Math.round(server.memoryMb / 1024 * 10) / 10} GB`;
    const status = document.createElement('span'); status.className = `server-list-status ${server.status === 'running' ? 'online' : server.status === 'error' ? 'error' : ''}`; status.textContent = server.status === 'running' ? '● ONLINE' : server.status === 'starting' ? '● STARTING' : server.status === 'stopping' ? '● STOPPING' : server.status === 'error' ? '● ERROR' : '● OFFLINE';
    button.append(title, details, status); host.append(button);
  }
}
async function refreshServerPage() {
  state.servers = await api.listServers();
  if (!state.selectedServerId || !state.servers.some(server => server.id === state.selectedServerId)) state.selectedServerId = state.servers[0]?.id || null;
  renderServerList();
  const hasServer = Boolean(selectedServer());
  $('#server-empty-state').hidden = hasServer;
  $('#server-create-panel').hidden = true;
  $('#server-dashboard-panel').hidden = !hasServer;
  if (!hasServer) {
    await refreshServerMetrics();
    return;
  }
  state.serverLogs = [];
  setText('#server-console-output', `[CRYON] Selected ${selectedServer().name}. Press Start to launch it.`);
  renderServerDashboard();
  await refreshServerMetrics();
  if (state.serverTab === 'files') await loadServerFiles();
  if (state.serverTab === 'backups') await loadServerBackups();
  if (state.serverTab === 'network') await renderServerNetwork();
}
function renderServerDashboard() {
  const server = selectedServer(); if (!server) return;
  setText('#server-selected-name', server.name);
  setText('#server-selected-meta', `${server.software.toUpperCase()} · Minecraft ${server.version} · Port ${server.port}`);
  setText('#server-allocation-value', `${(Number(server.memoryMb) / 1024).toFixed(1)} GB`);
  if (server.status === 'running' && !state.serverOnlineSince[server.id]) state.serverOnlineSince[server.id] = Date.now();
  if (['offline', 'error'].includes(server.status)) delete state.serverOnlineSince[server.id];
  const total = state.serverSystemInfo?.totalMemoryMb || 8192;
  $('#server-allocation-meter').style.width = `${Math.min(100, Number(server.memoryMb) / total * 100)}%`;
  setServerStatus(server.status || 'offline');
  renderServerList();
}
async function refreshServerMetrics() {
  if (state.serverMetricsRefreshing) return;
  state.serverMetricsRefreshing = true;
  try {
  const system = await api.getServerSystemInfo(); state.serverSystemInfo = system;
  setText('#server-cpu-value', system.cpuPercent === null ? 'Measuring…' : `${system.cpuPercent}%`);
  const coreSummary = `${system.cpuPhysicalCores || '—'} physical / ${system.cpuLogicalCores || system.cpuCores || '—'} logical cores`;
  setText('#server-cpu-model', `${coreSummary}${system.cpuSpeedMhz ? ` · ${system.cpuSpeedMhz} MHz` : ''} · ${system.cpuModel} · ${system.detectionSource || 'system counters'}`);
  $('#server-cpu-meter').style.width = `${system.cpuPercent ?? 0}%`;
  const used = system.usedMemoryMb / 1024; const total = system.totalMemoryMb / 1024; const available = system.availableMemoryMb / 1024;
  const hostRamPercent = Number.isFinite(Number(system.memoryUsagePercent)) ? Number(system.memoryUsagePercent) : used / Math.max(1, total) * 100;
  setText('#server-create-host-ram-value', `${hostRamPercent.toFixed(1)}%`);
  setText('#server-create-host-ram-sub', `${used.toFixed(1)} / ${total.toFixed(1)} GB used · ${available.toFixed(1)} GB available`);
  const createRamMeter = $('#server-create-host-ram-meter');
  if (createRamMeter) createRamMeter.style.width = `${Math.max(0, Math.min(100, hostRamPercent))}%`;
  setText('#server-ram-value', `${hostRamPercent.toFixed(1)}%`);
  setText('#server-ram-sub', `${used.toFixed(1)} / ${total.toFixed(1)} GB used · ${available.toFixed(1)} GB available`);
  if (!state.serverMemoryInitialized || !$('#server-create-panel').hidden) { renderServerMemoryLimit(); state.serverMemoryInitialized = true; }
  $('#server-ram-meter').style.width = `${Math.max(0, Math.min(100, hostRamPercent))}%`;
  const server = selectedServer();
  if (server) {
    setServerStatus(server.status || 'offline');
    setText('#server-allocation-value', `${(Number(server.memoryMb) / 1024).toFixed(1)} GB`);
    $('#server-allocation-meter').style.width = `${Math.min(100, Number(server.memoryMb) / system.totalMemoryMb * 100)}%`;
    try {
      const processMetrics = await api.getServerProcessMetrics(server.id);
      if (processMetrics.available) {
        setText('#server-process-cpu-value', processMetrics.cpuPercent === null ? 'Measuring…' : `${processMetrics.cpuPercent}%`);
        setText('#server-process-cpu-sub', `Java process · ${system.cpuLogicalCores || system.cpuCores || '?'} logical CPU threads · normalized to host capacity`);
        $('#server-process-cpu-meter').style.width = `${Math.min(100, processMetrics.cpuPercent || 0)}%`;
        const serverRamPercent = processMetrics.memoryPercent ?? processMetrics.memoryMb / Math.max(1, system.totalMemoryMb) * 100;
        setText('#server-process-ram-value', `${serverRamPercent.toFixed(2)}%`);
        setText('#server-process-ram-sub', `${(processMetrics.memoryMb / 1024).toFixed(2)} GB Java working set · PID ${processMetrics.pid} · share of host RAM`);
        $('#server-process-ram-meter').style.width = `${Math.max(0, Math.min(100, serverRamPercent))}%`;
      } else {
        setText('#server-process-cpu-value', server.status === 'starting' ? 'Starting' : '—'); setText('#server-process-cpu-sub', processMetrics.note || 'Java process unavailable'); $('#server-process-cpu-meter').style.width = '0%';
        setText('#server-process-ram-value', '—'); setText('#server-process-ram-sub', processMetrics.note || 'Java process unavailable'); $('#server-process-ram-meter').style.width = '0%';
      }
      const ping = await api.pingServer(server.id);
      setText('#server-player-value', ping.online ? `${ping.playersOnline} / ${ping.maxPlayers}` : 'Offline');
      setText('#server-player-sub', ping.online ? `Minecraft status ping · ${ping.version || server.version}` : 'Waiting for the server process');
      $('#server-player-meter').style.width = ping.online && ping.maxPlayers ? `${Math.min(100, ping.playersOnline / ping.maxPlayers * 100)}%` : '0%';
    } catch {
      setText('#server-player-value', server.status === 'running' ? 'Loading…' : 'Offline');
      setText('#server-player-sub', 'Player count appears after the server finishes starting');
    }
  } else {
    setText('#server-allocation-value', '—'); setText('#server-player-value', '—');
  }
  } finally { state.serverMetricsRefreshing = false; }
}
async function showServerCreateForm() {
  $('#server-empty-state').hidden = true;
  $('#server-dashboard-panel').hidden = true;
  $('#server-create-panel').hidden = false;
  renderServerMemoryLimit();
  $('#server-name').focus();
  try {
    await ensureCompatibleServerJava();
  } catch (error) {
    setText('#server-java-help', `Automatic Java setup could not complete: ${error.message}. You can retry the installation or select another installed runtime.`);
    toast(`Java runtime setup: ${error.message}`, 'error');
  }
}
function showServerDashboard() {
  $('#server-empty-state').hidden = true;
  $('#server-create-panel').hidden = true;
  $('#server-dashboard-panel').hidden = false;
  renderServerDashboard();
}
function setServerTab(tab) {
  state.serverTab = tab;
  $$('.server-tab').forEach(button => button.classList.toggle('active', button.dataset.serverTab === tab));
  ['console', 'plugins', 'mods', 'files', 'backups', 'network'].forEach(name => { $(`#server-tab-${name}`).hidden = name !== tab; });
  if (tab === 'files') loadServerFiles().catch(error => toast(error.message, 'error'));
  if (tab === 'plugins') { loadInstalledServerPlugins().catch(error => toast(error.message, 'error')); $('#server-plugin-query').focus(); }
  if (tab === 'mods') { if (selectedServer()?.software !== 'fabric') { $('#server-mod-results').textContent = 'This feature requires a Fabric server.'; } else { loadInstalledServerMods().catch(error => toast(error.message, 'error')); $('#server-mod-query').focus(); } }
  if (tab === 'backups') loadServerBackups().catch(error => toast(error.message, 'error'));
  if (tab === 'network') renderServerNetwork().catch(error => toast(error.message, 'error'));
}
async function createServerFromForm() {
  if (state.serverJavaInstallInProgress) { toast('Wait for Java installation to finish before creating this server.', 'warning'); return; }
  const button = $('#server-create-submit');
  const config = {
    name: $('#server-name').value.trim(), version: $('#server-version').value.trim(),
    software: $('#server-software').value, memoryMb: Number($('#server-memory-mb').value), javaPath: $('#server-java-runtime').value, performancePreset: $('#server-optimization').value,
    port: Number($('#server-port').value), maxPlayers: Number($('#server-max-players').value), acceptEula: $('#server-eula').checked,
    motd: $('#server-motd').value.trim(), difficulty: $('#server-difficulty').value, gameMode: $('#server-gamemode').value,
    worldSeed: $('#server-world-seed').value.trim(), worldType: $('#server-world-type').value,
    generateStructures: $('#server-generate-structures').checked, hardcore: $('#server-hardcore').checked,
    allowNether: $('#server-allow-nether').checked, enableCommandBlocks: $('#server-command-blocks').checked,
    spawnProtection: Number($('#server-spawn-protection').value),
    viewDistance: Number($('#server-view-distance').value), simulationDistance: Number($('#server-simulation-distance').value),
    onlineMode: $('#server-online-mode').value === 'true', whitelist: $('#server-whitelist').checked, pvp: $('#server-pvp').checked, allowFlight: $('#server-flight').checked,
  };
  button.disabled = true; button.textContent = 'Creating server…';
  $('#server-create-progress').hidden = false; $('#server-create-progress-fill').style.width = '8%'; setText('#server-create-progress-label', `Preparing Minecraft ${config.version} · ${config.software.toUpperCase()} server…`);
  try {
    const server = await api.createServer(config);
    state.servers = await api.listServers(); state.selectedServerId = server.id; state.serverTab = 'console';
    $('#server-create-progress-fill').style.width = '100%'; setText('#server-create-progress-label', 'Server created successfully.');
    renderServerList(); showServerDashboard(); setServerTab('console');
    toast(`${server.name} created. Press LAUNCH SERVER to boot Minecraft ${server.version}.`);
    setTimeout(() => { $('#server-create-progress').hidden = true; }, 1000);
  } catch (error) { toast(error.message, 'error'); setText('#server-create-progress-label', error.message); $('#server-create-progress-fill').style.width = '0%'; }
  finally { button.textContent = 'Download & Create Server'; renderServerMemoryLimit(); }
}
async function runServerAction(action) {
  const server = selectedServer(); if (!server) return;
  const buttons = ['#server-start-button', '#server-stop-button', '#server-restart-button']; buttons.forEach(selector => { $(selector).disabled = true; });
  try {
    if (action === 'start') { server.status = 'starting'; state.serverOnlineSince[server.id] = Date.now(); setServerStatus('starting', `Preparing Minecraft ${server.version} · ${server.software.toUpperCase()}`); await api.startServer(server.id); }
    else if (action === 'stop') { server.status = 'stopping'; setServerStatus('stopping', `Stopping Minecraft ${server.version}…`); await api.stopServer(server.id); }
    else { server.status = 'stopping'; setServerStatus('stopping', `Restarting Minecraft ${server.version}…`); await api.restartServer(server.id); }
    state.servers = await api.listServers(); renderServerDashboard();
    toast(action === 'start' ? 'Server process starting. Player status appears when it finishes loading.' : action === 'stop' ? 'Stop requested.' : 'Server restart requested.');
  } catch (error) {
    const current = selectedServer(); if (current) current.status = 'error';
    toast(error.message, 'error');
  }
  finally { buttons.forEach(selector => { $(selector).disabled = false; }); const latest = selectedServer(); if (latest) setServerStatus(latest.status || 'offline'); renderServerList(); }
}
function appendServerLog(event) {
  if (event.id !== state.selectedServerId) return;
  const host = $('#server-console-output'); if (!host) return;
  const stamp = new Date(event.time || Date.now()).toLocaleTimeString();
  const prefix = event.stream === 'stderr' ? '[ERR] ' : event.stream === 'system' ? '' : '';
  host.textContent = `${host.textContent}\n[${stamp}] ${prefix}${event.text}`.slice(-30000);
  host.scrollTop = host.scrollHeight;
}
async function sendServerCommand() {
  const server = selectedServer(); const input = $('#server-command-input');
  if (!server) return;
  const command = input.value.trim(); if (!command) return;
  try { await api.sendServerCommand(server.id, command); input.value = ''; }
  catch (error) { toast(error.message, 'error'); }
}
async function loadInstalledServerPlugins() {
  const server = selectedServer(); if (!server) return;
  const host = $('#server-installed-plugins'); host.replaceChildren();
  const result = await api.listServerPlugins(server.id);
  setText('#server-installed-plugin-count', result.plugins.length);
  if (!result.supported) {
    const note = document.createElement('div'); note.className = 'empty-state compact'; note.textContent = result.software === 'fabric' ? 'Fabric servers use Fabric mods, not Bukkit/Paper plugins. Open the Mods tab.' : 'Vanilla servers do not support Bukkit/Paper plugins. Use Paper or Purpur for plugins.'; host.append(note);
    $('#server-plugin-import').disabled = true; $('#server-plugin-search-button').disabled = true; $('#server-plugin-query').disabled = true; return;
  }
  $('#server-plugin-import').disabled = false; $('#server-plugin-search-button').disabled = false; $('#server-plugin-query').disabled = false;
  if (!result.plugins.length) { const empty = document.createElement('div'); empty.className = 'empty-state compact'; empty.textContent = 'No plugins installed in this server yet.'; host.append(empty); return; }
  for (const plugin of result.plugins) {
    const row = document.createElement('div'); row.className = 'server-installed-plugin-row';
    const name = document.createElement('b'); name.textContent = plugin.name;
    const size = document.createElement('small'); size.textContent = formatServerFileSize(plugin.size);
    const remove = document.createElement('button'); remove.type = 'button'; remove.className = 'small-ghost danger-ghost'; remove.textContent = 'Remove';
    remove.addEventListener('click', async () => {
      if (!confirm(`Remove plugin ${plugin.name}?`)) return;
      try { await api.removeServerFile(server.id, plugin.path); await loadInstalledServerPlugins(); toast(`${plugin.name} removed. Restart the server if it is running.`); }
      catch (error) { toast(error.message, 'error'); }
    });
    row.append(name, size, remove); host.append(row);
  }
}

async function searchServerPlugins() {
  const server = selectedServer(); if (!server) return;
  if (server.software === 'vanilla') { $('#server-plugin-results').textContent = 'Plugin installation requires Paper or Purpur. Vanilla servers do not load Bukkit/Paper plugins.'; return; }
  const query = $('#server-plugin-query').value.trim();
  const host = $('#server-plugin-results'); host.replaceChildren();
  const loading = document.createElement('div'); loading.className = 'empty-state compact'; loading.textContent = 'Searching Modrinth plugins…'; host.append(loading);
  try {
    const results = await api.searchServerPlugins(server.id, query);
    host.replaceChildren();
    if (!results.length) { const empty = document.createElement('div'); empty.className = 'empty-state compact'; empty.textContent = 'No compatible plugin projects found for this query.'; host.append(empty); return; }
    for (const plugin of results) {
      const card = document.createElement('article'); card.className = 'server-plugin-card';
      if (plugin.iconUrl) { const icon = document.createElement('img'); icon.src = plugin.iconUrl; icon.alt = ''; card.append(icon); }
      else { const icon = document.createElement('div'); icon.className = 'server-plugin-icon'; icon.textContent = '▦'; card.append(icon); }
      const copy = document.createElement('div'); copy.className = 'server-plugin-copy';
      const name = document.createElement('b'); name.textContent = plugin.title;
      const description = document.createElement('p'); description.textContent = plugin.description || 'Modrinth plugin project';
      const downloads = document.createElement('small'); downloads.textContent = `${Number(plugin.downloads || 0).toLocaleString()} downloads · ${plugin.compatible ? 'Version listed' : 'Version compatibility not confirmed'}`;
      copy.append(name, description, downloads); card.append(copy);
      const install = document.createElement('button'); install.className = 'button button-secondary'; install.type = 'button'; install.textContent = 'Install'; install.addEventListener('click', async () => {
        install.disabled = true; install.textContent = 'Installing…';
        try { const result = await api.downloadServerPlugin(server.id, plugin.projectId); toast(`${result.filename} installed. Restart the server to load it.`); install.textContent = 'Installed'; await loadInstalledServerPlugins(); }
        catch (error) { toast(error.message, 'error'); install.disabled = false; install.textContent = 'Install'; }
      });
      card.append(install); host.append(card);
    }
  } catch (error) { host.replaceChildren(); const node = document.createElement('div'); node.className = 'empty-state compact'; node.textContent = error.message; host.append(node); }
}
async function loadServerFiles() {
  const server = selectedServer(); if (!server) return;
  const host = $('#server-file-list'); host.replaceChildren();
  setText('#server-file-current-path', `/${state.serverFilePath}`);
  $('#server-file-editor').hidden = true;
  const entries = await api.listServerFiles(server.id, state.serverFilePath);
  if (!entries.length) { const empty = document.createElement('div'); empty.className = 'empty-state compact'; empty.textContent = 'This folder is empty.'; host.append(empty); }
  for (const item of entries) {
    const row = document.createElement('div'); row.className = 'server-file-row'; row.dataset.filePath = item.path;
    const main = document.createElement('button'); main.type = 'button'; main.className = 'server-file-main'; main.dataset.fileAction = item.type === 'directory' ? 'open' : 'select'; main.dataset.filePath = item.path;
    const symbol = document.createElement('b'); symbol.textContent = item.type === 'directory' ? '▰' : '▤';
    const filename = document.createElement('span'); filename.textContent = item.name; main.append(symbol, filename);
    const size = document.createElement('small'); size.textContent = item.type === 'directory' ? 'Folder' : formatServerFileSize(item.size);
    const edit = document.createElement('button'); edit.type = 'button'; edit.className = 'small-ghost'; edit.textContent = item.type === 'directory' ? 'Open' : 'Edit'; edit.dataset.fileAction = item.type === 'directory' ? 'open' : 'edit'; edit.dataset.filePath = item.path;
    row.append(main, size, edit); host.append(row);
  }
}
async function loadInstalledServerMods() {
  const server = selectedServer(); if (!server) return;
  const host = $('#server-installed-mods'); host.replaceChildren();
  if (server.software !== 'fabric') { host.textContent = 'Installed server mods are available for Fabric instances.'; setText('#server-installed-mod-count', '0'); return; }
  const files = await api.listServerFiles(server.id, 'mods').catch(() => []);
  const mods = files.filter(item => item.type === 'file' && item.name.toLowerCase().endsWith('.jar'));
  setText('#server-installed-mod-count', mods.length);
  if (!mods.length) { const empty = document.createElement('div'); empty.className = 'empty-state compact'; empty.textContent = 'No mods installed in this server yet.'; host.append(empty); return; }
  for (const mod of mods) {
    const row = document.createElement('div'); row.className = 'server-installed-plugin-row';
    const name = document.createElement('b'); name.textContent = mod.name;
    const size = document.createElement('small'); size.textContent = formatServerFileSize(mod.size);
    const remove = document.createElement('button'); remove.className = 'small-ghost danger-ghost'; remove.textContent = 'Remove';
    remove.addEventListener('click', async () => { if (!confirm(`Remove mod ${mod.name}?`)) return; try { await api.removeServerFile(server.id, `mods/${mod.name}`); await loadInstalledServerMods(); toast(`${mod.name} removed. Restart the server to apply changes.`); } catch (error) { toast(error.message, 'error'); } });
    row.append(name, size, remove); host.append(row);
  }
}

async function searchServerMods() {
  const server = selectedServer(); if (!server) return;
  if (server.software !== 'fabric') { $('#server-mod-results').textContent = 'Fabric mods require a Fabric server.'; return; }
  const query = $('#server-mod-query').value.trim(); const host = $('#server-mod-results');
  if (!query) { toast('Enter a mod name to search.', 'warning'); return; }
  host.textContent = 'Searching Modrinth for Fabric mods…';
  try {
    const results = await api.searchServerMods(server.id, query); host.replaceChildren();
    if (!results.length) { host.textContent = 'No compatible Fabric mods were found.'; return; }
    for (const mod of results) {
      const card = document.createElement('article'); card.className = 'server-plugin-card';
      if (mod.iconUrl) { const icon = document.createElement('img'); icon.src = mod.iconUrl; icon.alt = ''; card.append(icon); }
      else { const icon = document.createElement('div'); icon.className = 'server-plugin-icon'; icon.textContent = '◇'; card.append(icon); }
      const copy = document.createElement('div'); copy.className = 'server-plugin-copy';
      const title = document.createElement('b'); title.textContent = mod.title;
      const description = document.createElement('p'); description.textContent = mod.description || 'No description provided.';
      const meta = document.createElement('small'); meta.textContent = `${Number(mod.downloads || 0).toLocaleString()} downloads · ${mod.compatible ? 'Fabric · server compatible' : 'Server compatibility not confirmed'}`;
      copy.append(title, description, meta);
      const install = document.createElement('button'); install.className = 'button button-secondary'; install.textContent = 'Install'; install.disabled = !mod.compatible;
      install.addEventListener('click', async () => { install.disabled = true; install.textContent = 'Installing…'; try { const result = await api.downloadServerMod(server.id, mod.projectId); install.textContent = 'Installed'; toast(`${result.filename} installed. Restart the server to load it.`); } catch (error) { install.disabled = false; install.textContent = 'Install'; toast(error.message, 'error'); } });
      card.append(copy, install); host.append(card);
    }
  } catch (error) { host.textContent = error.message; toast(error.message, 'error'); }
}

async function loadServerBackups() {
  const server = selectedServer(); if (!server) return;
  const host = $('#server-backup-list'); host.replaceChildren();
  const backups = await api.listServerBackups(server.id);
  if (!backups.length) { const empty = document.createElement('div'); empty.className = 'empty-state compact'; empty.textContent = 'No backups created yet.'; host.append(empty); }
  for (const backup of backups) {
    const row = document.createElement('div'); row.className = 'server-backup-row';
    const info = document.createElement('div');
    const title = document.createElement('b'); title.textContent = new Date(backup.createdAt).toLocaleString();
    const detail = document.createElement('small'); detail.textContent = `${backup.included.length} items · ${(Number(backup.bytes || 0) / 1024 / 1024).toFixed(1)} MB captured · Local snapshot`;
    info.append(title, detail);
    const restore = document.createElement('button'); restore.className = 'small-ghost'; restore.textContent = 'Restore';
    restore.disabled = ['running', 'starting', 'stopping'].includes(server.status);
    restore.addEventListener('click', async () => {
      if (!confirm(`Restore this backup into ${server.name}? Existing matching world/config files will be copied to a rollback folder first.`)) return;
      restore.disabled = true; try { const result = await api.restoreServerBackup(server.id, backup.id); toast(`Backup restored. Previous files saved in ${result.rollbackDirectory}.`); await loadServerBackups(); } catch (error) { toast(error.message, 'error'); restore.disabled = false; }
    });
    row.append(info, restore); host.append(row);
  }
  $('#server-backup-create').disabled = ['running', 'starting', 'stopping'].includes(server.status);
}

async function renderServerNetwork() {
  const server = selectedServer(); if (!server) return;
  const port = Number(server.port) || 25565; const addresses = state.serverSystemInfo?.localIpv4Addresses || [];
  setText('#server-localhost-address', `127.0.0.1:${port}`);
  setText('#server-lan-address', addresses.length ? addresses.map(address => `${address}:${port}`).join(' · ') : 'No LAN IPv4 detected');
  setText('#server-network-port', `${port} / TCP`);
  setText('#playit-local-port', String(port));
  $('#server-public-address').value = server.publicAddress || '';
  $('#server-public-address-copy').disabled = !server.publicAddress;
  const playit = await api.getPlayitStatus();
  updatePlayitPanel(playit);
}

function updatePlayitPanel(status = state.playitStatus || {}) {
  state.playitStatus = status;
  setText('#playit-agent-status', status.message || (status.installed ? 'Playit agent installed.' : 'Playit agent is not installed.'));
  $('#playit-download-button').disabled = Boolean(status.running) || state.playitDownloading === true;
  $('#playit-start-button').disabled = !status.installed || Boolean(status.running);
  $('#playit-stop-button').disabled = !status.running;
  if (status.claimUrl || state.playitClaimUrl) {
    state.playitClaimUrl = status.claimUrl || state.playitClaimUrl;
    $('#playit-claim-row').hidden = false;
  }
  const server = selectedServer();
  if (status.detectedAddress && server && !$('#server-public-address').value.trim()) {
    $('#server-public-address').value = status.detectedAddress;
  }
}

async function refreshJavaRuntimeStatus() {
  const result = await api.detectJava();
  const runtimes = await api.listJavaRuntimes();
  const select = $('#settings-java-runtime');
  const selectedPath = String(state.settings?.javaPath || '');
  const active = state.settings?.profiles?.find(profile => profile.id === state.settings.activeProfileId);
  const required = requiredJavaForServerVersion(active?.version || '1.21.8');
  select.replaceChildren();
  const automatic = document.createElement('option'); automatic.value = ''; automatic.textContent = 'Automatic · Let Minecraft select a compatible Java version'; select.append(automatic);
  for (const runtime of Array.isArray(runtimes) ? runtimes : []) {
    const option = document.createElement('option'); option.value = runtime.executable;
    const compatible = Number(runtime.major) >= required;
    option.textContent = `Java ${runtime.version || runtime.major} · ${runtime.source || 'Detected installation'} · ${compatible ? 'Compatible' : `Needs Java ${required}+ for this version`}`;
    select.append(option);
  }
  select.value = [...select.options].some(option => option.value === selectedPath) ? selectedPath : '';
  $('#java-path').value = selectedPath;
  const button = $('#install-java-21');
  button.textContent = `↓ Install Java ${required}`;
  if (result.found && Number(result.major) >= required) {
    setText('#java-detect-result', `✓ ${result.version || `Java ${result.major}`} detected. Compatible with Minecraft ${active?.version || 'selected profile'} (Java ${required}+).`);
    setText('#home-java', result.version || `Java ${result.major}`);
  } else if (result.found) {
    setText('#java-detect-result', `⚠ Java ${result.major} detected, but Minecraft ${active?.version || 'selected profile'} needs Java ${required} or newer. CRYON can install the matching runtime or use automatic Java management.`);
    setText('#home-java', result.version || `Java ${result.major}`);
  } else {
    setText('#java-detect-result', `${result.message || 'No Java runtime detected.'} CRYON can use automatic Java management or install Java ${required}.`);
    setText('#home-java', 'Automatic');
  }
  return result;
}

function formatServerFileSize(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}
async function openServerTextFile(relativePath) {
  const server = selectedServer(); if (!server) return;
  try {
    const file = await api.readServerFile(server.id, relativePath);
    state.selectedServerFile = relativePath;
    setText('#server-file-editor-name', relativePath);
    $('#server-file-editor-content').value = file.content;
    $('#server-file-editor').hidden = false;
    $('#server-file-delete').disabled = false;
  } catch (error) { toast(error.message, 'error'); }
}
async function saveServerTextFile() {
  const server = selectedServer(); if (!server || !state.selectedServerFile) return;
  try {
    await api.writeServerFile(server.id, state.selectedServerFile, $('#server-file-editor-content').value);
    toast('Server file saved.');
    $('#server-file-editor').hidden = true; state.selectedServerFile = null; $('#server-file-delete').disabled = true;
  } catch (error) { toast(error.message, 'error'); }
}
async function deleteSelectedServerFile() {
  const server = selectedServer(); if (!server || !state.selectedServerFile) return;
  if (!confirm(`Delete ${state.selectedServerFile}? This cannot be undone.`)) return;
  try { await api.removeServerFile(server.id, state.selectedServerFile); state.selectedServerFile = null; $('#server-file-delete').disabled = true; $('#server-file-editor').hidden = true; await loadServerFiles(); toast('File deleted.'); }
  catch (error) { toast(error.message, 'error'); }
}
function getServerMemoryBounds() {
  const system = state.serverSystemInfo || {};
  const total = Math.max(0, Number(system.totalMemoryMb) || 0);
  const available = Math.max(0, Number(system.availableMemoryMb) || 0);
  // The selector represents installed physical RAM, not free RAM right now.
  // Real-time availability is enforced by the main process when Start is pressed.
  return { total, available, max: total };
}
function syncServerMemoryControls(source = 'slider') {
  const slider = $('#server-memory'); const number = $('#server-memory-mb');
  const min = 512; const max = Math.max(min, Number(slider.max) || min);
  if (source === 'number' && number.value.trim() === '') return;
  let value = Number(source.startsWith('number') ? number.value : slider.value);
  if (!Number.isFinite(value)) return;
  if (source === 'number' && (value < min || value > max)) return;
  value = Math.max(min, Math.min(max, Math.round(value)));
  slider.value = String(value); number.value = String(value);
  setText('#server-memory-value', `${(value / 1024).toFixed(2).replace(/0+$/, '').replace(/\.$/, '')} GB selected`);
  const percent = max > min ? (value - min) / (max - min) * 100 : 0;
  slider.style.setProperty('--memory-progress', `${percent}%`);
}
function renderServerMemoryLimit() {
  const { total, available, max } = getServerMemoryBounds();
  const slider = $('#server-memory'); const number = $('#server-memory-mb');
  const selectableMax = Math.max(512, max || 512);
  slider.min = '512'; slider.max = String(selectableMax); slider.step = '1';
  number.min = '512'; number.max = String(selectableMax); number.step = '1';
  const current = Number(number.value || slider.value) || 3584;
  const clamped = Math.max(512, Math.min(selectableMax, current));
  slider.value = String(clamped); number.value = String(clamped);
  setText('#server-memory-min-label', '512 MB');
  setText('#server-memory-max-label', `${max.toLocaleString()} MB max`);
  setText('#server-memory-installed-label', total ? `Installed: ${total.toLocaleString()} MB` : 'Detecting installed RAM…');
  const disabled = total < 512;
  $('#server-create-submit').disabled = disabled;
  setText('#server-memory-help', disabled
    ? 'CRYON could not detect at least 512 MB of installed RAM. Refresh system detection before creating a server.'
    : `You can select up to all installed RAM (${(total / 1024).toFixed(1)} GB). Server creation does not depend on free RAM. When you press Start, CRYON checks that Windows has at least ${(clamped / 1024).toFixed(2)} GB available, plus any other running CRYON server allocations. Leave memory for Windows and background apps.`);
  syncServerMemoryControls('slider');
}
function requiredJavaForServerVersion(version) {
  const [major = 1, minor = 0, patch = 0] = String(version || '').split('.').map(Number);
  if (major >= 26) return 25;
  if (major > 1 || minor >= 21 || (minor === 20 && patch >= 5)) return 21;
  if (minor >= 18) return 17;
  if (minor === 17) return 16;
  return 8;
}
async function refreshServerJavaRuntimes() {
  const select = $('#server-java-runtime');
  const previous = select.value;
  const required = requiredJavaForServerVersion($('#server-version').value);
  setText('#server-java-requirement', `Minecraft ${$('#server-version').value} requires Java ${required} or newer.`);
  const runtimes = await api.listJavaRuntimes();
  state.serverJavaRuntimes = Array.isArray(runtimes) ? runtimes : [];
  select.replaceChildren();
  const automatic = document.createElement('option'); automatic.value = ''; automatic.textContent = 'Automatic · Choose compatible runtime'; select.append(automatic);
  for (const runtime of state.serverJavaRuntimes) {
    const option = document.createElement('option'); option.value = runtime.executable;
    const compatible = Number(runtime.major) >= required;
    option.textContent = `Java ${runtime.version || runtime.major} · ${compatible ? 'Compatible' : `Needs Java ${required}+`} · ${runtime.vendor || 'Detected'}`;
    option.disabled = !compatible;
    option.dataset.major = String(runtime.major);
    select.append(option);
  }
  const installedMajors = new Set(state.serverJavaRuntimes.map(runtime => Number(runtime.major)));
  const downloadableMajors = [8, 16, 17, 21, 25].filter(major => major >= required && !installedMajors.has(major));
  if (downloadableMajors.length) {
    const group = document.createElement('optgroup'); group.label = 'Install when selected · Eclipse Temurin';
    for (const major of downloadableMajors) {
      const option = document.createElement('option'); option.value = `install:${major}`;
      option.textContent = `Java ${major} · Download and install automatically`;
      option.dataset.installMajor = String(major);
      group.append(option);
    }
    select.append(group);
  }
  const priorStillAvailable = [...select.options].some(option => option.value === previous && !option.disabled && !option.dataset.installMajor);
  select.value = priorStillAvailable ? previous : '';
  const compatible = state.serverJavaRuntimes.filter(runtime => Number(runtime.major) >= required).sort((a, b) => a.major - b.major);
  const exact = compatible.find(runtime => Number(runtime.major) === required);
  const chosen = state.serverJavaRuntimes.find(runtime => runtime.executable === select.value);
  setText('#server-java-help', chosen
    ? `Selected Java ${chosen.major} (${chosen.version}). This runtime will be saved only for this server.`
    : compatible.length
      ? `Automatic mode will use Java ${exact?.major || compatible[0].major} (${exact?.version || compatible[0].version}) for this server. Select another Java version below to download it automatically.`
      : `No compatible Java ${required}+ installation found. CRYON will download and install Java ${required} automatically when you open this creation step.`);
  const install = $('#server-java-install');
  install.textContent = state.serverJavaInstallInProgress ? 'Installing Java…' : `↓ Install Java ${required}`;
  install.disabled = state.serverJavaInstallInProgress || Boolean(exact);
  install.title = exact ? `Java ${required} is already installed.` : `Download and verify Eclipse Temurin Java ${required}.`;
}

async function ensureCompatibleServerJava() {
  await refreshServerJavaRuntimes();
  const required = requiredJavaForServerVersion($('#server-version').value);
  const compatible = state.serverJavaRuntimes.some(runtime => Number(runtime.major) >= required);
  if (!compatible && !state.serverJavaInstallInProgress) {
    setText('#server-java-help', `No compatible Java ${required}+ runtime found. CRYON is downloading and installing Java ${required} automatically.`);
    await installServerJavaMajor(required);
  }
}

async function installServerJavaMajor(major) {
  if (state.serverJavaInstallInProgress) return;
  const version = Number(major);
  if (![8, 16, 17, 21, 25].includes(version) || version < requiredJavaForServerVersion($('#server-version').value)) {
    throw new Error(`Java ${version} is not compatible with Minecraft ${$('#server-version').value}.`);
  }
  const select = $('#server-java-runtime');
  const installButton = $('#server-java-install');
  const createButton = $('#server-create-submit');
  const createWasDisabled = createButton.disabled;
  state.serverJavaInstallInProgress = true;
  select.disabled = true; installButton.disabled = true; createButton.disabled = true;
  $('#server-java-progress').hidden = false;
  $('#server-java-progress-fill').style.width = '3%';
  setText('#server-java-progress-label', `Preparing Temurin Java ${version}…`);
  setText('#server-java-help', `Installing Java ${version}. CRYON will select it for this server after verification.`);
  try {
    const installed = await api.installJavaMajor(version);
    await refreshServerJavaRuntimes();
    select.value = installed.executable;
    setText('#server-java-help', `Java ${installed.major} (${installed.version}) installed, verified and selected for this server only.`);
    $('#server-java-progress-fill').style.width = '100%';
    setText('#server-java-progress-label', `Java ${installed.version || installed.major} ready. This runtime is selected for this server.`);
    toast(`Java ${installed.major} installed and selected for this server.`);
  } catch (error) {
    setText('#server-java-progress-label', `Installation failed: ${error.message}`);
    setText('#server-java-help', `Java ${version} installation failed. Choose an installed runtime or retry the download. ${error.message}`);
    toast(`Java ${version} installation failed: ${error.message}`, 'error');
    await refreshServerJavaRuntimes().catch(() => {});
  } finally {
    state.serverJavaInstallInProgress = false;
    select.disabled = false; createButton.disabled = createWasDisabled;
    await refreshServerJavaRuntimes().catch(() => { installButton.disabled = false; });
    // refreshServerJavaRuntimes preserves the selected executable after a successful install.
  }
}
function applyServerOptimizationPreset() {
  const preset = $('#server-optimization').value;
  const settings = { 'low-resource': [6, 4], balanced: [8, 6], performance: [10, 8] };
  if (settings[preset]) {
    $('#server-view-distance').value = String(settings[preset][0]);
    $('#server-simulation-distance').value = String(settings[preset][1]);
  }
}



function setSkinStatus(message, type = 'info') {
  const status = $('#skin-status');
  if (status) { status.textContent = message; status.dataset.state = type; }
}

function renderSkinControls() {
  const account = state.account;
  const microsoft = account?.type === 'microsoft';
  $('#skin-upload-button').disabled = !state.selectedSkin || !microsoft || state.skinUploading;
  $('#skin-choose-button').disabled = state.skinUploading;
  $('#skin-variant').disabled = state.skinUploading || Boolean(state.selectedSkin?.legacy);
  $('#skin-refresh-button').disabled = state.skinUploading || !microsoft;
  setText('#skin-upload-hint', microsoft
    ? `Uploading to ${account.username || 'your Microsoft Minecraft account'} changes the official account skin. Other players can see it after Minecraft refreshes the profile.`
    : 'Sign in with a Microsoft account that owns Minecraft: Java Edition to upload a skin. Offline accounts can preview PNG files only.');
  setText('#skin-current-account', microsoft ? account.username : 'No Microsoft account selected');
}

async function refreshCurrentSkin() {
  renderSkinControls();
  if (state.account?.type !== 'microsoft') {
    state.currentSkin = null;
    $('#skin-current-image').hidden = true;
    $('#skin-current-placeholder').hidden = false;
    setText('#skin-account-state', state.account?.type === 'offline' ? 'OFFLINE ACCOUNT' : 'SIGN IN REQUIRED');
    setText('#skin-current-variant', 'Official account skin is available after Microsoft sign-in.');
    return;
  }
  setText('#skin-account-state', 'LOADING');
  try {
    const current = await api.getCurrentSkin();
    state.currentSkin = current;
    if (current?.url) {
      $('#skin-current-image').src = current.url;
      $('#skin-current-image').hidden = false;
      $('#skin-current-placeholder').hidden = true;
      setText('#skin-current-variant', `${String(current.variant || 'classic').toUpperCase()} · ACTIVE ON YOUR MINECRAFT ACCOUNT`);
      setText('#skin-account-state', 'ACTIVE');
    } else {
      $('#skin-current-image').hidden = true;
      $('#skin-current-placeholder').hidden = false;
      setText('#skin-current-variant', 'No active skin was returned by the Minecraft profile.');
      setText('#skin-account-state', 'NO SKIN');
    }
  } catch (error) {
    $('#skin-current-image').hidden = true;
    $('#skin-current-placeholder').hidden = false;
    setText('#skin-account-state', 'UNAVAILABLE');
    setText('#skin-current-variant', error.message || 'Could not load the current account skin.');
    throw error;
  }
}

async function chooseSkinFile() {
  try {
    const selected = await api.pickSkinFile();
    if (!selected) return;
    state.selectedSkin = selected;
    $('#skin-selected-preview').src = selected.previewUrl;
    $('#skin-selected-preview').hidden = false;
    $('#skin-selected-placeholder').hidden = true;
    setText('#skin-selected-name', selected.fileName);
    setText('#skin-selected-size', `PNG · ${selected.width}×${selected.height}${selected.legacy ? ' · legacy layout (Classic only)' : ''}`);
    $('#skin-variant').value = selected.legacy ? 'classic' : (selected.variant || 'classic');
    renderSkinControls();
    setSkinStatus('Skin image validated. Upload it to apply it to your Minecraft account.', 'success');
  } catch (error) { setSkinStatus(error.message, 'error'); toast(error.message, 'error'); }
}

async function uploadSelectedSkin() {
  if (!state.selectedSkin) return setSkinStatus('Choose a PNG skin first.', 'error');
  if (state.account?.type !== 'microsoft') return setSkinStatus('A signed-in Microsoft Minecraft account is required for an official skin upload.', 'error');
  state.skinUploading = true; renderSkinControls(); setSkinStatus('Uploading skin to Minecraft…', 'info');
  try {
    const result = await api.uploadSkin($('#skin-variant').value);
    if (result?.currentSkin) state.currentSkin = result.currentSkin;
    state.selectedSkin = null;
    $('#skin-selected-preview').hidden = true;
    $('#skin-selected-placeholder').hidden = false;
    setText('#skin-selected-name', 'No file selected');
    setText('#skin-selected-size', 'PNG · 64×64 or legacy 64×32');
    setSkinStatus('Skin uploaded successfully to your Microsoft Minecraft account.', 'success');
    toast('Minecraft skin uploaded successfully.');
    await refreshCurrentSkin();
  } catch (error) { setSkinStatus(error.message, 'error'); toast(error.message, 'error'); }
  finally { state.skinUploading = false; renderSkinControls(); }
}

async function initialize() {
  document.body.classList.add('home-active');
  try {
    const initial = await api.getState();
    state.settings = initial.settings; state.account = initial.account; state.accounts = initial.accounts || [];
    setText('#app-version', `v${initial.appVersion || '0.11.1'}`);
    state.performance = state.settings.performance || PRESETS.balanced;
    state.selectedPreset = state.settings.performancePreset || 'balanced';
    
    setText('#secure-status', initial.secureStorageAvailable ? 'OS-managed' : 'Unavailable (session only)');
    const versions = await api.getVersions(); state.versions = versions.versions || [];
    populateVersionSelect($('#server-version'), state.versions.find(item => item.type === 'release')?.id || '1.21.4');
    const activeProfile = state.settings.profiles.find(item => item.id === state.settings.activeProfileId) || state.settings.profiles[0];
    populateVersionSelect($('#version-select'), activeProfile.version);
    populateVersionSelect($('#new-profile-version'), state.versions.find(item => item.type === 'release')?.id || '1.21.1');
    resetProfileFormMode();
    applySettingsToForm(); updateAccount(initial.account); renderAccounts(); setAuthMethod('microsoft');
    await loadPartnerServers();
    if (state.partnerPingTimer) clearInterval(state.partnerPingTimer);
    state.partnerPingTimer = setInterval(() => loadPartnerServers().catch(() => {}), 60000);
    refreshJavaRuntimeStatus().catch(error => setText('#java-detect-result', `Java detection unavailable: ${error.message}`));
    renderPerformance(); renderProfileAccountAssignments();
    setText('#versions-source', versions.source === 'mojang' ? 'Mojang manifest' : 'Offline fallback list');
    if (versions.warning) toast('Could not refresh game versions. Using offline fallback list.', 'warning');
    await refreshMods(); renderPerformance();
  } catch (error) { toast(`Launcher initialization: ${error.message}`, 'error'); }
}
function updateAccount(account) {
  const previousAccountId = state.account?.id || null;
  state.account = account;
  if (previousAccountId !== (account?.id || null) && state.selectedSkin) {
    state.selectedSkin = null;
    if ($('#skin-selected-preview')) $('#skin-selected-preview').hidden = true;
    if ($('#skin-selected-placeholder')) $('#skin-selected-placeholder').hidden = false;
    setText('#skin-selected-name', 'No file selected');
    setText('#skin-selected-size', 'PNG · 64×64 or legacy 64×32');
  }
  if ($('#skin-upload-button')) renderSkinControls();
  setText('#auth-status', account ? (account.type === 'offline' ? 'Offline local identity' : 'Microsoft connected') : 'Not connected');
  updateHomeProfileSummary();
}

function loaderLabel(loader) {
  return ({ vanilla: 'Vanilla', fabric: 'Fabric', forge: 'Forge', neoforge: 'NeoForge', quilt: 'Quilt' })[loader] || 'Vanilla';
}
function autoProfileName(version, loader) {
  return `${version}-${loaderLabel(loader)}`;
}
function setGeneratedProfileName(force = false) {
  const input = $('#new-profile-name');
  if (!input) return;
  if (force || !state.profileNameTouched) {
    let generated = autoProfileName($('#new-profile-version').value, $('#new-profile-loader').value);
    const existing = new Set((state.settings?.profiles || []).map(item => item.name.toLowerCase()));
    if (existing.has(generated.toLowerCase())) {
      let suffix = 2;
      while (existing.has(`${generated}-${suffix}`.toLowerCase())) suffix += 1;
      generated = `${generated}-${suffix}`;
    }
    input.value = generated;
  }
  const folderSlug = input.value.normalize('NFKC').trim().toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, '_').replace(/^_+|_+$/g, '').slice(0, 48).replace(/_+$/g, '') || 'profile';
  setText('#new-profile-folder-preview', `.${folderSlug}`);
  const submit = $('#create-profile');
  if (submit) submit.textContent = `✧ Create ${$('#new-profile-version').value} Profile`;
}
function renderVersionChoices() {
  const host = $('#new-version-choices');
  if (!host) return;
  host.replaceChildren();
  const releases = state.versions.filter(item => item.type === 'release');
  const selected = $('#new-profile-version')?.value;
  const preferred = ['1.21.1', '1.8.9'];
  const ordered = [];
  const push = item => { if (item && !ordered.some(existing => existing.id === item.id)) ordered.push(item); };
  push(releases[0]);
  for (const id of preferred) push(releases.find(item => item.id === id));
  for (const item of releases) { if (ordered.length >= 5) break; push(item); }
  for (const item of ordered.slice(0, 5)) {
    const button = document.createElement('button');
    button.type = 'button'; button.className = `version-choice-card${item.id === selected ? ' selected' : ''}`;
    const art = document.createElement('span'); art.className = 'version-choice-art';
    art.innerHTML = '<b>MINECRAFT</b><strong>JAVA</strong><i>✦</i>';
    const title = document.createElement('span'); title.className = 'version-choice-title'; title.textContent = `Minecraft ${item.id}`;
    button.append(art, title);
    button.addEventListener('click', () => {
      $('#new-profile-version').value = item.id;
      $$('[data-version-id]').forEach(node => node.classList.toggle('selected', node.dataset.versionId === item.id));
      button.classList.add('selected');
      setGeneratedProfileName();
      $('#new-profile-loader-version').value = '';
    });
    button.dataset.versionId = item.id;
    host.append(button);
  }
  if (!ordered.length) {
    const empty = document.createElement('div'); empty.className = 'empty-state compact';
    empty.textContent = 'Could not load the official Minecraft release list. Check your connection and reopen this page.';
    host.append(empty);
  }
}
function setAuthMethod(method) {
  state.selectedAuthMethod = method === 'local' ? 'local' : 'microsoft';
  $('#auth-method-microsoft')?.classList.toggle('selected', state.selectedAuthMethod === 'microsoft');
  $('#auth-method-local')?.classList.toggle('selected', state.selectedAuthMethod === 'local');
  $('#microsoft-auth-panel').hidden = state.selectedAuthMethod !== 'microsoft';
  $('#local-auth-panel').hidden = state.selectedAuthMethod !== 'local';
}

$$('[data-page]').forEach(button => button.addEventListener('click', () => showPage(button.dataset.page)));
$('#server-new-button').addEventListener('click', showServerCreateForm);
$('#server-empty-create').addEventListener('click', showServerCreateForm);
$('#server-create-cancel').addEventListener('click', () => { if (selectedServer()) showServerDashboard(); else $('#server-empty-state').hidden = false; $('#server-create-panel').hidden = true; });
$('#server-list').addEventListener('click', async event => {
  const button = event.target.closest('[data-server-id]'); if (!button) return;
  state.selectedServerId = button.dataset.serverId; state.serverFilePath = ''; state.selectedServerFile = null; state.serverTab = 'console';
  state.servers = await api.listServers(); renderServerList(); showServerDashboard(); setServerTab('console');
  setText('#server-console-output', `[CRYON] Selected ${selectedServer()?.name || 'server'}.`);
  refreshServerMetrics().catch(error => toast(error.message, 'error'));
});
$('#server-create-submit').addEventListener('click', createServerFromForm);
$('#server-memory').addEventListener('input', () => syncServerMemoryControls('slider'));
$('#server-memory-mb').addEventListener('input', () => syncServerMemoryControls('number'));
$('#server-memory-mb').addEventListener('change', () => syncServerMemoryControls('number-commit'));
$('#server-version').addEventListener('change', () => ensureCompatibleServerJava().catch(error => { setText('#server-java-help', `Automatic Java setup failed: ${error.message}`); toast(error.message, 'error'); }));
$('#server-java-runtime').addEventListener('change', async () => {
  const value = $('#server-java-runtime').value;
  const installMatch = /^install:(8|16|17|21|25)$/.exec(value);
  if (installMatch) { await installServerJavaMajor(Number(installMatch[1])).catch(error => setText('#server-java-help', error.message)); return; }
  if (!value) await ensureCompatibleServerJava().catch(error => setText('#server-java-help', error.message));
  else await refreshServerJavaRuntimes().catch(error => setText('#server-java-help', error.message));
});
$('#server-optimization').addEventListener('change', applyServerOptimizationPreset);
$('#server-view-distance').addEventListener('input', () => { if ($('#server-optimization').value !== 'custom') $('#server-optimization').value = 'custom'; });
$('#server-simulation-distance').addEventListener('input', () => { if ($('#server-optimization').value !== 'custom') $('#server-optimization').value = 'custom'; });
$('#server-java-install').addEventListener('click', () => installServerJavaMajor(requiredJavaForServerVersion($('#server-version').value)).catch(error => setText('#server-java-help', error.message)));
$('#server-operation-stop').addEventListener('click', () => runServerAction('stop'));
$('#server-start-button').addEventListener('click', () => runServerAction('start'));
$('#server-stop-button').addEventListener('click', () => runServerAction('stop'));
$('#server-restart-button').addEventListener('click', () => runServerAction('restart'));
$('#server-open-folder').addEventListener('click', async () => { const server = selectedServer(); if (server) try { await api.openServerFolder(server.id); } catch (error) { toast(error.message, 'error'); } });
$('#server-delete-button').addEventListener('click', async () => {
  const server = selectedServer(); if (!server) return;
  if (!confirm(`Permanently delete ${server.name} and all its server files, worlds and plugins? This cannot be undone.`)) return;
  try {
    await api.deleteServer(server.id); state.selectedServerId = null; state.serverFilePath = ''; state.selectedServerFile = null;
    state.servers = await api.listServers(); state.selectedServerId = state.servers[0]?.id || null;
    renderServerList(); await refreshServerPage(); toast('Server and its local files deleted.');
  } catch (error) { toast(error.message, 'error'); }
});
$$('[data-server-tab]').forEach(button => button.addEventListener('click', () => setServerTab(button.dataset.serverTab)));
$('#server-command-send').addEventListener('click', sendServerCommand);
$('#server-command-input').addEventListener('keydown', event => { if (event.key === 'Enter') sendServerCommand(); });
$('#server-console-clear').addEventListener('click', () => { $('#server-console-output').textContent = '[CRYON] Console view cleared.'; state.serverLogs = []; });
$('#playit-download-button').addEventListener('click', async () => {
  const button = $('#playit-download-button'); button.disabled = true; state.playitDownloading = true;
  $('#playit-download-progress').hidden = false; $('#playit-download-progress-fill').style.width = '3%'; setText('#playit-download-progress-label', 'Checking official Playit release…');
  try { const result = await api.downloadPlayitAgent(); toast(`Playit ${result.version} downloaded and verified.`); updatePlayitPanel(await api.getPlayitStatus()); }
  catch (error) { setText('#playit-download-progress-label', `Download failed: ${error.message}`); toast(error.message, 'error'); }
  finally { state.playitDownloading = false; button.disabled = false; }
});
$('#playit-start-button').addEventListener('click', async () => {
  state.playitClaimUrl = null; $('#playit-claim-row').hidden = true; $('#playit-agent-output').textContent = '[CRYON] Starting Playit agent…';
  try { await api.startPlayitAgent(); updatePlayitPanel(await api.getPlayitStatus()); toast('Playit agent started. Complete the account claim if CRYON shows a link.'); }
  catch (error) { toast(`Playit start failed: ${error.message}`, 'error'); }
});
$('#playit-stop-button').addEventListener('click', async () => {
  try { await api.stopPlayitAgent(); updatePlayitPanel(await api.getPlayitStatus()); toast('Playit agent stopped.'); }
  catch (error) { toast(error.message, 'error'); }
});
$('#playit-open-dashboard').addEventListener('click', async () => { try { await api.openPlayitDashboard(); } catch (error) { toast(error.message, 'error'); } });
$('#playit-claim-open').addEventListener('click', async () => { if (!state.playitClaimUrl) return; try { await api.openPlayitClaim(state.playitClaimUrl); } catch (error) { toast(error.message, 'error'); } });
$('#server-public-address-save').addEventListener('click', async () => {
  const server = selectedServer(); if (!server) return;
  try {
    const address = await api.saveServerPublicAddress(server.id, $('#server-public-address').value);
    state.servers = await api.listServers();
    $('#server-public-address').value = address;
    $('#server-public-address-copy').disabled = !address;
    toast(address ? `Public address saved: ${address}` : 'Public address cleared.');
  } catch (error) { toast(error.message, 'error'); }
});
$('#server-public-address-copy').addEventListener('click', async () => {
  const value = $('#server-public-address').value.trim(); if (!value) return;
  try { await navigator.clipboard.writeText(value); toast('Public address copied.'); }
  catch { toast('Clipboard access is unavailable. Select and copy the address manually.', 'warning'); }
});
api.onJavaInstallProgress(progress => {
  $('#java-install-progress').hidden = false;
  if (Number.isFinite(progress.percent)) $('#java-install-progress-fill').style.width = `${Math.max(3, Math.min(100, progress.percent))}%`;
  else $('#java-install-progress-fill').style.width = '35%';
  setText('#java-install-progress-label', progress.message || `Java setup: ${progress.stage || 'working'}…`);
  if ($('#server-java-progress') && !$('#server-java-progress').hidden) {
    $('#server-java-progress-fill').style.width = `${Math.max(3, Math.min(100, Number(progress.percent) || 35))}%`;
    setText('#server-java-progress-label', progress.message || `Preparing Java ${requiredJavaForServerVersion($('#server-version').value)}…`);
  }
});
api.onPlayitDownloadProgress(progress => {
  $('#playit-download-progress').hidden = false;
  if (Number.isFinite(progress.percent)) $('#playit-download-progress-fill').style.width = `${Math.max(3, Math.min(100, progress.percent))}%`;
  setText('#playit-download-progress-label', progress.message || 'Downloading Playit agent…');
});
api.onPlayitStatus(status => updatePlayitPanel(status));
api.onPlayitLog(payload => {
  const output = $('#playit-agent-output');
  output.textContent = `${output.textContent}\n${payload.text || ''}`.slice(-18000);
  output.scrollTop = output.scrollHeight;
  if (payload.claimUrl) { state.playitClaimUrl = payload.claimUrl; $('#playit-claim-row').hidden = false; }
  if (payload.detectedAddress && !$('#server-public-address').value.trim()) $('#server-public-address').value = payload.detectedAddress;
});
$('#server-plugin-search-button').addEventListener('click', searchServerPlugins);
$('#server-plugin-query').addEventListener('keydown', event => { if (event.key === 'Enter') searchServerPlugins(); });
$('#server-mod-search-button').addEventListener('click', searchServerMods);
$('#server-mod-query').addEventListener('keydown', event => { if (event.key === 'Enter') searchServerMods(); });
$('#server-backup-create').addEventListener('click', async () => { const server = selectedServer(); if (!server) return; const button = $('#server-backup-create'); button.disabled = true; button.textContent = 'Creating…'; try { const backup = await api.createServerBackup(server.id); toast(`Backup created: ${backup.id}`); await loadServerBackups(); } catch (error) { toast(error.message, 'error'); } finally { button.disabled = false; button.textContent = '＋ Create Backup'; } });
$('#server-plugin-import').addEventListener('click', async () => {
  const server = selectedServer(); if (!server) return;
  try { const result = await api.importServerPlugin(server.id); if (result) { toast(`${result} copied to plugins/. Restart the server to load it.`); await loadInstalledServerPlugins(); } }
  catch (error) { toast(error.message, 'error'); }
});
$('#server-file-open-folder').addEventListener('click', async () => { const server = selectedServer(); if (server) try { await api.openServerFolder(server.id); } catch (error) { toast(error.message, 'error'); } });
$('#server-file-upload').addEventListener('click', async () => { const server = selectedServer(); if (!server) return; try { const result = await api.uploadServerFile(server.id, state.serverFilePath); if (result) { await loadServerFiles(); toast(`${result} uploaded to this server folder.`); } } catch (error) { toast(error.message, 'error'); } });
$('#server-file-up').addEventListener('click', async () => { if (!state.serverFilePath) return; state.serverFilePath = state.serverFilePath.split('/').slice(0, -1).join('/'); state.selectedServerFile = null; $('#server-file-delete').disabled = true; await loadServerFiles().catch(error => toast(error.message, 'error')); });
$('#server-file-list').addEventListener('click', async event => {
  const action = event.target.closest('[data-file-action]'); if (!action) return;
  const relativePath = action.dataset.filePath;
  if (action.dataset.fileAction === 'open') { state.serverFilePath = relativePath; state.selectedServerFile = null; $('#server-file-delete').disabled = true; await loadServerFiles().catch(error => toast(error.message, 'error')); }
  else if (action.dataset.fileAction === 'edit') await openServerTextFile(relativePath);
  else { state.selectedServerFile = relativePath; $('#server-file-delete').disabled = false; $$('.server-file-row').forEach(row => row.classList.toggle('selected', row.dataset.filePath === relativePath)); }
});
$('#server-file-editor-cancel').addEventListener('click', () => { $('#server-file-editor').hidden = true; state.selectedServerFile = null; $('#server-file-delete').disabled = true; });
$('#server-file-editor-save').addEventListener('click', saveServerTextFile);
$('#server-file-delete').addEventListener('click', deleteSelectedServerFile);
api.onServerLog(appendServerLog);
api.onServerCreateProgress(progress => {
  if (!$('#server-create-progress') || $('#server-create-progress').hidden) return;
  const pct = progress.stage === 'download' ? 55 : progress.stage === 'resolve' ? 20 : 35;
  $('#server-create-progress-fill').style.width = `${pct}%`;
  setText('#server-create-progress-label', progress.message || (progress.stage === 'download' ? 'Downloading server JAR…' : 'Preparing local server…'));
});
api.onServerStatus(event => {
  const server = state.servers.find(item => item.id === event.id);
  if (server) server.status = event.status;
  if (event.status === 'starting' && !state.serverOnlineSince[event.id]) state.serverOnlineSince[event.id] = Date.now();
  if (['offline', 'error'].includes(event.status)) delete state.serverOnlineSince[event.id];
  renderServerList();
  if (event.id === state.selectedServerId) setServerStatus(event.status, event.message);
});
document.addEventListener('click', () => $$('.profile-card-context-menu').forEach(menu => { menu.hidden = true; }));
$('#account-action').addEventListener('click', () => showPage(state.account ? 'accounts' : 'add-account'));
$('#microsoft-login').addEventListener('click', async () => {
  const button = $('#microsoft-login'); button.disabled = true; button.textContent = 'Opening Microsoft sign in…';
  try { state.account = await api.login(); const data = await api.getState(); state.accounts = data.accounts || []; updateAccount(state.account); renderAccounts(); showPage('accounts'); toast('Microsoft account added.'); }
  catch (error) { toast(error.message, 'error'); }
  finally { button.disabled = false; button.textContent = 'Sign in with Microsoft'; }
});
$('#offline-login').addEventListener('click', async () => {
  const button = $('#offline-login'); button.disabled = true;
  try { state.account = await api.offlineLogin($('#offline-username').value); const data = await api.getState(); state.accounts = data.accounts || []; updateAccount(state.account); renderAccounts(); showPage('accounts'); toast('Local offline identity created.'); }
  catch (error) { toast(error.message, 'error'); } finally { button.disabled = false; }
});
$('#active-profile-select').addEventListener('change', async () => {
  try { state.settings = await api.selectProfile($('#active-profile-select').value); applySettingsToForm(); await afterProfileSwitch(); renderProfiles(); toast('Active profile changed.'); }
  catch (error) { toast(error.message, 'error'); }
});
async function persistSelectedProfile() {
  updateProfileFromUI();
  try { await saveActiveProfileFromHome(); }
  catch (error) { toast(error.message, 'error'); }
}
$('#version-select').addEventListener('change', async () => {
  if ($('#loader-select').value !== 'vanilla') { $('#loader-version').value = ''; try { await resolveLoaderInto('#version-select', '#loader-select', '#loader-version'); } catch { /* manual build can be entered */ } }
  else await persistSelectedProfile();
});
$('#loader-select').addEventListener('change', async () => {
  $('#loader-version').value = '';
  if ($('#loader-select').value !== 'vanilla') {
    try { await resolveLoaderInto('#version-select', '#loader-select', '#loader-version'); }
    catch { /* allow user to enter a compatible loader build manually */ }
  } else await persistSelectedProfile();
});
$('#loader-version').addEventListener('change', persistSelectedProfile);
$('#resolve-home-loader').addEventListener('click', async () => { try { await resolveLoaderInto('#version-select', '#loader-select', '#loader-version'); } catch { /* surfaced in toast */ } });
$('#new-profile-name').addEventListener('input', () => {
  state.profileNameTouched = true;
  setGeneratedProfileName();
});
$('#new-profile-version').addEventListener('change', () => {
  setGeneratedProfileName();
  $('#new-profile-loader-version').value = '';
  renderVersionChoices();
});
$('#new-profile-loader').addEventListener('change', () => {
  $('#new-profile-loader-version').value = '';
  setGeneratedProfileName();
});
$('#resolve-new-loader').addEventListener('click', async () => {
  if ($('#new-profile-loader').value === 'vanilla') return;
  try { await resolveLoaderInto('#new-profile-version', '#new-profile-loader', '#new-profile-loader-version'); }
  catch { /* the loader can be resolved again when the profile is created or launched */ }
});
$('#new-profile-memory').addEventListener('input', () => setText('#new-profile-memory-value', `${(Number($('#new-profile-memory').value) / 1024).toFixed(1)} GB`));
$('#create-profile').addEventListener('click', async () => {
  const button = $('#create-profile'); button.disabled = true;
  try {
    const profile = {
      name: $('#new-profile-name').value.trim(), category: 'standard',
      version: $('#new-profile-version').value, loader: $('#new-profile-loader').value,
      loaderVersion: $('#new-profile-loader-version').value.trim(),
      ramMin: 1024, ramMax: Number($('#new-profile-memory').value),
    };
    if (profile.loader !== 'vanilla' && !profile.loaderVersion) {
      button.textContent = 'Finding compatible loader…';
      try { profile.loaderVersion = await api.resolveLoader(profile.version, profile.loader); }
      catch (error) { throw new Error(`Couldn't find a compatible ${profile.loader} build for ${profile.version}. ${error.message}`); }
    }
    button.textContent = 'Creating isolated profile…';
    const result = await api.createProfile(profile);
    state.settings = result.settings; applySettingsToForm(); await afterProfileSwitch();
    renderProfiles(); showPage('profiles');
    toast(`${result.profile.name} saved. PLAY initializes its real game folder and downloads Minecraft files.`);
  } catch (error) { toast(error.message, 'error'); }
  finally { button.disabled = false; setGeneratedProfileName(); }
});
async function launchProfile(profileId, partnerServerId = null, sourceButton = null) {
  const profiles = state.settings?.profiles || [];
  const profile = profiles.find(item => item.id === profileId) || profiles.find(item => item.id === state.settings?.activeProfileId) || profiles[0];
  if (!profile) { toast('Create or select a Minecraft profile first.', 'error'); showPage('profiles'); return; }
  const account = accountForProfile(profile);
  if (!account) { setAuthMethod('microsoft'); showPage('add-account'); return toast(`Add or select an account for ${profile.name} first.`, 'warning'); }
  try {
    if (state.settings.activeProfileId !== profile.id) { state.settings = await api.selectProfile(profile.id); applySettingsToForm(); await afterProfileSwitch(); }
  } catch (error) { return toast(error.message, 'error'); }
  const playButton = $('#play-button'); playButton.disabled = true; if (sourceButton) { sourceButton.disabled = true; sourceButton.textContent = 'LAUNCHING…'; }
  setText('#play-label', 'PREPARING…'); setText('#play-subtitle', `Preparing ${profile.version}-${loaderLabel(profile.loader)}`);
  setText('.play-symbol', '◌'); $('#launch-progress').hidden = false; $('#progress-fill').style.width = '0%'; setText('#progress-label', `Preparing ${profile.version}-${loaderLabel(profile.loader)}…`); setText('#progress-percent', '0%'); $('#launch-log').textContent = '';
  try {
    if (partnerServerId) {
      const server = [...state.partnerServers, ...state.communityServers].find(item => item.id === partnerServerId);
      setText('#progress-label', `Preparing ${profile.version} and joining ${server?.name || 'the selected server'}…`);
    }
    // The main process reports the actual game-start event separately. EML's
    // launch promise resolves only after the Minecraft process exits, so do not
    // overwrite the closed status with a late 'started' message here.
    await api.launch({ profileId: profile.id, ...(partnerServerId ? { partnerServerId } : {}) });
  }
  catch (error) {
    toast(error.message, 'error'); setText('#progress-label', `Launch failed: ${error.message}`);
    setText('#play-label', 'LAUNCH GAME'); setText('.play-symbol', '▶');
    playButton.disabled = !loaderCompatibility(profile.version, profile.loader).ok;
  }
  finally { if (sourceButton) { sourceButton.disabled = false; sourceButton.textContent = '▶  PLAY'; } }
}
$('#play-button').addEventListener('click', () => launchProfile(state.settings.activeProfileId));
$('#home-profile-menu').addEventListener('click', () => { const menu = $('#home-profile-shortcuts'); menu.hidden = !menu.hidden; });
document.addEventListener('click', event => { const menu = $('#home-profile-shortcuts'); if (menu && !menu.contains(event.target) && !$('#home-profile-menu')?.contains(event.target)) menu.hidden = true; });

api.onLauncherStatus(status => {
  $('#launch-progress').hidden = false; setText('#progress-label', status.message || status.state); setText('#engine-status', status.state === 'error' ? 'Error' : status.state);
  if (['resolving', 'preparing', 'installing'].includes(status.state)) {
    setText('#play-label', 'PREPARING…');
    const profile = state.settings?.profiles?.find(item => item.id === state.settings.activeProfileId);
    if (profile) setText('#play-subtitle', `Preparing ${profile.version}-${loaderLabel(profile.loader)}`);
    setText('.play-symbol', '◌');
  }
  if (status.state === 'starting') {
    setText('#play-label', 'GAME RUNNING');
    const profile = state.settings?.profiles?.find(item => item.id === state.settings.activeProfileId);
    if (profile) setText('#play-subtitle', `${profile.version}-${loaderLabel(profile.loader)} · In game`);
    setText('.play-symbol', '●');
    $('#progress-fill').style.width = '100%'; refreshActiveProfileFolderInfo();
  }
  if (status.state === 'closed' || status.state === 'error') {
    $('#play-button').disabled = !loaderCompatibility(state.settings?.minecraftVersion || '1.21.8', state.settings?.loader || 'vanilla').ok;
    setText('#play-label', 'LAUNCH GAME'); setText('.play-symbol', '▶');
    const profile = state.settings?.profiles?.find(item => item.id === state.settings.activeProfileId);
    if (profile) setText('#play-subtitle', profile.loader === 'vanilla' ? 'Minecraft Java Edition' : 'Manage mods & packs');
  }
  if (status.state === 'closed') refreshActiveProfileFolderInfo();
  if (status.state === 'installing' || status.state === 'preparing' || status.state === 'resolving') $('#progress-fill').style.width = '2%';
  if (status.state === 'error') toast(status.message || 'Minecraft launch failed.', 'error');
});
api.onLauncherEvent(event => {
  const payload = event.payload || {};
  if (event.type === 'launch_download' || event.type === 'download_progress') {
    const total = Number(payload.total?.amount || 0); const downloaded = Number(payload.downloaded?.amount || 0);
    const pct = total > 0 ? Math.min(99, Math.round(downloaded / total * 100)) : 0;
    $('#progress-fill').style.width = `${pct}%`; setText('#progress-percent', `${pct}%`);
    setText('#progress-label', `Downloading ${payload.type || 'Minecraft files'} (${downloaded}/${total || '…'})`);
  } else if (event.type === 'launch_compute_download') setText('#progress-label', 'Checking installed files…');
  else if (event.type === 'launch_install_loader') setText('#progress-label', `Installing ${payload.type || 'mod loader'} ${payload.loaderVersion || ''}…`);
  else if (event.type === 'launch_check_java') setText('#progress-label', 'Checking / preparing Java runtime…');
  else if (event.type === 'launch_copy_assets') setText('#progress-label', 'Preparing game assets…');
  else if (event.type === 'launch_extract_natives') setText('#progress-label', 'Extracting native libraries…');
  else if (event.type === 'launch_launch') { $('#progress-fill').style.width = '100%'; setText('#progress-label', 'Minecraft game process is starting.'); }
  if (event.type === 'launch_data' || event.type === 'launch_debug' || event.type === 'download_error' || event.type === 'patch_error') {
    const log = $('#launch-log'); log.textContent = `${log.textContent}\n${typeof payload === 'string' ? payload : JSON.stringify(payload)}`.trim().slice(-4000); log.scrollTop = log.scrollHeight;
  }
  if (event.type === 'launch_crash') toast('Minecraft reported a crash. Open launcher logs for details.', 'error');
  if (event.type === 'download_error' || event.type === 'patch_error') toast(payload.message || 'A game file failed to download or patch.', 'error');
});
api.onAccountsUpdated(accounts => { state.accounts = accounts || []; renderAccounts(); renderSkinControls(); });
api.onNotice(notice => toast(notice.message, notice.type || 'warning'));
$('#mod-search-button').addEventListener('click', () => loadCatalog($('#mod-search-input').value.trim()));
$('#mod-search-input').addEventListener('keydown', event => { if (event.key === 'Enter') $('#mod-search-button').click(); });
$('#refresh-mods').addEventListener('click', () => { if (state.catalogView === 'installed') refreshMods(); else loadCatalog($('#mod-search-input').value.trim()); });
$$('[data-mod-type]').forEach(button => button.addEventListener('click', () => setModType(button.dataset.modType)));
$$('[data-catalog-view]').forEach(button => button.addEventListener('click', async () => {
  state.catalogView = button.dataset.catalogView;
  $$('[data-catalog-view]').forEach(item => item.classList.toggle('active', item === button));
  $('#catalog-browse-panel').hidden = state.catalogView !== 'browse'; $('#catalog-installed-panel').hidden = state.catalogView !== 'installed';
  if (state.catalogView === 'installed') await refreshMods(); else if (!state.catalogLoaded) await loadCatalog('');
}));
$('#mod-sort').addEventListener('change', () => loadCatalog($('#mod-search-input').value.trim()));
$('#mod-release-channel').addEventListener('change', () => { if (state.catalogView === 'browse') loadCatalog($('#mod-search-input').value.trim()); });
$('#datapack-world-select').addEventListener('change', async () => { state.selectedWorldFolder = $('#datapack-world-select').value; if (state.catalogView === 'installed') await refreshMods(); });
$('#profile-search').addEventListener('input', renderProfiles); $('#profile-sort').addEventListener('change', renderProfiles);
$('#skin-choose-button').addEventListener('click', chooseSkinFile);
$('#skin-upload-button').addEventListener('click', uploadSelectedSkin);
$('#skin-refresh-button').addEventListener('click', () => refreshCurrentSkin().catch(error => setSkinStatus(error.message, 'error')));
$('#skin-variant').addEventListener('change', () => { if (state.selectedSkin && !state.selectedSkin.legacy) setSkinStatus(`Ready to upload using the ${$('#skin-variant').value} model.`, 'info'); });
$('#account-search').addEventListener('input', renderAccounts); $('#account-sort').addEventListener('change', renderAccounts);
$('#auth-method-microsoft').addEventListener('click', () => setAuthMethod('microsoft'));
$('#auth-method-local').addEventListener('click', () => setAuthMethod('local'));
$$('[data-page="add-account"]').forEach(button => button.addEventListener('click', () => { setAuthMethod('microsoft'); showPage('add-account'); }));
$('#open-create-profile').addEventListener('click', () => { resetProfileFormMode(); showPage('add-version'); });
$('#backup-mods').addEventListener('click', async () => { const button = $('#backup-mods'); button.disabled = true; try { const backup = await api.backupMods(); toast(`Mod backup created: ${backup.split(/[\\/]/).pop()}`); await refreshModBackups(); } catch (e) { toast(e.message, 'error'); } finally { button.disabled = false; } });
$('#import-local-mod').addEventListener('click', async () => { const button = $('#import-local-mod'); button.disabled = true; try { const imported = await api.importLocalMod(); if (!imported) return; await refreshMods(); toast(`${imported.filename} imported into this profile.`); } catch (e) { toast(e.message, 'error'); } finally { button.disabled = false; } });
$('#restore-mod-backup').addEventListener('click', async () => { const backupId = $('#mod-backup-select').value; if (!backupId) return; if (!confirm('Restore this backup? CRYON will first create a backup of the current mods folder.')) return; const button = $('#restore-mod-backup'); button.disabled = true; try { await api.restoreModBackup(backupId); await refreshMods(); toast('Mod backup restored.'); } catch (e) { toast(e.message, 'error'); } finally { button.disabled = false; } });
$('#check-mod-updates').addEventListener('click', async () => { const button = $('#check-mod-updates'); button.disabled = true; button.textContent = 'Checking…'; try { const count = await checkContentUpdates(); if (count) toast(`${count} update(s) available.`); } catch (e) { toast(e.message, 'error'); } finally { button.disabled = false; button.textContent = 'Check updates'; } });
$$('.preset-card').forEach(card => card.addEventListener('click', () => { state.selectedPreset = card.dataset.preset; state.performance = PRESETS[state.selectedPreset]; renderPerformance(); }));
$('#save-performance').addEventListener('click', async () => { try { state.performance = await api.savePerformance({ ...state.performance, preset: state.selectedPreset }); await api.saveSettings({ performancePreset: state.selectedPreset }); renderPerformance(); toast('Performance profile saved.'); } catch (e) { toast(e.message, 'error'); } });
$('#pick-game-directory').addEventListener('click', async () => { const path = await api.pickGameDirectory(); if (path) { state.settings.gameDirectory = path; setText('#game-directory-label', path); refreshActiveProfileFolderInfo(); await refreshMods(); toast('Game data parent folder updated.'); } });
$('#pick-java').addEventListener('click', async () => { const path = await api.pickJava(); if (path) { state.settings.javaPath = path; await refreshJavaRuntimeStatus(); setText('#home-java', 'Custom'); } });
$('#settings-java-runtime').addEventListener('change', async () => {
  const select = $('#settings-java-runtime'); select.disabled = true;
  try { const result = await api.selectJavaRuntime(select.value); state.settings = result.settings || state.settings; $('#java-path').value = result.javaPath || ''; await refreshJavaRuntimeStatus(); setText('#home-java', result.runtime?.version || (result.javaPath ? 'Custom' : 'Auto')); toast(result.javaPath ? `Java ${result.runtime?.major || ''} selected for the launcher.` : 'Automatic Java selection enabled.'); }
  catch (error) { toast(error.message, 'error'); await refreshJavaRuntimeStatus(); }
  finally { select.disabled = false; }
});
$('#detect-java').addEventListener('click', async () => { setText('#java-detect-result', 'Detecting…'); try { await refreshJavaRuntimeStatus(); } catch (error) { setText('#java-detect-result', error.message); } });
$('#install-java-21').addEventListener('click', async () => {
  const button = $('#install-java-21');
  if (state.javaInstallInProgress) return;
  const active = state.settings?.profiles?.find(profile => profile.id === state.settings.activeProfileId);
  const major = requiredJavaForServerVersion(active?.version || '1.21.8');
  state.javaInstallInProgress = true; button.disabled = true;
  $('#java-install-progress').hidden = false; $('#java-install-progress-fill').style.width = '3%'; setText('#java-install-progress-label', `Preparing secure Java ${major} download…`);
  try {
    const installed = await api.installJavaMajor(major);
    const selection = await api.selectJavaRuntime(installed.executable);
    state.settings = selection.settings || state.settings;
    applySettingsToForm();
    $('#java-install-progress-fill').style.width = '100%';
    setText('#java-install-progress-label', `${installed.vendor || 'Eclipse Temurin'} Java ${installed.version || installed.major} installed, verified and selected.`);
    await refreshJavaRuntimeStatus();
    toast(`Java ${installed.major} installed and selected for Minecraft ${active?.version || 'your profile'}.`);
  } catch (error) {
    setText('#java-install-progress-label', `Installation failed: ${error.message}`);
    toast(`Java ${major} installation failed: ${error.message}`, 'error');
  } finally { state.javaInstallInProgress = false; button.disabled = false; }
});
$('#ram-min').addEventListener('input', () => setText('#ram-min-value', `${$('#ram-min').value} MB`));
$('#ram-max').addEventListener('input', () => setText('#ram-max-value', `${$('#ram-max').value} MB`));
$('#setting-download-concurrency').addEventListener('input', () => setText('#download-concurrency-value', $('#setting-download-concurrency').value));
$('#save-settings').addEventListener('click', async () => {
  const ramMin = Number($('#ram-min').value), ramMax = Number($('#ram-max').value);
  const windowWidth = Number($('#setting-window-width').value), windowHeight = Number($('#setting-window-height').value);
  const concurrency = Number($('#setting-download-concurrency').value);
  if (!Number.isInteger(ramMin) || !Number.isInteger(ramMax) || ramMin < 512 || ramMax < ramMin || ramMax > 65536) return toast('RAM must be valid: min ≥ 512 MB, max ≥ min and ≤ 65536 MB.', 'error');
  if (!Number.isInteger(windowWidth) || windowWidth < 640 || windowWidth > 7680 || !Number.isInteger(windowHeight) || windowHeight < 480 || windowHeight > 4320) return toast('Window dimensions are outside the allowed range.', 'error');
  if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 16) return toast('Modpack download concurrency must be 1–16.', 'error');
  try {
    state.settings = await api.saveSettings({
      ramMin, ramMax, windowWidth, windowHeight, javaPath: $('#java-path').value.trim(),
      startOnLogin: $('#setting-start-on-login').checked,
      hideLauncherOnGameStart: $('#setting-hide-launcher').checked,
      hide3DCharacter: $('#setting-hide-character').checked,
      fullscreen: $('#setting-fullscreen').checked,
      javaArgs: $('#setting-java-args').value,
      downloadConcurrency: concurrency,
    });
    applySettingsToForm(); setText('#settings-feedback', 'Saved successfully.'); toast('Settings saved.');
  } catch (e) { toast(e.message, 'error'); }
});
$('#open-logs').addEventListener('click', () => api.openLogs());
$('#open-logs-settings').addEventListener('click', () => api.openLogs());
$('#open-game-directory').addEventListener('click', async () => { try { await api.openGameDirectory(); } catch (e) { toast(e.message, 'error'); } });
$('#open-install-directory').addEventListener('click', async () => { try { await api.openInstallDirectory(); } catch (e) { toast(e.message, 'error'); } });
$('#open-config-directory').addEventListener('click', async () => { try { await api.openConfigDirectory(); } catch (e) { toast(e.message, 'error'); } });
$('#open-active-profile-folder').addEventListener('click', async () => { try { await api.openProfileFolder(state.settings.activeProfileId); } catch (e) { toast(e.message, 'error'); } });
$('#partner-refresh').addEventListener('click', async () => {
  const button = $('#partner-refresh'); button.disabled = true;
  try { await loadPartnerServers(true); } finally { button.disabled = false; }
});

$$('[data-partner-tab]').forEach(button => button.addEventListener('click', () => {
  state.partnerTab = button.dataset.partnerTab === 'community' ? 'community' : 'partners';
  $('#partner-directory-search').value = '';
  renderPartnerDirectory();
}));
$('#partner-directory-search').addEventListener('input', renderPartnerDirectory);
$('#partner-sort-toggle').addEventListener('click', () => {
  const button = $('#partner-sort-toggle');
  button.dataset.sort = button.dataset.sort === 'name' ? 'live' : 'name';
  button.innerHTML = button.dataset.sort === 'live' ? '● <span>Live ranking</span>' : 'A–Z <span>Name</span>';
  renderPartnerDirectory();
});
$('#partner-add-toggle').addEventListener('click', () => {
  if (state.partnerTab === 'partners') return;
  const form = $('#community-server-form'); form.dataset.open = form.dataset.open === 'true' ? 'false' : 'true';
  form.hidden = form.dataset.open !== 'true';
  if (!form.hidden) $('#community-server-name').focus();
});
$('#community-server-cancel').addEventListener('click', () => {
  const form = $('#community-server-form'); form.dataset.open = 'false'; form.hidden = true;
});
$('#community-server-form').addEventListener('submit', async event => {
  event.preventDefault();
  const button = $('#community-server-save'); button.disabled = true; button.textContent = 'Saving…';
  try {
    await api.addCommunityServer({ name: $('#community-server-name').value, address: $('#community-server-address').value });
    $('#community-server-name').value = ''; $('#community-server-address').value = '';
    $('#community-server-form').dataset.open = 'false'; $('#community-server-form').hidden = true;
    state.partnerTab = 'community'; await loadPartnerServers(); toast('Server added to Your Servers.');
  } catch (error) { toast(error.message, 'error'); }
  finally { button.disabled = false; button.textContent = 'Add server'; }
});

function renderLauncherUpdate(value) {
  setText('#launcher-update-status', value.message);
  const progress = $('#launcher-update-progress');
  progress.hidden = value.status !== 'downloading'; progress.value = value.percent || 0;
  $('#launcher-update-check').disabled = ['disabled', 'checking', 'downloading', 'ready', 'installing'].includes(value.status);
  $('#launcher-update-install').hidden = value.status !== 'ready';
  $('#launcher-update-banner').hidden = value.status !== 'ready';
  if (value.status === 'ready') $('#launcher-update-banner').textContent = `Update v${value.version} ready · Restart`;
}
api.onUpdateState(renderLauncherUpdate);
api.getUpdateState().then(renderLauncherUpdate).catch(error => setText('#launcher-update-status', error.message));
$('#launcher-update-check').addEventListener('click', () => api.checkLauncherUpdate().then(renderLauncherUpdate).catch(error => toast(error.message, 'error')));
const installLauncherUpdate = () => api.installLauncherUpdate().catch(error => toast(error.message, 'warning'));
$('#launcher-update-install').addEventListener('click', installLauncherUpdate);
$('#launcher-update-banner').addEventListener('click', installLauncherUpdate);
initialize();
