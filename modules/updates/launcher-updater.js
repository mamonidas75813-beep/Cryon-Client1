// The installer and feed are handled by electron-updater (NSIS, HTTPS, SHA-512).
// Never download or execute raw JavaScript from the partner feed.
export class LauncherUpdater {
  constructor({ updater, enabled, onState = () => {}, canRestart = () => true, version }) {
    this.updater = updater;
    this.onState = onState;
    this.canRestart = canRestart;
    this.state = { status: enabled ? 'idle' : 'disabled', currentVersion: version, version: '', percent: 0, message: enabled ? 'Ready to check for updates.' : 'Automatic updates require a configured Windows Setup installation.' };
    if (!enabled) return;
    updater.autoDownload = true;
    updater.autoInstallOnAppQuit = false; // Explicit restart avoids interrupting Minecraft/server sessions.
    updater.allowPrerelease = false;
    updater.allowDowngrade = false;
    updater.on('checking-for-update', () => this.set('checking', 'Checking GitHub releases…', { percent: 0 }));
    updater.on('update-available', info => this.set('downloading', `Downloading v${info.version}…`, { version: info.version, percent: 0 }));
    updater.on('update-not-available', () => this.set('current', 'You are on the latest version.', { version: '', percent: 0 }));
    updater.on('download-progress', progress => this.set('downloading', `Downloading update: ${Math.round(progress.percent || 0)}%`, { percent: Math.max(0, Math.min(100, Number(progress.percent) || 0)) }));
    updater.on('update-downloaded', info => this.set('ready', `v${info.version} is ready. Restart to update.`, { version: info.version, percent: 100 }));
    updater.on('error', error => this.fail(error));
  }
  snapshot() { return { ...this.state }; }
  set(status, message, extra = {}) { this.state = { ...this.state, ...extra, status, message }; this.onState(this.snapshot()); }
  fail(error) { this.set('error', `Update failed. Retry when connected. (${String(error?.message || error).slice(0, 180)})`); }
  async check() {
    if (['disabled', 'checking', 'downloading', 'ready', 'installing'].includes(this.state.status) || this.pending) return this.snapshot();
    this.set('checking', 'Checking GitHub releases…');
    this.pending = true;
    try {
      const result = await this.updater.checkForUpdates();
      if (result?.downloadPromise) await result.downloadPromise;
      if (this.state.status === 'checking') this.set('current', 'No update available.');
    } catch (error) { this.fail(error); }
    finally { this.pending = false; }
    return this.snapshot();
  }
  install() {
    if (this.state.status !== 'ready') throw new Error('No downloaded update is ready.');
    if (!this.canRestart()) throw new Error('Close Minecraft and stop local servers/Playit before restarting.');
    this.set('installing', 'Restarting CRYON to install the update…');
    try { this.updater.quitAndInstall(false, true); }
    catch (error) { this.set('ready', 'Could not start installer. Retry.'); throw error; }
    return this.snapshot();
  }
}
