import { TRACK_CATALOG, getTrack } from './track-catalog.mjs';

export const TRACK_WORKDAY_OPEN_MINUTES = 8 * 60 + 30;
export const TRACK_WORKDAY_MIDPOINT_MINUTES = 12 * 60 + 30;
export const TRACK_WORKDAY_CLOSE_MINUTES = 16 * 60 + 30;
export const TRACK_WORKDAY_WINDOWS_PER_DAY = 2;
const DAY_MS = 86400000;

export function localTrackSlot(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new TypeError('Invalid date');
  const localDayOrdinal = Math.floor(Date.UTC(
    date.getFullYear(), date.getMonth(), date.getDate(),
  ) / DAY_MS);
  const localMinutes = date.getHours() * 60 + date.getMinutes();
  const windowIndex = localMinutes < TRACK_WORKDAY_OPEN_MINUTES
    ? -1
    : Number(localMinutes >= TRACK_WORKDAY_MIDPOINT_MINUTES);
  return localDayOrdinal * TRACK_WORKDAY_WINDOWS_PER_DAY + windowIndex;
}

export function autoTrackAt(date, catalog = TRACK_CATALOG) {
  if (!Array.isArray(catalog) || catalog.length < 2) throw new TypeError('Invalid track catalog');
  const slot = localTrackSlot(date);
  return catalog[((slot % catalog.length) + catalog.length) % catalog.length];
}

function localBoundary(date, dayOffset, minutes) {
  return new Date(
    date.getFullYear(), date.getMonth(), date.getDate() + dayOffset,
    Math.floor(minutes / 60), minutes % 60, 0, 0,
  );
}

export function nextTrackBoundary(date) {
  if (!(date instanceof Date) || !Number.isFinite(date.getTime())) throw new TypeError('Invalid date');
  const localMinutes = date.getHours() * 60 + date.getMinutes();
  if (localMinutes < TRACK_WORKDAY_OPEN_MINUTES) {
    return localBoundary(date, 0, TRACK_WORKDAY_OPEN_MINUTES);
  }
  if (localMinutes < TRACK_WORKDAY_MIDPOINT_MINUTES) {
    return localBoundary(date, 0, TRACK_WORKDAY_MIDPOINT_MINUTES);
  }
  return localBoundary(date, 1, TRACK_WORKDAY_OPEN_MINUTES);
}

function statusText(track, mode, boundary, now) {
  if (mode === 'manual') return `Active course: ${track.title} · Manual`;
  const crossesDay = boundary.getDate() !== now.getDate()
    || boundary.getMonth() !== now.getMonth()
    || boundary.getFullYear() !== now.getFullYear();
  const options = crossesDay
    ? { dateStyle: 'medium', timeStyle: 'short' }
    : { timeStyle: 'short' };
  return `Active course: ${track.title} · Auto · workday schedule · next change ${boundary.toLocaleString([], options)}`;
}

export function createTrackSelectionController({
  selector,
  status,
  liveRegion,
  applyTrack,
  onFatal,
  documentRef = globalThis.document,
  windowRef = globalThis.window,
  now = () => new Date(),
  setTimeoutFn = globalThis.setTimeout,
  clearTimeoutFn = globalThis.clearTimeout,
  catalog = TRACK_CATALOG,
}) {
  const owner = new AbortController();
  let mode = 'auto';
  let currentTrack;
  let timer;
  let destroyed = false;

  function clearBoundary() {
    if (timer !== undefined) clearTimeoutFn(timer);
    timer = undefined;
  }

  function fail(error) {
    if (destroyed) return;
    clearBoundary();
    onFatal(error);
  }

  function schedule(date) {
    if (destroyed || mode !== 'auto') return;
    clearBoundary();
    const boundary = nextTrackBoundary(date);
    const delay = Math.max(0, boundary.getTime() - date.getTime());
    timer = setTimeoutFn(() => {
      timer = undefined;
      try {
        recompute();
      } catch (error) {
        fail(error);
      }
    }, delay);
  }

  function apply(nextTrack, initial = false) {
    const changed = currentTrack?.id !== nextTrack.id;
    if (changed) applyTrack(nextTrack);
    currentTrack = nextTrack;
    const date = now();
    const boundary = nextTrackBoundary(date);
    status.textContent = statusText(nextTrack, mode, boundary, date);
    if (changed && !initial) liveRegion.textContent = `Course changed to ${nextTrack.title}.`;
  }

  function recompute(initial = false) {
    if (destroyed || mode !== 'auto') return;
    const date = now();
    apply(autoTrackAt(date, catalog), initial);
    schedule(date);
  }

  function catchUp() {
    if (destroyed || mode !== 'auto') return;
    try {
      recompute();
    } catch (error) {
      fail(error);
    }
  }

  function select() {
    if (destroyed) return;
    try {
      if (selector.value === 'auto') {
        mode = 'auto';
        recompute();
      } else {
        mode = 'manual';
        clearBoundary();
        apply(getTrack(selector.value));
      }
    } catch (error) {
      fail(error);
    }
  }

  selector.addEventListener('change', select, { signal: owner.signal });
  documentRef.addEventListener('visibilitychange', () => {
    if (documentRef.visibilityState === 'visible') catchUp();
  }, { signal: owner.signal });
  windowRef.addEventListener('pageshow', catchUp, { signal: owner.signal });
  windowRef.addEventListener('focus', catchUp, { signal: owner.signal });

  return Object.freeze({
    start() {
      try {
        selector.value = 'auto';
        recompute(true);
        return currentTrack;
      } catch (error) {
        fail(error);
        return undefined;
      }
    },
    get currentTrack() { return currentTrack; },
    get mode() { return mode; },
    destroy() {
      if (destroyed) return;
      destroyed = true;
      clearBoundary();
      owner.abort();
    },
  });
}
