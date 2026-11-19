import { test } from 'node:test';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import { LauncherUpdater } from '../modules/updates/launcher-updater.js';
function fixture(options = {}) {
  const updater = new EventEmitter();
  updater.checks = 0; updater.installs = 0;
  updater.checkForUpdates = async () => { updater.checks++; updater.emit('checking-for-update'); updater.emit('update-not-available'); };
  updater.quitAndInstall = () => updater.installs++;
  const manager = new LauncherUpdater({ updater, enabled: true, version: '0.11.7', ...options });
  return { updater, manager };
}
test('unconfigured updater does not make requests', async () => {
  const { updater, manager } = fixture({ enabled: false });
  assert.equal((await manager.check()).status, 'disabled'); assert.equal(updater.checks, 0);
});
test('update check reports current version and rejects downgrades or prereleases', async () => {
  const { updater, manager } = fixture();
  assert.equal((await manager.check()).status, 'current'); assert.equal(updater.allowDowngrade, false); assert.equal(updater.allowPrerelease, false);
  assert.equal(updater.autoDownload, true); assert.equal(updater.autoInstallOnAppQuit, false);
});
test('download progress and ready state; no duplicate download while ready', async () => {
  const { updater, manager } = fixture();
  updater.checkForUpdates = async () => { updater.checks++; updater.emit('update-available', {version:'0.11.8'}); updater.emit('download-progress', {percent: 45}); assert.equal(manager.snapshot().percent,45); return {downloadPromise:Promise.resolve().then(()=>updater.emit('update-downloaded',{version:'0.11.8'}))}; };
  assert.equal((await manager.check()).status,'ready'); assert.equal(manager.snapshot().version,'0.11.8'); await manager.check(); assert.equal(updater.checks,1);
});
test('installs only a ready update while game/server is idle', () => {
  let idle = false; const { updater, manager } = fixture({canRestart:()=>idle});
  assert.throws(()=>manager.install(), /No downloaded/);
  updater.emit('update-downloaded',{version:'0.11.8'}); assert.throws(()=>manager.install(), /Close Minecraft/); assert.equal(updater.installs,0);
  idle=true; assert.equal(manager.install().status,'installing'); assert.equal(updater.installs,1);
});
test('network errors allow retry without quitting app', async () => {
  const { updater, manager } = fixture(); const original=updater.checkForUpdates;
  updater.checkForUpdates=async()=>{throw new Error('offline');}; assert.equal((await manager.check()).status,'error');
  updater.checkForUpdates=original; assert.equal((await manager.check()).status,'current');
});
test('concurrent checks are coalesced', async () => {
  const { updater, manager }=fixture(); let finish; updater.checkForUpdates=()=>{updater.checks++; return new Promise(resolve=>{finish=resolve;});};
  const first=manager.check(); await manager.check(); finish(); await first; assert.equal(updater.checks,1);
});
