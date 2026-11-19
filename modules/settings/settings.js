import { createStarterProfiles, normalizeProfile } from '../launcher/profiles.js';

export function createDefaultSettings() {
  const profiles = createStarterProfiles('26.3');
  return {
    minecraftVersion: profiles[0].version, loader: profiles[0].loader, loaderVersion: profiles[0].loaderVersion,
    gameDirectory: '', javaPath: '', activeProfileId: profiles[0].id, profiles,
    ramMin: 1024, ramMax: 4096, windowWidth: 1280, windowHeight: 720, performancePreset: 'balanced',
    startOnLogin: false, hideLauncherOnGameStart: false, hide3DCharacter: false, fullscreen: false, javaArgs: '', downloadConcurrency: 6,
    performance: { preset: 'balanced', name: 'Balanced', renderDistance: 10, entityDistance: 75, particles: 'decreased', clouds: false, smoothLighting: true, vSync: false },
    hud: { fps: true, ping: true, coordinates: true, direction: true, keystrokes: true, cps: true, armor: true, potions: true, target: true, sprint: true, crosshair: true, durability: true, itemCount: true },
  };
}

export function sanitizeSettings(raw = {}) {
  const defaults = createDefaultSettings();
  const input = raw && typeof raw === 'object' ? raw : {};
  const ramMin = Number(input.ramMin ?? defaults.ramMin);
  const ramMax = Number(input.ramMax ?? defaults.ramMax);
  let profiles = defaults.profiles;
  if (Array.isArray(input.profiles) && input.profiles.length) {
    const accepted = [];
    for (const profile of input.profiles.slice(0, 50)) {
      try { accepted.push(normalizeProfile(profile)); } catch { /* ignore corrupted profile entries, keep the rest */ }
    }
    if (accepted.length) profiles = accepted;
  } else if (/^\d+\.\d+(?:\.\d+)?$/.test(String(input.minecraftVersion || ''))) {
    // Migrate older releases into the first starter profile without trusting unknown loader values.
    const legacyLoader = ['vanilla', 'fabric', 'forge', 'neoforge', 'quilt'].includes(input.loader) ? input.loader : 'vanilla';
    try { profiles = defaults.profiles.map((profile, index) => index === 0 ? normalizeProfile({ ...profile, version: String(input.minecraftVersion), loader: legacyLoader, loaderVersion: input.loaderVersion || '' }) : profile); }
    catch { profiles = defaults.profiles; }
  }
  const activeProfileId = profiles.some(profile => profile.id === input.activeProfileId) ? input.activeProfileId : profiles[0].id;
  const active = profiles.find(profile => profile.id === activeProfileId) || profiles[0];
  return {
    ...defaults,
    minecraftVersion: active.version,
    loader: active.loader,
    loaderVersion: active.loaderVersion,
    activeProfileId,
    profiles,
    gameDirectory: typeof input.gameDirectory === 'string' && input.gameDirectory.length < 1024 ? input.gameDirectory : '',
    javaPath: typeof input.javaPath === 'string' && input.javaPath.length < 1024 ? input.javaPath : '',
    ramMin: Number.isInteger(ramMin) && ramMin >= 512 && ramMin <= 32768 ? ramMin : defaults.ramMin,
    ramMax: Number.isInteger(ramMax) && ramMax >= Math.max(1024, ramMin) && ramMax <= 65536 ? ramMax : defaults.ramMax,
    windowWidth: Number(input.windowWidth) >= 640 && Number(input.windowWidth) <= 7680 ? Math.round(Number(input.windowWidth)) : defaults.windowWidth,
    windowHeight: Number(input.windowHeight) >= 480 && Number(input.windowHeight) <= 4320 ? Math.round(Number(input.windowHeight)) : defaults.windowHeight,
    startOnLogin: Boolean(input.startOnLogin),
    hideLauncherOnGameStart: Boolean(input.hideLauncherOnGameStart),
    hide3DCharacter: Boolean(input.hide3DCharacter),
    fullscreen: Boolean(input.fullscreen),
    javaArgs: typeof input.javaArgs === 'string' ? input.javaArgs.slice(0, 2000) : '',
    downloadConcurrency: Number.isInteger(Number(input.downloadConcurrency)) && Number(input.downloadConcurrency) >= 1 && Number(input.downloadConcurrency) <= 16 ? Number(input.downloadConcurrency) : defaults.downloadConcurrency,
    performancePreset: ['low', 'balanced', 'high', 'extreme', 'custom'].includes(input.performancePreset) ? input.performancePreset : 'balanced',
    performance: input.performance && typeof input.performance === 'object' ? { ...defaults.performance, ...input.performance } : defaults.performance,
    hud: input.hud && typeof input.hud === 'object' ? { ...defaults.hud, ...input.hud } : defaults.hud,
  };
}
