import { LIVE_CONSTANTS } from './live-constants.mjs';
import { ageLabel, normalizeImportedSnapshot, readImportFile } from './import-snapshot.mjs';
import { createLivePoller } from './live-poller.mjs';

export function createSourceController({
  fileInput,
  resetButton,
  importRegion,
  sourceLabel,
  sourceAge,
  sourceNotice,
  readFixtures,
  render,
  readFile = readImportFile,
  now = () => Date.now(),
  setIntervalFn = globalThis.setInterval,
  clearIntervalFn = globalThis.clearInterval,
  windowRef = globalThis.window,
  initialTrack,
  onFatal = () => {},
  fetchSnapshot = null,
  token = null,
  visibility = null,
}) {
  const owner = new AbortController();
  let mode = 'fixtures';
  let currentRender;
  let ageTimer;
  let poller = null;
  let disposed = false;
  let generation = 0;
  let track = initialTrack;

  const isCurrent = (candidate) => !disposed && generation === candidate;

  function stopPoller() {
    if (poller) {
      poller.stop();
      poller = null;
    }
  }

  function clearAgeTimer() {
    if (ageTimer !== undefined) clearIntervalFn(ageTimer);
    ageTimer = undefined;
    sourceAge.textContent = '';
    stopPoller();
  }

  function beginTransition() {
    currentRender?.clearInteraction?.();
    clearAgeTimer();
  }

  function replaceView(snapshot) {
    currentRender?.destroy?.();
    currentRender = render(snapshot, track);
  }

  async function freshFixtures() {
    return readFixtures();
  }

  function settleControls() {
    fileInput.value = '';
    fileInput.disabled = false;
    importRegion.removeAttribute('aria-busy');
  }

  function updateAge(observedAt) {
    sourceAge.textContent = ageLabel(observedAt, now());
  }

  async function commitFixtures(nextMode, rejected, transition) {
    const snapshot = await freshFixtures();
    if (!isCurrent(transition)) return false;
    replaceView(snapshot);
    mode = nextMode;
    sourceLabel.textContent = 'Fixtures · Night sector';
    sourceNotice.textContent = rejected
      ? 'Live snapshot rejected; showing fixtures.'
      : '';
    settleControls();
    return true;
  }

  async function selectFile(file) {
    if (disposed || mode === 'validating') return false;
    const transition = ++generation;
    beginTransition();
    mode = 'validating';
    fileInput.disabled = true;
    importRegion.setAttribute('aria-busy', 'true');
    sourceNotice.textContent = '';
    sourceLabel.textContent = 'Validating live snapshot…';
    let snapshot;
    try {
      snapshot = await readFile(file, { importNow: now() });
    } catch {
      if (!isCurrent(transition)) return false;
      try {
        await commitFixtures('rejected_fixtures', true, transition);
      } catch (error) {
        if (isCurrent(transition)) onFatal(error);
      }
      return false;
    }
    if (!isCurrent(transition)) return false;
    try {
      replaceView(snapshot);
      mode = 'live';
      sourceLabel.textContent = 'Live · one-shot tmux observation';
      sourceNotice.textContent = '';
      updateAge(snapshot.observedAt);
      ageTimer = setIntervalFn(
        () => updateAge(snapshot.observedAt),
        LIVE_CONSTANTS.STALE_LABEL_TICK_MS,
      );
      settleControls();
      return true;
    } catch (error) {
      if (isCurrent(transition)) onFatal(error);
      return false;
    }
  }

  async function reset() {
    if (disposed || mode === 'validating') return false;
    const transition = ++generation;
    beginTransition();
    try {
      return await commitFixtures('fixtures', false, transition);
    } catch (error) {
      if (isCurrent(transition)) onFatal(error);
      return false;
    }
  }

  async function start() {
    if (disposed) return false;
    const transition = ++generation;
    try {
      const snapshot = await freshFixtures();
      if (!isCurrent(transition)) return false;
      replaceView(snapshot);
      sourceLabel.textContent = 'Fixtures · Night sector';
      sourceAge.textContent = '';
      sourceNotice.textContent = '';
      return true;
    } catch (error) {
      if (isCurrent(transition)) onFatal(error);
      return false;
    }
  }

  async function goLive() {
    if (disposed || mode === 'validating' || !fetchSnapshot || !token) return false;
    const transition = ++generation;
    beginTransition();
    mode = 'live_polling';
    sourceLabel.textContent = 'Live · auto-refresh';
    sourceNotice.textContent = '';
    let liveRendered = false;
    poller = createLivePoller({
      pollOnce: async () => {
        const res = await fetchSnapshot();
        if (!res || !res.ok) throw new Error('LIVE_FETCH_FAILED');
        return normalizeImportedSnapshot(await res.json(), now());
      },
      onResult: (snapshot) => {
        if (!isCurrent(transition)) return;
        // Never throw out of the poller: a render error here must route through the
        // same fatal path as start()/selectFile, not become an unhandled rejection.
        try {
          // The first live snapshot still needs a full render (switching from
          // fixtures); subsequent ticks update in place so persisting route cars
          // keep their element (and CSS motion animation) instead of restarting it.
          if (liveRendered && currentRender?.update) {
            currentRender.update(snapshot);
          } else {
            replaceView(snapshot);
            liveRendered = true;
          }
          updateAge(snapshot.observedAt);
          sourceNotice.textContent = '';
        } catch (error) {
          if (isCurrent(transition)) onFatal(error);
        }
      },
      onFailure: () => {
        if (!isCurrent(transition)) return;
        sourceNotice.textContent = 'Live update failed; retrying…';
      },
      onExhausted: () => {
        if (!isCurrent(transition)) return;
        stopPoller();
        void commitFixtures('rejected_fixtures', true, transition).catch((error) => {
          if (isCurrent(transition)) onFatal(error);
        });
      },
      intervalMs: LIVE_CONSTANTS.LIVE_POLL_INTERVAL_MS,
      maxFailures: LIVE_CONSTANTS.LIVE_MAX_CONSECUTIVE_FAILURES,
      setIntervalFn,
      clearIntervalFn,
      visibility,
    });
    await poller.start();
    return true;
  }

  fileInput.addEventListener('change', () => {
    if (mode === 'validating') return;
    const [file] = fileInput.files ?? [];
    if (file) void selectFile(file);
  }, { signal: owner.signal });
  resetButton.addEventListener('click', () => void reset(), { signal: owner.signal });
  windowRef?.addEventListener?.('beforeunload', clearAgeTimer, { signal: owner.signal });

  return Object.freeze({
    start,
    selectFile,
    reset,
    goLive,
    setTrack(nextTrack) {
      if (disposed) return;
      track = nextTrack;
      try {
        currentRender?.setTrack?.(nextTrack);
      } catch (error) {
        onFatal(error);
      }
    },
    get mode() { return mode; },
    destroy() {
      if (disposed) return;
      disposed = true;
      generation += 1;
      clearAgeTimer();
      currentRender?.destroy?.();
      owner.abort();
    },
  });
}
