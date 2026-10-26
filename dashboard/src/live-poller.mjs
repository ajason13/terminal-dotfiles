import { LIVE_CONSTANTS } from './live-constants.mjs';

export function createLivePoller({
  pollOnce,
  onResult,
  onFailure,
  onExhausted,
  intervalMs,
  maxFailures,
  requestTimeoutMs = LIVE_CONSTANTS.LIVE_REQUEST_TIMEOUT_MS,
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
  visibility,
}) {
  let timer = null;
  let unsubscribe = null;
  let failures = 0;
  let running = false;
  let activeRequest = null;

  async function tick() {
    if (!running || activeRequest || visibility?.isHidden()) return;
    const controller = new AbortController();
    const request = { controller, cancel: null };
    activeRequest = request;
    let deadline;
    const canceled = new Promise((_, reject) => {
      request.cancel = () => {
        controller.abort();
        reject(new Error('LIVE_REQUEST_ABORTED'));
      };
      deadline = setTimeoutFn(request.cancel, requestTimeoutMs);
    });
    const isCurrent = () => running && activeRequest === request;
    try {
      let snapshot;
      try {
        // The race bounds even an adapter that ignores AbortSignal; abort also
        // releases the real fetch and response-body reader on timeout/teardown.
        snapshot = await Promise.race([
          Promise.resolve(pollOnce(controller.signal)), canceled,
        ]);
      } catch {
        if (!isCurrent()) return;
        failures += 1;
        onFailure(failures);
        if (failures >= maxFailures) {
          stop();
          onExhausted();
        }
        return;
      }
      if (!isCurrent()) return;
      // Render errors are not transport failures.
      failures = 0;
      onResult(snapshot);
    } finally {
      clearTimeoutFn(deadline);
      if (activeRequest === request) activeRequest = null;
    }
  }

  function start() {
    if (running) return Promise.resolve();
    running = true;
    failures = 0;
    if (visibility) {
      unsubscribe = visibility.subscribe(() => { if (!visibility.isHidden()) void tick(); });
    }
    timer = setIntervalFn(() => { void tick(); }, intervalMs);
    return tick();
  }

  function stop() {
    running = false;
    activeRequest?.cancel();
    activeRequest = null;
    if (timer !== null) { clearIntervalFn(timer); timer = null; }
    if (unsubscribe) { unsubscribe(); unsubscribe = null; }
  }

  return { start, stop, isRunning: () => running };
}
