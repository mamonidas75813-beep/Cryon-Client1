import test from 'node:test';
import assert from 'node:assert/strict';
import { normalizeProfile, createStarterProfiles, validateProfileCollection } from '../modules/launcher/profiles.js';
import { sanitizeSettings } from '../modules/settings/settings.js';

test('starter profiles are separate Standard, Performance and Legacy PvP profiles', () => {
  const profiles = createStarterProfiles('26.3');
  assert.deepEqual(profiles.map(profile => profile.category), ['standard', 'fastclient', 'legacy-pvp']);
  assert.equal(profiles[1].version, '1.21.1');
  assert.equal(profiles[1].loader, 'fabric');
  assert.equal(profiles[2].version, '1.8.9');
  assert.equal(new Set(profiles.map(profile => profile.instanceName)).size, profiles.length);
});

test('custom profile validates name, version and loader', () => {
  const profile = normalizeProfile({ name: 'Survival 1.20.4', category: 'standard', version: '1.20.4', loader: 'fabric', loaderVersion: '0.16.14' });
  assert.equal(profile.name, 'Survival 1.20.4');
  assert.equal(profile.instanceName, 'survival_1_20_4');
});

test('default instance name is an EML-safe lowercase snake_case folder slug', () => {
  const profile = normalizeProfile({ name: '1.21.1-Fabric', version: '1.21.1', loader: 'fabric' });
  assert.equal(profile.instanceName, '1_21_1_fabric');
});


test('modern 26.x Minecraft releases can create a Fabric profile', () => {
  const profile = normalizeProfile({ name: '26.3-Fabric', version: '26.3', loader: 'fabric', loaderVersion: '0.20.1' });
  assert.equal(profile.version, '26.3');
  assert.equal(profile.loader, 'fabric');
  assert.equal(profile.instanceName, '26_3_fabric');
});

test('unsupported legacy Fabric profile is rejected', () => {
  assert.throws(() => normalizeProfile({ name: 'Legacy Fabric', version: '1.8.9', loader: 'fabric' }), /not supported/);
});

test('profile collection rejects duplicate ids and roots', () => {
  const profiles = createStarterProfiles('26.3');
  assert.throws(() => validateProfileCollection([profiles[0], { ...profiles[1], id: profiles[0].id }], profiles[0].id), /Duplicate profile ID/);
  assert.throws(() => validateProfileCollection([profiles[0], { ...profiles[1], instanceName: profiles[0].instanceName }], profiles[0].id), /Duplicate profile game folder/);
});

test('settings sanitizer retains the selected profile and derives active version/loader', () => {
  const defaults = sanitizeSettings({});
  const active = defaults.profiles[1];
  const settings = sanitizeSettings({ ...defaults, activeProfileId: active.id });
  assert.equal(settings.minecraftVersion, active.version);
  assert.equal(settings.loader, active.loader);
});

test('profile account assignment survives normalization and rejects unsafe ids', () => {
  const assigned = normalizeProfile({ name: 'Survival Account', version: '1.21.1', loader: 'fabric', accountId: 'microsoft-player_123' });
  assert.equal(assigned.accountId, 'microsoft-player_123');
  const unsafe = normalizeProfile({ name: 'Survival Account', version: '1.21.1', loader: 'fabric', accountId: '../secret' });
  assert.equal(unsafe.accountId, null);
});


test('a saved profile cannot change version or loader in place', async () => {
  const { updateProfileMetadata } = await import('../modules/launcher/profiles.js');
  const profile = normalizeProfile({ id: 'stable-profile-01', name: '1.21.1-Fabric', version: '1.21.1', loader: 'fabric' });
  assert.throws(() => updateProfileMetadata(profile, { version: '26.3' }), /Use Add Version/);
  assert.throws(() => updateProfileMetadata(profile, { loader: 'vanilla' }), /Use Add Version/);
  const renamed = updateProfileMetadata(profile, { name: 'My Fabric Profile' });
  assert.equal(renamed.version, profile.version);
  assert.equal(renamed.loader, profile.loader);
  assert.equal(renamed.instanceName, profile.instanceName);
});
