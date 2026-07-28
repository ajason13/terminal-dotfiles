import { LIVE_CONSTANTS } from './live-constants.mjs';
import { ageLabel, readImportFile } from './import-snapshot.mjs';

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
}) {
  const owner = new AbortController();
  let mode = 'fixtures';
  let currentRender;
  let ageTimer;
  let disposed = false;
  let generation = 0;
  let track = initialTrack;

  const isCurrent = (candidate) => !disposed && generation === candidate;

  function clearAgeTimer() {
    if (ageTimer !== undefined) clearIntervalFn(ageTimer);
    ageTimer = undefined;
    sourceAge.textContent = '';
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
