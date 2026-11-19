import test from 'node:test';
import assert from 'node:assert/strict';
import { mapTemurinPlatform } from '../modules/server/java-installer.js';
import { normalizePlayitAddress, selectPlayitWindowsAsset } from '../modules/server/playit-manager.js';

test('managed Java 21 maps supported Windows, Linux and macOS architectures', () => {
  assert.deepEqual(mapTemurinPlatform('win32', 'x64'), { os: 'windows', architecture: 'x64', extension: 'zip' });
  assert.deepEqual(mapTemurinPlatform('linux', 'arm64'), { os: 'linux', architecture: 'aarch64', extension: 'tar.gz' });
  assert.deepEqual(mapTemurinPlatform('darwin', 'arm64'), { os: 'mac', architecture: 'aarch64', extension: 'tar.gz' });
  assert.throws(() => mapTemurinPlatform('freebsd', 'x64'), /not available/);
});

test('Playit release selection requires a signed Windows x64 agent and SHA-256 metadata', () => {
  const release = { tag_name: 'v2.0.2', assets: [
    { name: 'playit-windows-x86_64-signed.exe', browser_download_url: 'https://github.com/playit-cloud/playit-agent/releases/download/v2.0.2/playit.exe', size: 1234, digest: `sha256:${'a'.repeat(64)}` },
  ] };
  const selected = selectPlayitWindowsAsset(release);
  assert.equal(selected.version, 'v2.0.2');
  assert.equal(selected.digest, 'a'.repeat(64));
  assert.throws(() => selectPlayitWindowsAsset({ assets: [] }), /does not contain/);
});

test('Playit public address validation accepts hostnames and ports but rejects unsafe input', () => {
  assert.equal(normalizePlayitAddress('my-world.joinmc.link'), 'my-world.joinmc.link');
  assert.equal(normalizePlayitAddress('mc.example.net:25565'), 'mc.example.net:25565');
  assert.equal(normalizePlayitAddress('https://my-world.joinmc.link/'), 'my-world.joinmc.link');
  assert.equal(normalizePlayitAddress(''), '');
  assert.throws(() => normalizePlayitAddress('mc.example.net:70000'), /port/);
  assert.throws(() => normalizePlayitAddress('https://evil.example/path'), /public Playit address|valid public/);
  assert.throws(() => normalizePlayitAddress('example..net'), /public Playit address|valid public/);
});
