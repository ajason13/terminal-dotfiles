import { STATE_PRESENTATION, buildAccessibleText } from './session-contract.mjs';
import { allocateSessions } from './track-layout.mjs';
import { getTrack } from './track-catalog.mjs';

const ROUTE_LAP_SECONDS = 64;
const ROUTE_PHASE_SECONDS = ROUTE_LAP_SECONDS / 16;
const PIT_SELECTORS = Object.freeze({
  error: '#pit-error',
  permission: '#pit-permission',
  pitstop: '#pit-pitstop',
  unknown: '#pit-unknown',
});

function element(documentRef, tagName, className, text) {
  const node = documentRef.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function svgElement(documentRef, tagName, className, attributes = {}) {
  const node = documentRef.createElementNS('http://www.w3.org/2000/svg', tagName);
  if (className) node.setAttribute('class', className);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, value);
  return node;
}

function makeCarSilhouette(documentRef) {
  const svg = svgElement(documentRef, 'svg', 'car-silhouette', {
    viewBox: '0 0 32 48',
    'aria-hidden': 'true',
    focusable: 'false',
  });
  const wheels = [
    ['3', '10'], ['25', '10'], ['3', '32'], ['25', '32'],
  ].map(([x, y]) => svgElement(documentRef, 'rect', 'car-wheel', {
    x, y, width: '4', height: '9', rx: '2',
  }));
  const chassis = svgElement(documentRef, 'path', 'car-chassis', {
    d: 'M10 2Q16 0 22 2L25 9 27 18V38Q26 44 21 46H11Q6 44 5 38V18L7 9Z',
  });
  const frontGlass = svgElement(documentRef, 'path', 'car-glass car-glass-front', {
    d: 'M9 13Q16 10 23 13L22 19H10Z',
  });
  const rearGlass = svgElement(documentRef, 'path', 'car-glass car-glass-rear', {
    d: 'M10 31H22L23 36Q16 39 9 36Z',
  });
  const roof = svgElement(documentRef, 'path', 'car-roof', {
    d: 'M10 20Q16 18 22 20V30H10Z',
  });
  const centerline = svgElement(documentRef, 'path', 'car-centerline', {
    d: 'M12 9 16 6 20 9',
  });
  const lamps = [
    ['10', '5'], ['22', '5'],
  ].map(([cx, cy]) => svgElement(documentRef, 'circle', 'car-headlamp', {
    cx, cy, r: '1.6',
  }));
  svg.append(...wheels, chassis, frontGlass, rearGlass, roof, centerline, ...lamps);
  return svg;
}

function requiredMount(root, selector) {
  const mount = root.querySelector(selector);
  if (!mount) throw new Error(`Dashboard mount is missing: ${selector}`);
  return mount;
}

function stateClass(status) {
  return `state-${status.replaceAll('_', '-')}`;
}

function appendActivity(documentRef, parent, activity) {
  parent.append(`${activity.label}: `);
  const time = element(documentRef, 'time', 'activity-time', activity.exact);
  time.dateTime = activity.datetime;
  parent.append(time, ` (${activity.relative})`);
}

function makeTooltip(documentRef, session, presentation, text, tooltipId) {
  const tooltip = element(documentRef, 'span', 'session-tooltip');
  tooltip.id = tooltipId;
  tooltip.setAttribute('role', 'tooltip');
  tooltip.append(
    element(documentRef, 'strong', '', `${session.mapCode} · ${session.displayName}`),
    element(documentRef, 'span', '', `${presentation.label} · ${text.location}`),
  );
  const details = element(documentRef, 'span', 'tooltip-details');
  const nonActivity = text.details.split(`. ${text.activity.label}:`)[0];
  if (nonActivity && nonActivity !== text.details) details.append(`${nonActivity}. `);
  appendActivity(documentRef, details, text.activity);
  if (session.errorSummary) details.append(`. Error: ${session.errorSummary}`);
  tooltip.append(details);
  return tooltip;
}

function replaceTooltip(documentRef, tooltip, session, text) {
  const replacement = makeTooltip(
    documentRef,
    session,
    STATE_PRESENTATION[session.status],
    text,
    tooltip.id,
  );
  tooltip.replaceChildren(...replacement.childNodes);
}

