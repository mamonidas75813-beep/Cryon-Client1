import test from 'node:test';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';
import path from 'node:path';
import os from 'node:os';
import { mkdtemp, mkdir, writeFile, readFile, readdir, rm } from 'node:fs/promises';

// Importing the module verifies syntax and dependency-free initialization.
const mod = await import(pathToFileURL(path.resolve('modules/mods/modrinth.js')));
test('mod manager exports the expected operations', () => {
  for (const name of ['searchModrinth', 'getModrinthProjectVersions', 'installModrinthProject', 'updateModrinthProject', 'listInstalledMods', 'importLocalMod', 'removeInstalledMod', 'setModEnabled', 'backupMods', 'listModBackups', 'restoreModBackup', 'checkModUpdates']) assert.equal(typeof mod[name], 'function');
});



test('default Fabric performance set has the requested projects and excludes server-only Noisium from client installs', () => {
  assert.equal(mod.DEFAULT_FABRIC_PERFORMANCE_MODS.length, 12);
  assert.deepEqual(mod.DEFAULT_FABRIC_PERFORMANCE_MODS.map(item => item.name), [
    'Sodium', 'Sodium Extra', 'Lithium', 'Krypton', 'Entity Culling', 'More Culling',
    'C2ME', 'Noisium', 'FerriteCore', 'ImmediatelyFast', 'BadOptimizations', 'Mod Menu',
  ]);
  assert.equal(mod.DEFAULT_FABRIC_PERFORMANCE_MODS.find(item => item.name === 'Sodium Extra').projectId, 'PtjYWJkn');
  assert.equal(mod.DEFAULT_FABRIC_PERFORMANCE_MODS.find(item => item.name === 'Noisium').clientSide, false);
});

test('automatic performance installer only runs for Fabric profiles', async () => {
  const result = await mod.installDefaultFabricPerformanceMods({ gameDirectory: os.tmpdir(), loader: 'forge', minecraftVersion: '1.21.1' });
  assert.equal(result.enabled, false);
  assert.equal(result.installed, 0);
  assert.deepEqual(result.results, []);
});

