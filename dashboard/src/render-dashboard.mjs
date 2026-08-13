import { STATE_PRESENTATION, buildAccessibleText } from './session-contract.mjs';
import { allocatePitBays, allocateSessions } from './track-layout.mjs';
import { getTrack } from './track-catalog.mjs';

const ROUTE_LAP_SECONDS = 64;
const ROUTE_PHASE_SECONDS = ROUTE_LAP_SECONDS / 16;

function element(documentRef, tagName, className, text) {
  const node = documentRef.createElement(tagName);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}

function deepFreeze(value) {
  if (Array.isArray(value)) return Object.freeze(value.map(deepFreeze));
  if (value && typeof value === 'object') {
    return Object.freeze(Object.fromEntries(
      Object.entries(value).map(([key, entry]) => [key, deepFreeze(entry)]),
    ));
  }
  return value;
}

const freezeCatalog = (entries) => deepFreeze(entries);

export const CAR_VISUAL_CATALOG = Object.freeze({
  models: freezeCatalog([
    {
      key: 'coupe', name: 'Rounded Grand Tourer', signature: 'rounded-gt',
      nativeTopNose: 'down', topCorrection: 180,
    },
    {
      key: 'hatchback', name: 'Upright Hatch', signature: 'upright-hatch',
      nativeTopNose: 'down', topCorrection: 180,
    },
    {
      key: 'sedan', name: 'Rally Sedan', signature: 'rally-sedan',
      nativeTopNose: 'up', topCorrection: 0,
    },
    {
      key: 'wagon', name: 'Long-roof Van', signature: 'long-roof',
      nativeTopNose: 'up', topCorrection: 0,
    },
    {
      key: 'roadster', name: 'Low Sport Coupe', signature: 'low-coupe',
      nativeTopNose: 'up', topCorrection: 0,
    },
    {
      key: 'rally', name: 'High-rise Classic', signature: 'high-rise',
      nativeTopNose: 'down', topCorrection: 180,
    },
    {
      key: 'fastback', name: 'Long-hood Fastback', signature: 'long-hood',
      nativeTopNose: 'up', topCorrection: 0,
    },
    {
      key: 'utility', name: 'Boxy Liftback', signature: 'boxy-liftback',
      nativeTopNose: 'up', topCorrection: 0,
    },
  ]),
  liveries: Object.freeze([
    Object.freeze({ key: 'center-stripe', name: 'Center stripe' }),
    Object.freeze({ key: 'twin-stripe', name: 'Twin stripe' }),
    Object.freeze({ key: 'chevron', name: 'Chevron' }),
    Object.freeze({ key: 'sash', name: 'Sash' }),
    Object.freeze({ key: 'dashes', name: 'Dashes' }),
    Object.freeze({ key: 'checker', name: 'Checker' }),
    Object.freeze({ key: 'crossbar', name: 'Crossbar' }),
    Object.freeze({ key: 'edge-rails', name: 'Edge rails' }),
  ]),
  views: Object.freeze(['side', 'front', 'rear']),
});

const CAR_ASSET_VIEWS = Object.freeze(['top', ...CAR_VISUAL_CATALOG.views]);

export const CAR_ASSET_CATALOG = deepFreeze(Object.fromEntries(
  CAR_VISUAL_CATALOG.models.map((model) => [
    model.key,
    Object.fromEntries(CAR_ASSET_VIEWS.map((view) => [
      view,
      {
        path: `assets/cars/${model.key}-${view}.png`,
        width: view === 'top' ? 32 : 48,
        height: view === 'top' ? 48 : 32,
      },
    ])),
  ]),
));

function carAssetUrl(asset) {
  return new URL(`../${asset.path}`, import.meta.url).href;
}