function makeCar(documentRef, session, placement, text, target) {
  const presentation = STATE_PRESENTATION[session.status];
  const wrapper = element(
    documentRef,
    'div',
    `${target === 'route' ? 'vehicle-anchor' : 'pit-vehicle'} ${stateClass(session.status)}`,
  );
  wrapper.dataset.sessionId = session.id;
  wrapper.dataset.status = session.status;
  if (target === 'route') {
    wrapper.style.setProperty('--vehicle-x', `${placement.x / 10}%`);
    wrapper.style.setProperty('--vehicle-y', `${placement.y / 7.6}%`);
    wrapper.style.setProperty('--route-phase', `${-placement.slotIndex * ROUTE_PHASE_SECONDS}s`);
    wrapper.dataset.routeSlot = String(placement.slotIndex);
    if (placement.y >= 560) wrapper.classList.add('tooltip-up');
    if (placement.x <= 210) wrapper.classList.add('edge-left');
    if (placement.x >= 790) wrapper.classList.add('edge-right');
  }
  if (target === 'unknown') {
    wrapper.style.gridColumn = String(placement.slotIndex + 1);
    wrapper.style.gridRow = '1';
  }

  const atmosphere = element(documentRef, 'span', 'car-atmosphere', '');
  atmosphere.setAttribute('aria-hidden', 'true');

  const button = element(documentRef, 'button', 'session-car');
  button.type = 'button';
  button.dataset.sessionId = session.id;
  button.setAttribute('aria-label', text.label);
  button.setAttribute('aria-pressed', 'false');
  const tooltipId = `session-details-${session.mapCode.toLowerCase()}`;
  button.setAttribute('aria-describedby', tooltipId);

  const angle = element(documentRef, 'span', 'car-angle');
  const motion = element(documentRef, 'span', 'car-motion');
  const body = element(documentRef, 'span', 'car-body');
  const glyph = element(documentRef, 'span', 'car-glyph', presentation.glyph);
  const code = element(documentRef, 'span', 'car-code', session.mapCode);
  glyph.setAttribute('aria-hidden', 'true');
  code.setAttribute('aria-hidden', 'true');
  body.append(makeCarSilhouette(documentRef), glyph, code);
  motion.append(body);
  angle.append(motion);
  button.append(angle);
  wrapper.append(
    atmosphere,
    button,
    makeTooltip(documentRef, session, presentation, text, tooltipId),
  );
  return { wrapper, button };
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

const POOL_LABELS = Object.freeze({
  route: 'route',
  error: 'error hold',
  permission: 'permission hold',
  pitstop: 'Pit Stop',
  unknown: 'unclassified hold',
});

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
  const unknownHold = requiredMount(root, '#unknown-hold');
  const pitMounts = new Map(Object.entries(PIT_SELECTORS)
    .map(([pool, selector]) => [pool, requiredMount(root, selector)]));
  const pitOverflows = new Map([...pitMounts.keys()].map((pool) => [
    pool,
    requiredMount(root, `#pit-${pool}-overflow`),
  ]));

  vehicleLayer.replaceChildren();
  tooltipLayer.replaceChildren();
  mapOverflow.replaceChildren();
  mapOverflow.hidden = true;
  for (const mount of pitMounts.values()) mount.replaceChildren();
  for (let index = 0; index < 3; index += 1) {
    const anchor = element(documentRef, 'span', 'unknown-anchor', '?');
    anchor.setAttribute('aria-hidden', 'true');
    anchor.style.gridColumn = String(index + 1);
    anchor.style.gridRow = '1';
    pitMounts.get('unknown').append(anchor);
  }
  for (const notice of pitOverflows.values()) {
    notice.replaceChildren();
    notice.hidden = true;
  }
  renderOnTrackSummary(documentRef, onTrackSummary, snapshot.sessions);
  unknownHold.hidden = !snapshot.sessions.some((session) => session.status === 'unknown');

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
  function swapStateClass(wrapper, status) {
    wrapper.dataset.status = status;
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
    wrapper.classList.toggle('tooltip-up', placement.y >= 560);
    wrapper.classList.toggle('edge-left', placement.x <= 210);
    wrapper.classList.toggle('edge-right', placement.x >= 790);
    swapStateClass(wrapper, session.status);
    button.setAttribute('aria-label', text.label);
    replaceTooltip(documentRef, tooltip, session, text);
  }

  for (const session of snapshot.sessions) {
    const placement = placementsById.get(session.id);
    const text = buildAccessibleText(session, placement, snapshot.generatedAt);
    textById.set(session.id, text);
    if (placement.overflow) {
      if (!overflows.has(placement.pool)) overflows.set(placement.pool, []);
      overflows.get(placement.pool).push({ code: session.mapCode, name: session.displayName });
      continue;
    }
    const target = placement.pool === 'route' ? 'route' : placement.pool;
    const car = makeCar(documentRef, session, placement, text, target);
    if (target === 'route') vehicleLayer.append(car.wrapper);
    else pitMounts.get(target).append(car.wrapper);
    carsById.set(session.id, car.wrapper);
    buttonsById.set(session.id, car.button);
    tooltipsById.set(session.id, car.wrapper.querySelector('.session-tooltip'));
    attachCarInteractions(session.id);
  }

  summary.textContent = summaryText(snapshot);
  for (const [pool, entries] of overflows) {
    const notice = pool === 'route' ? mapOverflow : pitOverflows.get(pool);
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

        const target = placement.pool === 'route' ? 'route' : placement.pool;
        const existingWrapper = carsById.get(session.id);

        if (existingWrapper) {
          const button = buttonsById.get(session.id);
          const tooltip = tooltipsById.get(session.id);
          if (target === 'route') {
            applyRouteCar(existingWrapper, button, tooltip, session, placement, text);
          } else {
            button.setAttribute('aria-label', text.label);
            replaceTooltip(documentRef, tooltip, session, text);
            swapStateClass(existingWrapper, session.status);
          }
        } else {
          const car = makeCar(documentRef, session, placement, text, target);
          if (target === 'route') vehicleLayer.append(car.wrapper);
          else pitMounts.get(target).append(car.wrapper);
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

      mapOverflow.replaceChildren();
      mapOverflow.hidden = true;
      for (const notice of pitOverflows.values()) {
        notice.replaceChildren();
        notice.hidden = true;
      }
      for (const [pool, entries] of nextOverflows) {
        const notice = pool === 'route' ? mapOverflow : pitOverflows.get(pool);
        const capacity = nextPlacements.filter((item) => item.pool === pool && !item.overflow).length;
        renderOverflowNotice(documentRef, notice, entries, POOL_LABELS[pool] ?? pool, capacity);
        notice.hidden = false;
      }

      summary.textContent = summaryText(nextSnapshot);
      renderOnTrackSummary(documentRef, onTrackSummary, nextSnapshot.sessions);
      unknownHold.hidden = !nextSnapshot.sessions.some((session) => session.status === 'unknown');

      if (pinnedId && !carsById.has(pinnedId)) pinnedId = null;
      setPinned(pinnedId);

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
