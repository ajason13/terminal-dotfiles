import { STATE_PRESENTATION, buildAccessibleText } from './session-contract.mjs';
import { allocatePitBays, allocateSessions } from './track-layout.mjs';
import { getTrack } from './track-catalog.mjs';

import { element } from './dom-elements.mjs';
import { makeCar, updateCarVisual, replaceTooltip, applyBadge, stateClass, ROUTE_PHASE_SECONDS } from './car-visuals.mjs';
import { attachTooltipLayout } from './tooltip-layout.mjs';
export { CAR_VISUAL_CATALOG, CAR_ASSET_CATALOG, selectCarVisual, computeTooltipShift } from './car-visuals.mjs';

function requiredMount(root, selector) {
  const mount = root.querySelector(selector);
  if (!mount) throw new Error(`Dashboard mount is missing: ${selector}`);
  return mount;
}

// Just the total; the per-status breakdown is redundant with the on-track glyph
// counts (#on-track-summary), so keep the bar summary to one short chunk.
function summaryText(snapshot) {
  const total = snapshot.sessions.length;
  return `${total} ${total === 1 ? 'session' : 'sessions'}`;
}

function renderOnTrackSummary(documentRef, mount, sessions) {
  mount.replaceChildren();
  for (const status of ['active', 'thinking']) {
    const presentation = STATE_PRESENTATION[status];
    const count = sessions.filter((session) => session.status === status).length;
    const item = element(documentRef, 'span', `on-track-count ${stateClass(status)}`);
    item.setAttribute('aria-label', `${count} ${presentation.label.toLowerCase()} sessions on track`);
    const glyph = element(documentRef, 'span', 'on-track-glyph', presentation.glyph);
    glyph.setAttribute('aria-hidden', 'true');
    item.append(glyph, element(documentRef, 'span', 'on-track-label', `${count} ${presentation.label}`));
    mount.append(item);
  }
}

const POOL_LABELS = Object.freeze({ route: 'route', pit: 'pit' });

// Overflow is expected when live sessions outnumber a pool's slots. Render it as
// a calm, collapsed "parked" summary (code + name only) rather than repeating the
// full capacity/permission/observed boilerplate once per overflowed session.
function renderOverflowNotice(documentRef, notice, entries, label, capacity) {
  notice.replaceChildren();
  const details = element(documentRef, 'details', 'overflow-details');
  const slots = `${capacity} ${capacity === 1 ? 'slot' : 'slots'}`;
  const toggle = element(documentRef, 'summary', 'overflow-toggle',
    `${entries.length} parked · over ${label} capacity (${slots})`);
  const list = element(documentRef, 'ul', 'overflow-list');
  for (const entry of entries) {
    list.append(element(documentRef, 'li', 'overflow-item', `${entry.code} ${entry.name}`));
  }
  details.append(toggle, list);
  notice.append(details);
}

// Reconciles bay elements against the roster. Bays are reused and reordered with
// append() (a move) rather than rebuilt, because rebuilding one would destroy a pinned
// descendant car's focus and data-pinned, and dom-fake has no insertBefore.
function syncPitBays(documentRef, pitMount, roster, bays) {
  const live = new Set();
  // Match the in-order prefix and append only from the first mismatch onward: append()
  // moves a node to the end, so once one moves every later node must move too.
  let cursor = 0;
  let moving = false;
  for (const bay of roster) {
    const id = bay.key ?? '';
    live.add(id);
    let entry = bays.get(id);
    if (!entry) {
      const section = element(documentRef, 'section', 'pit-bay');
      section.dataset.bayKey = id;
      // group, not the region a labelled section would imply: four bays plus the lane
      // would clutter the landmark rotor, and the h3 already makes each bay navigable.
      section.setAttribute('role', 'group');
      section.setAttribute('aria-label', `${bay.label} bay`);
      const heading = element(documentRef, 'h3', 'pit-bay-name');
      const count = element(documentRef, 'span', 'pit-bay-count', '0');
      heading.append(element(documentRef, 'span', 'pit-bay-label', bay.label), count);
      const mount = element(documentRef, 'div', 'pit-bay-mount');
      section.append(heading, mount);
      entry = { section, mount, count };
      bays.set(id, entry);
    }
    if (!moving && pitMount.children[cursor] === entry.section) {
      cursor += 1;
      continue;
    }
    moving = true;
    pitMount.append(entry.section);
  }
  for (const [id, entry] of [...bays]) {
    if (live.has(id)) continue;
    entry.section.remove();
    bays.delete(id);
  }
}

