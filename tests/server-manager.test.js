import test from 'node:test';
import { detectJavaRuntime, listJavaRuntimes } from '../modules/server/java-runtime.js';
import { getManagedJavaDirectory, getManagedJavaExecutable } from '../modules/server/java-installer.js';
import { isUnexpectedServerExit, buildServerJvmArgs } from '../modules/server/lifecycle.js';
import { getServerProcessMetrics } from '../modules/server/monitor.js';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {
  normalizeServerName, normalizeMinecraftVersion, normalizeMemoryMb, safeServerPath, buildServerProperties,
  listLocalServers, listServerFiles, readServerTextFile, writeServerTextFile, removeServerFile, uploadServerFile,
  requiredJavaMajor, parseJavaMajor, calculateServerMemoryBudget, checkServerMemoryAvailability, createServerBackup, listServerBackups, restoreServerBackup, getLocalSystemInfo,
} from '../modules/server/local-server.js';

const serverId = 'server-123e4567-e89b-12d3-a456-426614174000';

 test('server name, Minecraft release and memory allocation are validated', () => {
  assert.equal(normalizeServerName('  CRYON   SMP  '), 'CRYON SMP');
  assert.throws(() => normalizeServerName('../outside'), /unsupported characters/i);
  assert.equal(normalizeMinecraftVersion('1.21.4'), '1.21.4');
  assert.throws(() => normalizeMinecraftVersion('latest'), /valid Minecraft/i);
  assert.equal(normalizeMemoryMb(2048, 8 * 1024 ** 3), 2048);
  assert.equal(normalizeMemoryMb(512, 8 * 1024 ** 3), 512);
  assert.equal(normalizeMemoryMb(8192, 8 * 1024 ** 3), 8192, 'full installed RAM can be selected during creation');
  assert.throws(() => normalizeMemoryMb(256, 8 * 1024 ** 3), /between 512 MB/i);
  assert.equal(normalizeMemoryMb(1024, 1024 ** 3), 1024, 'a server allocation may equal total installed RAM');
  assert.throws(() => normalizeMemoryMb(1025, 1024 ** 3), /detected installed RAM/i);
});


test('server properties include validated world, access and performance settings', () => {
  const properties = buildServerProperties({
    motd: 'CRYON\nInjected', port: 25570, maxPlayers: 40, onlineMode: true,
    whitelist: true, difficulty: 'hard', gameMode: 'creative', viewDistance: 10,
    simulationDistance: 8, pvp: false, allowFlight: true, spawnProtection: 24,
    worldSeed: 'seed-123\nserver-port=1', worldType: 'flat', generateStructures: false,
    hardcore: true, allowNether: false, enableCommandBlocks: true,
  });
  assert.match(properties, /motd=CRYON Injected/);
  assert.match(properties, /server-port=25570/);
  assert.match(properties, /level-seed=seed-123server-port1/);
  assert.match(properties, /level-type=minecraft:flat/);
  assert.match(properties, /generate-structures=false/);
  assert.match(properties, /hardcore=true/);
  assert.match(properties, /allow-nether=false/);
  assert.match(properties, /enable-command-block=true/);
  assert.match(properties, /spawn-protection=24/);
});

test('server file paths reject traversal and absolute paths', () => {
  const root = path.join(os.tmpdir(), 'cryon-server-test');
  assert.equal(safeServerPath(root, 'plugins/Example/config.yml'), path.join(root, 'plugins', 'Example', 'config.yml'));
  assert.throws(() => safeServerPath(root, '../outside.txt'), /traversal/i);
  assert.throws(() => safeServerPath(root, 'C:/outside.txt'), /Invalid server file path/i);
});

test('server listing and file editor stay inside the selected local server folder', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cryon-server-manager-'));
  const directory = path.join(root, serverId);
  await fs.mkdir(path.join(directory, 'plugins'), { recursive: true });
  await fs.writeFile(path.join(directory, 'cryon-server.json'), JSON.stringify({ id: serverId, name: 'Test Server', version: '1.21.4', software: 'paper', memoryMb: 2048, createdAt: new Date().toISOString() }));
  await fs.writeFile(path.join(directory, 'server.properties'), 'motd=CRYON\n');
  await fs.writeFile(path.join(directory, 'server.jar'), 'protected jar placeholder');
  try {
    const servers = await listLocalServers(root, { [serverId]: 'offline' });
    assert.equal(servers.length, 1);
    assert.equal(servers[0].status, 'offline');
    const entries = await listServerFiles(root, serverId, '');
    assert.ok(entries.some(item => item.name === 'plugins' && item.type === 'directory'));
    const file = await readServerTextFile(root, serverId, 'server.properties');
    assert.equal(file.content, 'motd=CRYON\n');
    await writeServerTextFile(root, serverId, 'server.properties', 'motd=Edited\n');
    assert.equal((await fs.readFile(path.join(directory, 'server.properties'), 'utf8')), 'motd=Edited\n');
    await assert.rejects(() => readServerTextFile(root, serverId, 'server.jar'), /cannot be edited/i);
    await assert.rejects(() => removeServerFile(root, serverId, 'server.jar'), /protected/i);
    await assert.rejects(() => readServerTextFile(root, serverId, '../outside.txt'), /traversal/i);
    const localUpload = path.join(root, 'upload.txt'); await fs.writeFile(localUpload, 'uploaded');
    assert.equal(await uploadServerFile(root, serverId, '', localUpload), 'upload.txt');
    assert.equal(await fs.readFile(path.join(directory, 'upload.txt'), 'utf8'), 'uploaded');
    const outside = path.join(root, 'outside'); await fs.mkdir(outside); await fs.writeFile(path.join(outside, 'secret.txt'), 'secret');
    try {
      await fs.symlink(outside, path.join(directory, 'linked'), 'dir');
      await assert.rejects(() => readServerTextFile(root, serverId, 'linked/secret.txt'), /Symbolic links/i);
    } catch (error) {
      if (!['EPERM', 'EACCES', 'ENOSYS'].includes(error.code)) throw error;
    }
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});


