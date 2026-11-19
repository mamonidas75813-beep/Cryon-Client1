import fs from 'node:fs/promises';
import path from 'node:path';
import { getGameInstancePath } from './paths.js';
import { validatePerformanceSettings, applyPerformanceOptions } from '../performance/presets.js';

export const PENDING_OPTIONS_FILE = '.cryon-options-pending';

/**
 * Prepare only the real EML runtime root, a loader's mods directory, and a
 * queued-settings file. Do not create a no-dot junction/alias: the runtime root
 * itself is the only authoritative folder to open or manage.
 * Minecraft creates versions/assets/libraries/logs/saves/options.txt itself.
 */
export async function initializeProfileWorkspace(settings, profile, performance = settings?.performance) {
  const isolatedSettings = { ...settings, activeProfileId: profile.id };
  const root = getGameInstancePath(isolatedSettings);
  await fs.mkdir(root, { recursive: true });
  if (String(profile.loader || 'vanilla').toLowerCase() !== 'vanilla') {
    await fs.mkdir(path.join(root, 'mods'), { recursive: true });
  }
  const markerPath = path.join(root, PENDING_OPTIONS_FILE);
  // Queue once per profile, at first PLAY. Do not reset an existing marker on
  // every launch: it may contain settings waiting for Minecraft to create options.txt.
  const markerExists = await fs.stat(markerPath).then(stat => stat.isFile()).catch(() => false);
  if (!markerExists) {
    const pending = {
      schemaVersion: 1,
      profileId: profile.id,
      queuedAt: new Date().toISOString(),
      performance: validatePerformanceSettings(performance || {}),
    };
    const tempPath = `${markerPath}.${process.pid}.tmp`;
    await fs.writeFile(tempPath, JSON.stringify(pending, null, 2), { mode: 0o600 });
    await fs.rename(tempPath, markerPath);
  }
  return { root, markerPath, queued: !markerExists };
}

/** Apply queued performance settings once Minecraft has created options.txt. */
export async function applyPendingProfileOptions(root) {
  const markerPath = path.join(path.resolve(root), PENDING_OPTIONS_FILE);
  let pending;
  try { pending = JSON.parse(await fs.readFile(markerPath, 'utf8')); }
  catch (error) {
    if (error?.code === 'ENOENT') return null;
    throw new Error(`CRYON pending settings file is invalid: ${error.message}`);
  }
  if (pending?.schemaVersion !== 1 || !pending?.performance) {
    throw new Error('CRYON pending settings file has an unsupported format.');
  }
  const appliedFile = await applyPerformanceOptions(root, pending.performance);
  if (appliedFile) await fs.rm(markerPath, { force: true });
  return appliedFile;
}
