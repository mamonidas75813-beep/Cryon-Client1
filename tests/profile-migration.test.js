import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { migrateDefaultProfileDirectory } from '../modules/launcher/profile-migration.js';

async function withTempDir(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), 'cryon-migration-'));
  try { await fn(root); } finally { await fs.rm(root, { recursive: true, force: true }); }
}

test('legacy hidden EML root moves directly under AppData when destination is empty', async () => {
  await withTempDir(async root => {
    const oldParent = path.join(root, '.nova');
    const newParent = root;
    const oldInstance = path.join(oldParent, '.1.21.10-Fabric');
    await fs.mkdir(oldInstance, { recursive: true });
    await fs.writeFile(path.join(oldInstance, 'options.txt'), 'music:0.5\n');
    const migrated = await migrateDefaultProfileDirectory(oldParent, newParent, [{ name: '1.21.10-Fabric', instanceName: '1.21.10-Fabric' }]);
    assert.equal(migrated, true);
    assert.equal(await fs.readFile(path.join(newParent, '.1_21_10_fabric', 'options.txt'), 'utf8'), 'music:0.5\n');
    assert.equal(await fs.stat(oldInstance).catch(() => null), null);
  });
});

test('legacy migration never overwrites an existing direct AppData profile root', async () => {
  await withTempDir(async root => {
    const oldParent = path.join(root, '.nova');
    const newParent = root;
    const oldInstance = path.join(oldParent, '.1.21.10-Fabric');
    const newInstance = path.join(newParent, '.1_21_10_fabric');
    await fs.mkdir(oldInstance, { recursive: true });
    await fs.mkdir(newInstance, { recursive: true });
    await fs.writeFile(path.join(oldInstance, 'old.txt'), 'keep');
    await fs.writeFile(path.join(newInstance, 'new.txt'), 'keep too');
    const migrated = await migrateDefaultProfileDirectory(oldParent, newParent, [{ name: '1.21.10-Fabric', instanceName: '1.21.10-Fabric' }]);
    assert.equal(migrated, true);
    assert.equal(await fs.readFile(path.join(oldInstance, 'old.txt'), 'utf8'), 'keep');
    assert.equal(await fs.readFile(path.join(newInstance, 'new.txt'), 'utf8'), 'keep too');
  });
});


test('legacy visible profile placeholder can migrate when the canonical hidden root is absent', async () => {
  await withTempDir(async root => {
    const oldParent = path.join(root, 'nova-client');
    const newParent = root;
    const oldInstance = path.join(oldParent, '.26.3-Fabric');
    await fs.mkdir(oldInstance, { recursive: true });
    await fs.writeFile(path.join(oldInstance, '.cryon-options-pending'), '{"schemaVersion":1}');
    const migrated = await migrateDefaultProfileDirectory(oldParent, newParent, [{ name: '26.3-Fabric', instanceName: '26.3-Fabric' }]);
    assert.equal(migrated, true);
    assert.ok((await fs.stat(path.join(newParent, '.26_3_fabric', '.cryon-options-pending'))).isFile());
    assert.equal(await fs.stat(oldInstance).catch(() => null), null);
  });
});
