import test from 'node:test';
import assert from 'node:assert/strict';
import { createDefaultSettings, sanitizeSettings } from '../modules/settings/settings.js';

test('settings defaults are safe', () => {
  const settings = createDefaultSettings();
  assert.equal(settings.ramMin, 1024);
  assert.equal(settings.loader, 'vanilla');
  assert.equal(settings.hud.fps, true);
});
test('settings sanitizer rejects unknown loader and invalid version', () => {
  const settings = sanitizeSettings({ loader: 'killaura', minecraftVersion: '../bad', ramMin: 12 });
  assert.equal(settings.loader, 'vanilla');
  assert.equal(settings.minecraftVersion, '26.3');
  assert.equal(settings.ramMin, 1024);
});
test('settings sanitizer keeps valid RAM values', () => {
  const settings = sanitizeSettings({ ramMin: 2048, ramMax: 8192 });
  assert.equal(settings.ramMin, 2048);
  assert.equal(settings.ramMax, 8192);
});

test('invalid profile rows are discarded without breaking valid saved profiles', async () => {
  const defaults = sanitizeSettings({});
  const valid = defaults.profiles[0];
  const next = sanitizeSettings({ profiles: [valid, { ...valid, id: 'bad-profile', version: 'not-a-version' }], activeProfileId: valid.id });
  assert.equal(next.profiles.length, 1);
  assert.equal(next.activeProfileId, valid.id);
});


test('CRYON launcher settings persist startup, window, Java and download preferences', () => {
  const settings = sanitizeSettings({ startOnLogin: true, hideLauncherOnGameStart: true, hide3DCharacter: true, fullscreen: true, windowWidth: 1920, windowHeight: 1080, javaArgs: '-XX:+UseG1GC', downloadConcurrency: 12 });
  assert.equal(settings.startOnLogin, true);
  assert.equal(settings.hideLauncherOnGameStart, true);
  assert.equal(settings.hide3DCharacter, true);
  assert.equal(settings.fullscreen, true);
  assert.equal(settings.windowWidth, 1920);
  assert.equal(settings.windowHeight, 1080);
  assert.equal(settings.javaArgs, '-XX:+UseG1GC');
  assert.equal(settings.downloadConcurrency, 12);
});

test('download concurrency is clamped to a safe default outside 1–16', () => {
  assert.equal(sanitizeSettings({ downloadConcurrency: 0 }).downloadConcurrency, 6);
  assert.equal(sanitizeSettings({ downloadConcurrency: 32 }).downloadConcurrency, 6);
});