// Places every pit car in its bay's mount in bayRank order, moving only what is out of
// place. Runs on first render and on update(), so a renamed session's car changes bays.
function appendPitCars(entries, bays) {
  const byBay = new Map();
  for (const entry of entries) {
    const id = entry.placement.bayKey ?? '';
    if (!byBay.has(id)) byBay.set(id, []);
    byBay.get(id).push(entry);
  }
  for (const [id, bay] of bays) {
    const items = (byBay.get(id) ?? [])
      .sort((left, right) => left.placement.bayRank - right.placement.bayRank);
    // Same prefix-then-append rule as syncPitBays: a steady tick moves no car at all.
    let cursor = 0;
    let moving = false;
    for (const item of items) {
      if (!moving && bay.mount.children[cursor] === item.wrapper) {
        cursor += 1;
        continue;
      }
      moving = true;
      bay.mount.append(item.wrapper);
    }
    bay.count.textContent = String(items.length);
  }
}

export function renderDashboard(snapshot, root = document, initialTrack = getTrack('ridge-pass')) {
  const renderController = new AbortController();
  const { signal } = renderController;
  const documentRef = root.ownerDocument ?? root;
  const summary = requiredMount(root, '#snapshot-summary');
  const vehicleLayer = requiredMount(root, '#vehicle-layer');
  const tooltipLayer = requiredMount(root, '#tooltip-layer');
  const mapOverflow = requiredMount(root, '#overflow-notice');
  const onTrackSummary = requiredMount(root, '#on-track-summary');
  const mapStage = requiredMount(root, '#map-stage');
  const mapHeading = requiredMount(root, '#map-heading');
  const pitMount = requiredMount(root, '#pit');
  const pitOverflow = requiredMount(root, '#pit-overflow');

  vehicleLayer.replaceChildren();
  tooltipLayer.replaceChildren();
  mapOverflow.replaceChildren();
  mapOverflow.hidden = true;
  pitMount.replaceChildren();
  pitOverflow.replaceChildren();
  pitOverflow.hidden = true;
  renderOnTrackSummary(documentRef, onTrackSummary, snapshot.sessions);

  const { dockPitTooltips } = attachTooltipLayout({
    root, documentRef, mapStage, vehicleLayer, pitMount, signal,
  });

  let track = getTrack(initialTrack.id);
  root.dataset.trackId = track.id;
  mapHeading.textContent = track.title;
  let placements = allocateSessions(snapshot.sessions, track);
  const placementsById = new Map(placements.map((placement) => [placement.id, placement]));
  const sessionsById = new Map(snapshot.sessions.map((session) => [session.id, session]));
  const textById = new Map();
  const carsById = new Map();
  const buttonsById = new Map();
  const tooltipsById = new Map();
  const overflows = new Map();
  const bays = new Map();

  let pinnedId = null;

  function setPinned(nextId) {
    pinnedId = nextId;
    for (const [id, car] of carsById) {
      const selected = id === pinnedId;
      if (selected) car.dataset.pinned = 'true';
      else delete car.dataset.pinned;
      buttonsById.get(id).setAttribute('aria-pressed', String(selected));
    }
  }

  // Hoisted so both the initial creation loop and update() can wire a freshly
  // created car's listeners without recreating elements that already have them.
  function attachCarInteractions(id) {
    const button = buttonsById.get(id);
    button.addEventListener('click', (event) => {
      if (event.detail !== 0) setPinned(pinnedId === id ? null : id);
    }, { signal });
    button.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return;
      event.preventDefault();
      setPinned(pinnedId === id ? null : id);
    }, { signal });
  }

  // Swaps a wrapper's state-* class and dataset.status in place, without touching
  // its base (vehicle-anchor/pit-vehicle) class or recreating the element.
  function swapStateClass(wrapper, session) {
    const { status } = session;
    wrapper.dataset.status = status;
    wrapper.dataset.confidence = session.confidence;
    // DOMTokenList is iterable but `.values` is a METHOD, not an array/Set - spreading
    // the bare function reference throws in real browsers. Iterate the list itself.
    for (const cls of [...wrapper.classList]) {
      if (cls.startsWith('state-')) wrapper.classList.remove(cls);
    }
    wrapper.classList.add(stateClass(status));
  }

  // Mutates a route car's position/phase/tooltip/aria/state in place; reused by
  // setTrack and update() so a persisting element (and its CSS motion animation) survives.
  // Note: slotIndex is recomputed from `placement` on every call, so a persisting session
  // whose `progress` crosses a 1/16 route bucket between ticks gets its anchor
  // (--vehicle-x/--vehicle-y) and --route-phase rewritten to the new slot - the element
  // (and its running CSS animation) still persists, but its on-track position can jump.
  // Accepted limitation.
  function applyRouteCar(wrapper, button, tooltip, session, placement, text) {
    wrapper.style.setProperty('--vehicle-x', `${placement.x / 10}%`);
    wrapper.style.setProperty('--vehicle-y', `${placement.y / 7.6}%`);
    wrapper.style.setProperty('--route-phase', `${-placement.slotIndex * ROUTE_PHASE_SECONDS}s`);
    wrapper.dataset.routeSlot = String(placement.slotIndex);
    swapStateClass(wrapper, session);
    button.setAttribute('aria-label', text.label);
    const visual = updateCarVisual(documentRef, wrapper, button, tooltip, session);
    replaceTooltip(documentRef, tooltip, session, text, visual);
    applyBadge(documentRef, wrapper, text.workRef);
  }

  const pitEntries = [];
  for (const session of snapshot.sessions) {
    const placement = placementsById.get(session.id);
    const text = buildAccessibleText(session, placement, snapshot.generatedAt);
    textById.set(session.id, text);
    if (placement.overflow) {
      if (!overflows.has(placement.pool)) overflows.set(placement.pool, []);
      overflows.get(placement.pool).push({ code: session.mapCode, name: session.displayName });
      continue;
    }
    const target = placement.pool === 'route' ? 'route' : 'pit';
    const car = makeCar(documentRef, session, placement, text, target);
    carsById.set(session.id, car.wrapper);
    buttonsById.set(session.id, car.button);
    tooltipsById.set(session.id, car.wrapper.querySelector('.session-tooltip'));
    attachCarInteractions(session.id);
    if (target === 'route') vehicleLayer.append(car.wrapper);
    else pitEntries.push({ wrapper: car.wrapper, placement });
  }
  syncPitBays(documentRef, pitMount, allocatePitBays(snapshot.sessions, track), bays);
  appendPitCars(pitEntries, bays);

  summary.textContent = summaryText(snapshot);
  for (const [pool, entries] of overflows) {
    const notice = pool === 'route' ? mapOverflow : pitOverflow;
    const capacity = placements.filter((item) => item.pool === pool && !item.overflow).length;
    renderOverflowNotice(documentRef, notice, entries, POOL_LABELS[pool] ?? pool, capacity);
    notice.hidden = false;
  }

  root.addEventListener('keydown', (event) => {
    if (event.key !== 'Escape') return;
    event.preventDefault();
    setPinned(null);
  }, { signal });

  return Object.freeze({
    get placements() { return placements; },
    overflowCount: [...overflows.values()].flat().length,
    setTrack(nextTrack) {
      const candidate = getTrack(nextTrack?.id);
      if (candidate.id === track.id) return;
      const nextPlacements = allocateSessions(snapshot.sessions, candidate);
      const nextById = new Map(nextPlacements.map((placement) => [placement.id, placement]));
      const prepared = [];
      for (const session of snapshot.sessions) {
        const placement = nextById.get(session.id);
        if (!placement || placement.overflow !== placementsById.get(session.id)?.overflow
          || placement.pool !== placementsById.get(session.id)?.pool) {
          throw new Error('Track placement invariant failed');
        }
        if (placement.pool !== 'route' || placement.overflow) continue;
        const text = buildAccessibleText(session, placement, snapshot.generatedAt);
        const wrapper = carsById.get(session.id);
        const button = buttonsById.get(session.id);
        const tooltip = tooltipsById.get(session.id);
        if (!wrapper || !button || !tooltip) throw new Error('Route car is missing');
        prepared.push({
          session, placement, text, wrapper, button, tooltip,
        });
      }
      // Commit begins only after the complete replacement view has been derived.
      root.dataset.trackId = candidate.id;
      mapHeading.textContent = candidate.title;
      for (const item of prepared) {
        applyRouteCar(item.wrapper, item.button, item.tooltip, item.session, item.placement, item.text);
        textById.set(item.session.id, item.text);
        placementsById.set(item.session.id, item.placement);
      }
      placements = nextPlacements;
      track = candidate;
    },
    update(nextSnapshot) {
      const nextPlacements = allocateSessions(nextSnapshot.sessions, track);
      const nextPlacementsById = new Map(nextPlacements.map((placement) => [placement.id, placement]));
      const nextIds = new Set(nextSnapshot.sessions.map((session) => session.id));

      // Remove cars whose session vanished, is now overflow, or changed pool.
      // Persisting same-pool cars are left alone below so their element (and its
      // CSS motion animation) survives the update.
      for (const [id, wrapper] of [...carsById]) {
        const nextPlacement = nextPlacementsById.get(id);
        const prevPlacement = placementsById.get(id);
        const gone = !nextIds.has(id);
        const overflowed = Boolean(nextPlacement?.overflow);
        const poolChanged = Boolean(nextPlacement) && Boolean(prevPlacement)
          && nextPlacement.pool !== prevPlacement.pool;
        if (gone || overflowed || poolChanged) {
          wrapper.remove();
          carsById.delete(id);
          buttonsById.delete(id);
          tooltipsById.delete(id);
        }
      }

      const nextOverflows = new Map();

      for (const session of nextSnapshot.sessions) {
        const placement = nextPlacementsById.get(session.id);
        const text = buildAccessibleText(session, placement, nextSnapshot.generatedAt);
        sessionsById.set(session.id, session);
        textById.set(session.id, text);
        placementsById.set(session.id, placement);

        if (placement.overflow) {
          if (!nextOverflows.has(placement.pool)) nextOverflows.set(placement.pool, []);
          nextOverflows.get(placement.pool).push({ code: session.mapCode, name: session.displayName });
          continue;
        }

        const target = placement.pool === 'route' ? 'route' : 'pit';
        const existingWrapper = carsById.get(session.id);

        if (existingWrapper) {
          const button = buttonsById.get(session.id);
          const tooltip = tooltipsById.get(session.id);
          if (target === 'route') {
            applyRouteCar(existingWrapper, button, tooltip, session, placement, text);
          } else {
            button.setAttribute('aria-label', text.label);
            const visual = updateCarVisual(documentRef, existingWrapper, button, tooltip, session);
            replaceTooltip(documentRef, tooltip, session, text, visual);
            swapStateClass(existingWrapper, session);
            applyBadge(documentRef, existingWrapper, text.workRef);
          }
        } else {
          const car = makeCar(documentRef, session, placement, text, target);
          // Pit cars are parented by appendPitCars below, once their bay exists.
          if (target === 'route') vehicleLayer.append(car.wrapper);
          carsById.set(session.id, car.wrapper);
          buttonsById.set(session.id, car.button);
          tooltipsById.set(session.id, car.wrapper.querySelector('.session-tooltip'));
          attachCarInteractions(session.id);
        }
      }

      // Delete stale bookkeeping for ids no longer present in the snapshot.
      for (const id of [...sessionsById.keys()]) {
        if (nextIds.has(id)) continue;
        sessionsById.delete(id);
        textById.delete(id);
        placementsById.delete(id);
      }

      // One reconcile pass per tick fixes ordering, absorbs bay renames, and adopts cars
      // into bays created this tick. It moves only mismatched nodes, so a steady tick
      // touches nothing and cannot knock focus out of a car the operator is tabbing.
      const pitEntries = [];
      for (const [id, wrapper] of carsById) {
        const placement = nextPlacementsById.get(id);
        if (placement && !placement.overflow && placement.pool === 'pit') {
          pitEntries.push({ wrapper, placement });
        }
      }
      syncPitBays(documentRef, pitMount, allocatePitBays(nextSnapshot.sessions, track), bays);
      appendPitCars(pitEntries, bays);

      mapOverflow.replaceChildren();
      mapOverflow.hidden = true;
      pitOverflow.replaceChildren();
      pitOverflow.hidden = true;
      for (const [pool, entries] of nextOverflows) {
        const notice = pool === 'route' ? mapOverflow : pitOverflow;
        const capacity = nextPlacements.filter((item) => item.pool === pool && !item.overflow).length;
        renderOverflowNotice(documentRef, notice, entries, POOL_LABELS[pool] ?? pool, capacity);
        notice.hidden = false;
      }

      summary.textContent = summaryText(nextSnapshot);
      renderOnTrackSummary(documentRef, onTrackSummary, nextSnapshot.sessions);

      if (pinnedId && !carsById.has(pinnedId)) pinnedId = null;
      setPinned(pinnedId);
      // A pinned tooltip stays visible across ticks, and this tick may have added or
      // dropped a bay, so re-dock it here too - the per-show handler will not fire again.
      dockPitTooltips();

      snapshot = nextSnapshot;
      placements = nextPlacements;
    },
    clearInteraction: () => {
      setPinned(null);
      const active = documentRef.activeElement;
      if (active && root.contains?.(active) && typeof active.blur === 'function') active.blur();
    },
    destroy: () => renderController.abort(),
  });
}

