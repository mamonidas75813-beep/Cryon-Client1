import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { getProfileFolderLayout, hasInstalledProfileVersion } from '../modules/launcher/profile-layout.js';

async function withTempDir(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cryon-layout-'));
  try { await fn(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('Vanilla layout description contains only normal user-data folders', () => {
  assert.deepEqual(getProfileFolderLayout('vanilla'), ['logs', 'saves', 'resourcepacks', 'screenshots', 'crash-reports']);
});

test('Fabric layout description includes its loader-specific folders', () => {
  const folders = getProfileFolderLayout('fabric');
  for (const folder of ['mods', 'config', 'shaderpacks', '.fabric', 'saves', 'resourcepacks']) assert.ok(folders.includes(folder));
  assert.ok(!folders.includes('.quilt'));
});

test('Forge and NeoForge have no Fabric or Quilt marker folders', () => {
  for (const loader of ['forge', 'neoforge']) {
    const folders = getProfileFolderLayout(loader);
    assert.ok(folders.includes('mods'));
    assert.ok(folders.includes('config'));
    assert.ok(!folders.includes('.fabric'));
    assert.ok(!folders.includes('.quilt'));
  }
});

test('Quilt layout includes Quilt marker folder', () => {
  const folders = getProfileFolderLayout('quilt');
  assert.ok(folders.includes('mods'));
  assert.ok(folders.includes('.quilt'));
  assert.ok(!folders.includes('.fabric'));
});

test('unsupported loaders are rejected', () => {
  assert.throws(() => getProfileFolderLayout('unknown'), /Unsupported profile loader/);
});

test('an absent profile or an old empty placeholder is not treated as an installed game', async () => {
  await withTempDir(async root => {
    const profile = { version: '1.21.1', loader: 'fabric' };
    assert.equal(await hasInstalledProfileVersion(root, profile), false);
    await fs.mkdir(path.join(root, 'logs'), { recursive: true });
    await fs.mkdir(path.join(root, 'mods'), { recursive: true });
    assert.equal(await hasInstalledProfileVersion(root, profile), false);
  });
});

test('a real matching Vanilla version JSON and non-empty JAR is recognized', async () => {
  await withTempDir(async root => {
    const versionDir = path.join(root, 'versions', '1.21.1');
    await fs.mkdir(versionDir, { recursive: true });
    await fs.writeFile(path.join(versionDir, '1.21.1.json'), JSON.stringify({ id: '1.21.1' }));
    await fs.writeFile(path.join(versionDir, '1.21.1.jar'), Buffer.from('real game jar'));
    assert.equal(await hasInstalledProfileVersion(root, { version: '1.21.1', loader: 'vanilla' }), true);
  });
});

test('a real matching Fabric loader version is recognized by inheritsFrom', async () => {
  await withTempDir(async root => {
    const id = 'fabric-loader-0.16.10-1.21.1';
    const versionDir = path.join(root, 'versions', id);
    await fs.mkdir(versionDir, { recursive: true });
    await fs.writeFile(path.join(versionDir, `${id}.json`), JSON.stringify({ id, inheritsFrom: '1.21.1' }));
    // Fabric inherits the real Minecraft JAR; its loader version JSON need not have a separate JAR.
    const baseDir = path.join(root, 'versions', '1.21.1');
    await fs.mkdir(baseDir, { recursive: true });
    await fs.writeFile(path.join(baseDir, '1.21.1.jar'), Buffer.from('base Minecraft game jar'));
    assert.equal(await hasInstalledProfileVersion(root, { version: '1.21.1', loader: 'fabric' }), true);
    assert.equal(await hasInstalledProfileVersion(root, { version: '1.20.4', loader: 'fabric' }), false);
  });
});