test('Java runtime compatibility is selected by Minecraft server release', () => {
  assert.equal(requiredJavaMajor('1.16.5'), 8);
  assert.equal(requiredJavaMajor('1.17.1'), 16);
  assert.equal(requiredJavaMajor('1.20.4'), 17);
  assert.equal(requiredJavaMajor('1.20.5'), 21);
  assert.equal(requiredJavaMajor('1.21.11'), 21);
  assert.equal(requiredJavaMajor('26.3'), 25);
  assert.equal(parseJavaMajor('openjdk version "25.0.1" 2026-08-18'), 25);
  assert.equal(parseJavaMajor('java version "1.8.0_422"'), 8);
  assert.equal(parseJavaMajor('not a Java version'), null);
});

test('server memory budget protects host reserve and accounts for other server allocations', () => {
  const empty = calculateServerMemoryBudget({ totalMemoryMb: 16384, availableMemoryMb: 12000 });
  const withServer = calculateServerMemoryBudget({ totalMemoryMb: 16384, availableMemoryMb: 12000, runningAllocationsMb: [8192] });
  assert.ok(empty.reserveMb >= 2048);
  assert.ok(empty.maxAdditionalMb >= 1024);
  assert.ok(withServer.maxAdditionalMb < empty.maxAdditionalMb);
  assert.ok(withServer.runningReservedMb === 8192);
  const constrained = calculateServerMemoryBudget({ totalMemoryMb: 8192, availableMemoryMb: 1800 });
  assert.equal(constrained.canStartMinimumServer, false);
  assert.ok(constrained.maxAdditionalMb < 1024);
});

test('server creation can select full installed RAM, but start requires enough currently available RAM', () => {
  assert.equal(normalizeMemoryMb(16384, 16384 * 1024 * 1024), 16384);
  const enough = checkServerMemoryAvailability({ availableMemoryMb: 9000, requestedMemoryMb: 8192 });
  assert.equal(enough.canStart, true);
  const notEnough = checkServerMemoryAvailability({ availableMemoryMb: 7000, requestedMemoryMb: 8192 });
  assert.equal(notEnough.canStart, false);
  assert.equal(notEnough.shortfallMb, 1192);
  const withOtherServer = checkServerMemoryAvailability({ availableMemoryMb: 12000, requestedMemoryMb: 8192, runningAllocationsMb: [4096] });
  assert.equal(withOtherServer.canStart, false);
  assert.equal(withOtherServer.requiredMemoryMb, 12288);
});

test('server backups restore exact world/config snapshots and retain a rollback copy', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cryon-server-backup-'));
  const directory = path.join(root, serverId);
  try {
    await fs.mkdir(path.join(directory, 'world', 'region'), { recursive: true });
    await fs.mkdir(path.join(directory, 'plugins'), { recursive: true });
    await fs.writeFile(path.join(directory, 'cryon-server.json'), JSON.stringify({ id: serverId, name: 'Backup Test', version: '1.21.4', software: 'paper', memoryMb: 2048, createdAt: new Date().toISOString() }));
    await fs.writeFile(path.join(directory, 'world', 'region', 'r.0.0.mca'), 'world-before');
    await fs.writeFile(path.join(directory, 'plugins', 'sample.jar'), 'plugin-before');
    await fs.writeFile(path.join(directory, 'server.properties'), 'motd=before\n');
    const backup = await createServerBackup(root, serverId);
    assert.ok(backup.bytes > 0);
    assert.equal((await listServerBackups(root, serverId)).length, 1);
    await fs.writeFile(path.join(directory, 'world', 'region', 'r.0.0.mca'), 'world-after');
    await fs.writeFile(path.join(directory, 'world', 'region', 'new-file.mca'), 'added-after-backup');
    await fs.writeFile(path.join(directory, 'server.properties'), 'motd=after\n');
    const restored = await restoreServerBackup(root, serverId, backup.id);
    assert.equal(restored.restored, true);
    assert.equal(await fs.readFile(path.join(directory, 'world', 'region', 'r.0.0.mca'), 'utf8'), 'world-before');
    await assert.rejects(() => fs.stat(path.join(directory, 'world', 'region', 'new-file.mca')), { code: 'ENOENT' });
    assert.equal(await fs.readFile(path.join(directory, 'server.properties'), 'utf8'), 'motd=before\n');
    assert.equal(await fs.readFile(path.join(restored.rollbackDirectory, 'server.properties'), 'utf8'), 'motd=after\n');
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});