export function renderDashboardError(error, root = document) {
  const documentRef = root.ownerDocument ?? root;
  const dashboardRoot = requiredMount(root, '#dashboard-root');
  const alert = element(documentRef, 'section', 'invalid-snapshot');
  alert.setAttribute('role', 'alert');
  alert.setAttribute('aria-labelledby', 'invalid-snapshot-title');
  const title = element(documentRef, 'h1', '', 'Snapshot could not be displayed');
  title.id = 'invalid-snapshot-title';
  const explanation = element(documentRef, 'p', '', 'The complete fixture snapshot was rejected. No partial or potentially misleading session state is shown.');
  const issues = element(documentRef, 'ul', 'invalid-snapshot-issues');
  const messages = Array.isArray(error?.issues) && error.issues.length > 0
    ? error.issues
    : [error?.message ?? 'Unknown snapshot error'];
  for (const message of messages) issues.append(element(documentRef, 'li', '', String(message)));
  alert.append(title, explanation, issues);
  dashboardRoot.replaceChildren(alert);
}

export function renderApplicationError(error, documentRef = document, dashboardRoot) {
  const alert = element(documentRef, 'section', 'invalid-snapshot application-failure');
  alert.setAttribute('role', 'alert');
  alert.setAttribute('aria-labelledby', 'application-failure-title');
  const title = element(documentRef, 'h1', '', 'Dashboard could not be displayed');
  title.id = 'application-failure-title';
  const explanation = element(
    documentRef,
    'p',
    '',
    'The dashboard encountered an application failure. No partial or potentially misleading state is shown.',
  );
  const issues = element(documentRef, 'ul', 'invalid-snapshot-issues');
  issues.append(element(documentRef, 'li', '', String(error?.message ?? 'Unknown application error')));
  alert.append(title, explanation, issues);
  if (dashboardRoot) dashboardRoot.replaceChildren(alert);
  else documentRef.body.replaceChildren(alert);
}
