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
  let ticking = false;

  async function tick() {
    if (!running) return;
    if (ticking) return;  // prevent concurrent ticks
    ticking = true;
    try {
      if (visibility && visibility.isHidden()) return;  // paused; no poll, no failure
      let snapshot;
      try {
        snapshot = await pollOnce();
      } catch {
        failures += 1;
        onFailure(failures);
        if (failures >= maxFailures) {
          stop();
          onExhausted();
        }
        return;
      }
      // Outside the catch: a throw from onResult (e.g. a render error) must not
      // be miscounted as a poll/transport failure.
      failures = 0;
      onResult(snapshot);
    } finally {
      ticking = false;
    }
  }

  function start() {
    if (running) return Promise.resolve();
    running = true;
    if (visibility) {
      unsubscribe = visibility.subscribe(() => { if (!visibility.isHidden()) void tick(); });
    }
    const tickPromise = tick();
    timer = setIntervalFn(() => { void tick(); }, intervalMs);
    return tickPromise;
  }

  function stop() {
    running = false;
    if (timer !== null) { clearIntervalFn(timer); timer = null; }
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  }

  return { start, stop, isRunning: () => running };
}
