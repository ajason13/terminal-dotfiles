export function createLivePoller({
  pollOnce,
  onResult,
  onFailure,
  onExhausted,
  intervalMs,
  maxFailures,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
  visibility,
}) {
  let timer = null;
  let unsubscribe = null;
  let failures = 0;
  let running = false;

  async function tick() {
    if (!running) return;
    if (visibility && visibility.isHidden()) return; // paused; no poll, no failure
    try {
      const snapshot = await pollOnce();
      failures = 0;
      onResult(snapshot);
    } catch {
      failures += 1;
      onFailure(failures);
      if (failures >= maxFailures) {
        stop();
        onExhausted();
      }
    }
  }

  function start() {
    if (running) return Promise.resolve();
    running = true;
    if (visibility) {
      unsubscribe = visibility.subscribe(() => { if (!visibility.isHidden()) void tick(); });
    }
    timer = setIntervalFn(() => { void tick(); }, intervalMs);
    return tick();
  }

  function stop() {
    running = false;
    if (timer !== null) { clearIntervalFn(timer); timer = null; }
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  }

  return { start, stop, isRunning: () => running };
}
