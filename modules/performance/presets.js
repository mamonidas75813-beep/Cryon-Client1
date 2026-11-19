import fs from 'node:fs/promises';
import path from 'node:path';

const PRESETS = Object.freeze({
  low: { name: 'Low-end PC', renderDistance: 6, particles: 'minimal', entityDistance: 50, clouds: false, smoothLighting: false, vSync: false },
  balanced: { name: 'Balanced', renderDistance: 10, particles: 'decreased', entityDistance: 75, clouds: false, smoothLighting: true, vSync: false },
  high: { name: 'High FPS', renderDistance: 8, particles: 'minimal', entityDistance: 60, clouds: false, smoothLighting: false, vSync: false },
  extreme: { name: 'Extreme FPS', renderDistance: 5, particles: 'minimal', entityDistance: 50, clouds: false, smoothLighting: false, vSync: false },
  custom: { name: 'Custom', renderDistance: 10, particles: 'decreased', entityDistance: 75, clouds: false, smoothLighting: true, vSync: false },
});

export function getPerformancePreset(name = 'balanced') {
  const key = String(name).toLowerCase();
  const preset = PRESETS[key] || PRESETS.balanced;
  return { preset: key in PRESETS ? key : 'balanced', ...preset };
}

export function validatePerformanceSettings(value = {}) {
  const base = getPerformancePreset(value.preset || 'balanced');
  const renderDistance = Number(value.renderDistance ?? base.renderDistance);
  const entityDistance = Number(value.entityDistance ?? base.entityDistance);
  const particles = ['all', 'decreased', 'minimal'].includes(value.particles) ? value.particles : base.particles;
  if (!Number.isInteger(renderDistance) || renderDistance < 2 || renderDistance > 32) throw new Error('Render distance must be between 2 and 32 chunks.');
  if (!Number.isInteger(entityDistance) || entityDistance < 25 || entityDistance > 500) throw new Error('Entity distance must be between 25% and 500%.');
  return {
    preset: String(value.preset || 'balanced'), name: String(value.name || base.name), renderDistance, entityDistance, particles,
    clouds: Boolean(value.clouds), smoothLighting: Boolean(value.smoothLighting), vSync: Boolean(value.vSync),
  };
}


/** Writes only well-known Minecraft options.txt keys and preserves existing settings. */
export async function applyPerformanceOptions(gameRoot, settings) {
  const safe = validatePerformanceSettings(settings);
  const file = path.join(path.resolve(gameRoot), 'options.txt');
  // Do not create a synthetic options.txt for a profile that Minecraft has not run yet.
  // The preset stays saved in launcher settings and is applied once Minecraft creates this file.
  const existing = await fs.stat(file).catch(() => null);
  if (!existing?.isFile()) return null;
  const original = await fs.readFile(file, 'utf8');
  const values = {
    renderDistance: String(safe.renderDistance),
    particles: safe.particles === 'minimal' ? '2' : safe.particles === 'decreased' ? '1' : '0',
    entityDistanceScaling: String((safe.entityDistance / 100).toFixed(2)),
    clouds: safe.clouds ? 'true' : 'false',
    ao: safe.smoothLighting ? 'true' : 'false',
    enableVsync: safe.vSync ? 'true' : 'false',
  };
  const lines = original.split(/\r?\n/).filter(Boolean);
  const output = lines.filter(line => !Object.hasOwn(values, line.split(':', 1)[0]));
  for (const [key, value] of Object.entries(values)) output.push(`${key}:${value}`);
  await fs.writeFile(file, output.join('\n') + '\n', 'utf8');
  return file;
}
