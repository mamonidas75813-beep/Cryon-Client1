import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { loadPartners } from './partner-config.js';

const MANIFEST_LIMIT = 256 * 1024;
const IMAGE_LIMIT = 512 * 1024;
const REFRESH_MS = 60_000;
const hash = value => createHash('sha256').update(value).digest('hex');
const pngHeader = Buffer.from([137,80,78,71,13,10,26,10]);
function validPng(bytes) {
  return bytes.length >= 33 && bytes.subarray(0,8).equals(pngHeader) && bytes.toString('ascii',12,16) === 'IHDR' && bytes.readUInt32BE(16) > 0 && bytes.readUInt32BE(16) <= 1024 && bytes.readUInt32BE(20) > 0 && bytes.readUInt32BE(20) <= 1024;
}
export function validateGlobalPartners(records) {
  if (!Array.isArray(records) || records.length > 50) throw new Error('Expected an array of at most 50 official partners.');
  for (const row of records) {
    if (!row || typeof row !== 'object' || Array.isArray(row) || ['id','name','address'].some(key => typeof row[key] !== 'string') || (row.description != null && (typeof row.description !== 'string' || row.description.length > 300))) throw new Error('Invalid partner record.');
  }
  return loadPartners(records, '');
}
async function atomicWrite(file, bytes) {
  await fs.mkdir(path.dirname(file), { recursive: true });
  const temp = `${file}.${randomUUID()}.tmp`;
  try { await fs.writeFile(temp, bytes); await fs.rename(temp, file); }
  finally { await fs.rm(temp, { force: true }).catch(() => {}); }
}
export class GlobalPartnerStore {
  constructor({ directory, seedFile, sourceFile, bundledAssets, fetcher = globalThis.fetch, now = Date.now }) {
    Object.assign(this, { directory, seedFile, sourceFile, bundledAssets, fetcher, now });
    this.partners = []; this.error = ''; this.source = 'bundled'; this.lastAttempt = -Infinity;
    this.url = null; this.initialized = false; this.inFlight = null; this.imageJobs = new Map();
    this.networkOk = false; this.activeRemote = false;
  }
  async initialize() {
    this.partners = validateGlobalPartners(JSON.parse(await fs.readFile(this.seedFile, 'utf8')));
    try {
      const config = JSON.parse(await fs.readFile(this.sourceFile, 'utf8'));
      if (typeof config.url !== 'string') throw new Error('url must be a string');
      if (config.url.trim()) {
        const url = new URL(config.url.trim());
        if (url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || !url.pathname.endsWith('/partners.json')) throw new Error('Use a direct HTTPS URL ending in /partners.json');
        this.url = url.href;
        this.cacheDir = path.join(this.directory, hash(this.url));
        try {
          this.partners = validateGlobalPartners(JSON.parse(await fs.readFile(path.join(this.cacheDir, 'partners.json'), 'utf8')));
          this.activeRemote = true; this.source = 'cache';
        } catch { /* first run or invalid cache: use bundled seed */ }
      } else this.error = 'Global partner feed is not configured yet. Showing bundled partners.';
    } catch (error) { this.error = `Global partner source configuration error: ${error.message}`; }
    this.initialized = true;
  }
  async download(url, maxBytes) {
    const response = await this.fetcher(url, { signal: AbortSignal.timeout(8000), redirect: 'error', cache: 'no-store' });
    if (!response.ok || !response.body) { await response.body?.cancel().catch(() => {}); throw new Error(`HTTP ${response.status}`); }
    const reader = response.body.getReader();
    const chunks = []; let size = 0;
    try {
      for (;;) {
        const { done, value } = await reader.read(); if (done) break;
        size += value.byteLength; if (size > maxBytes) throw new Error('Download too large');
        chunks.push(Buffer.from(value));
      }
      return Buffer.concat(chunks);
    } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
  }
  refresh(force = false) {
    if (this.inFlight) return this.inFlight;
    this.inFlight = this.update(force).finally(() => { this.inFlight = null; });
    return this.inFlight;
  }
  async update(force) {
    if (!this.initialized) await this.initialize();
    if (this.url && (force || this.now() - this.lastAttempt >= REFRESH_MS)) {
      this.lastAttempt = this.now();
      try {
        const bytes = await this.download(this.url, MANIFEST_LIMIT);
        const rows = JSON.parse(bytes.toString('utf8').replace(/^\uFEFF/, ''));
        const partners = validateGlobalPartners(rows);
        await atomicWrite(path.join(this.cacheDir, 'partners.json'), JSON.stringify(rows));
        this.partners = partners; this.source = 'online'; this.activeRemote = true; this.networkOk = true; this.error = '';
      } catch (error) {
        this.networkOk = false; this.source = this.activeRemote ? 'cache' : 'bundled';
        this.error = `Global partner sync unavailable (${error.message}). Showing ${this.activeRemote ? 'last synced' : 'bundled'} partners.`;
      }
    }
    return { partners: this.partners, error: this.error, source: this.source };
  }
  async imageBytes(filename) {
    if (!filename || !/^[a-zA-Z0-9_-]+\.png$/i.test(filename) || !this.partners.some(p => p.logo === filename || p.icon === filename)) return null;
    if (!this.activeRemote) {
      try { const bytes = await fs.readFile(path.join(this.bundledAssets, filename)); return bytes.length <= IMAGE_LIMIT && validPng(bytes) ? bytes : null; } catch { return null; }
    }
    if (this.imageJobs.has(filename)) return this.imageJobs.get(filename);
    const job = this.readRemoteImage(filename).finally(() => this.imageJobs.delete(filename));
    this.imageJobs.set(filename, job); return job;
  }
  async readRemoteImage(filename) {
    const file = path.join(this.cacheDir, 'images', filename);
    try { const bytes = await fs.readFile(file); if (bytes.length <= IMAGE_LIMIT && validPng(bytes)) return bytes; } catch { /* download if possible */ }
    if (!this.networkOk) return null;
    try {
      const bytes = await this.download(new URL(`images/${filename}`, this.url).href, IMAGE_LIMIT);
      if (!validPng(bytes)) return null;
      await atomicWrite(file, bytes); return bytes;
    } catch { return null; }
  }
}
