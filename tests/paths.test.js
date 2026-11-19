import test from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { EML_INSTANCE_NAME, getDefaultGameDirectoryParent, getGameDirectoryParent, getGameInstancePath, getGameInstanceName, getProfileRuntimePaths, isLegacyGameDirectoryParent } from '../modules/launcher/paths.js';

test('EML root is a safe instance name and not an absolute path', () => {
  assert.equal(EML_INSTANCE_NAME, 'cryon-client');
  assert.equal(path.isAbsolute(EML_INSTANCE_NAME), false);
});

test('EML instance path is a dot-prefixed child of the selected parent', () => {
  const parent = path.join(os.tmpdir(), 'nova-test-parent');
  const settings = { gameDirectory: parent };
  assert.equal(getGameDirectoryParent(settings), path.resolve(parent));
  assert.equal(getGameInstancePath(settings), path.join(path.resolve(parent), '.cryon_client'));
});

test('instance path uses the supplied default parent when no selection exists', () => {
  const fallback = path.join(os.tmpdir(), 'nova-default-parent');
  assert.equal(getGameInstancePath({}, fallback), path.join(path.resolve(fallback), '.cryon_client'));
});

test('every saved profile maps to its own EML instance folder', async () => {
  const { createStarterProfiles } = await import('../modules/launcher/profiles.js');
  const profiles = createStarterProfiles('26.3');
  const root = os.tmpdir();
  const first = getGameInstancePath({ gameDirectory: root, profiles, activeProfileId: profiles[0].id });
  const second = getGameInstancePath({ gameDirectory: root, profiles, activeProfileId: profiles[1].id });
  assert.notEqual(first, second);
  assert.equal(path.basename(first), `.${profiles[0].instanceName}`);
  assert.equal(path.basename(second), `.${profiles[1].instanceName}`);
});

test('profile path matches EML actual dot-folder format and screenshot slug', () => {
  const appData = path.join(os.tmpdir(), 'Roaming');
  const settings = {
    gameDirectory: appData,
    activeProfileId: 'profile-26-fabric',
    profiles: [{ id: 'profile-26-fabric', name: '26.3-Fabric', instanceName: '26.3-Fabric' }],
  };
  assert.equal(getGameInstanceName(settings), '26_3_fabric');
  assert.equal(getGameInstancePath(settings), path.join(appData, '.26_3_fabric'));
});

test('default game parent is exactly AppData/Roaming with no wrapper folder', () => {
  const appData = path.join(os.tmpdir(), 'Roaming');
  assert.equal(getDefaultGameDirectoryParent(appData), path.resolve(appData));
  assert.notEqual(getDefaultGameDirectoryParent(appData), path.join(appData, '.nova'));
  assert.notEqual(getDefaultGameDirectoryParent(appData), path.join(appData, 'nova-client'));
});


test('legacy nova-client and .nova parents are redirected to the canonical Roaming root', () => {
  const appData = path.join(os.tmpdir(), 'user', 'AppData', 'Roaming');
  for (const legacy of [path.join(appData, 'nova-client'), path.join(appData, 'nova-client', 'profiles'), path.join(appData, '.nova'), path.join(appData, '.nova', 'profiles')]) {
    assert.equal(isLegacyGameDirectoryParent(legacy, appData), true);
    assert.equal(getGameDirectoryParent({ gameDirectory: legacy }, appData), path.resolve(appData));
  }
});

test('custom game parent is preserved while legacy parent is normalized', () => {
  const appData = path.join(os.tmpdir(), 'user', 'AppData', 'Roaming');
  const custom = path.join(os.tmpdir(), 'MinecraftData');
  assert.equal(getGameDirectoryParent({ gameDirectory: custom }, appData), path.resolve(custom));
  assert.equal(getGameDirectoryParent({ gameDirectory: path.join(appData, 'nova-client') }, appData), path.resolve(appData));
});

test('runtime path contract returns the same EML root, cwd parent and disk folder', () => {
  const appData = path.join(os.tmpdir(), 'Roaming');
  const profile = { id: 'runtime-profile', name: '26.3-Fabric', instanceName: '26.3-Fabric' };
  const runtime = getProfileRuntimePaths({ gameDirectory: appData, activeProfileId: profile.id, profiles: [profile] }, profile, appData);
  assert.equal(runtime.parent, path.resolve(appData));
  assert.equal(runtime.rootName, '26_3_fabric');
  assert.equal(runtime.folder, path.join(path.resolve(appData), '.26_3_fabric'));
  assert.equal(path.resolve(runtime.parent, `.${runtime.rootName}`), runtime.folder);
});
