import { FixtureSessionAdapter } from './fixture-adapter.mjs';
import { FIXTURE_SNAPSHOT } from './fixture-sessions.mjs';
import { renderApplicationError, renderDashboard } from './render-dashboard.mjs';
import { normalizeSnapshot } from './session-contract.mjs';
import { createSourceController } from './source-controller.mjs';
import { TRACK_CATALOG } from './track-catalog.mjs';
import { createTrackSelectionController } from './track-selection.mjs';

function exactlyOne(documentRef, selector) {
  const matches = documentRef.querySelectorAll(selector);
  if (matches.length !== 1) throw new Error(`Dashboard requires exactly one ${selector}`);
  return matches[0];
}

export function preflightDocument(documentRef) {
  const root = exactlyOne(documentRef, '#dashboard-root');
  const selector = exactlyOne(documentRef, '#track-select');
  const status = exactlyOne(documentRef, '#track-status');
  const liveRegion = exactlyOne(documentRef, '#track-live-region');
  const mapHeading = exactlyOne(documentRef, '#map-heading');
  for (const track of TRACK_CATALOG) {
    const arts = documentRef.querySelectorAll(`#${track.artId}`);
    if (arts.length !== 1) throw new Error(`Track art is missing or duplicated: ${track.id}`);
    const art = arts[0];
    if (art.tagName.toLowerCase() !== 'g'
      || art.getAttribute('data-track-art') !== track.id) {
      throw new Error(`Track art does not match catalog: ${track.id}`);
    }
    const centerlines = documentRef.querySelectorAll(`#${track.centerlineId}`);
    if (centerlines.length !== 1 || centerlines[0].tagName.toLowerCase() !== 'path'
      || !art.contains(centerlines[0])
      || centerlines[0].getAttribute('fill') !== 'none') {
      throw new Error(`Track centerline does not match catalog: ${track.id}`);
    }
    if (art.parentElement?.closest?.('[data-track-art]')) {
      throw new Error(`Track art groups may not be nested: ${track.id}`);
    }
  }
  return {
    root, selector, status, liveRegion, mapHeading,
  };
}

export function createApplicationFatalHandler({
  documentRef,
  dashboardRoots = documentRef.querySelectorAll('#dashboard-root'),
  getTrackController = () => undefined,
  getSourceController = () => undefined,
}) {
  let fatal = false;
  const fatalRoot = dashboardRoots.length === 1 ? dashboardRoots[0] : undefined;
  return Object.freeze({
    get fatal() { return fatal; },
    handle(error) {
      if (fatal) return;
      fatal = true;
      getTrackController()?.destroy?.();
      getSourceController()?.destroy?.();
      renderApplicationError(error, documentRef, fatalRoot);
    },
  });
}

export function applyApplicationTrack(mounts, track, sourceController) {
  mounts.root.dataset.trackId = track.id;
  mounts.mapHeading.textContent = track.title;
  sourceController?.setTrack(track);
}

export async function startDashboard(documentRef = document, windowRef = window) {
  let trackController;
  let sourceController;
  const fatalHandler = createApplicationFatalHandler({
    documentRef,
    getTrackController: () => trackController,
    getSourceController: () => sourceController,
  });
  const onFatal = (error) => fatalHandler.handle(error);

  try {
    const mounts = preflightDocument(documentRef);
    let activeTrack;
    trackController = createTrackSelectionController({
      selector: mounts.selector,
      status: mounts.status,
      liveRegion: mounts.liveRegion,
      documentRef,
      windowRef,
      onFatal,
      applyTrack: (track) => {
        activeTrack = track;
        applyApplicationTrack(mounts, track, sourceController);
      },
    });
    activeTrack = trackController.start();
    if (fatalHandler.fatal || !activeTrack) return;
    const adapter = new FixtureSessionAdapter(FIXTURE_SNAPSHOT);
    sourceController = createSourceController({
      fileInput: exactlyOne(documentRef, '#snapshot-file'),
      resetButton: exactlyOne(documentRef, '#reset-source'),
      importRegion: exactlyOne(documentRef, '#source-controls'),
      sourceLabel: exactlyOne(documentRef, '#source-label'),
      sourceAge: exactlyOne(documentRef, '#source-age'),
      sourceNotice: exactlyOne(documentRef, '#source-notice'),
      readFixtures: async () => normalizeSnapshot(await adapter.readSnapshot()),
      render: (snapshot, track) => renderDashboard(snapshot, mounts.root, track),
      initialTrack: activeTrack,
      onFatal,
      windowRef,
    });
    await sourceController.start();
  } catch (error) {
    onFatal(error);
  }
}

if (typeof document !== 'undefined' && document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => void startDashboard(), { once: true });
} else if (typeof document !== 'undefined') {
  void startDashboard();
}
