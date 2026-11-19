import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const html = await readFile(new URL('../src/renderer/index.html', import.meta.url), 'utf8');
const app = await readFile(new URL('../src/renderer/app.js', import.meta.url), 'utf8');
const main = await readFile(new URL('../src/main.js', import.meta.url), 'utf8');
const preload = await readFile(new URL('../src/preload.cjs', import.meta.url), 'utf8');

test('Cosmetics page offers only Minecraft skin selection and upload controls', () => {
  const start = html.indexOf('id="page-cosmetics"');
  const end = html.indexOf('</section>', start);
  const page = html.slice(start, end + 10);
  assert.match(page, /skin-choose-button/);
  assert.match(page, /skin-upload-button/);
  assert.match(page, /skin-variant/);
  assert.doesNotMatch(page, /wings|capes|emotes|cosmetic store/i);
});

test('skin upload stays in Electron main and requires a Microsoft account', () => {
  assert.match(main, /function requireMicrosoftSkinAccount\(\)/);
  assert.match(main, /metadata\?\.type !== 'microsoft'/);
  assert.match(main, /await manager\.updateSkin\(imageBlob, variant\)/);
  assert.match(main, /new Skin\(account\)/);
  assert.doesNotMatch(preload, /accessToken|access_token/);
});

test('skin IPC API is exposed through narrow preload methods', () => {
  for (const api of ['pickSkinFile', 'getCurrentSkin', 'uploadSkin']) assert.match(preload, new RegExp(`${api}:`));
  assert.match(app, /async function chooseSkinFile\(\)/);
  assert.match(app, /async function uploadSelectedSkin\(\)/);
  assert.match(app, /api\.uploadSkin\(\$\('#skin-variant'\)\.value\)/);
});
