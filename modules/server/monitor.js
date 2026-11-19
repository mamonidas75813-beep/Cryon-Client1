import os from 'node:os';
import fs from 'node:fs/promises';
import { execFile as execFileCallback } from 'node:child_process';
import { promisify } from 'node:util';

const execFile = promisify(execFileCallback);
const previousSamples = new Map();
let linuxTicksPerSecondPromise = null;

async function getLinuxTicksPerSecond() {
  if (!linuxTicksPerSecondPromise) {
    linuxTicksPerSecondPromise = execFile('getconf', ['CLK_TCK'], { timeout: 1500, maxBuffer: 1024 })
      .then(({ stdout }) => Number(stdout.trim()))
      .then(value => Number.isFinite(value) && value > 0 ? value : 100)
      .catch(() => 100);
  }
  return linuxTicksPerSecondPromise;
}

function safePid(value) {
  const pid = Number(value);
  return Number.isSafeInteger(pid) && pid > 0 ? pid : null;
}

function cpuPercentFromDelta(previous, cpuSeconds, now, cores) {
  if (!previous || now <= previous.time) return null;
  const elapsed = (now - previous.time) / 1000;
  const cpuDelta = Math.max(0, cpuSeconds - previous.cpuSeconds);
  return Math.max(0, Math.min(100, Math.round((cpuDelta / elapsed / Math.max(1, cores)) * 1000) / 10));
}

function parseProcStat(text, ticksPerSecond = 100) {
  const close = text.lastIndexOf(')');
  if (close < 0) throw new Error('Invalid process stat data.');
  const fields = text.slice(close + 1).trim().split(/\s+/);
  const userTicks = Number(fields[11]);
  const systemTicks = Number(fields[12]);
  if (!Number.isFinite(userTicks) || !Number.isFinite(systemTicks)) throw new Error('Process CPU counters are unavailable.');
  return (userTicks + systemTicks) / Math.max(1, ticksPerSecond);
}

export async function getServerProcessMetrics(pidValue) {
  const pid = safePid(pidValue);
  if (!pid) return { available: false, cpuPercent: null, memoryMb: null, note: 'Process ID unavailable.' };
  const now = Date.now();
  const cores = os.cpus().length || 1;
  try {
    if (process.platform === 'linux') {
      const [statText, statusText] = await Promise.all([
        fs.readFile(`/proc/${pid}/stat`, 'utf8'),
        fs.readFile(`/proc/${pid}/status`, 'utf8'),
      ]);
      const ticksPerSecond = await getLinuxTicksPerSecond();
      const cpuSeconds = parseProcStat(statText, ticksPerSecond);
      const rssMatch = statusText.match(/^VmRSS:\s+(\d+)\s+kB/im);
      if (!rssMatch) throw new Error('Process memory counter is unavailable.');
      const memoryMb = Number(rssMatch[1]) / 1024;
      const cpuPercent = cpuPercentFromDelta(previousSamples.get(pid), cpuSeconds, now, cores);
      previousSamples.set(pid, { cpuSeconds, time: now });
      return { available: true, cpuPercent, memoryMb: Math.round(memoryMb * 10) / 10, pid };
    }
    if (process.platform === 'win32') {
      const script = `$p = Get-Process -Id ${pid} -ErrorAction Stop; [pscustomobject]@{ cpu = [double]$p.CPU; memory = [double]$p.WorkingSet64 } | ConvertTo-Json -Compress`;
      const { stdout } = await execFile('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script], { timeout: 2500, windowsHide: true, maxBuffer: 16 * 1024 });
      const data = JSON.parse(stdout.trim());
      const cpuSeconds = Number(data.cpu);
      const memoryMb = Number(data.memory) / 1024 / 1024;
      const cpuPercent = cpuPercentFromDelta(previousSamples.get(pid), cpuSeconds, now, cores);
      previousSamples.set(pid, { cpuSeconds, time: now });
      return { available: true, cpuPercent, memoryMb: Math.round(memoryMb * 10) / 10, pid };
    }
    const { stdout } = await execFile('ps', ['-o', 'time=,rss=', '-p', String(pid)], { timeout: 2500, maxBuffer: 8192 });
    const match = stdout.trim().match(/(?:(\d+)-)?(?:(\d+):)?(\d+):(\d+(?:\.\d+)?)\s+(\d+)/);
    if (!match) throw new Error('Process metrics are unavailable.');
    const cpuSeconds = (Number(match[1] || 0) * 86400) + (Number(match[2] || 0) * 3600) + (Number(match[3] || 0) * 60) + Number(match[4] || 0);
    const memoryMb = Number(match[5]) / 1024;
    const cpuPercent = cpuPercentFromDelta(previousSamples.get(pid), cpuSeconds, now, cores);
    previousSamples.set(pid, { cpuSeconds, time: now });
    return { available: true, cpuPercent, memoryMb: Math.round(memoryMb * 10) / 10, pid };
  } catch (error) {
    previousSamples.delete(pid);
    return { available: false, cpuPercent: null, memoryMb: null, pid, note: error?.code === 'ESRCH' || error?.code === 'ENOENT' ? 'Process has exited.' : 'Per-process monitoring is unavailable on this system.' };
  }
}
