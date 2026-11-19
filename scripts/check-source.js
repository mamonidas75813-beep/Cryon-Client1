import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const roots = ['src', 'modules', 'scripts', 'tests'];
const files = [];
async function walk(dir) {
  let entries; try { entries = await readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name === 'node_modules' || entry.name === 'build' || entry.name === 'dist') continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) await walk(full);
    else if (entry.isFile() && /\.(?:js|cjs|mjs)$/.test(full)) files.push(full);
  }
}
for (const root of roots) await walk(root);
let failed = false;
for (const file of files) {
  const result = spawnSync(process.execPath, ['--check', file], { encoding: 'utf8' });
  if (result.status !== 0) { failed = true; process.stderr.write(`${file}\n${result.stderr}`); }
}
if (failed) process.exit(1);

// Catch broken renderer selectors before Electron starts. Only static #id selectors
// authored in app.js are checked; dynamic class selectors are intentionally ignored.
const html = await readFile(path.join('src', 'renderer', 'index.html'), 'utf8');
const renderer = await readFile(path.join('src', 'renderer', 'app.js'), 'utf8');
const htmlIds = new Set([...html.matchAll(/\bid=[\"']([a-zA-Z0-9_-]+)[\"']/g)].map(match => match[1]));
const selectorIds = new Set([...renderer.matchAll(/[\"']#([a-zA-Z0-9_-]+)[\"']/g)].map(match => match[1]));
const missingIds = [...selectorIds].filter(id => !htmlIds.has(id));
if (missingIds.length) {
  console.error(`Renderer references missing HTML ids: ${missingIds.join(', ')}`);
  process.exit(1);
}
console.log(`Source syntax and renderer selector checks passed (${files.length} JavaScript files; ${selectorIds.size} static IDs).`);