test('automatic performance installer installs compatible versions, skips unsupported builds, and records state', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cryon-auto-fabric-mods-'));
  const settings = { gameDirectory: root, activeProfileId: 'auto-fabric', profiles: [
    { id: 'auto-fabric', instanceName: 'cryon-auto-fabric' },
  ], loader: 'fabric', minecraftVersion: '1.21.1' };
  const bytes = Buffer.from('verified Sodium test JAR');
  const sha512 = (await import('node:crypto')).createHash('sha512').update(bytes).digest('hex');
  const originalFetch = globalThis.fetch;
  const requestedProjects = [];
  globalThis.fetch = async input => {
    const url = new URL(String(input));
    if (url.pathname === '/v2/project/AANobbMI/version') {
      requestedProjects.push('AANobbMI');
      return Response.json([{ id: 'sodium-version', project_id: 'AANobbMI', name: 'Sodium test', version_number: 'test-1', version_type: 'release', date_published: '2026-01-01T00:00:00Z', game_versions: ['1.21.1'], loaders: ['fabric'], files: [{ filename: 'sodium-test.jar', primary: true }] }]);
    }
    if (url.pathname.startsWith('/v2/project/') && url.pathname.endsWith('/version')) {
      requestedProjects.push(url.pathname.split('/')[3]);
      return Response.json([]);
    }
    if (url.pathname === '/v2/version/sodium-version') return Response.json({
      id: 'sodium-version', project_id: 'AANobbMI', version_number: 'test-1', version_type: 'release',
      game_versions: ['1.21.1'], loaders: ['fabric'], dependencies: [],
      files: [{ filename: 'sodium-test.jar', primary: true, url: 'https://cdn.modrinth.com/data/test/sodium.jar', hashes: { sha512 } }],
    });
    if (url.href === 'https://cdn.modrinth.com/data/test/sodium.jar') return new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.length) } });
    throw new Error(`Unexpected auto-mod request: ${url.href}`);
  };
  try {
    const progress = [];
    const first = await mod.installDefaultFabricPerformanceMods(settings, { onProgress: item => progress.push(item) });
    assert.equal(first.enabled, true);
    assert.equal(first.installed, 1);
    assert.equal(first.skipped, 11);
    assert.equal(first.failed, 0);
    assert.ok(progress.length === 12);
    assert.ok(requestedProjects.includes('AANobbMI'));
    assert.ok(!requestedProjects.includes('KuNKN7d2'));
    const installed = await mod.listInstalledMods(settings);
    assert.ok(installed.some(item => item.projectId === 'AANobbMI' && item.filename === 'sodium-test.jar'));
    const state = JSON.parse(await readFile(path.join(root, '.cryon_auto_fabric', '.cryon-default-fabric-mods.json'), 'utf8'));
    assert.equal(state.projects.AANobbMI.status, 'installed');
    assert.match(state.projects.KuNKN7d2.message, /server-side only/i);

    requestedProjects.length = 0;
    const second = await mod.installDefaultFabricPerformanceMods(settings);
    assert.equal(second.installed, 1);
    assert.equal(second.skipped, 11);
    assert.equal(second.failed, 0);
    assert.deepEqual(requestedProjects, []);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test('mod enable/disable round-trip preserves managed metadata', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cryon-mods-'));
  const settings = { gameDirectory: root, loader: 'fabric', minecraftVersion: '1.21.1' };
  const mods = path.join(root, '.cryon_client', 'mods');
  await mkdir(mods, { recursive: true });
  try {
    await writeFile(path.join(mods, 'sample.jar'), 'test mod bytes');
    await writeFile(path.join(mods, '.nova-mods.json'), JSON.stringify({
      'sample.jar': { projectId: 'sampleProject', versionId: 'versionA', versionNumber: '1.0.0', enabled: true },
    }));
    const disabledName = await mod.setModEnabled(settings, 'sample.jar', false);
    assert.equal(disabledName, 'sample.jar.disabled');
    let manifest = JSON.parse(await readFile(path.join(mods, '.nova-mods.json'), 'utf8'));
    assert.equal(manifest['sample.jar.disabled'].enabled, false);
    const enabledName = await mod.setModEnabled(settings, disabledName, true);
    assert.equal(enabledName, 'sample.jar');
    manifest = JSON.parse(await readFile(path.join(mods, '.nova-mods.json'), 'utf8'));
    assert.equal(manifest['sample.jar'].enabled, true);
    assert.deepEqual((await readdir(mods)).filter(name => name.endsWith('.jar') || name.endsWith('.jar.disabled')), ['sample.jar']);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('mod installation refuses a Vanilla profile', async () => {
  await assert.rejects(mod.installModrinthProject({ projectId: 'abc123', settings: { loader: 'vanilla', minecraftVersion: '1.21.1' } }), /Select Fabric/i);
});

test('mod file operations reject path traversal', async () => {
  await assert.rejects(mod.removeInstalledMod({ gameDirectory: os.tmpdir() }, '../outside.jar'), /Unsafe mod filename/);
});


test('local JAR import is isolated to the active profile and listed as local', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cryon-import-'));
  const source = path.join(root, 'outside-example.jar');
  const settings = { gameDirectory: path.join(root, 'game'), loader: 'fabric', minecraftVersion: '1.21.1' };
  await writeFile(source, Buffer.from('test jar bytes'));
  try {
    const result = await mod.importLocalMod(settings, source);
    assert.equal(result.filename, 'outside-example.jar');
    const installed = await mod.listInstalledMods(settings);
    assert.equal(installed.length, 1);
    assert.equal(installed[0].source, 'local');
    assert.equal(installed[0].enabled, true);
    await assert.rejects(mod.importLocalMod(settings, path.join(root, 'not-a-mod.txt')), /\.jar/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('backup listing and restore round-trip preserve enabled and disabled mods', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cryon-backup-'));
  const settings = { gameDirectory: root, loader: 'fabric', minecraftVersion: '1.21.1' };
  const mods = path.join(root, '.cryon_client', 'mods');
  await mkdir(mods, { recursive: true });
  try {
    await writeFile(path.join(mods, 'first.jar'), 'first');
    await writeFile(path.join(mods, 'second.jar.disabled'), 'second');
    const backupPath = await mod.backupMods(settings);
    const backupId = path.basename(backupPath);
    const backups = await mod.listModBackups(settings);
    assert.ok(backups.some(item => item.id === backupId && item.files === 2));
    await rm(path.join(mods, 'first.jar'));
    await writeFile(path.join(mods, 'other.jar'), 'other');
    const restored = await mod.restoreModBackup(settings, backupId);
    assert.equal(restored.restored, backupId);
    const files = await readdir(mods);
    assert.ok(files.includes('first.jar'));
    assert.ok(files.includes('second.jar.disabled'));
    assert.ok(!files.includes('other.jar'));
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('Modrinth install accepts an official plus-sign JAR filename and writes it to the active profile', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cryon-modrinth-plus-install-'));
  const settings = { gameDirectory: root, activeProfileId: 'plus-profile', profiles: [
    { id: 'plus-profile', instanceName: 'cryon-plus-profile' },
  ], loader: 'fabric', minecraftVersion: '1.21.1' };
  const bytes = Buffer.from('sample verified mod archive');
  const sha512 = (await import('node:crypto')).createHash('sha512').update(bytes).digest('hex');
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async input => {
    const url = String(input);
    if (url.endsWith('/version/version123')) return Response.json({
      id: 'version123', project_id: 'sampleproject', version_number: '1.0.0', version_type: 'release',
      game_versions: ['1.21.1'], loaders: ['fabric'], dependencies: [],
      files: [{ filename: 'fabric-api-0.115.0+1.21.1.jar', primary: true, url: 'https://cdn.modrinth.com/data/sample/fabric-api.jar', hashes: { sha512 } }],
    });
    if (url === 'https://cdn.modrinth.com/data/sample/fabric-api.jar') return new Response(bytes, { status: 200, headers: { 'content-length': String(bytes.length) } });
    throw new Error(`Unexpected test request: ${url}`);
  };
  try {
    const result = await mod.installModrinthProject({ projectId: 'sampleproject', versionId: 'version123', settings });
    assert.equal(result.filename, 'fabric-api-0.115.0+1.21.1.jar');
    const installedPath = path.join(root, '.cryon_plus_profile', 'mods', result.filename);
    assert.deepEqual(await readFile(installedPath), bytes);
  } finally {
    globalThis.fetch = originalFetch;
    await rm(root, { recursive: true, force: true });
  }
});

test('Modrinth-style plus-sign JAR filenames are accepted without renaming', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cryon-plus-filename-'));
  const source = path.join(root, 'fabric-api-0.115.0+1.21.1.jar');
  const settings = { gameDirectory: path.join(root, 'game'), loader: 'fabric', minecraftVersion: '1.21.1' };
  await writeFile(source, Buffer.from('jar bytes'));
  try {
    const result = await mod.importLocalMod(settings, source);
    assert.equal(result.filename, 'fabric-api-0.115.0+1.21.1.jar');
    assert.equal((await mod.listInstalledMods(settings))[0].filename, result.filename);
    await mod.setModEnabled(settings, result.filename, false);
    assert.equal((await mod.listInstalledMods(settings))[0].enabled, false);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('read-only installed-content and world listing does not create fake profile folders', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cryon-read-only-list-'));
  const settings = { gameDirectory: root, loader: 'fabric', minecraftVersion: '1.21.1' };
  try {
    assert.deepEqual(await mod.listInstalledMods(settings), []);
    assert.deepEqual(await mod.listInstalledContent(settings, 'resourcepack'), []);
    assert.deepEqual(await mod.listProfileWorlds(settings), []);
    assert.deepEqual(await mod.listModBackups(settings), []);
    await assert.rejects((await import('node:fs/promises')).stat(path.join(root, '.cryon_client')), { code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Modrinth search refuses a Vanilla profile before making a network request', async () => {
  await assert.rejects(mod.searchModrinth({ query: 'Sodium', settings: { loader: 'vanilla', minecraftVersion: '1.21.1' } }), /Fabric, Forge, NeoForge or Quilt/i);
});

test('Modrinth content manager exposes all five Modrinth categories', () => {
  for (const name of ['searchModrinthContent', 'getModrinthContentVersions', 'installModrinthContent', 'listInstalledContent', 'setContentEnabled', 'removeInstalledContent', 'listProfileWorlds']) {
    assert.equal(typeof mod[name], 'function', `${name} must be exported`);
  }
});

test('Modrinth mod search refuses Vanilla before network access', async () => {
  await assert.rejects(
    mod.searchModrinthContent({ query: 'Sodium', type: 'mod', settings: { loader: 'vanilla', minecraftVersion: '1.21.1' } }),
    /Fabric, Forge, NeoForge or Quilt/i,
  );
});

test('resource packs are isolated by profile and can be disabled or removed', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nova-resource-packs-'));
  const settings = { gameDirectory: root, activeProfileId: 'pack-profile-a', profiles: [
    { id: 'pack-profile-a', instanceName: 'nova-pack-profile-a' },
    { id: 'pack-profile-b', instanceName: 'nova-pack-profile-b' },
  ], loader: 'vanilla', minecraftVersion: '1.21.1' };
  const firstDir = path.join(root, '.nova_pack_profile_a', 'resourcepacks');
  const secondDir = path.join(root, '.nova_pack_profile_b', 'resourcepacks');
  await mkdir(firstDir, { recursive: true });
  await mkdir(secondDir, { recursive: true });
  try {
    await writeFile(path.join(firstDir, 'clean-ui.zip'), 'pack bytes');
    assert.equal((await mod.listInstalledContent(settings, 'resourcepack')).length, 1);
    const disabled = await mod.setContentEnabled(settings, 'resourcepack', 'clean-ui.zip', false);
    assert.equal(disabled, 'clean-ui.zip.disabled');
    assert.equal((await mod.listInstalledContent(settings, 'resourcepack'))[0].enabled, false);
    assert.equal((await readdir(secondDir)).length, 0);
    await mod.removeInstalledContent(settings, 'resourcepack', disabled);
    assert.equal((await mod.listInstalledContent(settings, 'resourcepack')).length, 0);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Modrinth catalogue rejects an unknown project category', async () => {
  await assert.rejects(mod.listInstalledContent({ gameDirectory: os.tmpdir(), loader: 'fabric', minecraftVersion: '1.21.1' }, 'unknown'), /Unsupported Modrinth project category/);
});


test('data packs install into a selected saved world, not a shared profile folder', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nova-world-packs-'));
  const settings = { gameDirectory: root, activeProfileId: 'world-profile-a', profiles: [
    { id: 'world-profile-a', instanceName: 'nova-world-profile-a' },
    { id: 'world-profile-b', instanceName: 'nova-world-profile-b' },
  ], loader: 'fabric', minecraftVersion: '1.21.1' };
  const instance = path.join(root, '.nova_world_profile_a');
  const world = path.join(instance, 'saves', 'Survival World');
  await mkdir(path.join(world, 'datapacks'), { recursive: true });
  await mkdir(path.join(instance, 'saves', 'Other World'), { recursive: true });
  await writeFile(path.join(world, 'level.dat'), 'level data');
  try {
    const worlds = await mod.listProfileWorlds(settings);
    assert.deepEqual(worlds.map(item => item.folder), ['Survival World']);
    await writeFile(path.join(world, 'datapacks', 'better-loot.zip'), 'datapack bytes');
    assert.equal((await mod.listInstalledContent(settings, 'datapack', 'Survival World'))[0].filename, 'better-loot.zip');
    await assert.rejects(mod.listInstalledContent(settings, 'datapack', '../outside'), /valid saved world/i);
    const secondSettings = { ...settings, activeProfileId: 'world-profile-b' };
    await assert.rejects(mod.listInstalledContent(secondSettings, 'datapack', 'Survival World'), /level.dat was not found/i);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Modrinth .mrpack installs profile overrides and applies client overrides last', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nova-mrpack-install-'));
  const settings = { gameDirectory: root, activeProfileId: 'mrpack-profile', profiles: [
    { id: 'mrpack-profile', instanceName: 'nova-mrpack-profile' },
  ], loader: 'fabric', loaderVersion: '0.16.10', minecraftVersion: '1.21.1' };
  const pack = await readFile(new URL('./fixtures/valid-mini-pack.mrpack', import.meta.url));
  const profileRoot = path.join(root, '.nova_mrpack_profile');
  try {
    const result = await mod.installModrinthPackBuffer(pack, settings, 'Mini Pack');
    assert.equal(result.filesInstalled, 0);
    assert.equal(result.loaderVersion, '0.16.10');
    assert.equal(await readFile(path.join(profileRoot, 'config', 'nova-pack-layer.txt'), 'utf8'), 'client override wins');
    assert.equal(await readFile(path.join(profileRoot, 'options.txt'), 'utf8'), 'sound=0.7');
  } finally { await rm(root, { recursive: true, force: true }); }
});

test('Modrinth .mrpack rejects a loader or Minecraft version mismatch', async () => {
  const pack = await readFile(new URL('./fixtures/valid-mini-pack.mrpack', import.meta.url));
  const root = await mkdtemp(path.join(os.tmpdir(), 'nova-mrpack-mismatch-'));
  const settings = { gameDirectory: root, activeProfileId: 'mrpack-profile', profiles: [
    { id: 'mrpack-profile', instanceName: 'nova-mrpack-profile' },
  ], loader: 'forge', loaderVersion: '40.2.0', minecraftVersion: '1.21.1' };
  try { await assert.rejects(mod.installModrinthPackBuffer(pack, settings), /requires fabric/i); }
  finally { await rm(root, { recursive: true, force: true }); }
});


test('Data Pack discovery uses Modrinth all_project_types facet and supports Vanilla profiles', async () => {
  const originalFetch = globalThis.fetch;
  const calls = [];
  globalThis.fetch = async input => {
    calls.push(String(input));
    return { ok: true, status: 200, json: async () => ({ hits: [] }) };
  };
  try {
    await mod.searchModrinthContent({ query: '', type: 'datapack', settings: { loader: 'vanilla', minecraftVersion: '1.21.1' } });
    const url = new URL(calls[0]);
    const facets = JSON.parse(url.searchParams.get('facets'));
    assert.deepEqual(facets[0], ['all_project_types:datapack']);
    assert.equal(url.searchParams.has('query'), false);
  } finally { globalThis.fetch = originalFetch; }
});


test('Modrinth .mrpack rejects traversal path segments before writing files', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nova-mrpack-traversal-'));
  const settings = { gameDirectory: root, activeProfileId: 'mrpack-profile', profiles: [
    { id: 'mrpack-profile', instanceName: 'nova-mrpack-profile' },
  ], loader: 'fabric', loaderVersion: '0.16.10', minecraftVersion: '1.21.1' };
  const pack = await readFile(new URL('./fixtures/malicious-traversal.mrpack', import.meta.url));
  try {
    await assert.rejects(mod.installModrinthPackBuffer(pack, settings), /unsafe Modrinth modpack path/i);
    assert.equal(await readFile(path.join(root, '.nova_mrpack_profile', 'outside.txt')).catch(() => null), null);
  } finally { await rm(root, { recursive: true, force: true }); }
});
