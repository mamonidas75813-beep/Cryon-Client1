import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { parseJavaMajor } from './local-server.js';

export async function detectJavaRuntime(customPath = '', timeoutMs = 7000) {
  const configured = String(customPath || '').trim().replace(/^"|"$/g, '');
  let executable = configured || (process.platform === 'win32' ? 'java.exe' : 'java');
  // javaw.exe has no reliable console output; use its sibling java.exe for version checks and server hosting.
  if (process.platform === 'win32' && /javaw\.exe$/i.test(executable)) {
    const consoleRuntime = path.join(path.dirname(executable), 'java.exe');
    try { await fs.access(consoleRuntime); executable = consoleRuntime; } catch { /* Keep the selected path so the error explains the failure. */ }
  }
  return new Promise(resolve => {
    let settled = false;
    let output = '';
    const finish = result => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(result);
    };
    const child = spawn(executable, ['-version'], { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
    const timer = setTimeout(() => {
      try { child.kill(); } catch { /* The runtime may already have exited. */ }
      finish({ found: false, executable, major: null, version: null, message: 'Java detection timed out. Check the selected Java executable.' });
    }, Math.max(1000, Number(timeoutMs) || 7000));
    child.stdout?.on('data', chunk => { output = `${output}${chunk}`.slice(-4000); });
    child.stderr?.on('data', chunk => { output = `${output}${chunk}`.slice(-4000); });
    child.once('error', error => finish({ found: false, executable, major: null, version: null, message: `Java could not be started: ${error.message || String(error)}` }));
    child.once('close', code => {
      const major = parseJavaMajor(output);
      const versionMatch = output.match(/version\s+"([^" ]+)"|openjdk\s+(?:version\s+)?"?([^"\s]+)"?/i);
      const version = versionMatch?.[1] || versionMatch?.[2] || null;
      finish({
        found: code === 0 && major !== null,
        executable,
        version,
        major,
        message: code === 0 ? (version || `Java ${major || 'runtime'} detected`) : 'Java exited with an error. Check the selected Java runtime.',
      });
    });
  });
}

async function findRuntimeExecutable(root, platform = process.platform, depth = 0) {
  if (depth > 6) return null;
  const executableName = platform === 'win32' ? 'java.exe' : 'java';
  const direct = path.join(root, 'bin', executableName);
  const directStat = await fs.lstat(direct).catch(() => null);
  if (directStat?.isFile() && !directStat.isSymbolicLink()) return direct;
  const macExecutable = path.join(root, 'Contents', 'Home', 'bin', executableName);
  const macStat = await fs.lstat(macExecutable).catch(() => null);
  if (macStat?.isFile() && !macStat.isSymbolicLink()) return macExecutable;
  const entries = await fs.readdir(root, { withFileTypes: true }).catch(() => []);
  for (const entry of entries.slice(0, 80)) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    const match = await findRuntimeExecutable(path.join(root, entry.name), platform, depth + 1);
    if (match) return match;
  }
  return null;
}

async function addRuntimeCandidateFromRoot(root, candidates, platform = process.platform) {
  const raw = String(root || '').trim();
  if (!raw) return;
  const resolved = path.resolve(raw);
  const executableName = platform === 'win32' ? 'java.exe' : 'java';
  if (path.basename(resolved).toLowerCase() === executableName.toLowerCase()) {
    const stat = await fs.lstat(resolved).catch(() => null);
    if (stat?.isFile() && !stat.isSymbolicLink()) candidates.add(resolved);
    return;
  }
  const executable = await findRuntimeExecutable(resolved, platform);
  if (executable) candidates.add(executable);
}

async function scanRuntimeParent(parent, candidates, platform = process.platform) {
  const entries = await fs.readdir(parent, { withFileTypes: true }).catch(() => []);
  // Runtime bundles sometimes contain an additional vendor/version directory after
  // archive extraction, so discovery walks a small bounded depth within known roots.
  for (const entry of entries.slice(0, 100)) {
    if (!entry.isDirectory() || entry.isSymbolicLink()) continue;
    await addRuntimeCandidateFromRoot(path.join(parent, entry.name), candidates, platform);
  }
}

/** Discover Java installations without assuming that the newest installed Java is compatible. */
export async function listJavaRuntimes({ configuredPath = '', managedDirectory = '' } = {}) {
  const candidates = new Set();
  await addRuntimeCandidateFromRoot(configuredPath, candidates);
  await addRuntimeCandidateFromRoot(process.env.JAVA_HOME || '', candidates);
  if (managedDirectory) await scanRuntimeParent(managedDirectory, candidates);

  const executableName = process.platform === 'win32' ? 'java.exe' : 'java';
  const pathEntries = String(process.env.PATH || '').split(path.delimiter).filter(Boolean);
  for (const entry of pathEntries) {
    const candidate = path.join(entry, executableName);
    const stat = await fs.stat(candidate).catch(() => null);
    if (stat?.isFile()) candidates.add(candidate);
  }

  if (process.platform === 'win32') {
    const roots = [
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Java'),
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Eclipse Adoptium'),
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Microsoft'),
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Zulu'),
      process.env.ProgramFiles && path.join(process.env.ProgramFiles, 'Amazon Corretto'),
      process.env['ProgramFiles(x86)'] && path.join(process.env['ProgramFiles(x86)'], 'Java'),
      process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Programs', 'Eclipse Adoptium'),
      process.env.USERPROFILE && path.join(process.env.USERPROFILE, '.jdks'),
    ].filter(Boolean);
    for (const root of roots) await scanRuntimeParent(root, candidates);
  } else if (process.platform === 'darwin') {
    for (const root of ['/Library/Java/JavaVirtualMachines', '/opt/homebrew/opt', '/usr/local/opt']) await scanRuntimeParent(root, candidates);
  } else if (process.platform === 'linux') {
    for (const root of ['/usr/lib/jvm', '/usr/java', '/opt/java', '/opt/jdks']) await scanRuntimeParent(root, candidates);
  }

  const checked = await Promise.all([...candidates].slice(0, 40).map(async executable => {
    const result = await detectJavaRuntime(executable, 4500);
    if (!result.found || !Number.isInteger(Number(result.major))) return null;
    const realExecutable = await fs.realpath(executable).catch(() => path.resolve(executable));
    const configured = configuredPath && path.resolve(configuredPath) === path.resolve(executable);
    const managed = managedDirectory && path.resolve(realExecutable).startsWith(`${path.resolve(managedDirectory)}${path.sep}`);
    const javaHome = process.env.JAVA_HOME && path.resolve(process.env.JAVA_HOME) === path.resolve(path.dirname(path.dirname(executable)));
    return { executable: realExecutable, version: result.version, major: Number(result.major), vendor: null, source: managed ? 'CRYON managed' : configured ? 'Settings selection' : javaHome ? 'JAVA_HOME' : 'System installation' };
  }));
  const unique = new Map();
  for (const runtime of checked.filter(Boolean)) {
    const key = `${runtime.major}:${runtime.executable.toLowerCase()}`;
    if (!unique.has(key)) unique.set(key, runtime);
  }
  return [...unique.values()].sort((a, b) => a.major - b.major || a.executable.localeCompare(b.executable));
}