test('Java runtime detector reports an installed executable without hiding its version', async t => {
  const result = await detectJavaRuntime();
  if (!result.found) {
    t.skip(`No Java runtime is installed in this test environment: ${result.message}`);
    return;
  }
  assert.ok(result.major >= 8);
  assert.ok(result.executable);
  assert.ok(result.version);
});


test('server lifecycle distinguishes startup failures, crashes and requested shutdowns', () => {
  assert.equal(isUnexpectedServerExit({ ready: false, code: 0 }), true);
  assert.equal(isUnexpectedServerExit({ ready: true, code: 1 }), true);
  assert.equal(isUnexpectedServerExit({ ready: true, code: null, signal: 'SIGTERM' }), true);
  assert.equal(isUnexpectedServerExit({ ready: true, code: 0 }), false);
  assert.equal(isUnexpectedServerExit({ ready: false, stopRequested: true, code: 1, signal: 'SIGTERM' }), false);
});


test('host resource detection returns bounded memory and CPU topology', async () => {
  const info = await getLocalSystemInfo();
  assert.ok(info.cpuCores >= 1);
  assert.ok(info.totalMemoryMb > 0);
  assert.ok(info.availableMemoryMb >= 0 && info.availableMemoryMb <= info.totalMemoryMb);
  assert.ok(info.usedMemoryMb >= 0 && info.usedMemoryMb <= info.totalMemoryMb);
});

test('per-process monitor reports actual memory or an explicit unsupported status', async () => {
  const metrics = await getServerProcessMetrics(process.pid);
  assert.equal(typeof metrics.available, 'boolean');
  assert.equal(metrics.pid, process.pid);
  if (metrics.available) assert.ok(metrics.memoryMb > 0);
  else assert.ok(metrics.note);
});


test('Java runtime discovery finds checksum-versioned nested managed installations', async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cryon-java-discovery-'));
  const managed = path.join(root, 'runtimes');
  const java = path.join(managed, 'temurin-21-a1b2c3d4e5f6a7b8', 'jdk-package', 'jre', 'bin', 'java');
  await fs.mkdir(path.dirname(java), { recursive: true });
  await fs.writeFile(java, '#!/bin/sh\necho \"openjdk version \\\"21.0.7\\\" 2025-04-15\" >&2\nexit 0\n', 'utf8');
  await fs.chmod(java, 0o755);
  try {
    const runtimes = await listJavaRuntimes({ managedDirectory: managed });
    const realJava = await fs.realpath(java);
    assert.ok(runtimes.some(runtime => runtime.major === 21 && runtime.executable === realJava));
    assert.equal(await getManagedJavaExecutable(root, 'linux', 21), java);
  } finally { await fs.rm(root, { recursive: true, force: true }); }
});

test('managed Java directory names are immutable and checksum-specific', () => {
  const first = getManagedJavaDirectory('/tmp/cryon-user-data', 21, 'a'.repeat(64));
  const second = getManagedJavaDirectory('/tmp/cryon-user-data', 21, 'b'.repeat(64));
  assert.notEqual(first, second, 'a new Temurin package must not replace an existing runtime folder');
  assert.match(first, /temurin-21-aaaaaaaaaaaaaaaa$/);
  assert.match(second, /temurin-21-bbbbbbbbbbbbbbbb$/);
});

test('server JVM optimization profiles keep heap bounds and conservative G1 tuning', () => {
  const balanced = buildServerJvmArgs({ memoryMb: 3584, javaMajor: 21, performancePreset: 'balanced' });
  assert.ok(balanced.includes('-Xms1024M'));
  assert.ok(balanced.includes('-Xmx3584M'));
  assert.ok(balanced.includes('-XX:+UseG1GC'));
  assert.ok(balanced.includes('-XX:MaxGCPauseMillis=200'));
  const low = buildServerJvmArgs({ memoryMb: 512, javaMajor: 17, performancePreset: 'low-resource' });
  assert.ok(low.includes('-Xms512M'));
  assert.ok(low.includes('-XX:MaxGCPauseMillis=250'));
});
