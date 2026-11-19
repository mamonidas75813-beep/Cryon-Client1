import { spawn } from 'node:child_process';
import { mkdir, rm, writeFile, stat } from 'node:fs/promises';
import { createWriteStream, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import pkg from '../package.json' with { type: 'json' };

const projectRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const logDir = path.join(projectRoot, 'build-logs');
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const logFile = path.join(logDir, `windows-build-${timestamp}.log`);
const npmCommand = process.platform === 'win32' ? 'npm.cmd' : 'npm';
let logStream;

function log(message) {
  const line = `${message}\n`;
  process.stdout.write(line);
  logStream?.write(line);
}

function run(command, args, label) {
  return new Promise((resolve, reject) => {
    const commandLine = `${command} ${args.join(' ')}`;
    log(`\n===== ${label} =====\n> ${commandLine}`);
    const child = spawn(command, args, {
      cwd: projectRoot,
      env: process.env,
      shell: process.platform === 'win32',
      windowsHide: true,
      stdio: ['inherit', 'pipe', 'pipe'],
    });
    child.stdout.on('data', chunk => {
      process.stdout.write(chunk);
      logStream?.write(chunk);
    });
    child.stderr.on('data', chunk => {
      process.stderr.write(chunk);
      logStream?.write(chunk);
    });
    child.once('error', error => reject(new Error(`${label} could not start: ${error.message}`)));
    child.once('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`${label} failed with exit code ${code ?? 'unknown'}`));
    });
  });
}

async function main() {
  await mkdir(logDir, { recursive: true });
  await writeFile(logFile, `CRYON CLIENT ${pkg.version} Windows build\nStarted: ${new Date().toISOString()}\nHost: ${process.platform}/${process.arch}\nNode: ${process.version}\n`, 'utf8');
  logStream = createWriteStream(logFile, { flags: 'a' });

  try {
    log(`Build log: ${logFile}`);
    if (process.platform !== 'win32') {
      log('[ERROR] Windows EXE packaging must run on Windows 10/11. This environment cannot produce a verified Windows installer.');
      process.exitCode = 2;
      return;
    }
    if (process.arch !== 'x64') {
      log(`[ERROR] This release pipeline targets Windows x64; detected Node architecture: ${process.arch}. Install 64-bit Node.js.`);
      process.exitCode = 2;
      return;
    }
    if (Number(process.versions.node.split('.')[0]) < 22) {
      log(`[ERROR] Node.js 22+ is required; detected ${process.version}.`);
      process.exitCode = 2;
      return;
    }

    log('\n===== Remove stale outputs from earlier builds =====');
    await rm(path.join(projectRoot, 'build-output'), { recursive: true, force: true });
    await mkdir(path.join(projectRoot, 'release'), { recursive: true });
    for (const name of ['CRYON CLIENT Setup.exe', 'CRYON CLIENT Portable.exe']) {
      await rm(path.join(projectRoot, 'release', name), { force: true });
    }

    await run(npmCommand, ['--version'], 'Check npm');
    await run(npmCommand, ['install', '--include=dev', '--no-audit', '--no-fund'], 'Install dependencies (including devDependencies)');

    for (const required of ['electron', 'electron-builder']) {
      const packageJson = path.join(projectRoot, 'node_modules', required, 'package.json');
      if (!existsSync(packageJson)) throw new Error(`Missing build dependency: ${required}. Check the npm install error above.`);
    }

    await run(npmCommand, ['run', 'check'], 'Source checks');
    await run(npmCommand, ['test'], 'Automated tests');

    await run(npmCommand, ['run', 'build:installer'], 'Build NSIS installer');
    await run(process.execPath, ['scripts/collect-artifact.js', 'installer'], 'Collect NSIS installer');

    await run(npmCommand, ['run', 'build:portable'], 'Build portable executable');
    await run(process.execPath, ['scripts/collect-artifact.js', 'portable'], 'Collect portable executable');

    await run(process.execPath, ['scripts/verify-build.js'], 'Verify release files and SHA-256 checksums');

    const installer = path.join(projectRoot, 'release', 'CRYON CLIENT Setup.exe');
    const portable = path.join(projectRoot, 'release', 'CRYON CLIENT Portable.exe');
    const installerSize = (await stat(installer)).size;
    const portableSize = (await stat(portable)).size;
    log('\n[SUCCESS] Both Windows executables were built and verified.');
    log(`Installer: ${installer} (${installerSize.toLocaleString()} bytes)`);
    log(`Portable:  ${portable} (${portableSize.toLocaleString()} bytes)`);
    log(`Checksums: ${path.join(projectRoot, 'release', 'SHA256SUMS.txt')}`);
  } catch (error) {
    log(`\n[FAILED] ${error.message}`);
    log(`Full build output saved to: ${logFile}`);
    process.exitCode = 1;
  } finally {
    if (logStream) await new Promise(resolve => logStream.end(resolve));
  }
}

await main();
