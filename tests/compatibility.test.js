import test from 'node:test';
import assert from 'node:assert/strict';
import { isLoaderCompatible, validateLaunchRequest } from '../modules/launcher/compatibility.js';

test('vanilla accepts legacy and modern versions', () => {
  assert.equal(isLoaderCompatible('1.8.9', 'vanilla'), true);
  assert.equal(isLoaderCompatible('1.21.1', 'vanilla'), true);
});
test('Fabric and Quilt reject legacy 1.12.2 but allow modern 26.x releases', () => {
  assert.equal(isLoaderCompatible('1.12.2', 'fabric'), false);
  assert.equal(isLoaderCompatible('1.12.2', 'quilt'), false);
  assert.equal(isLoaderCompatible('26.3', 'fabric'), true);
  assert.equal(isLoaderCompatible('26.3', 'quilt'), true);
});
test('NeoForge has a minimum 1.20.2 baseline', () => {
  assert.equal(isLoaderCompatible('1.20.1', 'neoforge'), false);
  assert.equal(isLoaderCompatible('1.20.2', 'neoforge'), true);
});
test('modded launches require an explicit loader build', () => {
  assert.throws(() => validateLaunchRequest({ version: '1.21.1', loader: 'fabric' }), /loader build/i);
  assert.deepEqual(validateLaunchRequest({ version: '1.21.1', loader: 'fabric', loaderVersion: '0.16.10' }), { version: '1.21.1', loader: 'fabric', loaderVersion: '0.16.10' });
});
test('invalid version and loader are rejected', () => {
  assert.throws(() => validateLaunchRequest({ version: '../1.21', loader: 'vanilla' }), /Invalid Minecraft version/);
  assert.throws(() => validateLaunchRequest({ version: '1.21.1', loader: 'unknown' }), /Unsupported loader/);
});