function stableCodeIndex(mapCode) {
  const match = /^S(\d{2})$/.exec(String(mapCode));
  if (match && Number(match[1]) >= 1 && Number(match[1]) <= 64) return Number(match[1]) - 1;
  let hash = 2166136261;
  for (const character of String(mapCode)) {
    hash ^= character.codePointAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

export function selectCarVisual(mapCode) {
  const index = stableCodeIndex(mapCode);
  const model = CAR_VISUAL_CATALOG.models[index % 8];
  const livery = CAR_VISUAL_CATALOG.liveries[Math.floor(index / 8) % 8];
  return Object.freeze({
    modelKey: model.key,
    modelName: model.name,
    liveryKey: livery.key,
    liveryName: livery.name,
    view: CAR_VISUAL_CATALOG.views[index % CAR_VISUAL_CATALOG.views.length],
    signatureKey: model.signature,
    model,
  });
}

function makeCarImage(documentRef, visual, view, className) {
  const asset = CAR_ASSET_CATALOG[visual.modelKey][view];
  const image = element(documentRef, 'img', className);
  for (const [name, value] of Object.entries({
    src: carAssetUrl(asset),
    width: asset.width,
    height: asset.height,
    alt: '',
    'aria-hidden': 'true',
    draggable: 'false',
    decoding: 'async',
    'data-car-model': visual.modelKey,
    'data-car-livery': visual.liveryKey,
    'data-car-view': view,
    'data-car-signature': visual.signatureKey,
  })) image.setAttribute(name, value);
  if (view === 'top') {
    image.dataset.carNativeTopNose = visual.model.nativeTopNose;
    image.dataset.carTopCorrection = String(visual.model.topCorrection);
  }
  return image;
}

function makeCarSilhouette(documentRef, visual) {
  const art = element(documentRef, 'span', 'car-silhouette');
  art.setAttribute('aria-hidden', 'true');
  art.dataset.carModel = visual.modelKey;
  art.dataset.carLivery = visual.liveryKey;
  art.dataset.carView = 'top';
  art.dataset.carSignature = visual.signatureKey;

  art.append(makeCarImage(documentRef, visual, 'top', 'car-sprite'));
  return art;
}

function makeCarPreview(documentRef, visual) {
  const container = element(documentRef, 'span', 'vehicle-preview');
  container.dataset.carModel = visual.modelKey;
  container.dataset.carLivery = visual.liveryKey;
  container.dataset.carView = visual.view;
  container.dataset.carSignature = visual.signatureKey;
  container.setAttribute('aria-hidden', 'true');

  const image = makeCarImage(documentRef, visual, visual.view, 'vehicle-preview-image');
  container.append(image);
  return container;
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
  parent.append(`${activity.label} `);
  const time = element(documentRef, 'time', 'activity-time', activity.short);
  time.dateTime = activity.datetime;
  parent.append(time);
  // The visible line stays short; the exact time still belongs in the
  // accessible description for assistive tech.
  parent.append(element(documentRef, 'span', 'visually-hidden', activity.exact));
}

function refLine(workRef) {
  const parts = [];
  if (workRef.ticketKey) parts.push(`Jira: ${workRef.ticketKey}`);
  if (workRef.prNumber !== null) parts.push(`PR #${workRef.prNumber}`);
  return parts.join(' · ');
}

// The heading may already show one ref (badgeLabel picks PR over ticket), so drop
// only that token here - a bare "BB-323 PR #504" must still surface its ticket.
function unusedRefs(workRef) {
  if (workRef.label) return { ticketKey: workRef.ticketKey, prNumber: workRef.prNumber };
  return workRef.prNumber !== null
    ? { ticketKey: workRef.ticketKey, prNumber: null }
    : { ticketKey: null, prNumber: null };
}

// `badgeLabel` gives PR-over-ticket precedence; reused so the heading and the
// on-map badge agree for a name with a single ref (multi-ref names are rare and unhandled).
function headingText(session, workRef) {
  return workRef.label || badgeLabel(workRef) || session.displayName;
}

function makeTooltip(documentRef, session, presentation, text, tooltipId, visual) {
  const tooltip = element(documentRef, 'span', 'session-tooltip');
  tooltip.id = tooltipId;
  tooltip.setAttribute('role', 'tooltip');
  tooltip.dataset.carModel = visual.modelKey;
  tooltip.dataset.carLivery = visual.liveryKey;
  tooltip.dataset.carView = visual.view;
  tooltip.dataset.carSignature = visual.model.signature;
  tooltip.append(element(documentRef, 'strong', '', headingText(session, text.workRef)));
  // The heading is the window name, so the tmux session goes on its own line -
  // otherwise the prefix that disambiguates same-named windows is invisible.
  if (text.workRef.sessionName) {
    tooltip.append(element(documentRef, 'span', 'tooltip-session', text.workRef.sessionName));
  }
  tooltip.append(element(documentRef, 'span', '', presentation.label));
  const refs = refLine(unusedRefs(text.workRef));
  if (refs) tooltip.append(element(documentRef, 'span', '', refs));
  const details = element(documentRef, 'span', 'tooltip-details');
  const nonActivity = text.details.split(`. ${text.activity.label}:`)[0];
  if (nonActivity && nonActivity !== text.details) details.append(`${nonActivity}. `);
  appendActivity(documentRef, details, text.activity);
  if (session.errorSummary) details.append(`. Error: ${session.errorSummary}`);
  tooltip.append(
    details,
    makeCarPreview(documentRef, visual),
    element(documentRef, 'span', 'visually-hidden vehicle-preview-text',
      `Vehicle preview: ${visual.modelName}, ${visual.view} view`),
  );
  return tooltip;
}

function replaceTooltip(documentRef, tooltip, session, text, visual) {
  const replacement = makeTooltip(
    documentRef,
    session,
    STATE_PRESENTATION[session.status],
    text,
    tooltip.id,
    visual,
  );
  tooltip.dataset.carModel = visual.modelKey;
  tooltip.dataset.carLivery = visual.liveryKey;
  tooltip.dataset.carView = visual.view;
  tooltip.dataset.carSignature = visual.model.signature;
  tooltip.replaceChildren(...replacement.childNodes);
}

// Horizontal px shift that keeps a car's centered tooltip inside the viewport:
// push right if it would overhang the left edge, pull left if the right, else 0.
export function computeTooltipShift({ carCenter, tooltipWidth, viewportWidth, gutter = 8 }) {
  const half = tooltipWidth / 2;
  const leftPush = gutter - (carCenter - half);
  const rightPush = (viewportWidth - gutter) - (carCenter + half);
  return Math.max(leftPush, Math.min(0, rightPush));
}

function badgeLabel(workRef) {
  if (workRef.prNumber !== null) return `PR#${workRef.prNumber}`;
  if (workRef.ticketKey) return workRef.ticketKey;
  return null;
}

// Child of the wrapper (not the rotating car), so it stays upright; aria-hidden
// since the ref is already in the tooltip.
function applyBadge(documentRef, wrapper, workRef) {
  const label = badgeLabel(workRef);
  let badge = wrapper.querySelector('.car-badge');
  if (!label) {
    if (badge) badge.remove();
    return;
  }
  if (!badge) {
    badge = element(documentRef, 'span', 'car-badge');
    badge.setAttribute('aria-hidden', 'true');
    wrapper.append(badge);
  }
  badge.textContent = label;
}

function applyVisualMetadata(wrapper, button, visual) {
  for (const node of [wrapper, button]) {
    node.dataset.carModel = visual.modelKey;
    node.dataset.carLivery = visual.liveryKey;
    node.dataset.carView = visual.view;
    node.dataset.carSignature = visual.signatureKey;
  }
}

function updateCarVisual(documentRef, wrapper, button, tooltip, session) {
  const visual = selectCarVisual(session.mapCode);
  applyVisualMetadata(wrapper, button, visual);
  const tooltipId = `session-details-${session.mapCode.toLowerCase()}`;
  tooltip.id = tooltipId;
  button.setAttribute('aria-describedby', tooltipId);
  const body = button.querySelector('.car-body');
  if (body.dataset.carModel !== visual.modelKey
    || body.dataset.carLivery !== visual.liveryKey) {
    body.replaceChildren(makeCarSilhouette(documentRef, visual));
    body.dataset.carModel = visual.modelKey;
    body.dataset.carLivery = visual.liveryKey;
  }
  return visual;
}

function makeCar(documentRef, session, placement, text, target) {
  const presentation = STATE_PRESENTATION[session.status];
  const visual = selectCarVisual(session.mapCode);
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
  }
  const atmosphere = element(documentRef, 'span', 'car-atmosphere', '');
  atmosphere.setAttribute('aria-hidden', 'true');

  const button = element(documentRef, 'button', 'session-car');
  button.type = 'button';
  button.dataset.sessionId = session.id;
  applyVisualMetadata(wrapper, button, visual);
  button.setAttribute('aria-label', text.label);
  button.setAttribute('aria-pressed', 'false');
  const tooltipId = `session-details-${session.mapCode.toLowerCase()}`;
  button.setAttribute('aria-describedby', tooltipId);

  const angle = element(documentRef, 'span', 'car-angle');
  const motion = element(documentRef, 'span', 'car-motion');
  const body = element(documentRef, 'span', 'car-body');
  body.dataset.carModel = visual.modelKey;
  body.dataset.carLivery = visual.liveryKey;
  body.append(makeCarSilhouette(documentRef, visual));
  motion.append(body);
  angle.append(motion);
  button.append(angle);
  wrapper.append(
    atmosphere,
    button,
    makeTooltip(documentRef, session, presentation, text, tooltipId, visual),
  );
  applyBadge(documentRef, wrapper, text.workRef);
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

  // Route cars drive around the track (animated left/top); the tooltip only
  // shows on hover/focus/pin, which pauses the car, so measure the frozen
  // position on show and keep the tooltip on-screen on both axes. A static
  // slot-derived position/direction goes stale once the car animates away.
  function clampRouteTooltip(wrapper) {
    const tooltip = wrapper.querySelector('.session-tooltip');
    if (!tooltip) return;
    // pointerover fires before :hover makes content-visibility visible. Measure
    // the real contents synchronously while opacity/visibility still hide them,
    // otherwise offsetHeight is only the collapsed containment placeholder.
    tooltip.style.setProperty('content-visibility', 'visible');
    const rect = wrapper.getBoundingClientRect();
    tooltip.style.setProperty('--tt-shift', `${computeTooltipShift({
      carCenter: rect.left + rect.width / 2,
      tooltipWidth: tooltip.offsetWidth,
      viewportWidth: documentRef.documentElement.clientWidth,
    })}px`);
    // Open downward by default; flip up only when there is not room below within
    // the stage (its overflow-hidden box is the vertical clip context).
    const stage = mapStage.getBoundingClientRect();
    const needed = tooltip.offsetHeight + 9;
    const roomBelow = stage.bottom - rect.bottom;
    const roomAbove = rect.top - stage.top;
    let openUp;
    if (roomBelow >= needed) openUp = false;
    else if (roomAbove >= needed) openUp = true;
    else openUp = roomAbove > roomBelow;
    wrapper.classList.toggle('tooltip-up', openUp);

    // A detail-rich tooltip can be taller than the room on either side of the
    // car. After choosing the less crowded side, slide the whole bubble back
    // inside the stage instead of letting its overflow-hidden edge crop it.
    const gutter = 8;
    const baseTop = openUp
      ? rect.top - 9 - tooltip.offsetHeight
      : rect.bottom + 9;
    const minTop = stage.top + gutter;
    const maxTop = Math.max(minTop, stage.bottom - gutter - tooltip.offsetHeight);
    const clampedTop = Math.max(minTop, Math.min(baseTop, maxTop));
    tooltip.style.setProperty('--tt-shift-y', `${clampedTop - baseTop}px`);
    tooltip.style.removeProperty('content-visibility');
  }
  const clampFromEvent = (event) => {
    const wrapper = event.target.closest?.('.vehicle-anchor');
    if (wrapper) clampRouteTooltip(wrapper);
  };
  vehicleLayer.addEventListener('pointerover', clampFromEvent, { signal });
  vehicleLayer.addEventListener('focusin', clampFromEvent, { signal });

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
    swapStateClass(wrapper, session.status);
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
            swapStateClass(existingWrapper, session.status);
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
