import fs from 'node:fs/promises';
import path from 'node:path';

const COMMON_FOLDERS = Object.freeze([
  'logs',
  'saves',
  'resourcepacks',
  'screenshots',
  'crash-reports',
]);

const LOADER_FOLDERS = Object.freeze({
  vanilla: [],
  fabric: ['mods', 'config', 'shaderpacks', '.fabric'],
  forge: ['mods', 'config', 'shaderpacks'],
  neoforge: ['mods', 'config', 'shaderpacks'],
  quilt: ['mods', 'config', 'shaderpacks', '.quilt'],
});

/** Describes the expected user-data folders without creating placeholders. */
export function getProfileFolderLayout(loader = 'vanilla') {
  const normalizedLoader = String(loader || 'vanilla').toLowerCase();
  if (!Object.hasOwn(LOADER_FOLDERS, normalizedLoader)) {
    throw new Error(`Unsupported profile loader: ${normalizedLoader}`);
  }
  return [...COMMON_FOLDERS, ...LOADER_FOLDERS[normalizedLoader]];
}

/**
 * True only when the selected profile's actual Minecraft version metadata and
 * game JAR are present. Empty directories created by older launcher builds do
 * not count as an installed game.
 */
export async function hasInstalledProfileVersion(profilePath, profile) {
  const versionsRoot = path.join(path.resolve(profilePath), 'versions');
  let entries;
  try { entries = await fs.readdir(versionsRoot, { withFileTypes: true }); }
  catch (error) { if (error?.code === 'ENOENT') return false; throw error; }

  const expectedVersion = String(profile?.version || '');
  const loader = String(profile?.loader || 'vanilla').toLowerCase();
  if (!expectedVersion) return false;

  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const versionFolder = path.join(versionsRoot, entry.name);
    const metadataPath = path.join(versionFolder, `${entry.name}.json`);
    const jarPath = path.join(versionFolder, `${entry.name}.jar`);
    let metadata;
    try { metadata = JSON.parse(await fs.readFile(metadataPath, 'utf8')); }
    catch { continue; }

    const id = String(metadata?.id || entry.name);
    const matchesVersion = loader === 'vanilla'
      ? id === expectedVersion
      : metadata?.inheritsFrom === expectedVersion || id.startsWith(`${expectedVersion}-`) || id.endsWith(`-${expectedVersion}`);
    if (!matchesVersion) continue;

    const referencedVersion = typeof metadata?.jar === 'string' && /^[a-zA-Z0-9._-]{1,128}$/.test(metadata.jar)
      ? metadata.jar
      : expectedVersion;
    const candidateJars = [
      jarPath,
      path.join(versionsRoot, expectedVersion, `${expectedVersion}.jar`),
      path.join(versionsRoot, referencedVersion, `${referencedVersion}.jar`),
    ];
    for (const candidate of new Set(candidateJars)) {
      const jarStat = await fs.stat(candidate).catch(() => null);
      if (jarStat?.isFile() && jarStat.size > 0) return true;
    }
  }
  return false;
}
