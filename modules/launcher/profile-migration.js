import fs from 'node:fs/promises';
import path from 'node:path';
import { normalizeEmlRootName } from './paths.js';

function legacyInstanceNames(profile = {}) {
  const values = [profile.instanceName, profile.name];
  const names = new Set();
  for (const value of values) {
    const raw = String(value || '').trim();
    if (!raw) continue;
    if (/^[\p{L}\p{N}._-]{1,64}$/u.test(raw)) names.add(raw);
    names.add(normalizeEmlRootName(raw));
    const dashed = raw.replace(/\s+/g, '-').replace(/[^\p{L}\p{N}._-]/gu, '-').replace(/-+/g, '-').replace(/^[.-]+|[.-]+$/g, '');
    if (dashed) names.add(dashed);
  }
  return [...names].filter(name => /^[\p{L}\p{N}][\p{L}\p{N}._-]{0,63}$/u.test(name));
}

/** Move previous container roots directly under AppData only when destination is absent. */
export async function migrateDefaultProfileDirectory(oldParent, newParent, profiles = []) {
  const moves = [];
  for (const profile of profiles) {
    const destination = path.join(newParent, `.${normalizeEmlRootName(profile?.instanceName || profile?.name)}`);
    const destinationStat = await fs.stat(destination).catch(() => null);
    if (destinationStat) continue; // Never merge or overwrite an installed real instance.
    let source = null;
    for (const name of legacyInstanceNames(profile)) {
      // Previous builds wrote both EML-style hidden roots and visible placeholder aliases.
      // Prefer the hidden EML root, but only move a source when the canonical target is absent.
      const candidates = [path.join(oldParent, `.${name}`), path.join(oldParent, name)];
      for (const candidate of candidates) {
        const stat = await fs.stat(candidate).catch(() => null);
        if (stat?.isDirectory()) { source = candidate; break; }
      }
      if (source) break;
    }
    if (source) moves.push({ source, destination });
  }
  if (!moves.length) return true;
  await fs.mkdir(newParent, { recursive: true });
  const completed = [];
  try {
    for (const move of moves) {
      await fs.rename(move.source, move.destination);
      completed.push(move);
    }
    return true;
  } catch (error) {
    for (const move of completed.reverse()) {
      try { await fs.rename(move.destination, move.source); } catch { /* retain both copies if rollback is blocked */ }
    }
    throw error;
  }
}
