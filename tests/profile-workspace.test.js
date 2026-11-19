import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { initializeProfileWorkspace, applyPendingProfileOptions, PENDING_OPTIONS_FILE } from '../modules/launcher/profile-workspace.js';
import { getGameInstancePath } from '../modules/launcher/paths.js';

async function withTempDir(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cryon-workspace-'));
  try { await fn(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('first PLAY prepares the real Fabric workspace and queues pending settings', async () => {
  await withTempDir(async root => {
    const profile = { id: 'profile-fabric-1', name: '1.21.1-Fabric', instanceName: '1.21.1-Fabric', version: '1.21.1', loader: 'fabric' };
    const settings = { gameDirectory: root, activeProfileId: profile.id, profiles: [profile], performance: { preset: 'high' } };
    const { root: gameRoot, markerPath } = await initializeProfileWorkspace(settings, profile, settings.performance);
    assert.equal(gameRoot, getGameInstancePath(settings));
    const nonRuntimeAlias = path.join(root, '1.21.1-Fabric');
    assert.equal(await fs.lstat(nonRuntimeAlias).catch(() => null), null, 'no demo/no-dot alias is created');
    assert.ok((await fs.stat(path.join(gameRoot, 'mods'))).isDirectory());
    assert.ok((await fs.stat(markerPath)).isFile());
    assert.deepEqual(JSON.parse(await fs.readFile(markerPath, 'utf8')).performance.preset, 'high');
    assert.equal(await fs.stat(path.join(gameRoot, 'versions')).catch(() => null), null);
    assert.equal(await fs.stat(path.join(gameRoot, 'options.txt')).catch(() => null), null);
  });
});

test('Vanilla profile does not get a fake mods folder', async () => {
  await withTempDir(async root => {
    const profile = { id: 'profile-vanilla-1', name: '1.8.9-Vanilla', instanceName: '1.8.9-Vanilla', version: '1.8.9', loader: 'vanilla' };
    const settings = { gameDirectory: root, activeProfileId: profile.id, profiles: [profile] };
    const { root: gameRoot } = await initializeProfileWorkspace(settings, profile);
    assert.equal(await fs.stat(path.join(gameRoot, 'mods')).catch(() => null), null);
    assert.ok((await fs.stat(path.join(gameRoot, PENDING_OPTIONS_FILE))).isFile());
  });
});

test('pending options stay queued until Minecraft creates options.txt, then apply once', async () => {
  await withTempDir(async root => {
    const profile = { id: 'profile-fabric-2', name: '1.21.1-Fabric', instanceName: '1.21.1-Fabric', version: '1.21.1', loader: 'fabric' };
    const settings = { gameDirectory: root, activeProfileId: profile.id, profiles: [profile] };
    const { root: gameRoot, markerPath } = await initializeProfileWorkspace(settings, profile, { preset: 'extreme', renderDistance: 5, entityDistance: 50, particles: 'minimal', clouds: false, smoothLighting: false, vSync: false });
    assert.equal(gameRoot, getGameInstancePath(settings));
    assert.equal(await applyPendingProfileOptions(gameRoot), null);
    assert.ok((await fs.stat(markerPath)).isFile());
    await fs.writeFile(path.join(gameRoot, 'options.txt'), 'sound:1.0\nrenderDistance:12\n');
    const applied = await applyPendingProfileOptions(gameRoot);
    assert.equal(applied, path.join(gameRoot, 'options.txt'));
    const options = await fs.readFile(applied, 'utf8');
    assert.match(options, /renderDistance:5/);
    assert.match(options, /particles:2/);
    assert.equal(await fs.stat(markerPath).catch(() => null), null);
  });
});


test('repeated PLAY does not overwrite a pending marker waiting for options.txt', async () => {
  await withTempDir(async root => {
    const profile = { id: 'profile-fabric-3', name: '1.21.1-Fabric', instanceName: '1.21.1-Fabric', version: '1.21.1', loader: 'fabric' };
    const settings = { gameDirectory: root, activeProfileId: profile.id, profiles: [profile] };
    const first = await initializeProfileWorkspace(settings, profile, { preset: 'high' });
    const original = await fs.readFile(first.markerPath, 'utf8');
    const second = await initializeProfileWorkspace(settings, profile, { preset: 'low' });
    assert.equal(second.queued, false);
    assert.equal(await fs.readFile(second.markerPath, 'utf8'), original);
  });
});


test('pending marker is stored in the exact EML instance folder directly under AppData', async () => {
  await withTempDir(async appData => {
    const novaRoot = appData;
    const profile = { id: 'profile-nova-1', name: '1.21.10-Fabric', instanceName: '1.21.10-Fabric', version: '1.21.10', loader: 'fabric' };
    const settings = { gameDirectory: novaRoot, activeProfileId: profile.id, profiles: [profile] };
    const { root: gameRoot, markerPath } = await initializeProfileWorkspace(settings, profile, { preset: 'balanced' });
    assert.equal(gameRoot, path.join(novaRoot, '.1_21_10_fabric'));
    assert.equal(markerPath, path.join(novaRoot, '.1_21_10_fabric', PENDING_OPTIONS_FILE));
  });
});
