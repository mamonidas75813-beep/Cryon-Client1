import test from 'node:test';
import assert from 'node:assert/strict';
import { inspectMinecraftSkin, normalizeSkinVariant, MAX_SKIN_FILE_BYTES } from '../modules/cosmetics/skin-manager.js';

function fakePng(width, height, totalLength = 33) {
  const buffer = Buffer.alloc(totalLength);
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).copy(buffer, 0);
  buffer.writeUInt32BE(13, 8);
  buffer.write('IHDR', 12, 'ascii');
  buffer.writeUInt32BE(width, 16);
  buffer.writeUInt32BE(height, 20);
  return buffer;
}

test('Minecraft skin validator accepts the modern 64x64 PNG layout', () => {
  assert.deepEqual(inspectMinecraftSkin(fakePng(64, 64)), { width: 64, height: 64, legacy: false, variant: 'classic' });
});

test('Minecraft skin validator accepts legacy 64x32 and marks it Classic-only', () => {
  const info = inspectMinecraftSkin(fakePng(64, 32));
  assert.equal(info.legacy, true);
  assert.equal(normalizeSkinVariant('slim', info.legacy), 'classic');
});

test('Minecraft skin validator rejects non-PNG and non-standard dimensions', () => {
  assert.throws(() => inspectMinecraftSkin(Buffer.from('not a png')), /complete PNG|PNG skin/i);
  assert.throws(() => inspectMinecraftSkin(fakePng(128, 128)), /64×64 or legacy 64×32/);
});

test('Minecraft skin validator enforces the 5 MB upload limit', () => {
  assert.equal(MAX_SKIN_FILE_BYTES, 5 * 1024 * 1024);
  assert.throws(() => inspectMinecraftSkin(fakePng(64, 64, MAX_SKIN_FILE_BYTES + 1)), /5 MB or smaller/);
});

test('skin variant accepts only Classic and Slim for modern skins', () => {
  assert.equal(normalizeSkinVariant('SLIM'), 'slim');
  assert.equal(normalizeSkinVariant('classic'), 'classic');
  assert.throws(() => normalizeSkinVariant('wide'), /Classic.*Slim/);
});
