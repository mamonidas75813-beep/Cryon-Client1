export function isUnexpectedServerExit({ ready = false, stopRequested = false, code = null, signal = null } = {}) {
  return !stopRequested && (!ready || code !== 0 || Boolean(signal));
}

/** Conservative, broadly compatible JVM flags for dedicated Minecraft server processes. */
export function buildServerJvmArgs({ memoryMb = 2048, javaMajor = 21, performancePreset = 'balanced' } = {}) {
  const heap = Math.max(512, Math.floor(Number(memoryMb) || 2048));
  const initialHeap = Math.min(1024, heap);
  const pauseTarget = performancePreset === 'performance' ? 150 : performancePreset === 'low-resource' ? 250 : 200;
  const args = [
    `-Xms${initialHeap}M`,
    `-Xmx${heap}M`,
    '-XX:+UseG1GC',
    '-XX:+ParallelRefProcEnabled',
    `-XX:MaxGCPauseMillis=${pauseTarget}`,
    '-XX:+DisableExplicitGC',
    '-Dfile.encoding=UTF-8',
  ];
  // Do not add flags that are removed or experimental in particular Java releases.
  if (Number(javaMajor) >= 17) args.push('-XX:+UseStringDeduplication');
  return args;
}
