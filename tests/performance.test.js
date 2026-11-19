import test from 'node:test';
import assert from 'node:assert/strict';
import { getPerformancePreset, validatePerformanceSettings, applyPerformanceOptions } from '../modules/performance/presets.js';
import { mkdtemp, readFile, rm, mkdir, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('known performance presets return bounded recommendations', () => {
  assert.equal(getPerformancePreset('extreme').renderDistance, 5);
  assert.equal(getPerformancePreset('balanced').name, 'Balanced');
});
test('custom performance configuration validates bounds', () => {
  assert.equal(validatePerformanceSettings({ preset: 'low', renderDistance: 8 }).renderDistance, 8);
  assert.throws(() => validatePerformanceSettings({ renderDistance: 100 }), /between 2 and 32/);
});


test('performance options preserve unrelated player preferences', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'nova-perf-'));
  try {
    await mkdir(root, { recursive: true });
    await writeFile(path.join(root, 'options.txt'), 'sound:0.5\nrenderDistance:16\n', 'utf8');
    await applyPerformanceOptions(root, { preset: 'high' });
    const content = await readFile(path.join(root, 'options.txt'), 'utf8');
    assert.match(content, /sound:0.5/);
    assert.match(content, /renderDistance:8/);
    assert.doesNotMatch(content, /renderDistance:16/);
  } finally { await rm(root, { recursive: true, force: true }); }
});


test('saving a preset does not fabricate options.txt before Minecraft creates it', async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), 'cryon-perf-empty-'));
  try {
    const result = await applyPerformanceOptions(root, { preset: 'high' });
    assert.equal(result, null);
    await assert.rejects(readFile(path.join(root, 'options.txt'), 'utf8'), { code: 'ENOENT' });
  } finally { await rm(root, { recursive: true, force: true }); }
});
